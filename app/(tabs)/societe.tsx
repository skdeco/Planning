import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Alert, Platform, Image, Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DOC_SOCIETE_CATEGORIES, type DocSocieteCategorie, type DocumentSociete } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { todayYMD } from '@/lib/date/today';

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}
function formatFR(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SocieteScreen() {
  const { data, currentUser, addDocumentSociete, updateDocumentSociete, deleteDocumentSociete } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [selectedCat, setSelectedCat] = useState<DocSocieteCategorie | 'toutes'>('toutes');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    categorie: DocSocieteCategorie;
    nom: string;
    fichierUri: string;
    fichierNom: string;
    fichierType: 'image' | 'pdf' | undefined;
    dateEmission: string;
    dateExpiration: string;
    note: string;
  }>({
    categorie: 'juridique',
    nom: '',
    fichierUri: '',
    fichierNom: '',
    fichierType: undefined,
    dateEmission: '',
    dateExpiration: '',
    note: '',
  });
  const [uploading, setUploading] = useState(false);

  const docs = useMemo<DocumentSociete[]>(() => {
    const all = data.documentsSociete || [];
    return selectedCat === 'toutes' ? all : all.filter(d => d.categorie === selectedCat);
  }, [data.documentsSociete, selectedCat]);

  // Docs qui expirent bientôt (toutes catégories)
  const alertes = useMemo(() => {
    const all = data.documentsSociete || [];
    const today = todayYMD();
    return all
      .filter(d => d.dateExpiration)
      .map(d => ({ doc: d, jours: daysBetween(today, d.dateExpiration!) }))
      .filter(x => x.jours <= 60)
      .sort((a, b) => a.jours - b.jours);
  }, [data.documentsSociete]);

  if (!isAdmin) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 14, color: '#8C8077' }}>Accès réservé aux administrateurs.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const openNew = (cat?: DocSocieteCategorie) => {
    setEditId(null);
    setForm({
      categorie: cat || (selectedCat === 'toutes' ? 'juridique' : selectedCat),
      nom: '', fichierUri: '', fichierNom: '', fichierType: undefined,
      dateEmission: '', dateExpiration: '', note: '',
    });
    setShowForm(true);
  };

  const openEdit = (d: DocumentSociete) => {
    setEditId(d.id);
    setForm({
      categorie: d.categorie,
      nom: d.nom,
      fichierUri: d.fichierUri,
      fichierNom: d.fichierNom || '',
      fichierType: d.fichierType,
      dateEmission: d.dateEmission || '',
      dateExpiration: d.dateExpiration || '',
      note: d.note || '',
    });
    setShowForm(true);
  };

  const pickFichier = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.onchange = async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const uri = reader.result as string;
            const type = file.type.startsWith('application/pdf') ? 'pdf' : 'image';
            setForm(f => ({ ...f, fichierUri: uri, fichierNom: file.name, fichierType: type }));
          };
          reader.readAsDataURL(file);
        };
        input.click();
      } else {
        const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
        if (res.canceled || !res.assets?.[0]) return;
        const asset = res.assets[0];
        const type = asset.mimeType?.includes('pdf') ? 'pdf' : 'image';
        setForm(f => ({ ...f, fichierUri: asset.uri, fichierNom: asset.name || `doc_${Date.now()}`, fichierType: type }));
      }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le fichier.');
    }
  };

  const save = async () => {
    if (!form.nom.trim() || !form.fichierUri) return;
    setUploading(true);
    try {
      const fileId = editId || genId('docsoc');
      // Upload vers Supabase Storage si pas déjà une URL http
      let fichierUri = form.fichierUri;
      if (!fichierUri.startsWith('http')) {
        const uploaded = await uploadFileToStorage(fichierUri, `societe/${form.categorie}`, fileId);
        if (uploaded) fichierUri = uploaded;
      }
      const now = new Date().toISOString();
      if (editId) {
        const existing = (data.documentsSociete || []).find(d => d.id === editId);
        if (!existing) return;
        updateDocumentSociete({
          ...existing,
          categorie: form.categorie,
          nom: form.nom.trim(),
          fichierUri,
          fichierNom: form.fichierNom || existing.fichierNom,
          fichierType: form.fichierType || existing.fichierType,
          dateEmission: form.dateEmission || undefined,
          dateExpiration: form.dateExpiration || undefined,
          note: form.note.trim() || undefined,
        });
      } else {
        addDocumentSociete({
          id: fileId,
          categorie: form.categorie,
          nom: form.nom.trim(),
          fichierUri,
          fichierNom: form.fichierNom || undefined,
          fichierType: form.fichierType,
          dateEmission: form.dateEmission || undefined,
          dateExpiration: form.dateExpiration || undefined,
          note: form.note.trim() || undefined,
          uploadedAt: now,
          uploadedBy: currentUser?.nom,
        });
      }
      setShowForm(false);
    } finally {
      setUploading(false);
    }
  };

  const ouvrirFichier = (uri: string) => {
    if (Platform.OS === 'web') {
      window.open(uri, '_blank');
    } else {
      Linking.openURL(uri).catch(() => Alert.alert('Erreur', 'Impossible d\'ouvrir le fichier.'));
    }
  };

  const confirmDelete = (d: DocumentSociete) => {
    const msg = `Supprimer "${d.nom}" ?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) deleteDocumentSociete(d.id);
    } else {
      Alert.alert('Supprimer', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteDocumentSociete(d.id) },
      ]);
    }
  };

  const categoriesWithCount = DOC_SOCIETE_CATEGORIES.map(c => ({
    ...c,
    count: (data.documentsSociete || []).filter(d => d.categorie === c.key).length,
  }));

  const selectedCatMeta = DOC_SOCIETE_CATEGORIES.find(c => c.key === (selectedCat === 'toutes' ? 'juridique' : selectedCat));

  return (
    <ScreenContainer>
      <ScrollView style={{ flex: 1, backgroundColor: '#F5EDE3' }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={styles.title}>📁 Documents société</Text>
        <Text style={styles.subtitle}>Juridique, fiscal, social, assurances, certifications…</Text>

        {/* Alertes expiration */}
        {alertes.length > 0 && (
          <View style={styles.alertesBox}>
            <Text style={styles.alertesTitle}>⚠️ Échéances à venir</Text>
            {alertes.slice(0, 5).map(a => {
              const expired = a.jours < 0;
              return (
                <Pressable key={a.doc.id} onPress={() => openEdit(a.doc)} style={styles.alerteRow}>
                  <Text style={[styles.alerteText, expired && { color: '#B83A2E' }]}>
                    {expired ? '🔴' : '🟠'} {a.doc.nom}
                  </Text>
                  <Text style={[styles.alerteDate, expired && { color: '#B83A2E' }]}>
                    {expired ? `Expiré depuis ${-a.jours}j` : `Dans ${a.jours}j`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Onglets catégories */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }} contentContainerStyle={{ gap: 6 }}>
          <Pressable
            onPress={() => setSelectedCat('toutes')}
            style={[styles.catChip, selectedCat === 'toutes' && styles.catChipActive]}
          >
            <Text style={[styles.catChipText, selectedCat === 'toutes' && { color: '#fff' }]}>
              Tout ({(data.documentsSociete || []).length})
            </Text>
          </Pressable>
          {categoriesWithCount.map(c => (
            <Pressable
              key={c.key}
              onPress={() => setSelectedCat(c.key)}
              style={[styles.catChip, selectedCat === c.key && styles.catChipActive]}
            >
              <Text style={[styles.catChipText, selectedCat === c.key && { color: '#fff' }]}>
                {c.emoji} {c.label} ({c.count})
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Suggestions */}
        {selectedCat !== 'toutes' && selectedCatMeta && (
          <View style={styles.suggestionsBox}>
            <Text style={styles.suggestionsTitle}>Suggestions {selectedCatMeta.emoji} {selectedCatMeta.label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {selectedCatMeta.suggestions.map(s => (
                <Pressable
                  key={s}
                  onPress={() => { setEditId(null); setForm({
                    categorie: selectedCat,
                    nom: s, fichierUri: '', fichierNom: '', fichierType: undefined,
                    dateEmission: '', dateExpiration: '', note: '',
                  }); setShowForm(true); }}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionChipText}>+ {s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Liste des documents */}
        {docs.length === 0 ? (
          <Text style={styles.empty}>Aucun document dans cette catégorie.</Text>
        ) : (
          docs.map(d => {
            const cat = DOC_SOCIETE_CATEGORIES.find(c => c.key === d.categorie);
            const exp = d.dateExpiration ? daysBetween(todayYMD(), d.dateExpiration) : null;
            const expExpired = exp !== null && exp < 0;
            const expSoon = exp !== null && exp >= 0 && exp <= 60;
            return (
              <View key={d.id} style={styles.docCard}>
                <Pressable onPress={() => ouvrirFichier(d.fichierUri)} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 18 }}>{cat?.emoji || '📄'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docNom}>{d.nom}</Text>
                      <Text style={styles.docMeta}>
                        {cat?.label || d.categorie} · {d.fichierType === 'pdf' ? 'PDF' : 'Image'}
                        {d.fichierNom ? ` · ${d.fichierNom}` : ''}
                      </Text>
                      {(d.dateEmission || d.dateExpiration) && (
                        <Text style={styles.docDates}>
                          {d.dateEmission && `📅 Émis ${formatFR(d.dateEmission)}`}
                          {d.dateEmission && d.dateExpiration && '  ·  '}
                          {d.dateExpiration && (
                            <Text style={expExpired ? { color: '#B83A2E', fontWeight: '700' } : expSoon ? { color: '#F57C00', fontWeight: '700' } : undefined}>
                              ⏳ Expire {formatFR(d.dateExpiration)}
                            </Text>
                          )}
                        </Text>
                      )}
                      {d.note && <Text style={styles.docNote}>💬 {d.note}</Text>}
                    </View>
                  </View>
                </Pressable>
                <View style={styles.docActions}>
                  <Pressable onPress={() => openEdit(d)} style={styles.docActionBtn}>
                    <Text style={styles.docActionText}>✏️</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(d)} style={[styles.docActionBtn, { backgroundColor: '#FBEFEC' }]}>
                    <Text style={styles.docActionText}>🗑</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        <Pressable style={styles.addBtn} onPress={() => openNew()}>
          <Text style={styles.addBtnText}>+ Ajouter un document</Text>
        </Pressable>
      </ScrollView>

      {/* Modal création / édition */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <ScrollView style={{ maxHeight: '92%' }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginBottom: 12 }}>
                {editId ? 'Modifier le document' : 'Nouveau document société'}
              </Text>

              <Text style={styles.label}>Catégorie *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 6 }}>
                {DOC_SOCIETE_CATEGORIES.map(c => (
                  <Pressable
                    key={c.key}
                    onPress={() => setForm(f => ({ ...f, categorie: c.key }))}
                    style={[styles.catChip, form.categorie === c.key && styles.catChipActive]}
                  >
                    <Text style={[styles.catChipText, form.categorie === c.key && { color: '#fff' }]}>
                      {c.emoji} {c.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Nom du document *</Text>
              <TextInput
                style={styles.input}
                value={form.nom}
                onChangeText={v => setForm(f => ({ ...f, nom: v }))}
                placeholder="Ex : Décennale AXA 2026"
              />

              <Text style={[styles.label, { marginTop: 10 }]}>Fichier *</Text>
              <Pressable onPress={pickFichier} style={styles.filePickerBtn}>
                <Text style={styles.filePickerText}>
                  {form.fichierUri ? `📎 ${form.fichierNom || 'fichier sélectionné'}` : '+ Sélectionner un fichier (PDF ou image)'}
                </Text>
              </Pressable>
              {form.fichierUri && form.fichierType === 'image' && (
                <Image source={{ uri: form.fichierUri }} style={{ width: 120, height: 120, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Émis le</Text>
                  <DatePickerField
                    value={form.dateEmission}
                    onChange={v => setForm(f => ({ ...f, dateEmission: v }))}
                    placeholder="Optionnel"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Expire le</Text>
                  <DatePickerField
                    value={form.dateExpiration}
                    onChange={v => setForm(f => ({ ...f, dateExpiration: v }))}
                    placeholder="Optionnel"
                  />
                </View>
              </View>

              <Text style={[styles.label, { marginTop: 10 }]}>Note (optionnel)</Text>
              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                value={form.note}
                onChangeText={v => setForm(f => ({ ...f, note: v }))}
                placeholder="Remarques..."
                multiline
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <Pressable onPress={() => setShowForm(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
                </Pressable>
                <Pressable
                  onPress={save}
                  disabled={!form.nom.trim() || !form.fichierUri || uploading}
                  style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: (!form.nom.trim() || !form.fichierUri || uploading) ? 0.5 : 1 }}
                >
                  <Text style={{ color: '#C9A96E', fontWeight: '800' }}>
                    {uploading ? 'Envoi...' : editId ? 'Enregistrer' : 'Ajouter'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: '#2C2C2C', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#8C8077', marginBottom: 12 },
  alertesBox: {
    backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12,
    borderLeftWidth: 4, borderLeftColor: '#F57C00',
  },
  alertesTitle: { fontSize: 13, fontWeight: '800', color: '#8C6D2F', marginBottom: 6 },
  alerteRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#F5EDE3',
  },
  alerteText: { fontSize: 12, color: '#2C2C2C', fontWeight: '600', flex: 1 },
  alerteDate: { fontSize: 11, color: '#8C6D2F', fontWeight: '700' },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8DDD0',
  },
  catChipActive: { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' },
  catChipText: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  suggestionsBox: {
    backgroundColor: '#FAF7F3', borderRadius: 10, padding: 10, marginBottom: 12,
  },
  suggestionsTitle: { fontSize: 11, fontWeight: '700', color: '#8C8077', textTransform: 'uppercase' },
  suggestionChip: {
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9A96E',
  },
  suggestionChipText: { fontSize: 11, color: '#8C6D2F', fontWeight: '700' },
  empty: { fontSize: 13, color: '#8C8077', fontStyle: 'italic', textAlign: 'center', paddingVertical: 32 },
  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
  },
  docNom: { fontSize: 14, fontWeight: '800', color: '#2C2C2C' },
  docMeta: { fontSize: 11, color: '#8C8077', marginTop: 2 },
  docDates: { fontSize: 11, color: '#687076', marginTop: 4 },
  docNote: { fontSize: 11, color: '#8C6D2F', marginTop: 4, fontStyle: 'italic' },
  docActions: { flexDirection: 'row', gap: 4 },
  docActionBtn: {
    width: 36, height: 36, backgroundColor: '#F5EDE3', borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  docActionText: { fontSize: 16 },
  addBtn: {
    backgroundColor: '#2C2C2C', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 12,
  },
  addBtnText: { color: '#C9A96E', fontSize: 14, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginBottom: 4 },
  input: {
    backgroundColor: '#FAF7F3', borderRadius: 10, borderWidth: 1.5, borderColor: '#E8DDD0',
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: '#2C2C2C',
  },
  filePickerBtn: {
    backgroundColor: '#F5EDE3', borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: '#C9A96E', paddingVertical: 14, alignItems: 'center',
  },
  filePickerText: { color: '#8C6D2F', fontWeight: '700', fontSize: 13 },
});
