import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView,
  Image, FlatList, Dimensions, Platform,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';

const SCREEN_W = Dimensions.get('window').width;

interface GaleriePhotosProps {
  visible: boolean;
  onClose: () => void;
  titre?: string;
  chantierId?: string; // si fourni, filtre par chantier
}

export function GaleriePhotos({ visible, onClose, titre = '📷 Galerie photos', chantierId }: GaleriePhotosProps) {
  const { data, currentUser, deletePhotoChantier } = useApp();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const photos = (data.photosChantier || []).filter(p => {
    if (chantierId) return p.chantierId === chantierId;
    return true;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const getChantierNom = (id: string) =>
    data.chantiers.find(c => c.id === id)?.nom || id;

  const getEmployeNom = (id: string) => {
    const e = data.employes.find(e => e.id === id);
    return e ? `${e.prenom} ${e.nom}` : id;
  };

  const numCols = Platform.OS === 'web' ? 4 : 3;
  const itemSize = Math.floor((SCREEN_W - 32 - (numCols - 1) * 4) / numCols);

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

          {photos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📷</Text>
              <Text style={styles.emptyTxt}>Aucune photo disponible</Text>
              <Text style={styles.emptySubTxt}>Les photos sont ajoutées lors des pointages ou manuellement depuis les chantiers.</Text>
            </View>
          ) : (
            <FlatList
              data={photos}
              numColumns={numCols}
              keyExtractor={p => p.id}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <Pressable
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
                    <Text style={styles.thumbDate}>{item.date}</Text>
                  </View>
                </Pressable>
              )}
            />
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
    maxHeight: '90%',
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
  grid: {
    padding: 16,
    gap: 4,
  },
  thumb: {
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F2F4F7',
  },
  thumbImg: {
    borderRadius: 8,
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 3,
  },
  thumbDate: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
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
