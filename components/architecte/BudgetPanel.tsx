import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import type { Prescription, PrescriptionStatut } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { DS, radius, space, font } from '@/constants/design';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * BudgetPanel — budget consolidé des prescriptions d'un chantier.
 * Somme automatique prix × quantité par catégorie + enveloppe cible
 * (réutilise budgetsChantier) + delta validé / proposé. Palette V10.
 * Cette somme alimente l'assiette des honoraires (phase b).
 */
export interface BudgetPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

const VALIDE_STATUTS: PrescriptionStatut[] = ['valide', 'commande', 'pose'];
const PROPOSE_STATUTS: PrescriptionStatut[] = ['a_proposer', 'propose'];

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

const montantOf = (p: Prescription) => (p.prixUnitaire || 0) * (p.quantite || 0);

export function BudgetPanel({ visible, onClose, chantierId }: BudgetPanelProps) {
  const { data, updateBudgetChantier } = useApp();

  const chantierNom = useMemo(
    () => data.chantiers.find(c => c.id === chantierId)?.nom ?? '',
    [data.chantiers, chantierId],
  );

  const items = useMemo(
    () => (data.prescriptions || []).filter(p => p.chantierId === chantierId),
    [data.prescriptions, chantierId],
  );

  const total = useMemo(() => items.reduce((s, p) => s + montantOf(p), 0), [items]);
  const totalValide = useMemo(
    () => items.filter(p => VALIDE_STATUTS.includes(p.statut)).reduce((s, p) => s + montantOf(p), 0),
    [items],
  );
  const totalPropose = useMemo(
    () => items.filter(p => PROPOSE_STATUTS.includes(p.statut)).reduce((s, p) => s + montantOf(p), 0),
    [items],
  );

  // Répartition par catégorie (triée par montant décroissant)
  const parCategorie = useMemo(() => {
    const map = new Map<string, { count: number; montant: number }>();
    for (const p of items) {
      const cur = map.get(p.categorie) || { count: 0, montant: 0 };
      cur.count += 1;
      cur.montant += montantOf(p);
      map.set(p.categorie, cur);
    }
    return Array.from(map.entries())
      .map(([nom, v]) => ({ nom, ...v }))
      .sort((a, b) => b.montant - a.montant);
  }, [items]);

  const enveloppe = data.budgetsChantier?.[chantierId];
  const [envDraft, setEnvDraft] = useState('');

  useEffect(() => {
    if (visible) setEnvDraft(enveloppe != null ? String(enveloppe) : '');
  }, [visible, chantierId, enveloppe]);

  const saveEnveloppe = () => {
    const v = envDraft.trim() ? parseFloat(envDraft.replace(',', '.')) : NaN;
    updateBudgetChantier(chantierId, Number.isFinite(v) ? v : undefined);
  };

  const pctEnveloppe = enveloppe && enveloppe > 0 ? (total / enveloppe) * 100 : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <PanelHeader title="Budget" sub={chantierNom} onClose={onClose} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <EmptyState title="Budget vide" description="Ajoutez des prescriptions : leur total se calcule ici automatiquement." />
          ) : (
            <>
              {/* Hero total */}
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>Budget prescription</Text>
                <Text style={styles.heroValue}>{fmt(total)} €</Text>
                {pctEnveloppe != null ? (
                  <>
                    <View style={{ marginTop: space.sm }}>
                      <ProgressBar value={pctEnveloppe} variant={pctEnveloppe > 100 ? 'marron' : 'bordeaux'} showPercent />
                    </View>
                    <Text style={styles.heroEnv}>Enveloppe cible {fmt(enveloppe || 0)} €</Text>
                  </>
                ) : null}
              </View>

              {/* Enveloppe cible éditable */}
              <View style={styles.envRow}>
                <Text style={styles.envLabel}>Enveloppe cible (€)</Text>
                <TextInput
                  style={styles.envInput}
                  placeholder="—"
                  placeholderTextColor={DS.textAlt}
                  keyboardType="decimal-pad"
                  value={envDraft}
                  onChangeText={setEnvDraft}
                  onEndEditing={saveEnveloppe}
                  onSubmitEditing={saveEnveloppe}
                  returnKeyType="done"
                />
              </View>

              {/* Delta validé / proposé */}
              <View style={styles.deltaRow}>
                <View style={[styles.delta, { backgroundColor: DS.cremeNude }]}>
                  <Text style={[styles.deltaLabel, { color: DS.bordeaux }]}>Validé</Text>
                  <Text style={[styles.deltaValue, { color: DS.bordeaux }]}>{fmt(totalValide)} €</Text>
                </View>
                <View style={[styles.delta, { backgroundColor: DS.nudeMoyen }]}>
                  <Text style={[styles.deltaLabel, { color: DS.marron }]}>Proposé</Text>
                  <Text style={[styles.deltaValue, { color: DS.marron }]}>{fmt(totalPropose)} €</Text>
                </View>
              </View>

              {/* Répartition par catégorie */}
              <Text style={styles.sectionTitle}>Répartition</Text>
              {parCategorie.map(cat => {
                const share = total > 0 ? (cat.montant / total) * 100 : 0;
                return (
                  <View key={cat.nom} style={styles.catRow}>
                    <View style={styles.catHead}>
                      <Text style={styles.catNom} numberOfLines={1}>
                        {cat.nom} <Text style={styles.catCount}>· {cat.count}</Text>
                      </Text>
                      <Text style={styles.catMontant}>{fmt(cat.montant)} €</Text>
                    </View>
                    <ProgressBar value={share} variant="bordeaux" />
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.cremeFond },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingTop: space.xxxl, paddingBottom: space.md },
  hTitle: { fontSize: font.xl, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  hSub: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  hero: {
    backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border,
    padding: space.lg, marginBottom: space.md,
  },
  heroLabel: { fontSize: font.tiny, fontWeight: font.bold, color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { fontSize: font.xxl, fontWeight: font.heavy, color: DS.sombre, marginTop: 2 },
  heroEnv: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron, marginTop: space.xs },
  envRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border,
    paddingHorizontal: space.lg, paddingVertical: space.sm, marginBottom: space.md,
  },
  envLabel: { fontSize: font.body, fontWeight: font.semibold, color: DS.sombre },
  envInput: { minWidth: 90, textAlign: 'right', fontSize: font.md, fontWeight: font.bold, color: DS.text, paddingVertical: space.xs },
  deltaRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  delta: { flex: 1, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.md, alignItems: 'center' },
  deltaLabel: { fontSize: font.tiny, fontWeight: font.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  deltaValue: { fontSize: font.subhead, fontWeight: font.heavy, marginTop: 2 },
  sectionTitle: { fontSize: font.compact, fontWeight: font.bold, color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: space.sm },
  catRow: { marginBottom: space.md },
  catHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.xs },
  catNom: { flex: 1, fontSize: font.body, fontWeight: font.semibold, color: DS.sombre },
  catCount: { color: DS.textSecondary, fontWeight: font.normal },
  catMontant: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
});
