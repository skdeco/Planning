import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView,
  Image, FlatList, Dimensions, Platform,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';

const SCREEN_W = Dimensions.get('window').width;

type TriMode = 'chantier' | 'employe' | 'date';

interface GaleriePhotosProps {
  visible: boolean;
  onClose: () => void;
  titre?: string;
  chantierId?: string; // si fourni, filtre par chantier
}

export function GaleriePhotos({ visible, onClose, titre = '📷 Galerie photos', chantierId }: GaleriePhotosProps) {
  const { data, currentUser, deletePhotoChantier } = useApp();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [triMode, setTriMode] = useState<TriMode>('chantier');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Toutes les photos filtrées par chantier si besoin
  const allPhotos = useMemo(() => {
    return (data.photosChantier || []).filter(p => {
      if (chantierId) return p.chantierId === chantierId;
      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [data.photosChantier, chantierId]);

  const getChantierNom = (id: string) =>
    data.chantiers.find(c => c.id === id)?.nom || 'Chantier inconnu';

  const getEmployeNom = (id: string) => {
    if (id === 'admin') return 'Admin';
    const e = data.employes.find(e => e.id === id);
    if (e) return `${e.prenom} ${e.nom}`;
    const st = (data.sousTraitants || []).find(s => s.id === id);
    if (st) return st.nom;
    return id;
  };

  // Groupement selon le mode de tri
  const groupes = useMemo(() => {
    const map = new Map<string, { label: string; photos: typeof allPhotos }>();

    allPhotos.forEach(p => {
      let key: string;
      let label: string;

      if (triMode === 'chantier') {
        key = p.chantierId;
        label = getChantierNom(p.chantierId);
      } else if (triMode === 'employe') {
        key = p.employeId;
        label = getEmployeNom(p.employeId);
      } else {
        // tri par date : grouper par mois
        const d = new Date(p.createdAt);
        const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        label = `${mois[d.getMonth()]} ${d.getFullYear()}`;
      }

      if (!map.has(key)) map.set(key, { label, photos: [] });
      map.get(key)!.photos.push(p);
    });

    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }));
  }, [allPhotos, triMode, data.chantiers, data.employes]);

  // 12 colonnes sur web, 10 sur mobile pour des miniatures très compactes (2x plus petites)
  const numCols = Platform.OS === 'web' ? 12 : 10;
  const itemSize = Math.floor((SCREEN_W - 32 - (numCols - 1) * 2) / numCols);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.titre}>{titre}</Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {/* Barre de tri */}
          <View style={styles.triBar}>
            <Text style={styles.triLabel}>Trier par :</Text>
            {(['chantier', 'employe', 'date'] as TriMode[]).map(mode => (
              <Pressable
                key={mode}
                style={[styles.triBtn, triMode === mode && styles.triBtnActive]}
                onPress={() => { setTriMode(mode); setExpandedGroup(null); }}
              >
                <Text style={[styles.triBtnText, triMode === mode && styles.triBtnTextActive]}>
                  {mode === 'chantier' ? '🏗 Chantier' : mode === 'employe' ? '👷 Employé' : '📅 Date'}
                </Text>
              </Pressable>
            ))}
          </View>

          {allPhotos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📷</Text>
              <Text style={styles.emptyTxt}>Aucune photo disponible</Text>
              <Text style={styles.emptySubTxt}>Les photos sont ajoutées lors des pointages, des notes ou manuellement depuis les chantiers.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {groupes.map(groupe => {
                const isExpanded = expandedGroup === null || expandedGroup === groupe.key;
                return (
                  <View key={groupe.key} style={styles.groupeContainer}>
                    {/* En-tête du groupe */}
                    <Pressable
                      style={styles.groupeHeader}
                      onPress={() => setExpandedGroup(isExpanded && expandedGroup === groupe.key ? null : groupe.key)}
                    >
                      <View style={styles.groupeHeaderLeft}>
                        <Text style={styles.groupeNom}>{groupe.label}</Text>
                        <View style={styles.groupeBadge}>
                          <Text style={styles.groupeBadgeText}>{groupe.photos.length}</Text>
                        </View>
                      </View>
                      <Text style={styles.groupeChevron}>
                        {expandedGroup === groupe.key || expandedGroup === null ? '▾' : '▸'}
                      </Text>
                    </Pressable>

                    {/* Grille de photos du groupe */}
                    {(expandedGroup === null || expandedGroup === groupe.key) && (
                      <View style={styles.groupeGrid}>
                        {groupe.photos.map(item => (
                          <Pressable
                            key={item.id}
                            style={[styles.thumb, { width: itemSize, height: itemSize }]}
                            onPress={() => setSelectedPhoto(item.uri)}
                          >
                            <Image
                              source={{ uri: item.uri }}
                              style={[styles.thumbImg, { width: itemSize, height: itemSize }]}
                              resizeMode="cover"
                            />
                            {isAdmin && (
                              <Pressable
                                style={styles.deleteBtn}
                                onPress={() => deletePhotoChantier(item.id)}
                              >
                                <Text style={styles.deleteTxt}>✕</Text>
                              </Pressable>
                            )}
                            <View style={styles.thumbOverlay}>
                              <Text style={styles.thumbDate} numberOfLines={1}>
                                {triMode === 'chantier'
                                  ? getEmployeNom(item.employeId)
                                  : triMode === 'employe'
                                  ? getChantierNom(item.chantierId)
                                  : item.date}
                              </Text>
                            </View>
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

      {/* Visionneuse plein écran */}
      {selectedPhoto && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
          <Pressable style={styles.viewer} onPress={() => setSelectedPhoto(null)}>
            <Image
              source={{ uri: selectedPhoto }}
              style={styles.viewerImg}
              resizeMode="contain"
            />
            <Pressable style={styles.viewerClose} onPress={() => setSelectedPhoto(null)}>
              <Text style={styles.viewerCloseTxt}>✕</Text>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
  },
  titre: {
    fontSize: 17,
    fontWeight: '700',
    color: '#11181C',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: {
    fontSize: 14,
    color: '#687076',
    fontWeight: '700',
  },
  // Barre de tri
  triBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
    backgroundColor: '#FAFBFC',
  },
  triLabel: {
    fontSize: 12,
    color: '#687076',
    fontWeight: '600',
    marginRight: 4,
  },
  triBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F2F4F7',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  triBtnActive: {
    backgroundColor: '#EBF0FF',
    borderColor: '#1A3A6B',
  },
  triBtnText: {
    fontSize: 12,
    color: '#687076',
    fontWeight: '600',
  },
  triBtnTextActive: {
    color: '#1A3A6B',
  },
  // Groupes
  groupeContainer: {
    marginBottom: 4,
  },
  groupeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
  },
  groupeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  groupeNom: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A3A6B',
    flex: 1,
  },
  groupeBadge: {
    backgroundColor: '#1A3A6B',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  groupeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  groupeChevron: {
    fontSize: 16,
    color: '#687076',
    marginLeft: 8,
  },
  groupeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
    gap: 2,
  },
  // Miniatures
  empty: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 8,
  },
  emptySubTxt: {
    fontSize: 13,
    color: '#687076',
    textAlign: 'center',
    lineHeight: 18,
  },
  thumb: {
    margin: 1,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#F2F4F7',
  },
  thumbImg: {
    borderRadius: 6,
  },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTxt: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  thumbOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 3,
  },
  thumbDate: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Visionneuse
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImg: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseTxt: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
