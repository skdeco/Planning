import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { useConfirm } from '@/hooks/useConfirm';
import { CHANTIER_DOC_CATEGORIES, type ChantierDoc, type ChantierDocCategorie } from '@/app/types';

/**
 * DriveChantier — Drive documentaire par chantier (Tier 3 A2).
 * Liste les documents groupés par catégorie (Devis, Devis TS, Devis concurrents,
 * Photos de l'existant, Références diverses, Factures) avec upload / aperçu /
 * suppression. Disponible dès le statut "à l'étude".
 */
interface DriveChantierProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

export function DriveChantier({ visible, onClose, chantierId }: DriveChantierProps) {
  const { data, currentUser, updateChantier } = useApp();
  const { confirm, ConfirmModal } = useConfirm();
  const [uploadingCat, setUploadingCat] = useState<ChantierDocCategorie | null>(null);

  const chantier = data.chantiers.find(c => c.id === chantierId);
  const documents = chantier?.documents || [];

  const handleAdd = async (categorie: ChantierDocCategorie) => {
    if (!chantier) return;
    try {
      const picked = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true, compressImages: true });
      if (!picked.length) return;
      setUploadingCat(categorie);
      const nouveaux: ChantierDoc[] = [];
      for (const f of picked) {
        const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const url = await uploadFileToStorage(f.uri, `chantiers/${chantierId}/drive`, docId);
        if (url) {
          nouveaux.push({
            id: docId,
            categorie,
            nom: f.filename || 'Document',
            fichierUrl: url,
            uploadedAt: new Date().toISOString(),
            uploadedPar: currentUser?.nom,
          });
        }
      }
      if (nouveaux.length) {
        updateChantier({ ...chantier, documents: [...documents, ...nouveaux] });
      }
    } catch (e) {
      console.error('Ajout document drive échoué', e);
    } finally {
      setUploadingCat(null);
    }
  };

  const handleDelete = async (doc: ChantierDoc) => {
    if (!chantier) return;
    if (await confirm(`Supprimer "${doc.nom}" ?`)) {
      updateChantier({ ...chantier, documents: documents.filter(d => d.id !== doc.id) });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Documents</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{chantier?.nom || ''}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
            {CHANTIER_DOC_CATEGORIES.map(cat => {
              const docs = documents.filter(d => d.categorie === cat.key);
              return (
                <View key={cat.key} style={styles.catBlock}>
                  <View style={styles.catHeader}>
                    <Text style={styles.catTitle}>{cat.label} ({docs.length})</Text>
                    <Pressable
                      onPress={() => handleAdd(cat.key)}
                      disabled={uploadingCat !== null}
                      style={[styles.addBtn, uploadingCat !== null && { opacity: 0.4 }]}
                    >
                      {uploadingCat === cat.key
                        ? <ActivityIndicator size="small" color="#5C1F2E" />
                        : <Text style={styles.addBtnText}>+ Ajouter</Text>}
                    </Pressable>
                  </View>
                  {docs.length === 0 ? (
                    <Text style={styles.empty}>Aucun document</Text>
                  ) : docs.map(doc => (
                    <View key={doc.id} style={styles.docRow}>
                      <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => openDocPreview(doc.fichierUrl)}>
                        <Text style={styles.docNom} numberOfLines={1}>{doc.nom}</Text>
                        <Text style={styles.docMeta}>
                          {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}{doc.uploadedPar ? ` · ${doc.uploadedPar}` : ''}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => handleDelete(doc)} hitSlop={8} style={styles.delBtn}>
                        <Text style={styles.del}>🗑</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              );
            })}
            <View style={{ height: 24 }} />
          </ScrollView>

          <ConfirmModal />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF7F2', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDE4D8',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#2C2C2C' },
  subtitle: { fontSize: 13, color: '#8C8077', marginTop: 2 },
  close: { fontSize: 20, color: '#8C8077', paddingHorizontal: 4 },
  catBlock: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 },
  catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catTitle: { fontSize: 14, fontWeight: '700', color: '#5C1F2E' },
  addBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F0E6DC' },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#5C1F2E' },
  empty: { fontSize: 12, color: '#B0A99F', fontStyle: 'italic' },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F2ECE4',
  },
  docNom: { fontSize: 13, fontWeight: '600', color: '#2C2C2C' },
  docMeta: { fontSize: 11, color: '#8C8077', marginTop: 1 },
  delBtn: { padding: 4 },
  del: { fontSize: 15 },
});
