import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { Plus, Pencil, Trash2, Link2, Paperclip, X } from 'lucide-react-native';
import type { Prescription, PrescriptionNature, PrescriptionStatut } from '@/app/types';
import { PRESCRIPTION_STATUT_LABELS } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FilterChip } from '@/components/ui/FilterChip';
import { StatusPill, type StatusType } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * PrescriptionsPanel — prescriptions matériaux & déco d'un chantier.
 * Boucle archi → entreprise → client (statut). Palette V10 bordeaux/crème.
 *
 * Panel plein écran (pattern SuiviCRPanel). Le formulaire d'ajout est rendu
 * en overlay inline — jamais en <Modal> imbriquée (fix bug Modal-on-Modal iOS).
 */
export interface PrescriptionsPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
  /** Auteur des prescriptions créées ('admin' ou apporteurId architecte). */
  auteurId?: string;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

/** Mappe le statut de prescription vers un StatusPill (3 tons DS). */
function statutToPill(statut: PrescriptionStatut): StatusType {
  if (statut === 'valide') return 'actif';
  if (statut === 'commande' || statut === 'pose') return 'livre';
  return 'attente'; // a_proposer, propose, refuse
}

const NATURES: { key: PrescriptionNature; label: string }[] = [
  { key: 'materiau', label: 'Matériau' },
  { key: 'deco', label: 'Décoration' },
];

const STATUTS: PrescriptionStatut[] = [
  'a_proposer', 'propose', 'valide', 'refuse', 'commande', 'pose',
];

type FormState = {
  nature: PrescriptionNature;
  categorie: string;
  designation: string;
  marque: string;
  reference: string;
  lien: string;
  prixUnitaire: string;
  unite: string;
  quantite: string;
  statut: PrescriptionStatut;
};

const EMPTY_FORM: FormState = {
  nature: 'materiau', categorie: '', designation: '', marque: '', reference: '',
  lien: '', prixUnitaire: '', unite: '', quantite: '', statut: 'a_proposer',
};

export function PrescriptionsPanel({ visible, onClose, chantierId, auteurId = 'admin' }: PrescriptionsPanelProps) {
  const { data, addPrescription, updatePrescription, deletePrescription } = useApp();

  const [filter, setFilter] = useState<string | null>(null); // null = toutes
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const chantierNom = useMemo(
    () => data.chantiers.find(c => c.id === chantierId)?.nom ?? '',
    [data.chantiers, chantierId],
  );

  const items = useMemo(
    () => (data.prescriptions || []).filter(p => p.chantierId === chantierId),
    [data.prescriptions, chantierId],
  );

  const categories = useMemo(
    () => Array.from(new Set(items.map(i => i.categorie))).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const visibles = useMemo(
    () => (filter === null ? items : items.filter(i => i.categorie === filter)),
    [items, filter],
  );

  // Regroupe par catégorie (ordre alphabétique)
  const groupes = useMemo(() => {
    const map = new Map<string, Prescription[]>();
    for (const p of visibles) {
      const arr = map.get(p.categorie) || [];
      arr.push(p);
      map.set(p.categorie, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibles]);

  const totalCategorie = (list: Prescription[]) =>
    list.reduce((s, p) => s + (p.prixUnitaire || 0) * (p.quantite || 0), 0);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: Prescription) => {
    setEditId(p.id);
    setForm({
      nature: p.nature,
      categorie: p.categorie,
      designation: p.designation,
      marque: p.marque || '',
      reference: p.reference || '',
      lien: p.lien || '',
      prixUnitaire: p.prixUnitaire != null ? String(p.prixUnitaire) : '',
      unite: p.unite || '',
      quantite: p.quantite != null ? String(p.quantite) : '',
      statut: p.statut,
    });
    setShowForm(true);
  };

  const save = () => {
    if (!form.designation.trim() || !form.categorie.trim()) return;
    const now = new Date().toISOString();
    const existing = editId ? items.find(i => i.id === editId) : undefined;
    const num = (v: string) => (v.trim() ? parseFloat(v.replace(',', '.')) || undefined : undefined);
    const entry: Prescription = {
      id: editId || genId('presc'),
      chantierId,
      nature: form.nature,
      categorie: form.categorie.trim(),
      designation: form.designation.trim(),
      marque: form.marque.trim() || undefined,
      reference: form.reference.trim() || undefined,
      lien: form.lien.trim() || undefined,
      prixUnitaire: num(form.prixUnitaire),
      unite: form.unite.trim() || undefined,
      quantite: num(form.quantite),
      statut: form.statut,
      visibilite: existing?.visibilite,
      alternatives: existing?.alternatives,
      documents: existing?.documents,
      livraisonId: existing?.livraisonId,
      createParId: existing?.createParId || auteurId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (editId) updatePrescription(entry);
    else addPrescription(entry);
    setShowForm(false);
  };

  const confirmDelete = (p: Prescription) => {
    Alert.alert('Supprimer', `Supprimer « ${p.designation} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deletePrescription(p.id) },
    ]);
  };

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        {/* En-tête */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Prescriptions</Text>
            {chantierNom ? <Text style={styles.hSub}>{chantierNom}</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={DS.sombre} />
          </Pressable>
        </View>

        {/* Filtres par catégorie */}
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="Toutes" active={filter === null} onPress={() => setFilter(null)} activeColor={DS.bordeaux} />
            {categories.map(c => (
              <FilterChip key={c} label={c} active={filter === c} onPress={() => setFilter(c)} activeColor={DS.bordeaux} />
            ))}
          </ScrollView>
        )}

        {/* Liste groupée */}
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {groupes.length === 0 ? (
            <EmptyState iconComponent={Plus} title="Aucune prescription" description="Ajoutez le premier matériau ou élément de décoration." />
          ) : (
            groupes.map(([cat, list]) => (
              <View key={cat} style={styles.groupe}>
                <SectionHeader title={cat} count={list.length} subtitle={`${fmt(totalCategorie(list))} €`} uppercase size="sm" />
                {list.map(p => {
                  const sousTotal = (p.prixUnitaire || 0) * (p.quantite || 0);
                  return (
                    <View key={p.id} style={styles.card}>
                      <View style={styles.cardBody}>
                        <Text style={styles.designation} numberOfLines={1}>{p.designation}</Text>
                        {(p.marque || p.reference) ? (
                          <Text style={styles.marque} numberOfLines={1}>{[p.marque, p.reference].filter(Boolean).join(' · ')}</Text>
                        ) : null}
                        <View style={styles.metaRow}>
                          {p.prixUnitaire != null ? (
                            <Text style={styles.prix}>
                              {fmt(p.prixUnitaire)} €{p.unite ? ` /${p.unite}` : ''}
                              {p.quantite != null && sousTotal ? ` · ${fmt(sousTotal)} €` : ''}
                            </Text>
                          ) : null}
                          {p.lien ? <Link2 size={13} color={DS.textSecondary} /> : null}
                          {p.documents && p.documents.length > 0 ? <Paperclip size={13} color={DS.textSecondary} /> : null}
                        </View>
                        <View style={styles.pillRow}>
                          <StatusPill label={PRESCRIPTION_STATUT_LABELS[p.statut]} status={statutToPill(p.statut)} />
                        </View>
                      </View>
                      <View style={styles.actions}>
                        <Pressable hitSlop={8} onPress={() => openEdit(p)} style={styles.actionBtn}>
                          <Pencil size={16} color={DS.bordeaux} />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => confirmDelete(p)} style={styles.actionBtn}>
                          <Trash2 size={16} color={DS.marron} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {/* FAB ajouter */}
        <Pressable style={styles.fab} onPress={openNew}>
          <Plus size={22} color={DS.cremeFond} />
        </Pressable>

        {/* Formulaire ajout/édition — overlay inline (pas de Modal imbriquée) */}
        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.formTitle}>{editId ? 'Modifier' : 'Nouvelle prescription'}</Text>

                <View style={styles.segRow}>
                  {NATURES.map(n => (
                    <FilterChip key={n.key} label={n.label} active={form.nature === n.key} onPress={() => set({ nature: n.key })} activeColor={DS.bordeaux} />
                  ))}
                </View>

                <TextInput style={styles.input} placeholder="Catégorie (ex: Carrelage, Luminaires)" placeholderTextColor={DS.textAlt} value={form.categorie} onChangeText={t => set({ categorie: t })} />
                <TextInput style={styles.input} placeholder="Désignation (ex: Grès cérame 60×60 mat)" placeholderTextColor={DS.textAlt} value={form.designation} onChangeText={t => set({ designation: t })} />
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Marque" placeholderTextColor={DS.textAlt} value={form.marque} onChangeText={t => set({ marque: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Référence" placeholderTextColor={DS.textAlt} value={form.reference} onChangeText={t => set({ reference: t })} />
                </View>
                <TextInput style={styles.input} placeholder="Lien fournisseur (https://…)" placeholderTextColor={DS.textAlt} autoCapitalize="none" value={form.lien} onChangeText={t => set({ lien: t })} />
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Prix €" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.prixUnitaire} onChangeText={t => set({ prixUnitaire: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Unité" placeholderTextColor={DS.textAlt} value={form.unite} onChangeText={t => set({ unite: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Qté" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.quantite} onChangeText={t => set({ quantite: t })} />
                </View>

                <Text style={styles.formLabel}>Statut</Text>
                <View style={styles.segWrap}>
                  {STATUTS.map(s => (
                    <FilterChip key={s} label={PRESCRIPTION_STATUT_LABELS[s]} active={form.statut === s} onPress={() => set({ statut: s })} activeColor={DS.bordeaux} />
                  ))}
                </View>

                <Pressable style={[styles.saveBtn, (!form.designation.trim() || !form.categorie.trim()) && styles.saveBtnDisabled]} onPress={save}>
                  <Text style={styles.saveText}>{editId ? 'Enregistrer' : 'Ajouter'}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        )}
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
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 120 },
  groupe: { marginBottom: space.lg },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border,
    padding: space.md, marginBottom: space.sm,
  },
  cardBody: { flex: 1, minWidth: 0 },
  designation: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  marque: { fontSize: font.compact, color: DS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  prix: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron },
  pillRow: { marginTop: space.sm, flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: space.sm },
  actionBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  fab: {
    position: 'absolute', right: space.lg, bottom: space.xl,
    width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux,
    alignItems: 'center', justifyContent: 'center',
  },
  // Formulaire (overlay inline)
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  segRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  segWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  input: {
    backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md,
    paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm,
  },
  row2: { flexDirection: 'row', gap: space.sm },
  flex1: { flex: 1 },
  formLabel: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginBottom: space.sm },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
