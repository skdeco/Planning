import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X, Plus, Pencil, Trash2 } from 'lucide-react-native';
import type { PhaseChantier } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { DS, radius, space, font } from '@/constants/design';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * PhasePanel — planning de phases (DET) : jalons clés + phases/lots avec
 * comparaison prévu vs réel → badge « Retard J+X » calculé. Palette V10.
 */
export interface PhasePanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function genId(p: string): string {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function joursEntre(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

type Tone = 'termine' | 'ontime' | 'retard' | 'soon';
const TONE_STYLE: Record<Tone, { bg: string; color: string }> = {
  termine: { bg: DS.cremeNude, color: DS.bordeaux },
  ontime: { bg: DS.nudeMoyen, color: DS.marron },
  retard: { bg: DS.errorSoft, color: DS.error },
  soon: { bg: DS.cremeNude, color: DS.textSecondary },
};

/** Statut d'une phase à partir du prévu vs réel (calculé à la volée). */
function statutPhase(p: PhaseChantier, today: Date): { label: string; tone: Tone } {
  const av = p.avancementPct ?? 0;
  if (av >= 100) return { label: 'Terminé', tone: 'termine' };
  const deb = parseDate(p.dateDebutPrevue);
  const fin = parseDate(p.dateFinPrevue);
  if (fin && today > fin) return { label: `Retard J+${joursEntre(today, fin)}`, tone: 'retard' };
  if (deb && fin) {
    const total = fin.getTime() - deb.getTime();
    const elapsed = today.getTime() - deb.getTime();
    if (elapsed < 0) return { label: 'À venir', tone: 'soon' };
    const attendu = total > 0 ? (elapsed / total) * 100 : 0;
    if (av + 1 >= attendu) return { label: 'À l’heure', tone: 'ontime' };
    return { label: 'En retard', tone: 'retard' };
  }
  return av > 0 ? { label: 'En cours', tone: 'ontime' } : { label: 'À venir', tone: 'soon' };
}

type FormState = {
  libelle: string;
  dateDebut: string;
  dateFin: string;
  avancement: string;
};
const EMPTY: FormState = { libelle: '', dateDebut: '', dateFin: '', avancement: '' };

export function PhasePanel({ visible, onClose, chantierId }: PhasePanelProps) {
  const { data, addPhaseChantier, updatePhaseChantier, deletePhaseChantier } = useApp();

  const chantierNom = useMemo(() => data.chantiers.find(c => c.id === chantierId)?.nom ?? '', [data.chantiers, chantierId]);
  const today = useMemo(() => new Date(), []);

  const phases = useMemo(
    () => (data.phasesChantier || []).filter(p => p.chantierId === chantierId).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [data.phasesChantier, chantierId],
  );

  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  const openNew = () => { setEditId(null); setForm(EMPTY); setShowForm(true); };
  const openEditPhase = (p: PhaseChantier) => {
    setEditId(p.id);
    setForm({ libelle: p.libelle, dateDebut: p.dateDebutPrevue || '', dateFin: p.dateFinPrevue || '', avancement: p.avancementPct != null ? String(p.avancementPct) : '' });
    setShowForm(true);
  };

  const save = () => {
    if (!form.libelle.trim()) return;
    const now = new Date().toISOString();
    const ex = editId ? phases.find(p => p.id === editId) : undefined;
    const av = form.avancement.trim() ? Math.max(0, Math.min(100, Math.round(parseFloat(form.avancement.replace(',', '.')) || 0))) : undefined;
    const entry: PhaseChantier = {
      id: editId || genId('phase'), chantierId, libelle: form.libelle.trim(),
      ordre: ex?.ordre ?? phases.length,
      dateDebutPrevue: form.dateDebut.trim() || undefined,
      dateFinPrevue: form.dateFin.trim() || undefined,
      avancementPct: av,
      createdAt: ex?.createdAt || now, updatedAt: now,
    };
    editId ? updatePhaseChantier(entry) : addPhaseChantier(entry);
    setShowForm(false);
  };

  const confirmDelete = (id: string, nom: string) => {
    Alert.alert('Supprimer', `Supprimer « ${nom} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deletePhaseChantier(id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <PanelHeader title="Planning" sub={chantierNom} onClose={onClose} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Phases */}
          <View style={styles.jHead}>
            <Text style={styles.sectionTitle}>Phases / lots</Text>
            <Pressable hitSlop={8} onPress={openNew} style={styles.miniAdd}><Plus size={15} color={DS.bordeaux} /></Pressable>
          </View>
          {phases.length === 0 ? (
            <EmptyState iconComponent={Plus} title="Aucune phase" description="Ajoutez les phases du chantier pour suivre l'avancement." />
          ) : (
            phases.map(p => {
              const st = statutPhase(p, today);
              const ts = TONE_STYLE[st.tone];
              const av = p.avancementPct ?? 0;
              return (
                <View key={p.id} style={styles.phase}>
                  <View style={styles.phaseHead}>
                    <Text style={styles.phaseNom} numberOfLines={1}>{p.libelle}</Text>
                    <View style={[styles.pill, { backgroundColor: ts.bg }]}>
                      <Text style={[styles.pillText, { color: ts.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  {(p.dateDebutPrevue || p.dateFinPrevue) ? (
                    <Text style={styles.phaseDates}>{p.dateDebutPrevue || '—'} → {p.dateFinPrevue || '—'}</Text>
                  ) : null}
                  <View style={styles.phaseBar}>
                    <ProgressBar value={av} variant={st.tone === 'retard' ? 'marron' : 'bordeaux'} showPercent />
                  </View>
                  <View style={styles.phaseActions}>
                    <Pressable hitSlop={8} onPress={() => openEditPhase(p)} style={styles.iconBtn}><Pencil size={14} color={DS.bordeaux} /></Pressable>
                    <Pressable hitSlop={8} onPress={() => confirmDelete(p.id, p.libelle)} style={styles.iconBtn}><Trash2 size={14} color={DS.marron} /></Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Formulaire overlay inline */}
        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formTitle}>{editId ? 'Modifier' : 'Nouvelle phase'}</Text>
                <TextInput style={styles.input} placeholder="Libellé (ex: Menuiseries ext.)" placeholderTextColor={DS.textAlt} value={form.libelle} onChangeText={t => set({ libelle: t })} />
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Début (AAAA-MM-JJ)" placeholderTextColor={DS.textAlt} autoCapitalize="none" value={form.dateDebut} onChangeText={t => set({ dateDebut: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Fin (AAAA-MM-JJ)" placeholderTextColor={DS.textAlt} autoCapitalize="none" value={form.dateFin} onChangeText={t => set({ dateFin: t })} />
                </View>
                <TextInput style={styles.input} placeholder="Avancement % (0-100)" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.avancement} onChangeText={t => set({ avancement: t })} />
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
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  jHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, marginBottom: space.sm },
  sectionTitle: { fontSize: font.tiny, fontWeight: font.bold, color: DS.bordeaux, textTransform: 'uppercase', letterSpacing: 0.6 },
  miniAdd: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  jalonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  hint: { fontSize: font.compact, color: DS.textSecondary },
  jalon: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: DS.cremeNude, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
  jalonDone: { backgroundColor: DS.bordeaux },
  jalonText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron },
  jalonTextDone: { color: DS.cremeFond },
  phase: { backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: space.md, marginBottom: space.sm },
  phaseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  phaseNom: { flex: 1, fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  phaseDates: { fontSize: font.compact, color: DS.textSecondary, marginTop: 3 },
  phaseBar: { marginTop: space.sm },
  phaseActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
  iconBtn: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  pill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.xs },
  pillText: { fontSize: font.tiny, fontWeight: font.bold, textTransform: 'uppercase' },
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  input: { backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm },
  row2: { flexDirection: 'row', gap: space.sm },
  flex1: { flex: 1 },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
