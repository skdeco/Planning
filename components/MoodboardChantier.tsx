/**
 * Moodboard : images d'inspiration partagees sur un chantier
 * (client, architecte, apporteur peuvent uploader).
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Modal, TextInput, Platform, Alert, ScrollView,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { openDocPreview } from '@/lib/share/openDocPreview';
import type { Chantier } from '@/app/types';

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

interface Props {
  chantier: Chantier;
  isAdmin: boolean;
  externAp?: { id: string; prenom: string; nom: string; type: 'client' | 'architecte' | 'apporteur' | 'contractant' };
}

export function MoodboardChantier({ chantier, isAdmin, externAp }: Props) {
  const { updateChantier } = useApp();
  const inspirations = chantier.inspirations || [];
  const [showModal, setShowModal] = useState(false);
  const [uploadingList, setUploadingList] = useState<string[]>([]);
  const [noteForm, setNoteForm] = useState('');
  const [pickedUri, setPickedUri] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);

  const canAdd = isAdmin || !!externAp;

  const pickImage = async () => {
    try {
      const files = await pickNativeFile({
        acceptImages: true,
        acceptPdf: true,
        acceptCamera: true,
        multiple: false,
        compressImages: true,
      });
      if (files.length === 0) return;
      setPickedUri(files[0].uri);
      setNoteForm('');
      setShowModal(true);
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir le sélecteur.");
    }
  };

  const save = async () => {
    if (!pickedUri) return;
    const newId = genId('insp');
    setUploadingList(l => [...l, newId]);
    try {
      let uri = pickedUri;
      if (!uri.startsWith('http')) {
        const up = await uploadFileToStorage(uri, `chantiers/${chantier.id}/inspirations`, newId);
        if (up) uri = up;
      }
      const newItem = {
        id: newId,
        uri,
        titre: noteForm.trim() || undefined,
        ajoutParId: isAdmin ? 'admin' : (externAp?.id || 'unknown'),
        ajoutParNom: isAdmin ? 'Admin' : externAp ? `${externAp.prenom} ${externAp.nom}` : undefined,
        ajoutParType: (isAdmin ? 'admin' : externAp?.type) as any,
        createdAt: new Date().toISOString(),
      };
      updateChantier({ ...chantier, inspirations: [...inspirations, newItem] });
      setShowModal(false);
      setPickedUri('');
      setNoteForm('');
    } finally {
      setUploadingList(l => l.filter(x => x !== newId));
    }
  };

  const remove = (id: string) => {
    const doDel = () => updateChantier({ ...chantier, inspirations: inspirations.filter(i => i.id !== id) });
    if (Platform.OS === 'web') { if (window.confirm('Supprimer cette inspiration ?')) doDel(); }
    else Alert.alert('Supprimer', 'Supprimer cette inspiration ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: doDel },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={styles.title}>🎨 Moodboard inspirations ({inspirations.length})</Text>
      </View>

      {inspirations.length === 0 ? (
        <Text style={styles.empty}>Aucune inspiration partagée pour le moment.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {inspirations.map(i => {
            const canDelete = isAdmin || i.ajoutParId === externAp?.id;
            const isPdf = i.uri.toLowerCase().endsWith('.pdf') || i.uri.startsWith('data:application/pdf');
            return (
              <View key={i.id} style={{ width: 100, position: 'relative' }}>
                <Pressable
                  onPress={() => { if (isPdf) { openDocPreview(i.uri); } else { setPreview(i.uri); } }}
                  accessibilityRole="button"
                  accessibilityLabel={isPdf ? "Ouvrir le PDF" : "Aperçu inspiration"}
                >
                  {isPdf ? (
                    <View style={{ width: '100%', height: 100, borderRadius: 8, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 32 }}>📄</Text>
                      <Text style={{ fontSize: 10, color: '#8C6D2F', fontWeight: '700', marginTop: 2 }}>PDF</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: i.uri }} style={{ width: '100%', height: 100, borderRadius: 8 }} resizeMode="cover" />
                  )}
                  {i.titre && (
                    <Text numberOfLines={1} style={{ fontSize: 10, color: '#2C2C2C', marginTop: 3 }}>{i.titre}</Text>
                  )}
                  {i.ajoutParNom && (
                    <Text numberOfLines={1} style={{ fontSize: 9, color: '#8C8077' }}>{i.ajoutParNom}</Text>
                  )}
                </Pressable>
                {canDelete && (
                  <Pressable
                    onPress={() => remove(i.id)}
                    style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✕</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {canAdd && (
        <Pressable onPress={pickImage} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Ajouter une inspiration</Text>
        </Pressable>
      )}

      {/* Modal upload + titre */}
      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginBottom: 12 }}>🎨 Nouvelle inspiration</Text>
            {pickedUri && (pickedUri.toLowerCase().endsWith('.pdf') || pickedUri.startsWith('data:application/pdf')
              ? <View style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 12, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 48 }}>📄</Text>
                  <Text style={{ fontSize: 12, color: '#8C6D2F', fontWeight: '700', marginTop: 4 }}>PDF prêt à être ajouté</Text>
                </View>
              : <Image source={{ uri: pickedUri }} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 12 }} resizeMode="cover" />
            )}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginBottom: 4 }}>Titre / note (optionnel)</Text>
            <TextInput
              style={{ backgroundColor: '#FAF7F3', borderRadius: 10, borderWidth: 1.5, borderColor: '#E8DDD0', paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: '#2C2C2C' }}
              value={noteForm}
              onChangeText={setNoteForm}
              placeholder="Ex : style salle de bain"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable onPress={() => setShowModal(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={save} disabled={uploadingList.length > 0} style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: uploadingList.length > 0 ? 0.5 : 1 }}>
                <Text style={{ color: '#C9A96E', fontWeight: '800' }}>{uploadingList.length > 0 ? 'Envoi...' : 'Ajouter'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Preview plein écran */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable onPress={() => setPreview(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {preview && <Image source={{ uri: preview }} style={{ width: '100%', height: '90%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '800', color: '#2C2C2C' },
  empty: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
  addBtn: { backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9A96E' },
  addBtnText: { color: '#8C6D2F', fontSize: 12, fontWeight: '700' },
});
