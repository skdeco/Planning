import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X, Plus, Pencil, Trash2, Check, Clock, Landmark, AlertTriangle } from 'lucide-react-native';
import type { DemarcheAdministrative, DemarchePhase, DemarcheStatut } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * DemarchePanel — démarches & échéances administratives (PC, DOC, DAACT,
 * assurances…) en 3 phases, avec alerte d'échéance en tête. Palette V10.
 */
export interface DemarchePanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function genId(p: string): string {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const PHASES: { key: DemarchePhase; label: string }[] = [
  { key: 'autorisations', label: 'Autorisations' },
  { key: 'chantier', label: 'Chantier' },
  { key: 'achevement', label: 'Achèvement' },
];
const STATUT_LABELS: Record<DemarcheStatut, string> = { a_faire: 'À faire', fait: 'Fait', en_attente: 'En attente' };
const STATUT_CYCLE: DemarcheStatut[] = ['a_faire', 'fait', 'en_attente'];

type FormState = { phase: DemarchePhase; libelle: string; statut: DemarcheStatut; dateEcheance: string };
const EMPTY: FormState = { phase: 'autorisations', libelle: '', statut: 'a_faire', dateEcheance: '' };

export function DemarchePanel({ visible, onClose, chantierId }: DemarchePanelProps) {
  const { data, addDemarcheAdmin, updateDemarcheAdmin, deleteDemarcheAdmin } = useApp();

  const chantierNom = useMemo(() => data.chantiers.find(c => c.id === chantierId)?.nom ?? '', [data.chantiers, chantierId]);
  const items = useMemo(
    () => (data.demarchesAdmin || []).filter(d => d.chantierId === chantierId),
    [data.demarchesAdmin, chantierId],
  );

  const enAttente = useMemo(() => items.filter(d => d.statut === 'en_attente'), [items]);

  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  const openNew = () => { setEditId(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (d: DemarcheAdministrative) => {
    setEditId(d.id);
    setForm({ phase: d.phase, libelle: d.libelle, statut: d.statut, dateEcheance: d.dateEcheance || '' });
    setShowForm(true);
  };

  const save = () => {
    if (!form.libelle.trim()) return;
    const ex = editId ? items.find(d => d.id === editId) : undefined;
    const entry: DemarcheAdministrative = {
      id: editId || genId('adm'),
      chantierId,
      phase: form.phase,
      libelle: form.libelle.trim(),
      statut: form.statut,
      dateEcheance: form.dateEcheance.trim() || undefined,
      faitLe: form.statut === 'fait' ? (ex?.faitLe || new Date().toISOString().slice(0, 10)) : undefined,
      ordre: ex?.ordre ?? items.length,
    };
    editId ? updateDemarcheAdmin(entry) : addDemarcheAdmin(entry);
    setShowForm(false);
  };

  const cycleStatut = (d: DemarcheAdministrative) => {
    const next = STATUT_CYCLE[(STATUT_CYCLE.indexOf(d.statut) + 1) % STATUT_CYCLE.length];
    updateDemarcheAdmin({ ...d, statut: next, faitLe: next === 'fait' ? (d.faitLe || new Date().toISOString().slice(0, 10)) : undefined });
  };

  const confirmDelete = (d: DemarcheAdministrative) => {
    Alert.alert('Supprimer', `Supprimer « ${d.libelle} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteDemarcheAdmin(d.id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Administratif</Text>
            {chantierNom ? <Text style={styles.hSub}>{chantierNom}</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {enAttente.length > 0 ? (
            <View style={styles.alert}>
              <AlertTriangle size={16} color={DS.error} />
              <Text style={styles.alertText}>{enAttente.length} démarche{enAttente.length > 1 ? 's' : ''} en attente — {enAttente[0].libelle}</Text>
            </View>
          ) : null}

          {items.length === 0 ? (
            <EmptyState iconComponent={Landmark} title="Aucune démarche" description="Ajoutez les démarches administratives (PC, DOC, DAACT, assurances…)." />
          ) : (
            PHASES.map(ph => {
              const list = items.filter(d => d.phase === ph.key).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
              if (list.length === 0) return null;
              return (
                <View key={ph.key} style={styles.group}>
                  <Text style={styles.groupTitle}>{ph.label}</Text>
                  {list.map(d => (
                    <View key={d.id} style={styles.item}>
                      <Pressable hitSlop={6} onPress={() => cycleStatut(d)}
                        style={[styles.check, d.statut === 'fait' && styles.checkDone, d.statut === 'en_attente' && styles.checkWarn]}>
                        {d.statut === 'fait' ? <Check size={13} color={DS.cremeFond} /> : d.statut === 'en_attente' ? <Clock size={12} color={DS.error} /> : null}
                      </Pressable>
                      <Pressable style={{ flex: 1 }} onPress={() => openEdit(d)}>
                        <Text style={[styles.itemNom, d.statut === 'fait' && styles.itemDone]}>{d.libelle}</Text>
                        {(d.dateEcheance || d.faitLe) ? (
                          <Text style={styles.itemMeta}>{d.statut === 'fait' && d.faitLe ? `Fait ${d.faitLe}` : d.dateEcheance ? `Échéance ${d.dateEcheance}` : ''}</Text>
                        ) : null}
                      </Pressable>
                      {d.statut === 'en_attente' ? (
                        <View style={styles.pillWarn}><Text style={styles.pillWarnText}>En attente</Text></View>
                      ) : null}
                      <Pressable hitSlop={8} onPress={() => confirmDelete(d)} style={styles.iconBtn}><Trash2 size={14} color={DS.marron} /></Pressable>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>

        <Pressable style={styles.fab} onPress={openNew}><Plus size={22} color={DS.cremeFond} /></Pressable>

        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formTitle}>{editId ? 'Modifier' : 'Nouvelle démarche'}</Text>
                <Text style={styles.formLabel}>Phase</Text>
                <View style={styles.chipRow}>
                  {PHASES.map(ph => (
                    <Pressable key={ph.key} onPress={() => set({ phase: ph.key })} style={[styles.chip, form.phase === ph.key && styles.chipOn]}>
                      <Text style={[styles.chipText, form.phase === ph.key && styles.chipTextOn]}>{ph.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="Libellé (ex: Dépôt du permis de construire)" placeholderTextColor={DS.textAlt} value={form.libelle} onChangeText={t => set({ libelle: t })} />
                <TextInput style={styles.input} placeholder="Échéance (AAAA-MM-JJ)" placeholderTextColor={DS.textAlt} autoCapitalize="none" value={form.dateEcheance} onChangeText={t => set({ dateEcheance: t })} />
                <Text style={styles.formLabel}>Statut</Text>
                <View style={styles.chipRow}>
                  {STATUT_CYCLE.map(s => (
                    <Pressable key={s} onPress={() => set({ statut: s })} style={[styles.chip, form.statut === s && styles.chipOn]}>
                      <Text style={[styles.chipText, form.statut === s && styles.chipTextOn]}>{STATUT_LABELS[s]}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={[styles.saveBtn, !form.libelle.trim() && styles.saveBtnDisabled]} onPress={save}>
                  <Text style={styles.saveText}>{editId ? 'Enregistrer' : 'Ajouter'}</Text>
                </Pressable>
              </ScrollView>
            </View>
            </KeyboardAvoidingView>
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
  scroll: { paddingHorizontal: space.lg, paddingBottom: 120 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: DS.errorSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  alertText: { flex: 1, fontSize: font.compact, fontWeight: font.bold, color: DS.error },
  group: { marginBottom: space.lg },
  groupTitle: { fontSize: font.tiny, fontWeight: font.bold, color: DS.bordeaux, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.xs },
  check: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 1.5, borderColor: DS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surface },
  checkDone: { backgroundColor: DS.bordeaux, borderColor: DS.bordeaux },
  checkWarn: { backgroundColor: DS.errorSoft, borderColor: DS.errorSoft },
  itemNom: { fontSize: font.body, fontWeight: font.semibold, color: DS.sombre },
  itemDone: { color: DS.textSecondary },
  itemMeta: { fontSize: font.tiny, color: DS.textSecondary, marginTop: 1 },
  pillWarn: { backgroundColor: DS.errorSoft, borderRadius: radius.xs, paddingVertical: 3, paddingHorizontal: 7 },
  pillWarnText: { fontSize: font.tiny, fontWeight: font.bold, color: DS.error, textTransform: 'uppercase' },
  iconBtn: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  fab: { position: 'absolute', right: space.lg, bottom: space.xl, width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux, alignItems: 'center', justifyContent: 'center' },
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  formLabel: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginBottom: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: { backgroundColor: DS.cremeNude, borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 14 },
  chipOn: { backgroundColor: DS.bordeaux },
  chipText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.sombre },
  chipTextOn: { color: DS.cremeFond },
  input: { backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
