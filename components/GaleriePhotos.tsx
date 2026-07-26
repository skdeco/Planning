import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView,
  Image, Platform, TextInput, Alert, useWindowDimensions,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { uploadFileToStorage } from '@/lib/supabase';
import { todayYMD } from '@/lib/date/today';
import { NativeFilePickerButton } from '@/components/share/NativeFilePickerButton';
import type { PickedFile } from '@/lib/share/pickNativeFile';
import type { PhotoChantier } from '@/app/types';

type TriMode = 'chantier' | 'employe' | 'semaine';

interface GaleriePhotosProps {
  visible: boolean;
  onClose: () => void;
  titre?: string;
  chantierId?: string;
}

function formatDatePhoto(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

function getWeekLabel(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const mon = monday.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const fri = friday.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${mon} — ${fri}`;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export function GaleriePhotos({ visible, onClose, titre, chantierId }: GaleriePhotosProps) {
  const { data, currentUser, deletePhotoChantier, addPhotoChantier, updatePhotoChantier } = useApp();
  const { t, language } = useLanguage();
  const dateLocale = ({ fr: 'fr-FR', en: 'en-GB', es: 'es-ES', pt: 'pt-PT', ru: 'ru-RU', ar: 'ar-EG' } as const)[language] || 'fr-FR';
  const { width: screenW } = useWindowDimensions();
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoChantier | null>(null);
  const [triMode, setTriMode] = useState<TriMode>('chantier');
  const [filterEmployeId, setFilterEmployeId] = useState<string | 'all'>('all');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  // Upload
  const [uploadLegende, setUploadLegende] = useState('');
  const [uploadChantierId, setUploadChantierId] = useState<string>(chantierId || '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelecting = selectedIds.size > 0;
  const toggleSelect = (id: string) => setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const clearSelection = () => setSelectedIds(new Set());

  const isAdmin = currentUser?.role === 'admin';
  const myId = currentUser?.employeId || currentUser?.soustraitantId || 'admin';
  // Gestion du partage photos (admin/entreprise + architecte). Le client ne voit que les photos partagées.
  const externType = (data.apporteurs || []).find(a => a.id === currentUser?.apporteurId)?.type;
  const canManagePhotos = isAdmin || externType === 'architecte';

  // Non-admin (employé / sous-traitant) : restreint aux chantiers où l'utilisateur est
  // affecté — la galerie globale ne doit pas exposer les photos des autres chantiers.
  const allowedChantierIds = useMemo(() => {
    if (isAdmin) return null; // null = tous les chantiers
    const ids = new Set<string>();
    const empId = currentUser?.employeId;
    const stId = currentUser?.soustraitantId;
    data.affectations.forEach(a => {
      if ((empId && a.employeId === empId) || (stId && a.soustraitantId === stId)) ids.add(a.chantierId);
    });
    if (empId) data.chantiers.forEach(c => { if ((c.employeIds || []).includes(empId)) ids.add(c.id); });
    return ids;
  }, [isAdmin, currentUser?.employeId, currentUser?.soustraitantId, data.affectations, data.chantiers]);

  const allPhotos = useMemo(() => {
    let photos = (data.photosChantier || []);
    if (chantierId) photos = photos.filter(p => p.chantierId === chantierId);
    else if (allowedChantierIds) photos = photos.filter(p => allowedChantierIds.has(p.chantierId));
    if (!canManagePhotos) photos = photos.filter(p => p.partageExterne !== false); // client : photos partagées seulement
    if (filterEmployeId !== 'all') photos = photos.filter(p => p.employeId === filterEmployeId);
    return photos.sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
  }, [data.photosChantier, chantierId, filterEmployeId, allowedChantierIds, canManagePhotos]);

  const getChantierNom = (id: string) => data.chantiers.find(c => c.id === id)?.nom || '?';
  const getChantierCouleur = (id: string) => data.chantiers.find(c => c.id === id)?.couleur || '#2C2C2C';
  const getEmployeNom = (id: string) => {
    if (id === 'admin') return 'Admin';
    const e = data.employes.find(e => e.id === id);
    if (e) return `${e.prenom} ${e.nom}`;
    const st = (data.sousTraitants || []).find(s => s.id === id);
    return st?.nom || id;
  };

  // Employés qui ont des photos (pour le filtre)
  const photographes = useMemo(() => {
    const ids = new Set((data.photosChantier || []).filter(p => !chantierId || p.chantierId === chantierId).map(p => p.employeId));
    return [...ids].map(id => ({ id, nom: getEmployeNom(id) }));
  }, [data.photosChantier, chantierId]);

  // Groupement
  const groupes = useMemo(() => {
    const map = new Map<string, { label: string; color?: string; photos: PhotoChantier[] }>();
    allPhotos.forEach(p => {
      let key: string, label: string, color: string | undefined;
      if (triMode === 'chantier') {
        key = p.chantierId; label = getChantierNom(p.chantierId); color = getChantierCouleur(p.chantierId);
      } else if (triMode === 'employe') {
        key = p.employeId; label = getEmployeNom(p.employeId);
      } else {
        key = getWeekKey(p.date || (p.createdAt || '').slice(0, 10) || '2026-01-01'); label = getWeekLabel(p.date || (p.createdAt || '').slice(0, 10) || '2026-01-01', dateLocale);
      }
      if (!map.has(key)) map.set(key, { label, color, photos: [] });
      map.get(key)!.photos.push(p);
    });
    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }));
  }, [allPhotos, triMode, dateLocale]);

  // Taille des miniatures
  const numCols = screenW > 900 ? 8 : screenW > 600 ? 6 : 4;
  const itemSize = Math.floor((screenW - 32 - (numCols - 1) * 4) / numCols);

  // Upload photo unique (1 fichier par appel — itération multi gérée par NativeFilePickerButton)
  const handlePickNative = useCallback(async (file: PickedFile): Promise<boolean> => {
    const targetChantierId = uploadChantierId || chantierId || data.chantiers.find(c => c.statut === 'actif')?.id;
    if (!targetChantierId) {
      if (Platform.OS === 'web') alert(t.galerie.selectChantier);
      else Alert.alert(t.galerie.selectionRequired, t.galerie.selectChantier);
      return false;
    }
    const photoId = `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const storageUrl = await uploadFileToStorage(file.uri, `chantiers/${targetChantierId}/photos`, photoId);
    if (!storageUrl) {
      if (Platform.OS !== 'web') Alert.alert(t.common.error, t.galerie.uploadError);
      return false;
    }
    addPhotoChantier({
      id: photoId,
      chantierId: targetChantierId,
      employeId: myId,
      date: todayYMD(),
      uri: storageUrl,
      nom: file.filename,
      legende: uploadLegende.trim() || undefined,
      createdAt: new Date().toISOString(),
      source: 'manuel',
    });
    return true;
  }, [chantierId, uploadChantierId, data.chantiers, myId, uploadLegende, addPhotoChantier]);

  // Télécharger une photo
  const downloadPhoto = (photo: PhotoChantier) => {
    if (Platform.OS !== 'web') return;
    const a = document.createElement('a');
    a.href = photo.uri;
    a.download = photo.nom || `photo_${photo.date}_${photo.id}.jpg`;
    a.target = '_blank';
    a.click();
  };

  // Télécharger toutes les photos visibles
  const downloadAll = () => {
    allPhotos.forEach((p, i) => setTimeout(() => downloadPhoto(p), i * 300));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={() => { setSelectedPhoto(null); clearSelection(); }}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: '95%' }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.titre}>{titre || t.galerie.title}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {allPhotos.length > 0 && (
                <Pressable style={styles.downloadAllBtn} onPress={downloadAll}>
                  <Text style={styles.downloadAllBtnText}>Tout ({allPhotos.length})</Text>
                </Pressable>
              )}
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeTxt}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* Zone ajout */}
          <View style={styles.uploadBar}>
            {/* Sélecteur chantier — visible si pas de chantierId fixe (admin galerie globale) */}
            {!chantierId && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 4 }}>
                {data.chantiers.filter(c => c.statut === 'actif' && (!allowedChantierIds || allowedChantierIds.has(c.id))).map(c => (
                  <Pressable key={c.id}
                    style={[styles.triBtn, uploadChantierId === c.id && { backgroundColor: c.couleur || '#2C2C2C', borderColor: c.couleur || '#2C2C2C' }]}
                    onPress={() => setUploadChantierId(c.id)}>
                    <Text style={[styles.triBtnText, uploadChantierId === c.id && { color: '#fff' }]} numberOfLines={1}>{c.nom}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <TextInput
              style={[styles.legendeInput, { marginBottom: 6 }]}
              placeholder={t.galerie.captionPlaceholder}
              placeholderTextColor="#999"
              value={uploadLegende}
              onChangeText={setUploadLegende}
            />
            <NativeFilePickerButton
              onPick={handlePickNative}
              acceptImages
              acceptCamera
              acceptPdf={false}
              multiple
              compressImages
              label={`📸 ${t.galerie.add}`}
              disabled={!chantierId && !uploadChantierId}
            />
          </View>

          {/* Barre de tri + filtre employé */}
          <View style={styles.triBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
              <Text style={styles.triLabel}>{t.galerie.sort}</Text>
              {([['chantier', '🏗'], ['employe', '👷'], ['semaine', '📅']] as [TriMode, string][]).map(([mode, icon]) => (
                <Pressable key={mode} style={[styles.triBtn, triMode === mode && styles.triBtnActive]}
                  onPress={() => { setTriMode(mode); setExpandedGroup(null); }}>
                  <Text style={[styles.triBtnText, triMode === mode && styles.triBtnTextActive]}>
                    {icon} {mode === 'chantier' ? t.galerie.byChantier : mode === 'employe' ? t.galerie.byEmploye : t.galerie.byWeek}
                  </Text>
                </Pressable>
              ))}
              <View style={{ width: 1, height: 20, backgroundColor: '#E2E6EA', marginHorizontal: 4 }} />
              <Pressable style={[styles.triBtn, filterEmployeId === 'all' && styles.triBtnActive]}
                onPress={() => setFilterEmployeId('all')}>
                <Text style={[styles.triBtnText, filterEmployeId === 'all' && styles.triBtnTextActive]}>{t.common.all}</Text>
              </Pressable>
              {photographes.map(p => (
                <Pressable key={p.id} style={[styles.triBtn, filterEmployeId === p.id && styles.triBtnActive]}
                  onPress={() => setFilterEmployeId(filterEmployeId === p.id ? 'all' : p.id)}>
                  <Text style={[styles.triBtnText, filterEmployeId === p.id && styles.triBtnTextActive]}>{p.nom.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Barre de sélection */}
          {isSelecting && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#2C2C2C' }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{selectedIds.size} {t.galerie.selected}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  onPress={() => { allPhotos.filter(p => selectedIds.has(p.id)).forEach((p, i) => setTimeout(() => downloadPhoto(p), i * 300)); clearSelection(); }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t.common.download}</Text>
                </Pressable>
                {isAdmin && (
                  <Pressable style={{ backgroundColor: 'rgba(239,68,68,0.8)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                    onPress={() => {
                      const doDelete = () => { selectedIds.forEach(id => deletePhotoChantier(id)); clearSelection(); };
                      if (Platform.OS === 'web') { if (window.confirm(`${t.common.delete} ${selectedIds.size} ${t.galerie.photosWord} ?`)) doDelete(); }
                      else Alert.alert(t.common.delete, `${t.common.delete} ${selectedIds.size} ${t.galerie.photosWord} ?`, [{ text: t.common.cancel, style: 'cancel' }, { text: t.common.delete, style: 'destructive', onPress: doDelete }]);
                    }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t.common.delete}</Text>
                  </Pressable>
                )}
                <Pressable style={{ paddingHorizontal: 8, paddingVertical: 6 }} onPress={clearSelection}>
                  <Text style={{ color: '#fff', fontSize: 12 }}>✕</Text>
                </Pressable>
              </View>
            </View>
          )}

          {allPhotos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📷</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C', marginBottom: 8 }}>{t.galerie.noPhoto}</Text>
              <Text style={{ fontSize: 13, color: '#687076', textAlign: 'center' }}>
                {t.galerie.noPhotoHint}
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {groupes.map(groupe => {
                const isExpanded = expandedGroup === null || expandedGroup === groupe.key;
                return (
                  <View key={groupe.key}>
                    <Pressable style={styles.groupeHeader}
                      onPress={() => setExpandedGroup(isExpanded && expandedGroup === groupe.key ? null : groupe.key)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        {groupe.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: groupe.color }} />}
                        <Text style={styles.groupeNom}>{groupe.label}</Text>
                        <View style={styles.groupeBadge}>
                          <Text style={styles.groupeBadgeText}>{groupe.photos.length}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#687076' }}>{expandedGroup === groupe.key || expandedGroup === null ? '▾' : '▸'}</Text>
                    </Pressable>

                    {isExpanded && (
                      <View style={styles.groupeGrid}>
                        {groupe.photos.map(item => (
                          <Pressable key={item.id} style={[styles.thumb, { width: itemSize, height: itemSize }, selectedIds.has(item.id) && { borderWidth: 3, borderColor: '#2C2C2C', borderRadius: 10 }]}
                            onPress={() => isSelecting ? toggleSelect(item.id) : setSelectedPhoto(item)}
                            onLongPress={() => toggleSelect(item.id)}>
                            {item.uri ? (
                              <Image source={{ uri: item.uri }} style={{ width: itemSize - (selectedIds.has(item.id) ? 6 : 0), height: itemSize - (selectedIds.has(item.id) ? 6 : 0), borderRadius: 8 }} resizeMode="cover" />
                            ) : (
                              <View style={{ width: itemSize, height: itemSize, borderRadius: 8, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>📷</Text></View>
                            )}
                            {selectedIds.has(item.id) && (
                              <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#2C2C2C', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                              </View>
                            )}
                            <View style={styles.thumbOverlay}>
                              <Text style={styles.thumbInfo} numberOfLines={1}>
                                {triMode === 'chantier' ? getEmployeNom(item.employeId).split(' ')[0] : triMode === 'employe' ? getChantierNom(item.chantierId) : formatDatePhoto(item.createdAt || item.date, dateLocale)}
                              </Text>
                            </View>
                            {item.legende && (
                              <View style={styles.thumbLegendeTag}>
                                <Text style={{ fontSize: 8, color: '#fff' }} numberOfLines={1}>{item.legende}</Text>
                              </View>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Visionneuse plein écran avec navigation */}
      {selectedPhoto && (() => {
        const idx = allPhotos.findIndex(p => p.id === selectedPhoto.id);
        const hasPrev = idx > 0;
        const hasNext = idx < allPhotos.length - 1;
        const goPrev = () => { if (hasPrev) setSelectedPhoto(allPhotos[idx - 1]); };
        const goNext = () => { if (hasNext) setSelectedPhoto(allPhotos[idx + 1]); };
        return (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
          <View style={styles.viewer}>
            {selectedPhoto.uri ? (
              <Image source={{ uri: selectedPhoto.uri }} style={styles.viewerImg} resizeMode="contain" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 48 }}>📷</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>{t.galerie.photoUnavailable}</Text>
              </View>
            )}
            {/* Navigation prev/next */}
            {hasPrev && (
              <Pressable style={{ position: 'absolute', left: 8, top: '40%', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }} onPress={goPrev}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>‹</Text>
              </Pressable>
            )}
            {hasNext && (
              <Pressable style={{ position: 'absolute', right: 8, top: '40%', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }} onPress={goNext}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>›</Text>
              </Pressable>
            )}
            {/* Compteur */}
            <View style={{ position: 'absolute', top: 50, left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>{idx + 1} / {allPhotos.length}</Text>
            </View>
            {/* Infos en bas */}
            <View style={styles.viewerInfo}>
              <View style={{ flex: 1 }}>
                {selectedPhoto.legende && (
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 }}>{selectedPhoto.legende}</Text>
                )}
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                  {getEmployeNom(selectedPhoto.employeId)} — {formatDatePhoto(selectedPhoto.createdAt || selectedPhoto.date, dateLocale)}
                </Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                  {getChantierNom(selectedPhoto.chantierId)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                {canManagePhotos && (
                  <Pressable
                    style={[styles.viewerActionBtn, { width: 'auto', paddingHorizontal: 12, backgroundColor: selectedPhoto.partageExterne === false ? 'rgba(140,109,47,0.35)' : 'rgba(46,125,91,0.4)' }]}
                    onPress={() => { const upd = { ...selectedPhoto, partageExterne: selectedPhoto.partageExterne === false ? true : false }; updatePhotoChantier(upd); setSelectedPhoto(upd); }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{selectedPhoto.partageExterne === false ? 'Privé' : 'Partagé'}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.viewerActionBtn} onPress={() => downloadPhoto(selectedPhoto)}>
                  <Text style={{ fontSize: 18 }}>⬇</Text>
                </Pressable>
                {isAdmin && (
                  <Pressable style={[styles.viewerActionBtn, { backgroundColor: 'rgba(239,68,68,0.3)' }]}
                    onPress={() => {
                      const next = hasNext ? allPhotos[idx + 1] : hasPrev ? allPhotos[idx - 1] : null;
                      deletePhotoChantier(selectedPhoto.id);
                      setSelectedPhoto(next);
                    }}>
                    <Text style={{ fontSize: 18 }}>🗑</Text>
                  </Pressable>
                )}
              </View>
            </View>
            {/* Fermer */}
            <Pressable style={styles.viewerClose} onPress={() => setSelectedPhoto(null)}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        </Modal>
        );
      })()}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F5EDE3' },
  titre: { fontSize: 17, fontWeight: '700', color: '#11181C' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 14, color: '#687076', fontWeight: '700' },
  downloadAllBtn: { backgroundColor: '#2C2C2C', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  downloadAllBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Upload
  uploadBar: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#F5EDE3', backgroundColor: '#FAFBFC' },
  legendeInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#11181C' },
  uploadBtn: { backgroundColor: '#2C2C2C', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, justifyContent: 'center' },
  uploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Tri
  triBar: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5EDE3', backgroundColor: '#FAFBFC' },
  triLabel: { fontSize: 12, color: '#687076', fontWeight: '600' },
  triBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: 'transparent' },
  triBtnActive: { backgroundColor: '#EBF0FF', borderColor: '#2C2C2C' },
  triBtnText: { fontSize: 12, color: '#687076', fontWeight: '600' },
  triBtnTextActive: { color: '#2C2C2C' },
  // Groupes
  groupeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F8F9FA', borderBottomWidth: 1, borderBottomColor: '#E2E6EA' },
  groupeNom: { fontSize: 14, fontWeight: '700', color: '#2C2C2C' },
  groupeBadge: { backgroundColor: '#2C2C2C', borderRadius: 10, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  groupeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  groupeGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 4 },
  // Miniatures
  empty: { alignItems: 'center', padding: 48 },
  thumb: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#F5EDE3' },
  thumbOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, paddingVertical: 2 },
  thumbInfo: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  thumbLegendeTag: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(26,58,107,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, maxWidth: '80%' },
  // Visionneuse
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
  viewerInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', padding: 20, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.6)' },
  viewerActionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
