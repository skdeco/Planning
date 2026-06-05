/**
 * Recherche globale (admin) — modal plein écran.
 *
 * Cherche à travers toutes les entités de l'app (chantiers, employés,
 * sous-traitants, articles, SAV, devis ST, documents société, apporteurs) avec
 * des filtres par type cumulables. Aucun filtre sélectionné = tous les types.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Search, X, Building2, HardHat, Briefcase, Package, Wrench, FilePen,
  FileText, Users, ChevronRight, ListFilter,
} from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';

type FilterType = 'chantier' | 'employe' | 'st' | 'article' | 'sav' | 'devis' | 'docSociete' | 'apporteur';

interface SearchResult {
  type: FilterType;
  id: string;
  label: string;
  sub: string;
  route?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const FILTERS: { type: FilterType; label: string; icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { type: 'chantier', label: 'Chantiers', icon: Building2 },
  { type: 'employe', label: 'Employés', icon: HardHat },
  { type: 'st', label: 'Sous-traitants', icon: Briefcase },
  { type: 'article', label: 'Articles', icon: Package },
  { type: 'sav', label: 'SAV', icon: Wrench },
  { type: 'devis', label: 'Devis ST', icon: FilePen },
  { type: 'docSociete', label: 'Docs société', icon: FileText },
  { type: 'apporteur', label: 'Contacts', icon: Users },
];

const ICONS: Record<FilterType, React.ComponentType<{ size?: number; color?: string }>> = {
  chantier: Building2, employe: HardHat, st: Briefcase, article: Package,
  sav: Wrench, devis: FilePen, docSociete: FileText, apporteur: Users,
};

export function GlobalSearch({ visible, onClose }: Props) {
  const { data } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Set<FilterType>>(new Set());

  const toggleFilter = (t: FilterType) =>
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    const wants = (t: FilterType) => active.size === 0 || active.has(t);
    const out: SearchResult[] = [];

    if (wants('chantier')) {
      data.chantiers.forEach(c => {
        if (c.nom.toLowerCase().includes(q) || (c.adresse || '').toLowerCase().includes(q))
          out.push({ type: 'chantier', id: c.id, label: c.nom, sub: c.adresse || c.statut, route: '/(tabs)/chantiers' });
      });
    }
    if (wants('employe')) {
      data.employes.forEach(e => {
        if (`${e.prenom} ${e.nom}`.toLowerCase().includes(q) || (e.identifiant || '').toLowerCase().includes(q) || (e.metier || '').toLowerCase().includes(q))
          out.push({ type: 'employe', id: e.id, label: `${e.prenom} ${e.nom}`, sub: e.metier || 'Employé', route: '/(tabs)/equipe' });
      });
    }
    if (wants('st')) {
      data.sousTraitants.forEach(s => {
        if (`${s.prenom} ${s.nom} ${s.societe} ${s.email} ${s.telephone}`.toLowerCase().includes(q))
          out.push({ type: 'st', id: s.id, label: s.societe || `${s.prenom} ${s.nom}`, sub: `${s.prenom} ${s.nom}`.trim() || 'Sous-traitant', route: '/(tabs)/equipe' });
      });
    }
    if (wants('article')) {
      (data.catalogueArticles || []).forEach(a => {
        if (a.nom.toLowerCase().includes(q) || (a.reference || '').toLowerCase().includes(q) || (a.fournisseur || '').toLowerCase().includes(q))
          out.push({ type: 'article', id: a.id, label: a.nom, sub: a.categorie + (a.fournisseur ? ` · ${a.fournisseur}` : ''), route: '/(tabs)/materiel' });
      });
    }
    if (wants('sav')) {
      (data.ticketsSAV || []).forEach(t => {
        if (t.objet.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)) {
          const ch = data.chantiers.find(c => c.id === t.chantierId);
          out.push({ type: 'sav', id: t.id, label: t.objet, sub: `${t.statut}${ch ? ` · ${ch.nom}` : ''}`, route: '/(tabs)/chantiers' });
        }
      });
    }
    if (wants('devis')) {
      (data.devis || []).forEach(d => {
        const st = data.sousTraitants.find(s => s.id === d.soustraitantId);
        const ch = data.chantiers.find(c => c.id === d.chantierId);
        if ((d.objet || '').toLowerCase().includes(q) || (st?.societe || '').toLowerCase().includes(q) || (ch?.nom || '').toLowerCase().includes(q))
          out.push({ type: 'devis', id: d.id, label: `${d.objet || 'Devis'} — ${st?.societe || 'ST'}`, sub: `${ch?.nom || ''}${d.devisSigne ? ' · signé' : d.devisFichier ? ' · à signer' : ''}`, route: '/(tabs)/financier-st' });
      });
    }
    if (wants('docSociete')) {
      (data.documentsSociete || []).forEach(doc => {
        if (doc.nom.toLowerCase().includes(q) || doc.categorie.toLowerCase().includes(q))
          out.push({ type: 'docSociete', id: doc.id, label: doc.nom, sub: doc.categorie, route: '/(tabs)/societe' });
      });
    }
    if (wants('apporteur')) {
      (data.apporteurs || []).forEach(a => {
        if (`${a.prenom} ${a.nom} ${a.societe || ''} ${a.email || ''}`.toLowerCase().includes(q))
          out.push({ type: 'apporteur', id: a.id, label: `${a.prenom} ${a.nom}`, sub: a.societe || a.type, route: '/(tabs)/equipe' });
      });
    }

    return out.slice(0, 60);
  }, [query, active, data]);

  const go = (r: SearchResult) => {
    if (r.route) router.push(r.route as never);
    close();
  };

  const close = () => { setQuery(''); setActive(new Set()); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <View style={styles.container}>
        {/* Barre de recherche */}
        <View style={styles.searchRow}>
          <Search size={18} color={DS.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Rechercher partout…"
            placeholderTextColor={DS.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={18} color={DS.textMuted} />
            </Pressable>
          )}
          <Pressable onPress={close} hitSlop={8} style={styles.cancelBtn}>
            <Text style={styles.cancelTxt}>Fermer</Text>
          </Pressable>
        </View>

        {/* Filtres par type */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
          {FILTERS.map(f => {
            const on = active.has(f.type);
            const Icon = f.icon;
            return (
              <Pressable key={f.type} onPress={() => toggleFilter(f.type)} style={[styles.chip, on && styles.chipOn]}>
                <Icon size={13} color={on ? DS.surface : DS.bordeaux} />
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
          {active.size > 0 && (
            <Pressable onPress={() => setActive(new Set())} style={styles.chipClear}>
              <ListFilter size={13} color={DS.textAlt} />
              <Text style={styles.chipClearTxt}>Tous</Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Résultats */}
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
          {query.trim().length < 2 ? (
            <Text style={styles.hint}>Tape au moins 2 caractères pour rechercher.</Text>
          ) : results.length === 0 ? (
            <Text style={styles.hint}>Aucun résultat pour « {query} ».</Text>
          ) : (
            <>
              <Text style={styles.count}>{results.length} résultat{results.length > 1 ? 's' : ''}</Text>
              {results.map(r => {
                const Icon = ICONS[r.type];
                return (
                  <Pressable key={`${r.type}_${r.id}`} style={styles.row} onPress={() => go(r)}>
                    <View style={styles.rowIcon}><Icon size={18} color={DS.bordeaux} /></View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel} numberOfLines={1}>{r.label}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{r.sub}</Text>
                    </View>
                    <ChevronRight size={16} color={DS.textDisabled} />
                  </Pressable>
                );
              })}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.cremeFond, paddingTop: Platform.OS === 'ios' ? 56 : 24 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: DS.surface, marginHorizontal: space.lg, paddingHorizontal: space.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: DS.border,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: font.md, color: DS.text },
  cancelBtn: { paddingLeft: space.sm },
  cancelTxt: { fontSize: font.body, color: DS.bordeaux, fontWeight: font.semibold },
  chipsScroll: { marginTop: space.md, maxHeight: 44 },
  chipsContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: DS.cremeNude, borderRadius: radius.full,
    paddingHorizontal: space.md, paddingVertical: 7,
  },
  chipOn: { backgroundColor: DS.bordeaux },
  chipTxt: { fontSize: font.compact, color: DS.bordeaux, fontWeight: font.semibold },
  chipTxtOn: { color: DS.surface },
  chipClear: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: space.md, paddingVertical: 7,
  },
  chipClearTxt: { fontSize: font.compact, color: DS.textAlt, fontWeight: font.medium },
  results: { flex: 1, marginTop: space.md, paddingHorizontal: space.lg },
  hint: { fontSize: font.body, color: DS.textAlt, textAlign: 'center', marginTop: space.xxxl },
  count: { fontSize: font.compact, color: DS.textAlt, marginBottom: space.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: DS.surface, borderRadius: radius.md, padding: space.md,
    marginBottom: space.sm, borderWidth: 1, borderColor: DS.border,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: DS.cremeNude,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: font.md, fontWeight: font.semibold, color: DS.textStrong },
  rowSub: { fontSize: font.sm, color: DS.textAlt, marginTop: 1 },
});
