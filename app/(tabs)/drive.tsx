/**
 * Drive documentaire général (admin) — vue transversale de TOUS les documents de
 * TOUS les chantiers (Tier 3 A3), filtrable par statut de chantier, catégorie et
 * recherche. L'ajout/suppression se fait dans le drive du chantier concerné.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { openDocPreview } from '@/lib/share/openDocPreview';
import {
  CHANTIER_DOC_CATEGORIES,
  type ChantierDoc, type ChantierDocCategorie, type StatutChantier,
} from '@/app/types';

const STATUT_GROUPES: Record<string, StatutChantier[] | null> = {
  en_cours: ['actif', 'en_attente', 'en_pause', 'sav'],
  a_letude: ['a_letude'],
  archive: ['archive'],
  tous: null,
};

const STATUT_FILTRES: { key: string; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'a_letude', label: "À l'étude" },
  { key: 'archive', label: 'Archivés' },
];

export default function DriveScreen() {
  const { data, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [filterCat, setFilterCat] = useState<ChantierDocCategorie | 'tous'>('tous');
  const [search, setSearch] = useState('');

  const catLabel = (k: ChantierDocCategorie) => CHANTIER_DOC_CATEGORIES.find(c => c.key === k)?.label || k;

  const rows = useMemo(() => {
    const allowed = STATUT_GROUPES[filterStatut];
    const q = search.trim().toLowerCase();
    const out: { doc: ChantierDoc; chantierNom: string }[] = [];
    data.chantiers.forEach(c => {
      if (allowed && !allowed.includes(c.statut)) return;
      (c.documents || []).forEach(d => {
        if (filterCat !== 'tous' && d.categorie !== filterCat) return;
        if (q && !(d.nom.toLowerCase().includes(q) || c.nom.toLowerCase().includes(q))) return;
        out.push({ doc: d, chantierNom: c.nom });
      });
    });
    return out.sort((a, b) => (b.doc.uploadedAt || '').localeCompare(a.doc.uploadedAt || ''));
  }, [data.chantiers, filterStatut, filterCat, search]);

  // Garde de route : l'onglet est masqué (href:null) mais la route reste
  // atteignable par URL (web) — on protège au rendu.
  if (!isAdmin) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 14, color: '#8C8077' }}>Accès réservé aux administrateurs.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView style={{ flex: 1, backgroundColor: '#FBF7F2' }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Drive documentaire</Text>
        <Text style={styles.subtitle}>{rows.length} document{rows.length > 1 ? 's' : ''} — tous chantiers</Text>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder="Rechercher un document ou un chantier…"
            placeholderTextColor="#B0A99F"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Filtre statut */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
          {STATUT_FILTRES.map(f => {
            const active = filterStatut === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilterStatut(f.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Filtre catégorie */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
          <Pressable onPress={() => setFilterCat('tous')} style={[styles.chip, filterCat === 'tous' && styles.chipActive]}>
            <Text style={[styles.chipText, filterCat === 'tous' && styles.chipTextActive]}>Toutes catégories</Text>
          </Pressable>
          {CHANTIER_DOC_CATEGORIES.map(c => {
            const active = filterCat === c.key;
            return (
              <Pressable key={c.key} onPress={() => setFilterCat(c.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ marginTop: 12, gap: 8 }}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>Aucun document ne correspond aux filtres.</Text>
          ) : rows.map(({ doc, chantierNom }) => (
            <Pressable key={doc.id} onPress={() => openDocPreview(doc.fichierUrl)} style={styles.row}>
              <Text style={styles.docNom} numberOfLines={1}>📄 {doc.nom}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.chantier} numberOfLines={1}>🏗 {chantierNom}</Text>
                <Text style={styles.cat}>{catLabel(doc.categorie)}</Text>
              </View>
              <Text style={styles.date}>{new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}{doc.uploadedPar ? ` · ${doc.uploadedPar}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: '#2C2C2C' },
  subtitle: { fontSize: 13, color: '#8C8077', marginTop: 2, marginBottom: 12 },
  searchWrap: { marginBottom: 8 },
  search: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#EDE4D8', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#2C2C2C' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: '#E8DDD0', backgroundColor: '#F5EDE3' },
  chipActive: { borderColor: '#2C2C2C', backgroundColor: '#2C2C2C' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#687076' },
  chipTextActive: { color: '#fff' },
  empty: { fontSize: 13, color: '#B0A99F', fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  row: { backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  docNom: { fontSize: 14, fontWeight: '700', color: '#2C2C2C' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 8 },
  chantier: { fontSize: 12, color: '#5C1F2E', fontWeight: '600', flex: 1 },
  cat: { fontSize: 11, color: '#8C8077', backgroundColor: '#F0E6DC', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  date: { fontSize: 11, color: '#8C8077', marginTop: 4 },
});
