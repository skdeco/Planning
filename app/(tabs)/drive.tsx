/**
 * Drive documentaire général (admin) — vue transversale de TOUS les documents de
 * TOUS les chantiers (Tier 3 A3), filtrable par statut de chantier, catégorie et
 * recherche. L'ajout/suppression se fait dans le drive du chantier concerné.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { BackToPlus } from '@/components/ui/BackToPlus';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
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
  const { t, language } = useLanguage();
  const dateLocale = ({ fr: 'fr-FR', en: 'en-GB', es: 'es-ES', pt: 'pt-PT', ru: 'ru-RU', ar: 'ar-EG' } as const)[language] || 'fr-FR';
  const isAdmin = currentUser?.role === 'admin';
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [filterCat, setFilterCat] = useState<ChantierDocCategorie | 'tous'>('tous');
  const [search, setSearch] = useState('');

  const catLabel = (k: ChantierDocCategorie) => (t.cats.chantierDoc as Record<string, string>)[k] || k;
  const statutLabel = (k: string) => k === 'tous' ? t.common.all : k === 'en_cours' ? t.common.ongoing : k === 'a_letude' ? t.statut.aLetude : t.statut.archives;

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
          <Text style={{ fontSize: 14, color: '#6A6A68' }}>{t.common.accessReserved}</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackToPlus />
      <ScrollView style={{ flex: 1, backgroundColor: '#F4F4F2' }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t.drive.title}</Text>
        <Text style={styles.subtitle}>{rows.length} {t.drive.documents} — {t.drive.allChantiers}</Text>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder={t.drive.searchPlaceholder}
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
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{statutLabel(f.key)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Filtre catégorie */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
          <Pressable onPress={() => setFilterCat('tous')} style={[styles.chip, filterCat === 'tous' && styles.chipActive]}>
            <Text style={[styles.chipText, filterCat === 'tous' && styles.chipTextActive]}>{t.drive.allCategories}</Text>
          </Pressable>
          {CHANTIER_DOC_CATEGORIES.map(c => {
            const active = filterCat === c.key;
            return (
              <Pressable key={c.key} onPress={() => setFilterCat(c.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{catLabel(c.key)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ marginTop: 12, gap: 8 }}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>{t.drive.empty}</Text>
          ) : rows.map(({ doc, chantierNom }) => (
            <Pressable key={doc.id} onPress={() => openDocPreview(doc.fichierUrl)} style={styles.row}>
              <Text style={styles.docNom} numberOfLines={1}>{doc.nom}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.chantier} numberOfLines={1}>{chantierNom}</Text>
                <Text style={styles.cat}>{catLabel(doc.categorie)}</Text>
              </View>
              <Text style={styles.date}>{new Date(doc.uploadedAt).toLocaleDateString(dateLocale)}{doc.uploadedPar ? ` · ${doc.uploadedPar}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Manrope_500Medium', fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: '#141414' },
  subtitle: { fontSize: 13, color: '#6A6A68', marginTop: 2, marginBottom: 12 },
  searchWrap: { marginBottom: 8 },
  search: { backgroundColor: '#fff', borderRadius: 23, minHeight: 46, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, color: '#141414', shadowColor: '#141414', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  chip: { paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: 999, backgroundColor: '#EBEBE8' },
  chipActive: { backgroundColor: '#141414' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#141414' },
  chipTextActive: { color: '#fff' },
  empty: { fontSize: 14, color: '#959593', textAlign: 'center', paddingVertical: 24 },
  row: { backgroundColor: '#fff', borderRadius: 24, padding: 14, shadowColor: '#141414', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 },
  docNom: { fontSize: 15.5, fontWeight: '600', color: '#141414' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 8 },
  chantier: { fontSize: 13, color: '#141414', fontWeight: '600', flex: 1 },
  cat: { fontSize: 12.5, color: '#6A6A68', backgroundColor: '#EBEBE8', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  date: { fontSize: 12.5, color: '#6A6A68', marginTop: 4 },
});
