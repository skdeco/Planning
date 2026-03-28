import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, Alert,
  Modal, FlatList, Image as RNImage,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import type { Pointage, PhotoChantier } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('@/assets/images/sk_deco_logo.png') as number;
import { Image } from 'react-native';

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
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<'debut' | 'fin' | null>(null);

  // ── État modal photos fin de journée ──
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [photosChantierId, setPhotosChantierId] = useState<string>('');
  const [photosEnAttente, setPhotosEnAttente] = useState<{ uri: string; name: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = toYMD(now);
  const employeId = currentUser?.employeId || '';

  const pointagesAujourdhui = data.pointages.filter(
    p => p.employeId === employeId && p.date === todayStr
  );
  const debutAujourdhui = pointagesAujourdhui.find(p => p.type === 'debut');
  const finAujourdhui = pointagesAujourdhui.find(p => p.type === 'fin');

  // Chantiers sur lesquels l'employé est affecté aujourd'hui
  const chantiersAujourdhui = data.affectations
    .filter(a => a.employeId === employeId && a.dateDebut <= todayStr && a.dateFin >= todayStr)
    .map(a => data.chantiers.find(c => c.id === a.chantierId))
    .filter(Boolean) as typeof data.chantiers;

  // Chantier par défaut = premier chantier du jour
  const chantierDefautId = chantiersAujourdhui[0]?.id || '';

  const historique = useCallback(() => {
    const myPointages = data.pointages
      .filter(p => p.employeId === employeId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const byDate: Record<string, { debut?: Pointage; fin?: Pointage }> = {};
    myPointages.forEach(p => {
      if (!byDate[p.date]) byDate[p.date] = {};
      byDate[p.date][p.type] = p;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30);
  }, [data.pointages, employeId]);

  const doPointageFin = () => {
    const ts = new Date();
    const pointage: Pointage = {
      id: `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      employeId,
      type: 'fin',
      date: toYMD(ts),
      heure: toHM(ts),
      timestamp: ts.toISOString(),
      latitude: null,
      longitude: null,
      adresse: null,
    };
    addPointage(pointage);
    setLastAction('fin');
    // Ouvrir le modal photos après la fin de journée
    setPhotosChantierId(chantierDefautId);
    setPhotosEnAttente([]);
    setShowPhotosModal(true);
  };

  const handlePointage = (type: 'debut' | 'fin') => {
    const label = type === 'debut' ? t.pointage.startDay : t.pointage.endDay;
    const heure = toHM(new Date());
    const doPointage = () => {
      if (type === 'fin') {
        doPointageFin();
        return;
      }
      const ts = new Date();
      const pointage: Pointage = {
        id: `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        employeId,
        type,
        date: toYMD(ts),
        heure: toHM(ts),
        timestamp: ts.toISOString(),
        latitude: null,
        longitude: null,
        adresse: null,
      };
      addPointage(pointage);
      setLastAction(type);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${label} à ${heure} ?`)) doPointage();
    } else {
      Alert.alert(
        t.pointage.title,
        `${label} à ${heure} ?`,
        [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.common.confirm, onPress: doPointage },
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
      for (const f of photosEnAttente) {
        const photoId = `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        // Uploader vers Supabase Storage et récupérer l'URL publique
        const folder = `chantiers/${photosChantierId}/photos`;
        const storageUrl = await uploadFileToStorage(f.uri, folder, photoId);
        newPhotos.push({
          id: photoId,
          chantierId: photosChantierId,
          employeId,
          date: todayStr,
          uri: storageUrl || f.uri, // Fallback sur base64 si upload échoué
          nom: f.name,
          createdAt: new Date().toISOString(),
          source: 'fin_journee' as const,
        });
      }
      addPhotosChantier(newPhotos);
    } finally {
      setUploadingPhotos(false);
      setShowPhotosModal(false);
      setPhotosEnAttente([]);
    }
  };

  const emp = data.employes.find(e => e.id === employeId);
  const empNom = emp ? `${emp.prenom} ${emp.nom}` : '';

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
        <View>
          <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerSub}>{t.pointage.title}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Carte du jour */}
        <View style={styles.todayCard}>
          <Text style={styles.todayDate}>
            {JOURS_LONG[now.getDay()]} {now.getDate()} {MOIS[now.getMonth()]} {now.getFullYear()}
          </Text>
          <Text style={styles.todayClock}>{now.toTimeString().slice(0, 8)}</Text>
          <Text style={styles.todayName}>{empNom}</Text>

          {/* Chantier(s) du jour */}
          {chantiersAujourdhui.length > 0 && (
            <View style={styles.chantiersRow}>
              {chantiersAujourdhui.map(c => (
                <View key={c.id} style={[styles.chantierBadge, { backgroundColor: c.couleur || '#1A3A6B' }]}>
                  <Text style={styles.chantierBadgeText} numberOfLines={1}>{c.nom}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Statut du jour */}
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, debutAujourdhui ? styles.statusDone : styles.statusPending]}>
              <Text style={styles.statusIcon}>{debutAujourdhui ? '✓' : '○'}</Text>
              <View>
                <Text style={styles.statusLabel}>{t.pointage.startDay}</Text>
                {debutAujourdhui && <Text style={styles.statusTime}>{debutAujourdhui.heure}</Text>}
              </View>
            </View>
            <View style={[styles.statusBadge, finAujourdhui ? styles.statusDone : styles.statusPending]}>
              <Text style={styles.statusIcon}>{finAujourdhui ? '✓' : '○'}</Text>
              <View>
                <Text style={styles.statusLabel}>{t.pointage.endDay}</Text>
                {finAujourdhui && <Text style={styles.statusTime}>{finAujourdhui.heure}</Text>}
              </View>
            </View>
          </View>

          {lastAction && (
            <View style={styles.confirmBanner}>
              <Text style={styles.confirmText}>
                {lastAction === 'debut' ? `✓ ${t.pointage.startDayConfirm}` : `✓ ${t.pointage.endDayConfirm}`}
              </Text>
            </View>
          )}
        </View>

        {/* Boutons de pointage */}
        <View style={styles.buttonsRow}>
          <Pressable
            style={[styles.pointageBtn, styles.debutBtn, debutAujourdhui && styles.btnDisabled]}
            onPress={() => handlePointage('debut')}
            disabled={!!debutAujourdhui || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.btnIcon}>🌅</Text>
                <Text style={styles.btnLabel}>{t.pointage.startDay}</Text>
                {debutAujourdhui && <Text style={styles.btnSubLabel}>{t.pointage.recordedAt} {debutAujourdhui.heure}</Text>}
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.pointageBtn, styles.finBtn, (!debutAujourdhui || finAujourdhui) && styles.btnDisabled]}
            onPress={() => handlePointage('fin')}
            disabled={!debutAujourdhui || !!finAujourdhui || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.btnIcon}>🌇</Text>
                <Text style={styles.btnLabel}>{t.pointage.endDay}</Text>
                {finAujourdhui && <Text style={styles.btnSubLabel}>{t.pointage.recordedAt} {finAujourdhui.heure}</Text>}
                {!debutAujourdhui && <Text style={styles.btnSubLabel}>{t.pointage.clockFirst}</Text>}
              </>
            )}
          </Pressable>
        </View>

        {/* Historique */}
        {hist.length > 0 && (
          <View style={styles.histSection}>
            <Text style={styles.histTitle}>{t.pointage.history}</Text>
            {hist.map(([date, { debut, fin }]) => (
              <View key={date} style={styles.histCard}>
                <Text style={styles.histDate}>{formatDateFr(date)}</Text>
                <View style={styles.histRow}>
                  <View style={styles.histItem}>
                    <Text style={styles.histLabel}>{t.reporting.arrival}</Text>
                    <Text style={styles.histTime}>{debut ? debut.heure : '—'}</Text>
                    {debut?.adresse && <Text style={styles.histAddr} numberOfLines={2}>{debut.adresse}</Text>}
                  </View>
                  <View style={styles.histSep} />
                  <View style={styles.histItem}>
                    <Text style={styles.histLabel}>{t.reporting.departure}</Text>
                    <Text style={styles.histTime}>{fin ? fin.heure : '—'}</Text>
                    {fin?.adresse && <Text style={styles.histAddr} numberOfLines={2}>{fin.adresse}</Text>}
                  </View>
                  {debut && fin && (
                    <>
                      <View style={styles.histSep} />
                      <View style={styles.histItem}>
                        <Text style={styles.histLabel}>{t.pointage.totalHours}</Text>
                        <Text style={styles.histTime}>
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
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Modal Photos fin de journée ── */}
      <Modal visible={showPhotosModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📸 Photos de la journée</Text>
              <Pressable onPress={() => setShowPhotosModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Ajoutez les photos de votre journée. Elles seront enregistrées dans la galerie du chantier.
            </Text>

            {/* Sélection du chantier */}
            {chantiersAujourdhui.length > 0 ? (
              <View style={styles.chantierSelectSection}>
                <Text style={styles.chantierSelectLabel}>Chantier :</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chantierSelectScroll}>
                  {chantiersAujourdhui.map(c => (
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
            ) : (
              <Text style={styles.noChantierText}>Aucun chantier affecté aujourd'hui.</Text>
            )}

            {/* Photos sélectionnées */}
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

            {/* Bouton ajouter photos */}
            <Pressable style={styles.pickPhotosBtn} onPress={handlePickPhotos}>
              <Text style={styles.pickPhotosBtnText}>📎 Ajouter des photos / PDF</Text>
            </Pressable>

            {/* Actions */}
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
                    ✓ Enregistrer {photosEnAttente.length > 0 ? `(${photosEnAttente.length})` : ''}
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
  todayCard: {
    margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  todayDate: { fontSize: 14, color: '#687076', marginBottom: 4 },
  todayClock: { fontSize: 40, fontWeight: '700', color: '#1A3A6B', letterSpacing: 2 },
  todayName: { fontSize: 16, color: '#11181C', fontWeight: '600', marginTop: 4, marginBottom: 8 },
  chantiersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chantierBadge: {
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    maxWidth: 160,
  },
  chantierBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: 12 },
  statusBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, padding: 12,
  },
  statusDone: { backgroundColor: '#D4EDDA' },
  statusPending: { backgroundColor: '#F2F4F7' },
  statusIcon: { fontSize: 18 },
  statusLabel: { fontSize: 12, color: '#11181C', fontWeight: '600' },
  statusTime: { fontSize: 16, color: '#1A3A6B', fontWeight: '700', marginTop: 2 },
  confirmBanner: { marginTop: 12, backgroundColor: '#D4EDDA', borderRadius: 8, padding: 10 },
  confirmText: { color: '#155724', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  buttonsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 8 },
  pointageBtn: {
    flex: 1, borderRadius: 16, padding: 20,
    alignItems: 'center', justifyContent: 'center', minHeight: 120,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  debutBtn: { backgroundColor: '#1A3A6B' },
  finBtn: { backgroundColor: '#E74C3C' },
  btnDisabled: { opacity: 0.5 },
  btnIcon: { fontSize: 32, marginBottom: 8 },
  btnLabel: { fontSize: 14, color: '#fff', fontWeight: '700', textAlign: 'center' },
  btnSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' },
  histSection: { paddingHorizontal: 16 },
  histTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', marginBottom: 12 },
  histCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  histDate: { fontSize: 13, fontWeight: '700', color: '#1A3A6B', marginBottom: 10 },
  histRow: { flexDirection: 'row', alignItems: 'flex-start' },
  histItem: { flex: 1, alignItems: 'center' },
  histSep: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 8, alignSelf: 'stretch' },
  histLabel: { fontSize: 11, color: '#687076', marginBottom: 4 },
  histTime: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  histAddr: { fontSize: 10, color: '#687076', textAlign: 'center', marginTop: 4 },
  // Modal photos
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
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
  noChantierText: { fontSize: 13, color: '#E74C3C', marginBottom: 16 },
  photosPreviewRow: { marginBottom: 12 },
  photoPreviewItem: {
    width: 80, marginRight: 10, alignItems: 'center',
  },
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
