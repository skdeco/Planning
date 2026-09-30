import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, Alert,
  Modal, FlatList, Image as RNImage, RefreshControl,
} from 'react-native';
import { useRefresh } from '@/hooks/useRefresh';
import { toast } from 'sonner-native';
import { ScreenContainer } from '@/components/screen-container';
import { BackToPlus } from '@/components/ui/BackToPlus';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import type { Pointage, PhotoChantier, Chantier } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { Image } from 'react-native';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';
import { getCurrentPosition, haversineDistance, geocodeAddress } from '@/lib/pointage/geo';
import { PointageLibre } from '@/components/pointage/PointageLibre';
import { ReglageRayon } from '@/components/pointage/ReglageRayon';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { Ico } from '@/components/ui/Ico';

// Filtre mime utilisé par l'InboxPickerButton de cet écran
// (photos pointage fin journée). Aligné avec equipe.tsx + financier-st.tsx.
const inboxMimeFilterImagePdf = (m: string): boolean =>
  m.startsWith('image/') || m === 'application/pdf';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('@/assets/images/sk_deco_logo.png') as number;

// Les libellés de mois et de jours viennent des traductions (t.common.monthsShort, t.ui.joursLongs).

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function toHM(date: Date): string {
  return date.toTimeString().slice(0, 5);
}
/** Date longue localisée : « Lundi 12 Mai 2026 » selon la langue choisie. */
function formatDateLongue(
  dateStr: string,
  jours: readonly string[],
  moisCourts: readonly string[],
): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${jours[d.getDay()]} ${d.getDate()} ${moisCourts[d.getMonth()]} ${d.getFullYear()}`;
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
    input.click(); setTimeout(() => input.remove(), 60000);
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

function IconCheck({ size = 18, color = '#2E7D32' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Polyline points="8,12 11,15 16,9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconClock({ size = 16, color = '#6E5F54' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconLocation({ size = 14, color = '#6E5F54' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11z" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="12" cy="10" r="2.5" stroke={color} strokeWidth="1.8" />
    </Svg>
  );
}

function IconCalendar({ size = 16, color = '#6E5F54' }: { size?: number; color?: string }) {
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

function IconPending({ size = 18, color = '#9A8C80' }: { size?: number; color?: string }) {
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
  const { t } = useLanguage();
  const couleur = chantier.couleur || '#5C1F2E';
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
          <Text style={styles.chantierCardNom} numberOfLines={1}>
            {chantier.nom}
            {chantier.categorie === 'depannage' ? <Text style={{ color: '#B9770E', fontSize: 12 }}>  · {t.ui.catDepannage}</Text> : null}
            {chantier.categorie === 'lieuFixe' ? <Text style={{ color: '#34506B', fontSize: 12 }}>  · {t.ui.catLieuFixe}</Text> : null}
          </Text>
          {adresse ? (
            <View style={styles.adresseRow}>
              <IconLocation size={12} color="#9A8C80" />
              <Text style={styles.chantierCardAdresse} numberOfLines={1}>{adresse}</Text>
            </View>
          ) : null}
        </View>
        {isComplete && (
          <View style={styles.completeBadge}>
            <IconCheck size={14} color="#2E7D32" />
            <Text style={styles.completeBadgeText}>{t.pointage.done}</Text>
          </View>
        )}
      </View>

      {/* Horaires enregistrées */}
      <View style={styles.horairesRow}>
        <View style={styles.horaireItem}>
          <View style={styles.horaireLabel}>
            <IconArrivee size={14} color={debutPointage ? '#2E7D32' : '#9A8C80'} />
            <Text style={[styles.horaireLabelText, debutPointage && styles.horaireLabelDone]}>{t.pointage.arrival}</Text>
          </View>
          <Text style={[styles.horaireHeure, debutPointage && styles.horaireHeureDone]}>
            {debutPointage ? debutPointage.heure : '—'}
          </Text>
        </View>
        <View style={styles.horaireSep} />
        <View style={styles.horaireItem}>
          <View style={styles.horaireLabel}>
            <IconDepart size={14} color={finPointage ? '#E74C3C' : '#9A8C80'} />
            <Text style={[styles.horaireLabelText, finPointage && styles.horaireLabelDone]}>{t.pointage.departure}</Text>
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
                <IconClock size={14} color="#5C1F2E" />
                <Text style={[styles.horaireLabelText, { color: '#5C1F2E' }]}>{t.pointage.duration}</Text>
              </View>
              <Text style={[styles.horaireHeure, { color: '#5C1F2E' }]}>
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
                  {debutPointage ? t.pointage.arrivalDone : t.pointage.clockArrival}
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
                  {!debutPointage ? t.pointage.clockArrivalFirst : t.pointage.clockDeparture}
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
  const { data, currentUser, isHydrated, addPointage, addPhotosChantier, toggleTask } = useApp();
  const { t } = useLanguage();
  const { refreshing, onRefresh } = useRefresh();
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
      let horsZone = false; // pointage hors du rayon chantier — marqué en silence (visible admin uniquement)
      let distanceChantier: number | null = null;

      const chantier = data.chantiers.find(c => c.id === chantierId);
      const adresseChantier = chantier
        ? [chantier.rue, chantier.codePostal, chantier.ville].filter(Boolean).join(', ') || chantier.adresse || ''
        : '';

      // Géolocalisation
      try {
        const pos = await getCurrentPosition(t.ui.geoIndispo, t.ui.geoRefusee);
        latitude = pos.latitude;
        longitude = pos.longitude;
        adresse = `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;

        // Vérification distance — utiliser GPS du chantier si disponible, sinon géocoder
        const chantierGPS = chantier?.latitude != null && chantier?.longitude != null
          ? { lat: chantier.latitude, lng: chantier.longitude }
          : null;
        if (chantierGPS || adresseChantier) {
          let coords = chantierGPS;
          if (!coords && adresseChantier) {
            if (!(chantierId in geocacheRef.current)) {
              geocacheRef.current[chantierId] = await geocodeAddress(adresseChantier);
            }
            coords = geocacheRef.current[chantierId];
          }
          if (coords) {
            const dist = haversineDistance(pos.latitude, pos.longitude, coords.lat, coords.lng);
            // Contrôle silencieux : on ne bloque JAMAIS et on n'avertit PAS l'ouvrier.
            // Hors du rayon (100 m) → pointage enregistré avec un drapeau visible par l'admin seulement.
            if (dist > 100) {
              horsZone = true;
              distanceChantier = Math.round(dist);
            }
          }
        }
      } catch {
        // Géolocalisation refusée ou indisponible : avertir mais permettre le pointage
        const msg = t.pointage.geoUnavailableMsg;
        if (Platform.OS === 'web') {
          alert(msg);
        } else {
          Alert.alert(t.pointage.geoUnavailableTitle, msg);
        }
        // Continuer sans coordonnées GPS
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
        ...(horsZone ? { horsZone: true, distanceChantier: distanceChantier ?? undefined } : {}),
      };
      addPointage(pointage);

      // Feedback visuel
      const label = type === 'debut' ? t.pointage.arrivalRecordedAt : t.pointage.departureRecordedAt;
      toast.success(`${label} ${toHM(ts)}`);

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
    const chantierNom = chantier?.nom || '';
    const heure = toHM(new Date());

    // Arrivée : pointage direct (feedback par le toast). Départ : confirmation (fin de journée).
    if (type === 'debut') {
      doPointage(type, chantierId);
      return;
    }
    const msg = `${t.pointage.departurePromptPrefix} ${heure} ?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doPointage(type, chantierId);
    } else {
      Alert.alert(`${t.pointage.departure} — ${chantierNom}`, msg, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.confirm, onPress: () => doPointage(type, chantierId) },
      ]);
    }
  };

  const handlePickPhotos = async () => {
    if (Platform.OS === 'web') {
      const files = await pickFilesWeb();
      setPhotosEnAttente(prev => [...prev, ...files]);
    } else {
      // Natif : sélecteur photothèque / caméra / fichiers (uploadé à la sauvegarde).
      const picked = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true, compressImages: true });
      if (picked.length > 0) {
        setPhotosEnAttente(prev => [...prev, ...picked.map(f => ({ uri: f.uri, name: f.filename || `photo_${Date.now()}` }))]);
      }
    }
  };

  // P1 — Inbox flow équivalent de handlePickPhotos + handleSavePhotos
  // (mobile-compat). Direct upload Supabase + addPhotosChantier sans
  // staging : si on staguait, l'item Inbox serait retiré avant save
  // → tap "Passer" perdrait le fichier. Date recalculée au moment de
  // l'upload (l'écran tick chaque seconde, on prend la date fraîche).
  const addFromInboxPhotoPointage = useCallback(
    async (item: InboxItem): Promise<boolean> => {
      if (!photosChantierId) return false;
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const photoId = `inbox_${item.id}`;
      const folder = `chantiers/${photosChantierId}/photos`;
      const url = await uploadFileToStorage(fileURI, folder, photoId);
      if (!url) return false;
      addPhotosChantier([{
        id: photoId,
        chantierId: photosChantierId,
        employeId,
        date: toYMD(new Date()),
        uri: url,
        nom: item.filename,
        createdAt: new Date().toISOString(),
        source: 'fin_journee' as const,
      }]);
      return true;
    },
    [photosChantierId, employeId, addPhotosChantier],
  );

  const handleRemovePhoto = (index: number) => {
    setPhotosEnAttente(prev => prev.filter((_, i) => i !== index));
  };

  const handleSavePhotos = async () => {
    if (photosEnAttente.length === 0) {
      setShowPhotosModal(false);
      return;
    }
    if (!photosChantierId) {
      Alert.alert(t.common.error, t.pointage.selectChantierError);
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
        const msg = `${failCount} ${t.pointage.uploadFailSuffix}`;
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert(t.pointage.uploadErrorTitle, msg);
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
      <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerSub}>{t.pointage.title}</Text>
        </View>
        <View style={styles.adminMsg}>
          <Text style={styles.adminMsgText}>{t.pointage.adminMessage}</Text>
        </View>
        <ReglageRayon />
      </ScreenContainer>
    );
  }

  const hist = historique();

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <BackToPlus />
      <View style={styles.header}>
        <Text style={styles.headerSub}>{t.pointage.title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {/* Carte identité du jour */}
        <View style={styles.identiteCard}>
          <View style={styles.identiteLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>
                {emp ? `${emp.prenom?.[0] || '?'}${emp.nom?.[0] || '?'}`.toUpperCase() : '?'}
              </Text>
            </View>
          </View>
          <View style={styles.identiteRight}>
            <Text style={styles.identiteNom}>{empNom}</Text>
            <View style={styles.identiteRow}>
              <IconCalendar size={13} color="#6E5F54" />
              <Text style={styles.identiteDate}>
                {t.ui.joursLongs[now.getDay()]} {now.getDate()} {t.common.monthsShort[now.getMonth()]} {now.getFullYear()}
              </Text>
            </View>
            <Text style={styles.identiteHeure}>{now.toTimeString().slice(0, 8)}</Text>
          </View>
        </View>

        {/* Info géolocalisation */}
        <View style={styles.geoInfoBanner}>
          <IconLocation size={14} color="#5C1F2E" />
          <Text style={styles.geoInfoText}>
            La géolocalisation est activée uniquement lors de l'enregistrement d'une heure d'arrivée ou de départ.
          </Text>
        </View>

        {/* Pointage libre : le chantier est déduit de la position */}
        <PointageLibre onDepart={id => { if (id) { setPhotosChantierId(id); setPhotosEnAttente([]); setShowPhotosModal(true); } }} />

        {/* Historique */}
        {hist.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.pointage.history}</Text>
            {hist.map(([date, byCh]) => {
              const entries = Object.entries(byCh);
              return (
                <View key={date} style={styles.histCard}>
                  <View style={styles.histDateRow}>
                    <IconCalendar size={13} color="#5C1F2E" />
                    <Text style={styles.histDate}>{formatDateLongue(date, t.ui.joursLongs, t.common.monthsShort)}</Text>
                  </View>
                  {entries.map(([cId, { debut, fin }]) => {
                    const ch = cId !== '__global__' ? data.chantiers.find(c => c.id === cId) : null;
                    return (
                      <View key={cId} style={styles.histChantierBlock}>
                        {ch && (
                          <View style={[styles.histChantierTag, { borderLeftColor: ch.couleur || '#5C1F2E' }]}>
                            <Text style={styles.histChantierNom} numberOfLines={1}>{ch.nom}</Text>
                          </View>
                        )}
                        <View style={styles.histRow}>
                          <View style={styles.histItem}>
                            <View style={styles.histItemIcon}>
                              {debut ? <IconCheck size={14} color="#2E7D32" /> : <IconPending size={14} color="#9A8C80" />}
                              <Text style={styles.histLabel}>{t.reporting.arrival}</Text>
                            </View>
                            <Text style={[styles.histTime, !debut && styles.histTimeMissing]}>
                              {debut ? debut.heure : '—'}
                            </Text>
                          </View>
                          <View style={styles.histSep} />
                          <View style={styles.histItem}>
                            <View style={styles.histItemIcon}>
                              {fin ? <IconCheck size={14} color="#E74C3C" /> : <IconPending size={14} color="#9A8C80" />}
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
                                  <IconClock size={14} color="#5C1F2E" />
                                  <Text style={[styles.histLabel, { color: '#5C1F2E' }]}>{t.pointage.totalHours}</Text>
                                </View>
                                <Text style={[styles.histTime, { color: '#5C1F2E' }]}>
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
                        {/* Indicateur si modifié par admin */}
                        {(debut?.saisieManuelle || fin?.saisieManuelle) && (
                          <View style={{ marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#FFF3CD', borderRadius: 4, alignSelf: 'flex-start' }}>
                            <Text style={{ fontSize: 9, color: '#856404', fontWeight: '600' }}>{debut?.saisieManuelle ? t.pointage.arrival : ''}{debut?.saisieManuelle && fin?.saisieManuelle ? ' + ' : ''}{fin?.saisieManuelle ? t.pointage.departure : ''} {t.ui.modifiePar} {(() => {
                                const modId = (debut?.saisieManuelle ? debut?.saisieParId : fin?.saisieParId) || 'admin';
                                const mod = data.employes.find(e => e.id === modId);
                                return mod ? mod.prenom : 'Admin';
                              })()}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
        {/* ─── Récap mensuel ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.pointage.monthlyRecap}</Text>
          {(() => {
            const moisActuel = now.getMonth();
            const annee = now.getFullYear();
            const mesPointages = data.pointages.filter(p => {
              if (p.employeId !== employeId) return false;
              const d = new Date(p.date + 'T12:00:00');
              return d.getMonth() === moisActuel && d.getFullYear() === annee;
            });

            // Grouper par date
            const byDate: Record<string, { debut?: string; fin?: string }> = {};
            mesPointages.forEach(p => {
              if (!byDate[p.date]) byDate[p.date] = {};
              if (p.type === 'debut' && !byDate[p.date].debut) byDate[p.date].debut = p.heure;
              if (p.type === 'fin') byDate[p.date].fin = p.heure;
            });

            const dates = Object.keys(byDate).sort();
            let totalMinutes = 0;
            let joursComplets = 0;
            dates.forEach(date => {
              const { debut, fin } = byDate[date];
              if (debut && fin) {
                const [dh, dm] = debut.split(':').map(Number);
                const [fh, fm] = fin.split(':').map(Number);
                const diff = (fh * 60 + fm) - (dh * 60 + dm);
                if (diff > 0) { totalMinutes += diff; joursComplets++; }
              }
            });

            // Heures théoriques depuis les horaires de l'employé
            const horaires = emp?.horaires;
            let heuresTheoriques = 0;
            if (horaires) {
              // Compter les jours ouvrés du mois
              const firstDay = new Date(annee, moisActuel, 1);
              const lastDay = new Date(annee, moisActuel + 1, 0);
              for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
                const jour = d.getDay(); // 0=dim
                const h = horaires[jour];
                if (h?.actif) {
                  const [deb_h, deb_m] = h.debut.split(':').map(Number);
                  const [fin_h, fin_m] = h.fin.split(':').map(Number);
                  heuresTheoriques += (fin_h * 60 + fin_m) - (deb_h * 60 + deb_m);
                }
              }
            }

            const heuresSup = heuresTheoriques > 0 ? Math.max(0, totalMinutes - heuresTheoriques) : 0;
            const totalH = Math.floor(totalMinutes / 60);
            const totalM = totalMinutes % 60;
            const theoriqueH = Math.floor(heuresTheoriques / 60);
            const theoriqueM = heuresTheoriques % 60;
            const supH = Math.floor(heuresSup / 60);
            const supM = heuresSup % 60;

            const MOIS_LONG = t.ui.moisLongs;

            return (
              <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#2B1D14', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#5C1F2E', marginBottom: 12 }}>
                  {MOIS_LONG[moisActuel]} {annee}
                </Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#2B1D14' }}>{joursComplets}</Text>
                    <Text style={{ fontSize: 12.5, color: '#6E5F54' }}>{t.pointage.daysClocked}</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: '#EDE2D6' }} />
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#5C1F2E' }}>{totalH}h{String(totalM).padStart(2, '0')}</Text>
                    <Text style={{ fontSize: 12.5, color: '#6E5F54' }}>{t.pointage.hoursWorked}</Text>
                  </View>
                </View>


                {/* Bouton export PDF */}
                {Platform.OS === 'web' && (
                  <Pressable
                    style={{ marginTop: 12, backgroundColor: '#5C1F2E', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                    onPress={() => {
                      // Générer HTML pour impression PDF
                      const rows = dates.map(date => {
                        const { debut, fin } = byDate[date];
                        let duree = '—';
                        if (debut && fin) {
                          const [dh2, dm2] = debut.split(':').map(Number);
                          const [fh2, fm2] = fin.split(':').map(Number);
                          const diff2 = (fh2 * 60 + fm2) - (dh2 * 60 + dm2);
                          if (diff2 > 0) duree = `${Math.floor(diff2 / 60)}h${String(diff2 % 60).padStart(2, '0')}`;
                        }
                        return `<tr><td>${formatDateLongue(date, t.ui.joursLongs, t.common.monthsShort)}</td><td>${debut || '—'}</td><td>${fin || '—'}</td><td>${duree}</td></tr>`;
                      }).join('');

                      const html = `
                        <html><head><title>${t.ui.feuillePointage} - ${MOIS_LONG[moisActuel]} ${annee}</title>
                        <style>
                          body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                          h1 { color: #2C2C2C; font-size: 22px; }
                          h2 { color: #687076; font-size: 14px; margin-bottom: 20px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                          th { background: #2C2C2C; color: #fff; padding: 10px; text-align: left; font-size: 13px; }
                          td { padding: 8px 10px; border-bottom: 1px solid #E2E6EA; font-size: 13px; }
                          tr:nth-child(even) { background: #F8F9FA; }
                          .summary { margin-top: 24px; padding: 16px; background: #F5EDE3; border-radius: 8px; }
                          .summary span { font-weight: bold; color: #2C2C2C; }
                        </style></head><body>
                        <h1>${t.ui.feuillePointage}</h1>
                        <h2>${empNom} — ${MOIS_LONG[moisActuel]} ${annee}</h2>
                        <table>
                          <thead><tr><th>${t.common.date}</th><th>${t.pointage.arrival}</th><th>${t.pointage.departure}</th><th>${t.pointage.duration}</th></tr></thead>
                          <tbody>${rows}</tbody>
                        </table>
                        <div class="summary">
                          <p><span>${joursComplets}</span> ${t.pointage.daysClocked} • <span>${totalH}h${String(totalM).padStart(2, '0')}</span> ${t.pointage.hoursWorked}</p>
                          
                        </div>
                        <script>window.onload = function() { window.print(); }</script>
                        </body></html>
                      `;
                      const win = window.open('', '_blank');
                      if (win) { win.document.write(html); win.document.close(); }
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{t.pointage.exportPdf}</Text>
                  </Pressable>
                )}
              </View>
            );
          })()}
        </View>
      </ScrollView>

      {/* ── Modal Photos fin de journée ── */}
      <Modal visible={showPhotosModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.pointage.dayPhotos}</Text>
              <Pressable onPress={() => setShowPhotosModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>{t.ui.photosJourneeAide}</Text>

            {/* Tâches du jour sur ce chantier — à cocher avant de partir (jamais bloquant) */}
            {(() => {
              const taches = data.affectations
                .filter(a => a.employeId === employeId && a.chantierId === photosChantierId && a.dateDebut <= todayStr && a.dateFin >= todayStr)
                .flatMap(a => (a.notes || [])
                  .filter(n => (n.date === todayStr || !n.date) && !n.archiveeAt)
                  .flatMap(n => (n.tasks || []).map(tk => ({ tk, affectationId: a.id, noteId: n.id }))));
              if (taches.length === 0) return null;
              return (
                <View style={{ marginBottom: 12, backgroundColor: '#FAF5EF', borderRadius: 12, padding: 10, gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#6E5F54', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {t.ui.tachesDuJourAvantDepart} ({taches.filter(x => x.tk.fait).length}/{taches.length})
                  </Text>
                  {taches.map(({ tk, affectationId, noteId }) => (
                    <Pressable key={tk.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => toggleTask(affectationId, noteId, tk.id, currentUser?.nom || '')}>
                      <Text style={{ fontSize: 18, color: tk.fait ? '#2E7D32' : '#9A8C80' }}>{tk.fait ? '☑' : '☐'}</Text>
                      <Text style={{ flex: 1, fontSize: 13.5, color: tk.fait ? '#9A8C80' : '#2B1D14', textDecorationLine: tk.fait ? 'line-through' : 'none' }}>{tk.texte}</Text>
                    </Pressable>
                  ))}
                </View>
              );
            })()}

            {uniqueChantiers.length > 1 && (
              <View style={styles.chantierSelectSection}>
                <Text style={styles.chantierSelectLabel}>{t.pointage.chantierLabel} :</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chantierSelectScroll}>
                  {uniqueChantiers.map(c => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.chantierSelectBtn,
                        photosChantierId === c.id && styles.chantierSelectBtnActive,
                        { borderColor: c.couleur || '#5C1F2E' },
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
                        <Ico e="📄" size={16} />
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
              <Text style={styles.pickPhotosBtnText}>{t.pointage.addPhotosPdf}</Text>
            </Pressable>
            <View style={{ marginTop: 4 }}>
              <InboxPickerButton
                onPick={addFromInboxPhotoPointage}
                mimeFilter={inboxMimeFilterImagePdf}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.skipBtn} onPress={() => setShowPhotosModal(false)}>
                <Text style={styles.skipBtnText}>{t.pointage.skip}</Text>
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
                    {t.common.save} {photosEnAttente.length > 0 ? `(${photosEnAttente.length})` : ''}
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
    gap: 8,
  },
  headerLogo: { width: 72, height: 36 },
  headerSub: { fontFamily: 'Fraunces_600SemiBold', fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: '#2B1D14' },
  adminMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  adminMsgText: { fontSize: 16, color: '#6E5F54', textAlign: 'center', lineHeight: 24 },

  // Carte identité
  identiteCard: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, marginBottom: 10,
    backgroundColor: '#fff', borderRadius: 24, padding: 16,
    gap: 14,
    shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  identiteLeft: {},
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#5C1F2E', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 18, fontWeight: '700' },
  identiteRight: { flex: 1 },
  identiteNom: { fontSize: 18, fontWeight: '600', color: '#2B1D14', marginBottom: 3 },
  identiteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  identiteDate: { fontSize: 13, color: '#6E5F54' },
  identiteHeure: { fontSize: 26, fontWeight: '700', color: '#5C1F2E', letterSpacing: 1 },

  // Bannière géo
  geoInfoBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#F1E7DC', borderRadius: 16, padding: 12, gap: 8,
  },
  geoInfoText: { flex: 1, fontSize: 13, color: '#6E5F54', lineHeight: 18 },

  // Section
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: '#6E5F54', marginBottom: 10 },

  // Carte chantier
  chantierCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 16,
    marginBottom: 12,
    shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  chantierCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  chantierDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  chantierCardNom: { fontSize: 16.5, fontWeight: '600', color: '#2B1D14', marginBottom: 2 },
  adresseRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chantierCardAdresse: { fontSize: 12.5, color: '#9A8C80', flex: 1 },
  completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  completeBadgeText: { fontSize: 12.5, color: '#2E7D32', fontWeight: '600' },

  // Horaires
  horairesRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF5EF', borderRadius: 16, padding: 10, marginBottom: 12 },
  horaireItem: { flex: 1, alignItems: 'center' },
  horaireLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  horaireLabelText: { fontSize: 12.5, color: '#9A8C80', fontWeight: '500' },
  horaireLabelDone: { color: '#2B1D14' },
  horaireHeure: { fontSize: 18, fontWeight: '700', color: '#9A8C80' },
  horaireHeureDone: { color: '#2B1D14' },
  horaireSep: { width: StyleSheet.hairlineWidth, backgroundColor: '#EDE2D6', height: 32, marginHorizontal: 6 },

  // Boutons action
  btnsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 12,
  },
  btnArrivee: { backgroundColor: '#5C1F2E' },
  btnDepart: { backgroundColor: '#8C4A2F' },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', textAlign: 'center', flex: 1 },
  actionBtnTextDisabled: { color: 'rgba(255,255,255,0.7)' },

  // No chantier
  noChantierBox: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  noChantierText: { fontSize: 14, color: '#9A8C80', textAlign: 'center' },

  // Historique
  histCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 16, marginBottom: 12,
    shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  histDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  histDate: { fontSize: 14, fontWeight: '600', color: '#2B1D14' },
  histChantierBlock: { marginBottom: 10 },
  histChantierTag: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 8 },
  histChantierNom: { fontSize: 13.5, fontWeight: '600', color: '#2B1D14' },
  histRow: { flexDirection: 'row', alignItems: 'flex-start' },
  histItem: { flex: 1, alignItems: 'center' },
  histItemIcon: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  histSep: { width: StyleSheet.hairlineWidth, backgroundColor: '#EDE2D6', marginHorizontal: 8, alignSelf: 'stretch' },
  histLabel: { fontSize: 12.5, color: '#6E5F54' },
  histTime: { fontSize: 17, fontWeight: '700', color: '#2B1D14' },
  histTimeMissing: { color: '#9A8C80' },

  // Modal photos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingBottom: 36, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontFamily: 'Fraunces_600SemiBold', color: '#2B1D14' },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { fontSize: 18, color: '#6E5F54' },
  modalSubtitle: { fontSize: 13, color: '#6E5F54', marginBottom: 16, lineHeight: 18 },
  chantierSelectSection: { marginBottom: 16 },
  chantierSelectLabel: { fontSize: 13, fontWeight: '600', color: '#2B1D14', marginBottom: 8 },
  chantierSelectScroll: { flexGrow: 0 },
  chantierSelectBtn: {
    borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8,
    marginRight: 8, backgroundColor: '#fff',
  },
  chantierSelectBtnActive: { backgroundColor: '#5C1F2E', borderColor: '#5C1F2E' },
  chantierSelectText: { fontSize: 13, fontWeight: '600', color: '#5C1F2E' },
  photosPreviewRow: { marginBottom: 12 },
  photoPreviewItem: { width: 80, marginRight: 10, alignItems: 'center' },
  photoPreviewImg: { width: 72, height: 72, borderRadius: 14, backgroundColor: '#F1E7DC' },
  photoPreviewPdf: {
    width: 72, height: 72, borderRadius: 14, backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
  },
  photoPreviewPdfIcon: { fontSize: 28 },
  photoPreviewName: { fontSize: 11, color: '#6E5F54', marginTop: 4, textAlign: 'center', width: 72 },
  photoRemoveBtn: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#E74C3C', borderRadius: 16, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pickPhotosBtn: {
    backgroundColor: '#F1E7DC', borderRadius: 18, padding: 16,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#EDE2D6',
    borderStyle: 'dashed',
  },
  pickPhotosBtnText: { fontSize: 14, color: '#5C1F2E', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12 },
  skipBtn: {
    flex: 1, borderRadius: 16, padding: 14, alignItems: 'center',
    backgroundColor: '#F1E7DC',
  },
  skipBtnText: { fontSize: 14, color: '#6E5F54', fontWeight: '600' },
  savePhotosBtn: {
    flex: 2, borderRadius: 16, padding: 14, alignItems: 'center',
    backgroundColor: '#5C1F2E',
  },
  savePhotosBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
