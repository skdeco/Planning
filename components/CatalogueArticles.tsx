import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, TextInput, Platform, Alert,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { CATEGORIES_ARTICLES, type ArticleCatalogue, type CategorieArticle } from '@/app/types';

function genId() { return `art_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CatalogueArticles({ visible, onClose }: Props) {
  const { data, addArticleCatalogue, updateArticleCatalogue, deleteArticleCatalogue } = useApp();
  const [filterCat, setFilterCat] = useState<CategorieArticle | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nom: '', categorie: 'outillage' as CategorieArticle, description: '', reference: '',
    prixUnitaire: '', fournisseur: '', lienFournisseur: '', unite: 'pièce',
  });

  const articles = useMemo(() => {
    let list = data.catalogueArticles || [];
    if (filterCat !== 'all') list = list.filter(a => a.categorie === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(a => a.nom.toLowerCase().includes(q) || (a.reference || '').toLowerCase().includes(q) || (a.fournisseur || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));
  }, [data.catalogueArticles, filterCat, search]);

  // Grouper par catégorie
  const grouped = useMemo(() => {
    const map = new Map<string, ArticleCatalogue[]>();
    articles.forEach(a => {
      const cat = CATEGORIES_ARTICLES.find(c => c.value === a.categorie)?.label || a.categorie;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(a);
    });
    return [...map.entries()];
  }, [articles]);

  const openNew = () => {
    setEditId(null);
    setForm({ nom: '', categorie: 'outillage', description: '', reference: '', prixUnitaire: '', fournisseur: '', lienFournisseur: '', unite: 'pièce' });
    setShowForm(true);
  };

  const openEdit = (a: ArticleCatalogue) => {
    setEditId(a.id);
    setForm({
      nom: a.nom, categorie: a.categorie, description: a.description || '', reference: a.reference || '',
      prixUnitaire: a.prixUnitaire ? String(a.prixUnitaire) : '', fournisseur: a.fournisseur || '',
      lienFournisseur: a.lienFournisseur || '', unite: a.unite || 'pièce',
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.nom.trim()) return;
    const now = new Date().toISOString();
    const article: ArticleCatalogue = {
      id: editId || genId(),
      nom: form.nom.trim(),
      categorie: form.categorie,
      description: form.description.trim() || undefined,
      reference: form.reference.trim() || undefined,
      prixUnitaire: form.prixUnitaire ? parseFloat(form.prixUnitaire) : undefined,
      fournisseur: form.fournisseur.trim() || undefined,
      lienFournisseur: form.lienFournisseur.trim() || undefined,
      unite: form.unite.trim() || undefined,
      createdAt: editId ? (data.catalogueArticles || []).find(a => a.id === editId)?.createdAt || now : now,
      updatedAt: now,
    };
    if (editId) updateArticleCatalogue(article);
    else addArticleCatalogue(article);
    setShowForm(false);
  };

  const handleDelete = (id: string, nom: string) => {
    const doDelete = () => deleteArticleCatalogue(id);
    if (Platform.OS === 'web') { if (window.confirm(`Supprimer "${nom}" ?`)) doDelete(); }
    else Alert.alert('Supprimer', `Supprimer "${nom}" ?`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '95%', flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E6EA' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#11181C' }}>📦 Catalogue articles</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={{ backgroundColor: '#1A3A6B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }} onPress={openNew}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>+ Article</Text>
              </Pressable>
              <Pressable style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
                <Text style={{ fontSize: 14, color: '#687076', fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* Recherche */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: '#F2F4F7' }}>
            <TextInput
              style={{ flex: 1, backgroundColor: '#F2F4F7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, borderWidth: 1, borderColor: '#E2E6EA' }}
              placeholder="Rechercher un article, référence, fournisseur..."
              placeholderTextColor="#999"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Filtres catégories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: '#F2F4F7' }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 4 }}>
            <Pressable style={[chipS, filterCat === 'all' && chipSA]} onPress={() => setFilterCat('all')}>
              <Text style={[chipT, filterCat === 'all' && chipTA]}>Tout ({(data.catalogueArticles || []).length})</Text>
            </Pressable>
            {CATEGORIES_ARTICLES.map(c => {
              const count = (data.catalogueArticles || []).filter(a => a.categorie === c.value).length;
              return (
                <Pressable key={c.value} style={[chipS, filterCat === c.value && chipSA]} onPress={() => setFilterCat(filterCat === c.value ? 'all' : c.value)}>
                  <Text style={[chipT, filterCat === c.value && chipTA]}>{c.label} {count > 0 ? `(${count})` : ''}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Liste */}
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
            {articles.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
                <Text style={{ fontSize: 15, color: '#687076' }}>Aucun article dans le catalogue</Text>
                <Text style={{ fontSize: 12, color: '#B0BEC5', marginTop: 4 }}>Cliquez "+ Article" pour commencer</Text>
              </View>
            )}
            {grouped.map(([cat, items]) => (
              <View key={cat}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A3A6B', marginTop: 10, marginBottom: 6 }}>{cat} ({items.length})</Text>
                {items.map(a => (
                  <Pressable key={a.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#E2E6EA', flexDirection: 'row', gap: 10 }}
                    onPress={() => openEdit(a)}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#11181C' }}>{a.nom}</Text>
                      {a.reference && <Text style={{ fontSize: 11, color: '#687076' }}>Réf: {a.reference}</Text>}
                      {a.description && <Text style={{ fontSize: 12, color: '#687076', marginTop: 2 }}>{a.description}</Text>}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {a.prixUnitaire != null && <Text style={{ fontSize: 11, fontWeight: '700', color: '#27AE60' }}>{a.prixUnitaire} €/{a.unite || 'u'}</Text>}
                        {a.fournisseur && <Text style={{ fontSize: 11, color: '#687076' }}>🏪 {a.fournisseur}</Text>}
                      </View>
                    </View>
                    <Pressable onPress={() => handleDelete(a.id, a.nom)} style={{ padding: 4 }}>
                      <Text style={{ color: '#E74C3C', fontSize: 12 }}>🗑</Text>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Modal formulaire */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }} onPress={() => setShowForm(false)}>
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '85%' }} onPress={e => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 12 }}>{editId ? 'Modifier l\'article' : 'Nouvel article'}</Text>

              <Text style={lbl}>Nom *</Text>
              <TextInput style={inp} value={form.nom} onChangeText={v => setForm(f => ({ ...f, nom: v }))} placeholder="Ex: Disjoncteur 20A" />

              <Text style={lbl}>Catégorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 4 }}>
                {CATEGORIES_ARTICLES.map(c => (
                  <Pressable key={c.value} style={[chipS, form.categorie === c.value && chipSA]} onPress={() => setForm(f => ({ ...f, categorie: c.value }))}>
                    <Text style={[chipT, form.categorie === c.value && chipTA]}>{c.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={lbl}>Description (visible employé)</Text>
              <TextInput style={[inp, { minHeight: 50 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline placeholder="Description pour l'employé..." />

              <Text style={lbl}>Référence fournisseur</Text>
              <TextInput style={inp} value={form.reference} onChangeText={v => setForm(f => ({ ...f, reference: v }))} placeholder="Ex: LEG-04886" />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Prix unitaire (€)</Text>
                  <TextInput style={inp} value={form.prixUnitaire} onChangeText={v => setForm(f => ({ ...f, prixUnitaire: v }))} keyboardType="decimal-pad" placeholder="12.50" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Unité</Text>
                  <TextInput style={inp} value={form.unite} onChangeText={v => setForm(f => ({ ...f, unite: v }))} placeholder="pièce, m, m², kg..." />
                </View>
              </View>

              <Text style={lbl}>Fournisseur</Text>
              <TextInput style={inp} value={form.fournisseur} onChangeText={v => setForm(f => ({ ...f, fournisseur: v }))} placeholder="Ex: Leroy Merlin" />

              <Text style={lbl}>Lien fournisseur (URL)</Text>
              <TextInput style={inp} value={form.lienFournisseur} onChangeText={v => setForm(f => ({ ...f, lienFournisseur: v }))} placeholder="https://..." autoCapitalize="none" />

              <Pressable style={{ backgroundColor: '#1A3A6B', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16, opacity: form.nom.trim() ? 1 : 0.5 }}
                onPress={handleSave} disabled={!form.nom.trim()}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editId ? 'Modifier' : 'Ajouter au catalogue'}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const chipS = { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F2F4F7', borderWidth: 1, borderColor: '#E2E6EA' };
const chipSA = { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' };
const chipT = { fontSize: 11, fontWeight: '600' as const, color: '#687076' };
const chipTA = { color: '#fff' };
const lbl = { fontSize: 12, fontWeight: '600' as const, color: '#687076', marginBottom: 4, marginTop: 8 };
const inp = { backgroundColor: '#F2F4F7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 4, color: '#11181C' };
