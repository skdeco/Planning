import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, Alert,
  Modal, FlatList, Image as RNImage,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import type { Pointage, PhotoChantier, Chantier } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { Image } from 'react-native';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('@/assets/images/sk_deco_logo.png') as number;

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const JOURS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function toHM(date: Date): string {
  return date.toTimeString().slice(0, 5);
}
function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${JOURS_LONG[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Distance en mètres entre deux coordonnées GPS (formule Haversine) */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Géocode une adresse via Nominatim (OSM) — retourne lat/lng ou null */
async function geocodeAddress(adresse: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr', 'User-Agent': 'SKDeco-Planning/1.0' } });
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    // ignore network errors
  }
  return null;
}

/** Obtient la position GPS courante via l'API navigateur */
function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(new Error('Géolocalisation non disponible'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

/** Ouvre le sélecteur de fichier image/PDF natif web */
function pickFilesWeb(): Promise<{ uri: string; name: string }[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      const results: { uri: string; name: string }[] = [];
      for (const file of files) {
        const uri = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(file);
        });
        results.push({ uri, name: file.name });
      }
      resolve(results);
    };
    input.click();
  });
}

// ─── Icônes SVG inline ───────────────────────────────────────────────────────

function IconArrivee({ size = 28, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 12H4M6 10l-2 2 2 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconDepart({ size = 28, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 12h4M18 10l2 2-2 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconCheck({ size = 18, color = '#27AE60' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Polyline points="8,12 11,15 16,9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconClock({ size = 16, color = '#687076' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconLocation({ size = 14, color = '#687076' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11z" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="12" cy="10" r="2.5" stroke={color} strokeWidth="1.8" />
    </Svg>
  );
}

function IconCalendar({ size = 16, color = '#687076' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16v14H4zM4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="8" y1="16" x2="13" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function IconPending({ size = 18, color = '#B0B8C1' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" />
    </Svg>
  );
}

// ─── Composant carte chantier ────────────────────────────────────────────────

interface ChantierCardProps {
  chantier: Chantier;
  debutPointage: Pointage | undefined;
  finPointage: Pointage | undefined;
  onPointage: (type: 'debut' | 'fin', chantierId: string) => void;
  loading: boolean;
}

function ChantierCard({ chantier, debutPointage, finPointage, onPointage, loading }: ChantierCardProps) {
  const couleur = chantier.couleur || '#1A3A6B';
  const adresse = [chantier.rue, chantier.codePostal, chantier.ville].filter(Boolean).join(', ') || chantier.adresse || '';

  const canDebut = !debutPointage;
  const canFin = !!debutPointage && !finPointage;
  const isComplete = !!debutPointage && !!finPointage;

  return (
    <View style={[styles.chantierCard, { borderLeftColor: couleur }]}>
      {/* En-tête */}
      <View style={styles.chantierCardHeader}>
        <View style={[styles.chantierDot, { backgroundColor: couleur }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.chantierCardNom} numberOfLines={1}>{chantier.nom}</Text>
          {adresse ? (
            <View style={styles.adresseRow}>
              <IconLocation size={12} color="#9CA3AF" />
              <Text style={styles.chantierCardAdresse} numberOfLines={1}>{adresse}</Text>
            </View>
          ) : null}
        </View>
        {isComplete && (
          <View style={styles.completeBadge}>
            <IconCheck size={14} color="#27AE60" />
            <Text style={styles.completeBadgeText}>Terminé</Text>
          </View>
        )}
      </View>

      {/* Horaires enregistrées */}
      <View style={styles.horairesRow}>
        <View style={styles.horaireItem}>
          <View style={styles.horaireLabel}>
            <IconArrivee size={14} color={debutPointage ? '#27AE60' : '#B0B8C1'} />
            <Text style={[styles.horaireLabelText, debutPointage && styles.horaireLabelDone]}>Arrivée</Text>
          </View>
          <Text style={[styles.horaireHeure, debutPointage && styles.horaireHeureDone]}>
            {debutPointage ? debutPointage.heure : '—'}
          </Text>
        </View>
        <View style={styles.horaireSep} />
        <View style={styles.horaireItem}>
          <View style={styles.horaireLabel}>
            <IconDepart size={14} color={finPointage ? '#E74C3C' : '#B0B8C1'} />
            <Text style={[styles.horaireLabelText, finPointage && styles.horaireLabelDone]}>Départ</Text>
          </View>
          <Text style={[styles.horaireHeure, finPointage && styles.horaireHeureDone]}>
            {finPointage ? finPointage.heure : '—'}
          </Text>
        </View>
        {debutPointage && finPointage && (
          <>
            <View style={styles.horaireSep} />
            <View style={styles.horaireItem}>
              <View style={styles.horaireLabel}>
                <IconClock size={14} color="#1A3A6B" />
                <Text style={[styles.horaireLabelText, { color: '#1A3A6B' }]}>Durée</Text>
              </View>
              <Text style={[styles.horaireHeure, { color: '#1A3A6B' }]}>
                {(() => {
                  const [dh, dm] = debutPointage.heure.split(':').map(Number);
                  const [fh, fm] = finPointage.heure.split(':').map(Number);
                  const diff = (fh * 60 + fm) - (dh * 60 + dm);
                  if (diff <= 0) return '—';
                  return `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`;
                })()}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Boutons */}
      {!isComplete && (
        <View style={styles.btnsRow}>
          <Pressable
            style={[styles.actionBtn, styles.btnArrivee, !canDebut && styles.actionBtnDisabled]}
            onPress={() => canDebut && !loading && onPointage('debut', chantier.id)}
            disabled={!canDebut || loading}
          >
            {loading && canDebut ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <IconArrivee size={20} color={canDebut ? '#fff' : 'rgba(255,255,255,0.4)'} />
                <Text style={[styles.actionBtnText, !canDebut && styles.actionBtnTextDisabled]}>
                  {debutPointage ? 'Arrivée enregistrée' : 'Pointer l\'arrivée'}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.btnDepart, !canFin && styles.actionBtnDisabled]}
            onPress={() => canFin && !loading && onPointage('fin', chantier.id)}
            disabled={!canFin || loading}
          >
            {loading && canFin ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <IconDepart size={20} color={canFin ? '#fff' : 'rgba(255,255,255,0.4)'} />
                <Text style={[styles.actionBtnText, !canFin && styles.actionBtnTextDisabled]}>
                  {!debutPointage ? 'Pointez d\'abord l\'arrivée' : 'Pointer le départ'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Écran principal ─────────────────────────────────────────────────────────

export default function PointageScreen() {
  const { data, currentUser, isHydrated, addPointage, addPhotosChantier } = useApp();
  const { t } = useLanguage();
  const isAdmin = currentUser?.role === 'admin';
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) {
      router.replace('/login');
    }
  }, [isHydrated, currentUser, router]);

  const [now, setNow] = useState(new Date());
  const [loadingChantierId, setLoadingChantierId] = useState<string | null>(null);

  // ── État modal photos fin de journée ──
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [photosChantierId, setPhotosChantierId] = useState<string>('');
  const [photosEnAttente, setPhotosEnAttente] = useState<{ uri: string; name: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Cache géocodage par chantierId
  const geocacheRef = useRef<Record<string, { lat: number; lng: number } | null>>({});

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = toYMD(now);
  const employeId = currentUser?.employeId || '';

  const chantiersAujourdhui = data.affectations
    .filter(a => a.employeId === employeId && a.dateDebut <= todayStr && a.dateFin >= todayStr)
    .map(a => data.chantiers.find(c => c.id === a.chantierId))
    .filter(Boolean) as Chantier[];

  // Dédupliquer par chantierId
  const uniqueChantiers = chantiersAujourdhui.filter(
    (c, i, arr) => arr.findIndex(x => x.id === c.id) === i
  );

  const pointagesAujourdhui = data.pointages.filter(
    p => p.employeId === employeId && p.date === todayStr
  );

  function getPointage(chantierId: string, type: 'debut' | 'fin') {
    return pointagesAujourdhui.find(p => (p as any).chantierId === chantierId && p.type === type);
  }

  // Historique : groupé par date puis par chantier
  const historique = useCallback(() => {
    const myPointages = data.pointages
      .filter(p => p.employeId === employeId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const byDate: Record<string, Record<string, { debut?: Pointage; fin?: Pointage }>> = {};
    myPointages.forEach(p => {
      const cId = (p as any).chantierId || '__global__';
      if (!byDate[p.date]) byDate[p.date] = {};
      if (!byDate[p.date][cId]) byDate[p.date][cId] = {};
      byDate[p.date][cId][p.type] = p;
    });

    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30);
  }, [data.pointages, employeId]);

  const doPointage = async (type: 'debut' | 'fin', chantierId: string) => {
    setLoadingChantierId(chantierId);
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      let adresse: string | null = null;

      const chantier = data.chantiers.find(c => c.id === chantierId);
      const adresseChantier = chantier
        ? [chantier.rue, chantier.codePostal, chantier.ville].filter(Boolean).join(', ') || chantier.adresse || ''
        : '';

      // Géolocalisation
      try {
        const pos = await getCurrentPosition();
        latitude = pos.latitude;
        longitude = pos.longitude;
        adresse = `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;

        // Vérification distance si adresse disponible
        if (adresseChantier) {
          // Charger depuis cache ou géocoder
          if (!(chantierId in geocacheRef.current)) {
            geocacheRef.current[chantierId] = await geocodeAddress(adresseChantier);
          }
          const coords = geocacheRef.current[chantierId];
          if (coords) {
            const dist = haversineDistance(pos.latitude, pos.longitude, coords.lat, coords.lng);
            if (dist > 100) {
              const distStr = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
              const msg =
                `Vous êtes à ${distStr} du chantier.\n\n` +
                `Vous devez être à moins de 100 m de "${chantier?.nom}" pour pointer.`;
              if (Platform.OS === 'web') {
                alert(msg);
              } else {
                Alert.alert('Trop loin du chantier', msg);
              }
              return;
            }
          }
        }
      } catch {
        // Si géolocalisation refusée ou indisponible : on bloque
        const msg =
          'La géolocalisation est nécessaire pour pointer.\n\n' +
          'Elle n\'est utilisée qu\'au moment de l\'enregistrement de votre heure d\'arrivée ou de départ.';
        if (Platform.OS === 'web') {
          alert(msg);
        } else {
          Alert.alert('Géolocalisation requise', msg);
        }
        return;
      }

      const ts = new Date();
      const pointage: Pointage = {
        id: `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        employeId,
        chantierId,
        type,
        date: toYMD(ts),
        heure: toHM(ts),
        timestamp: ts.toISOString(),
        latitude,
        longitude,
        adresse,
      };
      addPointage(pointage);

      // Ouvrir modal photos après fin de journée
      if (type === 'fin') {
        setPhotosChantierId(chantierId);
        setPhotosEnAttente([]);
        setShowPhotosModal(true);
      }
    } finally {
      setLoadingChantierId(null);
    }
  };

  const handlePointage = (type: 'debut' | 'fin', chantierId: string) => {
    const chantier = data.chantiers.find(c => c.id === chantierId);
    const label = type === 'debut' ? 'Arrivée' : 'Départ';
    const heure = toHM(new Date());
    const chantierNom = chantier?.nom || '';

    const msg = `Enregistrer votre ${label.toLowerCase()} à ${heure} sur "${chantierNom}" ?`;

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doPointage(type, chantierId);
    } else {
      Alert.alert(
        `${label} — ${chantierNom}`,
        msg,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', onPress: () => doPointage(type, chantierId) },
        ]
      );
    }
  };

  const handlePickPhotos = async () => {
    if (Platform.OS === 'web') {
      const files = await pickFilesWeb();
      setPhotosEnAttente(prev => [...prev, ...files]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotosEnAttente(prev => prev.filter((_, i) => i !== index));
  };

  const handleSavePhotos = async () => {
    if (photosEnAttente.length === 0) {
      setShowPhotosModal(false);
      return;
    }
    if (!photosChantierId) {
      Alert.alert('Erreur', 'Veuillez sélectionner un chantier.');
      return;
    }
    setUploadingPhotos(true);
    try {
      const newPhotos: PhotoChantier[] = [];
      let failCount = 0;
      for (const f of photosEnAttente) {
        const photoId = `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const folder = `chantiers/${photosChantierId}/photos`;
        const storageUrl = await uploadFileToStorage(f.uri, folder, photoId);
        if (storageUrl) {
          newPhotos.push({
            id: photoId,
            chantierId: photosChantierId,
            employeId,
            date: todayStr,
            uri: storageUrl,
            nom: f.name,
            createdAt: new Date().toISOString(),
            source: 'fin_journee' as const,
          });
        } else {
          failCount++;
        }
      }
      if (newPhotos.length > 0) addPhotosChantier(newPhotos);
      if (failCount > 0) {
        const msg = `${failCount} photo(s) n'ont pas pu être envoyées. Veuillez réessayer.`;
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Erreur upload', msg);
      }
    } finally {
      setUploadingPhotos(false);
      setShowPhotosModal(false);
      setPhotosEnAttente([]);
    }
  };

  const emp = data.employes.find(e => e.id === employeId);
  const empNom = emp ? `${emp.prenom} ${emp.nom}` : '';

  // ── Vue admin ────────────────────────────────────────────────────────────────
  if (isAdmin) {
    return (
      <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerSub}>{t.pointage.title}</Text>
        </View>
        <View style={styles.adminMsg}>
          <Text style={styles.adminMsgText}>{t.pointage.adminMessage}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const hist = historique();

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
        <Text style={styles.headerSub}>{t.pointage.title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Carte identité du jour */}
        <View style={styles.identiteCard}>
          <View style={styles.identiteLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>
                {emp ? `${emp.prenom[0]}${emp.nom[0]}`.toUpperCase() : '?'}
              </Text>
            </View>
          </View>
          <View style={styles.identiteRight}>
            <Text style={styles.identiteNom}>{empNom}</Text>
            <View style={styles.identiteRow}>
              <IconCalendar size={13} color="#687076" />
              <Text style={styles.identiteDate}>
                {JOURS_LONG[now.getDay()]} {now.getDate()} {MOIS[now.getMonth()]} {now.getFullYear()}
              </Text>
            </View>
            <Text style={styles.identiteHeure}>{now.toTimeString().slice(0, 8)}</Text>
          </View>
        </View>

        {/* Info géolocalisation */}
        <View style={styles.geoInfoBanner}>
          <IconLocation size={14} color="#1A3A6B" />
          <Text style={styles.geoInfoText}>
            La géolocalisation est activée uniquement lors de l'enregistrement d'une heure d'arrivée ou de départ.
          </Text>
        </View>

        {/* Chantiers du jour */}
        {uniqueChantiers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mes chantiers du jour</Text>
            {uniqueChantiers.map(chantier => (
              <ChantierCard
                key={chantier.id}
                chantier={chantier}
                debutPointage={getPointage(chantier.id, 'debut')}
                finPointage={getPointage(chantier.id, 'fin')}
                onPointage={handlePointage}
                loading={loadingChantierId === chantier.id}
              />
            ))}
          </View>
        ) : (
          <View style={styles.noChantierBox}>
            <IconCalendar size={32} color="#B0B8C1" />
            <Text style={styles.noChantierText}>Aucun chantier affecté aujourd'hui</Text>
          </View>
        )}

        {/* Historique */}
        {hist.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.pointage.history}</Text>
            {hist.map(([date, byCh]) => {
              const entries = Object.entries(byCh);
              return (
                <View key={date} style={styles.histCard}>
                  <View style={styles.histDateRow}>
                    <IconCalendar size={13} color="#1A3A6B" />
                    <Text style={styles.histDate}>{formatDateFr(date)}</Text>
                  </View>
                  {entries.map(([cId, { debut, fin }]) => {
                    const ch = cId !== '__global__' ? data.chantiers.find(c => c.id === cId) : null;
                    return (
                      <View key={cId} style={styles.histChantierBlock}>
                        {ch && (
                          <View style={[styles.histChantierTag, { borderLeftColor: ch.couleur || '#1A3A6B' }]}>
                            <Text style={styles.histChantierNom} numberOfLines={1}>{ch.nom}</Text>
                          </View>
                        )}
                        <View style={styles.histRow}>
                          <View style={styles.histItem}>
                            <View style={styles.histItemIcon}>
                              {debut ? <IconCheck size={14} color="#27AE60" /> : <IconPending size={14} color="#B0B8C1" />}
                              <Text style={styles.histLabel}>{t.reporting.arrival}</Text>
                            </View>
                            <Text style={[styles.histTime, !debut && styles.histTimeMissing]}>
                              {debut ? debut.heure : '—'}
                            </Text>
                          </View>
                          <View style={styles.histSep} />
                          <View style={styles.histItem}>
                            <View style={styles.histItemIcon}>
                              {fin ? <IconCheck size={14} color="#E74C3C" /> : <IconPending size={14} color="#B0B8C1" />}
                              <Text style={styles.histLabel}>{t.reporting.departure}</Text>
                            </View>
                            <Text style={[styles.histTime, !fin && styles.histTimeMissing]}>
                              {fin ? fin.heure : '—'}
                            </Text>
                          </View>
                          {debut && fin && (
                            <>
                              <View style={styles.histSep} />
                              <View style={styles.histItem}>
                                <View style={styles.histItemIcon}>
                                  <IconClock size={14} color="#1A3A6B" />
                                  <Text style={[styles.histLabel, { color: '#1A3A6B' }]}>{t.pointage.totalHours}</Text>
                                </View>
                                <Text style={[styles.histTime, { color: '#1A3A6B' }]}>
                                  {(() => {
                                    const [dh, dm] = debut.heure.split(':').map(Number);
                                    const [fh, fm] = fin.heure.split(':').map(Number);
                                    const diff = (fh * 60 + fm) - (dh * 60 + dm);
                                    if (diff <= 0) return '—';
                                    return `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`;
                                  })()}
                                </Text>
                              </View>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Modal Photos fin de journée ── */}
      <Modal visible={showPhotosModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Photos de la journée</Text>
              <Pressable onPress={() => setShowPhotosModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Ajoutez les photos de votre journée. Elles seront enregistrées dans la galerie du chantier.
            </Text>

            {uniqueChantiers.length > 1 && (
              <View style={styles.chantierSelectSection}>
                <Text style={styles.chantierSelectLabel}>Chantier :</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chantierSelectScroll}>
                  {uniqueChantiers.map(c => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.chantierSelectBtn,
                        photosChantierId === c.id && styles.chantierSelectBtnActive,
                        { borderColor: c.couleur || '#1A3A6B' },
                      ]}
                      onPress={() => setPhotosChantierId(c.id)}
                    >
                      <Text style={[
                        styles.chantierSelectText,
                        photosChantierId === c.id && { color: '#fff' },
                      ]} numberOfLines={1}>{c.nom}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {photosEnAttente.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosPreviewRow}>
                {photosEnAttente.map((f, i) => (
                  <View key={i} style={styles.photoPreviewItem}>
                    {f.uri.startsWith('data:image') ? (
                      <RNImage source={{ uri: f.uri }} style={styles.photoPreviewImg} />
                    ) : (
                      <View style={styles.photoPreviewPdf}>
                        <Text style={styles.photoPreviewPdfIcon}>📄</Text>
                      </View>
                    )}
                    <Text style={styles.photoPreviewName} numberOfLines={1}>{f.name}</Text>
                    <Pressable style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(i)}>
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable style={styles.pickPhotosBtn} onPress={handlePickPhotos}>
              <Text style={styles.pickPhotosBtnText}>📎 Ajouter des photos / PDF</Text>
            </Pressable>

            <View style={styles.modalActions}>
              <Pressable style={styles.skipBtn} onPress={() => setShowPhotosModal(false)}>
                <Text style={styles.skipBtnText}>Passer</Text>
              </Pressable>
              <Pressable
                style={[styles.savePhotosBtn, uploadingPhotos && { opacity: 0.6 }]}
                onPress={handleSavePhotos}
                disabled={uploadingPhotos}
              >
                {uploadingPhotos ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.savePhotosBtnText}>
                    Enregistrer {photosEnAttente.length > 0 ? `(${photosEnAttente.length})` : ''}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
    backgroundColor: '#F2F4F7', gap: 8,
  },
  headerLogo: { width: 72, height: 36 },
  headerSub: { fontSize: 12, color: '#687076', marginBottom: 2 },
  adminMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  adminMsgText: { fontSize: 16, color: '#687076', textAlign: 'center', lineHeight: 24 },

  // Carte identité
  identiteCard: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    gap: 14,
  },
  identiteLeft: {},
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1A3A6B', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 18, fontWeight: '700' },
  identiteRight: { flex: 1 },
  identiteNom: { fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 3 },
  identiteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  identiteDate: { fontSize: 12, color: '#687076' },
  identiteHeure: { fontSize: 26, fontWeight: '700', color: '#1A3A6B', letterSpacing: 1 },

  // Bannière géo
  geoInfoBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#EEF2FF', borderRadius: 10, padding: 10, gap: 8,
  },
  geoInfoText: { flex: 1, fontSize: 11, color: '#3B4A9E', lineHeight: 16 },

  // Section
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#11181C', marginBottom: 10 },

  // Carte chantier
  chantierCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  chantierCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  chantierDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  chantierCardNom: { fontSize: 15, fontWeight: '700', color: '#11181C', marginBottom: 2 },
  adresseRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chantierCardAdresse: { fontSize: 11, color: '#9CA3AF', flex: 1 },
  completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  completeBadgeText: { fontSize: 11, color: '#27AE60', fontWeight: '600' },

  // Horaires
  horairesRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, marginBottom: 12 },
  horaireItem: { flex: 1, alignItems: 'center' },
  horaireLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  horaireLabelText: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  horaireLabelDone: { color: '#11181C' },
  horaireHeure: { fontSize: 18, fontWeight: '700', color: '#B0B8C1' },
  horaireHeureDone: { color: '#11181C' },
  horaireSep: { width: 1, backgroundColor: '#E5E7EB', height: 32, marginHorizontal: 6 },

  // Boutons action
  btnsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10,
  },
  btnArrivee: { backgroundColor: '#1A3A6B' },
  btnDepart: { backgroundColor: '#E74C3C' },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center', flex: 1 },
  actionBtnTextDisabled: { color: 'rgba(255,255,255,0.7)' },

  // No chantier
  noChantierBox: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  noChantierText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  // Historique
  histCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  histDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  histDate: { fontSize: 13, fontWeight: '700', color: '#1A3A6B' },
  histChantierBlock: { marginBottom: 10 },
  histChantierTag: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6 },
  histChantierNom: { fontSize: 12, fontWeight: '600', color: '#11181C' },
  histRow: { flexDirection: 'row', alignItems: 'flex-start' },
  histItem: { flex: 1, alignItems: 'center' },
  histItemIcon: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  histSep: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 8, alignSelf: 'stretch' },
  histLabel: { fontSize: 11, color: '#687076' },
  histTime: { fontSize: 17, fontWeight: '700', color: '#11181C' },
  histTimeMissing: { color: '#B0B8C1' },

  // Modal photos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { fontSize: 18, color: '#687076' },
  modalSubtitle: { fontSize: 13, color: '#687076', marginBottom: 16, lineHeight: 18 },
  chantierSelectSection: { marginBottom: 16 },
  chantierSelectLabel: { fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 8 },
  chantierSelectScroll: { flexGrow: 0 },
  chantierSelectBtn: {
    borderRadius: 20, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 6,
    marginRight: 8, backgroundColor: '#fff',
  },
  chantierSelectBtnActive: { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' },
  chantierSelectText: { fontSize: 13, fontWeight: '600', color: '#1A3A6B' },
  photosPreviewRow: { marginBottom: 12 },
  photoPreviewItem: { width: 80, marginRight: 10, alignItems: 'center' },
  photoPreviewImg: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#F2F4F7' },
  photoPreviewPdf: {
    width: 72, height: 72, borderRadius: 8, backgroundColor: '#FFF3CD',
    alignItems: 'center', justifyContent: 'center',
  },
  photoPreviewPdfIcon: { fontSize: 28 },
  photoPreviewName: { fontSize: 9, color: '#687076', marginTop: 4, textAlign: 'center', width: 72 },
  photoRemoveBtn: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#E74C3C', borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pickPhotosBtn: {
    backgroundColor: '#F2F4F7', borderRadius: 10, padding: 14,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#E2E6EA',
    borderStyle: 'dashed',
  },
  pickPhotosBtnText: { fontSize: 14, color: '#1A3A6B', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12 },
  skipBtn: {
    flex: 1, borderRadius: 10, padding: 14, alignItems: 'center',
    backgroundColor: '#F2F4F7',
  },
  skipBtnText: { fontSize: 14, color: '#687076', fontWeight: '600' },
  savePhotosBtn: {
    flex: 2, borderRadius: 10, padding: 14, alignItems: 'center',
    backgroundColor: '#1A3A6B',
  },
  savePhotosBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
