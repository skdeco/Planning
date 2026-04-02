import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView,
  Image, Platform, TextInput, Alert, useWindowDimensions,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { uploadFileToStorage } from '@/lib/supabase';
import type { PhotoChantier } from '@/app/types';

type TriMode = 'chantier' | 'employe' | 'semaine';

interface GaleriePhotosProps {
  visible: boolean;
  onClose: () => void;
  titre?: string;
  chantierId?: string;
}

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function formatDatePhoto(iso: string): string {
  const d = new Date(iso);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return `${monday.getDate()} ${MOIS[monday.getMonth()]} — ${friday.getDate()} ${MOIS[friday.getMonth()]}`;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export function GaleriePhotos({ visible, onClose, titre = '📷 Galerie photos', chantierId }: GaleriePhotosProps) {
  const { data, currentUser, deletePhotoChantier, addPhotoChantier } = useApp();
  const { width: screenW } = useWindowDimensions();
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoChantier | null>(null);
  const [triMode, setTriMode] = useState<TriMode>('chantier');
  const [filterEmployeId, setFilterEmployeId] = useState<string | 'all'>('all');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadLegende, setUploadLegende] = useState('');
  const [uploadChantierId, setUploadChantierId] = useState<string>(chantierId || '');

  const isAdmin = currentUser?.role === 'admin';
  const myId = currentUser?.employeId || currentUser?.soustraitantId || 'admin';

  const allPhotos = useMemo(() => {
    let photos = (data.photosChantier || []);
    if (chantierId) photos = photos.filter(p => p.chantierId === chantierId);
    if (filterEmployeId !== 'all') photos = photos.filter(p => p.employeId === filterEmployeId);
    return photos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [data.photosChantier, chantierId, filterEmployeId]);

  const getChantierNom = (id: string) => data.chantiers.find(c => c.id === id)?.nom || '?';
  const getChantierCouleur = (id: string) => data.chantiers.find(c => c.id === id)?.couleur || '#1A3A6B';
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
        key = getWeekKey(p.date); label = getWeekLabel(p.date);
      }
      if (!map.has(key)) map.set(key, { label, color, photos: [] });
      map.get(key)!.photos.push(p);
    });
    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }));
  }, [allPhotos, triMode]);

  // Taille des miniatures
  const numCols = screenW > 900 ? 8 : screenW > 600 ? 6 : 4;
  const itemSize = Math.floor((screenW - 32 - (numCols - 1) * 4) / numCols);

  // Upload photos
  const handleUploadPhotos = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    const targetChantierId = uploadChantierId || chantierId || data.chantiers.find(c => c.statut === 'actif')?.id;
    if (!targetChantierId) { alert('Veuillez sélectionner un chantier'); return; }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      setUploading(true);
      let ok = 0;
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        const base64: string = await new Promise(resolve => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const photoId = `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storageUrl = await uploadFileToStorage(base64, `chantiers/${targetChantierId}/photos`, photoId);
        if (storageUrl) {
          addPhotoChantier({
            id: photoId,
            chantierId: targetChantierId,
            employeId: myId,
            date: new Date().toISOString().slice(0, 10),
            uri: storageUrl,
            nom: file.name,
            legende: uploadLegende.trim() || undefined,
            createdAt: new Date().toISOString(),
            source: 'manuel',
          });
          ok++;
        }
      }
      setUploading(false);
      setUploadLegende('');
      if (ok > 0) alert(`${ok} photo(s) ajoutée(s)`);
    };
    input.click();
  }, [chantierId, data.chantiers, myId, uploadLegende, addPhotoChantier]);

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { maxHeight: '95%' }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.titre}>{titre}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {allPhotos.length > 0 && (
                <Pressable style={styles.downloadAllBtn} onPress={downloadAll}>
                  <Text style={styles.downloadAllBtnText}>⬇ Tout ({allPhotos.length})</Text>
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
                {data.chantiers.filter(c => c.statut === 'actif').map(c => (
                  <Pressable key={c.id}
                    style={[styles.triBtn, uploadChantierId === c.id && { backgroundColor: c.couleur || '#1A3A6B', borderColor: c.couleur || '#1A3A6B' }]}
                    onPress={() => setUploadChantierId(c.id)}>
                    <Text style={[styles.triBtnText, uploadChantierId === c.id && { color: '#fff' }]} numberOfLines={1}>{c.nom}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.legendeInput, { flex: 1 }]}
                placeholder="Légende (optionnel)..."
                placeholderTextColor="#999"
                value={uploadLegende}
                onChangeText={setUploadLegende}
              />
              <Pressable
                style={[styles.uploadBtn, (uploading || (!chantierId && !uploadChantierId)) && { opacity: 0.5 }]}
                onPress={handleUploadPhotos}
                disabled={uploading || (!chantierId && !uploadChantierId)}>
                <Text style={styles.uploadBtnText}>{uploading ? '...' : '📸 Ajouter'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Barre de tri + filtre employé */}
          <View style={styles.triBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
              <Text style={styles.triLabel}>Tri :</Text>
              {([['chantier', '🏗'], ['employe', '👷'], ['semaine', '📅']] as [TriMode, string][]).map(([mode, icon]) => (
                <Pressable key={mode} style={[styles.triBtn, triMode === mode && styles.triBtnActive]}
                  onPress={() => { setTriMode(mode); setExpandedGroup(null); }}>
                  <Text style={[styles.triBtnText, triMode === mode && styles.triBtnTextActive]}>
                    {icon} {mode === 'chantier' ? 'Chantier' : mode === 'employe' ? 'Employé' : 'Semaine'}
                  </Text>
                </Pressable>
              ))}
              <View style={{ width: 1, height: 20, backgroundColor: '#E2E6EA', marginHorizontal: 4 }} />
              <Pressable style={[styles.triBtn, filterEmployeId === 'all' && styles.triBtnActive]}
                onPress={() => setFilterEmployeId('all')}>
                <Text style={[styles.triBtnText, filterEmployeId === 'all' && styles.triBtnTextActive]}>Tous</Text>
              </Pressable>
              {photographes.map(p => (
                <Pressable key={p.id} style={[styles.triBtn, filterEmployeId === p.id && styles.triBtnActive]}
                  onPress={() => setFilterEmployeId(filterEmployeId === p.id ? 'all' : p.id)}>
                  <Text style={[styles.triBtnText, filterEmployeId === p.id && styles.triBtnTextActive]}>{p.nom.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {allPhotos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📷</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C', marginBottom: 8 }}>Aucune photo</Text>
              <Text style={{ fontSize: 13, color: '#687076', textAlign: 'center' }}>
                Cliquez sur "Ajouter des photos" pour commencer.
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
                          <Pressable key={item.id} style={[styles.thumb, { width: itemSize, height: itemSize }]}
                            onPress={() => setSelectedPhoto(item)}>
                            <Image source={{ uri: item.uri }} style={{ width: itemSize, height: itemSize, borderRadius: 8 }} resizeMode="cover" />
                            <View style={styles.thumbOverlay}>
                              <Text style={styles.thumbInfo} numberOfLines={1}>
                                {triMode === 'chantier' ? getEmployeNom(item.employeId).split(' ')[0] : triMode === 'employe' ? getChantierNom(item.chantierId) : formatDatePhoto(item.createdAt)}
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

      {/* Visionneuse plein écran enrichie */}
      {selectedPhoto && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
          <View style={styles.viewer}>
            <Image source={{ uri: selectedPhoto.uri }} style={styles.viewerImg} resizeMode="contain" />
            {/* Infos en bas */}
            <View style={styles.viewerInfo}>
              <View style={{ flex: 1 }}>
                {selectedPhoto.legende && (
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 }}>{selectedPhoto.legende}</Text>
                )}
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                  {getEmployeNom(selectedPhoto.employeId)} — {formatDatePhoto(selectedPhoto.createdAt)}
                </Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                  {getChantierNom(selectedPhoto.chantierId)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable style={styles.viewerActionBtn} onPress={() => downloadPhoto(selectedPhoto)}>
                  <Text style={{ fontSize: 18 }}>⬇</Text>
                </Pressable>
                {isAdmin && (
                  <Pressable style={[styles.viewerActionBtn, { backgroundColor: 'rgba(239,68,68,0.3)' }]}
                    onPress={() => {
                      deletePhotoChantier(selectedPhoto.id);
                      setSelectedPhoto(null);
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
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  titre: { fontSize: 17, fontWeight: '700', color: '#11181C' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 14, color: '#687076', fontWeight: '700' },
  downloadAllBtn: { backgroundColor: '#1A3A6B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  downloadAllBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Upload
  uploadBar: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F7', backgroundColor: '#FAFBFC' },
  legendeInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#11181C' },
  uploadBtn: { backgroundColor: '#1A3A6B', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, justifyContent: 'center' },
  uploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Tri
  triBar: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F2F4F7', backgroundColor: '#FAFBFC' },
  triLabel: { fontSize: 12, color: '#687076', fontWeight: '600' },
  triBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F2F4F7', borderWidth: 1, borderColor: 'transparent' },
  triBtnActive: { backgroundColor: '#EBF0FF', borderColor: '#1A3A6B' },
  triBtnText: { fontSize: 12, color: '#687076', fontWeight: '600' },
  triBtnTextActive: { color: '#1A3A6B' },
  // Groupes
  groupeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F8F9FA', borderBottomWidth: 1, borderBottomColor: '#E2E6EA' },
  groupeNom: { fontSize: 14, fontWeight: '700', color: '#1A3A6B' },
  groupeBadge: { backgroundColor: '#1A3A6B', borderRadius: 10, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  groupeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  groupeGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 4 },
  // Miniatures
  empty: { alignItems: 'center', padding: 48 },
  thumb: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#F2F4F7' },
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
