import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { X, Plus, Pencil, Trash2, Lock } from 'lucide-react-native';
import type {
  DevisHonoraires, HonorairesLigne, HonorairesMode, HonorairesAssiette, HonorairesPhaseStatut, Prescription,
} from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';
import { FilterChip } from '@/components/ui/FilterChip';
import { StatusPill, type StatusType } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * HonorairesPanel — devis d'honoraires de l'architecte (flux PRIVÉ archi ↔ client).
 * 3 phases (conception / suivi optionnel / suppléments), assiette travaux SAISIE
 * + prescriptions auto, acceptation LIBRE par phase. Palette V10.
 */
export interface HonorairesPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
  auteurId?: string;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}
const montantOf = (p: Prescription) => (p.prixUnitaire || 0) * (p.quantite || 0);

const STATUT_LABELS: Record<HonorairesPhaseStatut, string> = {
  a_confirmer: 'À confirmer', accepte: 'Accepté', refuse: 'Refusé',
};
const STATUT_CYCLE: HonorairesPhaseStatut[] = ['a_confirmer', 'accepte', 'refuse'];
function statutToPill(s: HonorairesPhaseStatut): StatusType {
  if (s === 'accepte') return 'actif';
  if (s === 'refuse') return 'livre';
  return 'attente';
}

type EditTarget = { kind: 'conception' | 'suivi' | 'supplement'; id?: string };
type LigneForm = {
  libelle: string;
  mode: HonorairesMode;
  montantForfait: string;
  pourcentage: string;
  assiette: HonorairesAssiette;
  optionnelle: boolean;
};

export function HonorairesPanel({ visible, onClose, chantierId, auteurId = 'admin' }: HonorairesPanelProps) {
  const { data, addDevisHonoraires, updateDevisHonoraires } = useApp();

  const chantierNom = useMemo(
    () => data.chantiers.find(c => c.id === chantierId)?.nom ?? '',
    [data.chantiers, chantierId],
  );
  const devis = useMemo(
    () => (data.devisHonoraires || []).find(d => d.chantierId === chantierId),
    [data.devisHonoraires, chantierId],
  );
  const prescTotal = useMemo(
    () => (data.prescriptions || []).filter(p => p.chantierId === chantierId).reduce((s, p) => s + montantOf(p), 0),
    [data.prescriptions, chantierId],
  );

  const [target, setTarget] = useState<EditTarget | null>(null);
  const [form, setForm] = useState<LigneForm>({ libelle: '', mode: 'forfait', montantForfait: '', pourcentage: '', assiette: 'travaux', optionnelle: false });
  const [envTravaux, setEnvTravaux] = useState('');

  const assietteTravaux = devis?.montantTravauxHT || 0;
  const assietteDeco = assietteTravaux + prescTotal;
  const ligneMontant = (l: HonorairesLigne) =>
    l.mode === 'forfait'
      ? (l.montantForfaitHT || 0)
      : ((l.assiette === 'travaux_deco' ? assietteDeco : assietteTravaux) * (l.pourcentage || 0)) / 100;

  const lignes = useMemo<HonorairesLigne[]>(() => {
    if (!devis) return [];
    return [devis.phaseConception, ...(devis.phaseSuivi ? [devis.phaseSuivi] : []), ...(devis.supplements || [])];
  }, [devis]);

  const totalEngage = lignes.filter(l => l.statut === 'accepte').reduce((s, l) => s + ligneMontant(l), 0);
  const totalAConfirmer = lignes.filter(l => l.statut === 'a_confirmer').reduce((s, l) => s + ligneMontant(l), 0);

  const patch = (updater: (d: DevisHonoraires) => DevisHonoraires) => {
    if (!devis) return;
    updateDevisHonoraires({ ...updater(devis), updatedAt: new Date().toISOString() });
  };

  const createDevis = () => {
    const now = new Date().toISOString();
    addDevisHonoraires({
      id: genId('hono'), chantierId, architecteId: auteurId,
      phaseConception: { id: genId('ph'), libelle: 'Conception', mode: 'forfait', montantForfaitHT: 0, statut: 'a_confirmer' },
      tauxTVA: 20, createdAt: now, updatedAt: now,
    });
  };

  const saveTravaux = () => {
    const v = envTravaux.trim() ? parseFloat(envTravaux.replace(',', '.')) : NaN;
    patch(d => ({ ...d, montantTravauxHT: Number.isFinite(v) ? v : undefined }));
  };

  const cycleStatut = (l: HonorairesLigne, kind: EditTarget['kind']) => {
    const next = STATUT_CYCLE[(STATUT_CYCLE.indexOf(l.statut) + 1) % STATUT_CYCLE.length];
    patch(d => applyLigne(d, { ...l, statut: next }, kind, l.id));
  };

  const applyLigne = (d: DevisHonoraires, ligne: HonorairesLigne, kind: EditTarget['kind'], id?: string): DevisHonoraires => {
    if (kind === 'conception') return { ...d, phaseConception: ligne };
    if (kind === 'suivi') return { ...d, phaseSuivi: ligne };
    const supps = d.supplements || [];
    const exists = id && supps.some(s => s.id === id);
    return { ...d, supplements: exists ? supps.map(s => (s.id === id ? ligne : s)) : [...supps, ligne] };
  };

  const openEdit = (t: EditTarget, l?: HonorairesLigne) => {
    setTarget(t);
    setForm({
      libelle: l?.libelle || (t.kind === 'suivi' ? 'Suivi de chantier' : t.kind === 'supplement' ? '' : 'Conception'),
      mode: l?.mode || 'pourcentage',
      montantForfait: l?.montantForfaitHT != null ? String(l.montantForfaitHT) : '',
      pourcentage: l?.pourcentage != null ? String(l.pourcentage) : '',
      assiette: l?.assiette || (t.kind === 'suivi' ? 'travaux_deco' : 'travaux'),
      optionnelle: l?.optionnelle ?? t.kind === 'suivi',
    });
  };

  const saveLigne = () => {
    if (!target || !devis) return;
    if (target.kind === 'supplement' && !form.libelle.trim()) return;
    const num = (v: string) => (v.trim() ? parseFloat(v.replace(',', '.')) || 0 : 0);
    const existing = target.kind === 'conception' ? devis.phaseConception
      : target.kind === 'suivi' ? devis.phaseSuivi
      : (devis.supplements || []).find(s => s.id === target.id);
    const ligne: HonorairesLigne = {
      id: existing?.id || genId('ph'),
      libelle: form.libelle.trim() || 'Phase',
      mode: form.mode,
      montantForfaitHT: form.mode === 'forfait' ? num(form.montantForfait) : undefined,
      pourcentage: form.mode === 'pourcentage' ? num(form.pourcentage) : undefined,
      assiette: form.mode === 'pourcentage' ? form.assiette : undefined,
      optionnelle: form.optionnelle || undefined,
      statut: existing?.statut || 'a_confirmer',
      decideAt: existing?.decideAt,
    };
    patch(d => applyLigne(d, ligne, target.kind, target.id));
    setTarget(null);
  };

  const deleteLigne = (t: EditTarget) => {
    Alert.alert('Supprimer', 'Supprimer cette ligne ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: () => patch(d => {
          if (t.kind === 'suivi') return { ...d, phaseSuivi: undefined };
          if (t.kind === 'supplement') return { ...d, supplements: (d.supplements || []).filter(s => s.id !== t.id) };
          return d;
        }),
      },
    ]);
  };

  const set = (p: Partial<LigneForm>) => setForm(f => ({ ...f, ...p }));

  const renderLigne = (l: HonorairesLigne, kind: EditTarget['kind'], id?: string) => (
    <View key={l.id} style={[styles.ligne, l.optionnelle && styles.ligneOpt]}>
      <View style={{ flex: 1 }}>
        <View style={styles.ligneTop}>
          <Text style={styles.ligneNom}>{l.libelle}</Text>
          <Text style={styles.ligneMontant}>{fmt(ligneMontant(l))} €</Text>
        </View>
        <View style={styles.ligneMeta}>
          <Text style={styles.calc}>
            {l.mode === 'forfait'
              ? 'Forfait'
              : `${l.pourcentage || 0} % · ${fmt((l.assiette === 'travaux_deco' ? assietteDeco : assietteTravaux))} €`}
          </Text>
          <Pressable onPress={() => cycleStatut(l, kind)}>
            <StatusPill label={STATUT_LABELS[l.statut]} status={statutToPill(l.statut)} />
          </Pressable>
        </View>
      </View>
      <View style={styles.ligneActions}>
        <Pressable hitSlop={8} onPress={() => openEdit({ kind, id }, l)} style={styles.iconBtn}><Pencil size={15} color={DS.bordeaux} /></Pressable>
        {kind !== 'conception' ? (
          <Pressable hitSlop={8} onPress={() => deleteLigne({ kind, id })} style={styles.iconBtn}><Trash2 size={15} color={DS.marron} /></Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Honoraires</Text>
            {chantierNom ? <Text style={styles.hSub}>{chantierNom} · privé</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        {!devis ? (
          <View style={styles.center}>
            <EmptyState iconComponent={Plus} title="Aucun devis d'honoraires" description="Créez le devis pour ce chantier (flux privé avec le client)." />
            <Pressable style={styles.primaryBtn} onPress={createDevis}>
              <Text style={styles.primaryText}>Créer le devis</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Total engagé */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Total engagé</Text>
              <Text style={styles.heroValue}>{fmt(totalEngage)} €</Text>
              {totalAConfirmer > 0 ? <Text style={styles.heroSub}>+ {fmt(totalAConfirmer)} € à confirmer</Text> : null}
            </View>

            {/* Assiette */}
            <View style={styles.assiette}>
              <View style={styles.assRow}>
                <Text style={styles.assLabel}>Montant travaux (saisi)</Text>
                <TextInput
                  style={styles.assInput} placeholder="0" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad"
                  defaultValue={assietteTravaux ? String(assietteTravaux) : ''}
                  onChangeText={setEnvTravaux} onEndEditing={saveTravaux} onSubmitEditing={saveTravaux} returnKeyType="done"
                />
              </View>
              <View style={styles.assRow}>
                <Text style={styles.assLabelMut}>+ Prescriptions & mobilier (auto)</Text>
                <Text style={styles.assVal}>{fmt(prescTotal)} €</Text>
              </View>
              <View style={[styles.assRow, styles.assTot]}>
                <Text style={styles.assLabelTot}>= Assiette suivi</Text>
                <Text style={styles.assValTot}>{fmt(assietteDeco)} €</Text>
              </View>
            </View>

            {/* Phases */}
            <Text style={styles.sectionTitle}>a · Conception</Text>
            {renderLigne(devis.phaseConception, 'conception')}

            <Text style={styles.sectionTitle}>b · Suivi de chantier</Text>
            {devis.phaseSuivi
              ? renderLigne(devis.phaseSuivi, 'suivi')
              : (
                <Pressable style={styles.addLine} onPress={() => openEdit({ kind: 'suivi' })}>
                  <Plus size={16} color={DS.bordeaux} /><Text style={styles.addLineText}>Ajouter le suivi de chantier</Text>
                </Pressable>
              )}

            <Text style={styles.sectionTitle}>c · Suppléments</Text>
            {(devis.supplements || []).map(s => renderLigne(s, 'supplement', s.id))}
            <Pressable style={styles.addLine} onPress={() => openEdit({ kind: 'supplement' })}>
              <Plus size={16} color={DS.bordeaux} /><Text style={styles.addLineText}>Ajouter un supplément</Text>
            </Pressable>

            <View style={styles.private}>
              <Lock size={14} color={DS.marron} />
              <Text style={styles.privateText}>Visible par le client & l'architecte uniquement — jamais l'entreprise.</Text>
            </View>
          </ScrollView>
        )}

        {/* Formulaire ligne — overlay inline */}
        {target && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setTarget(null)} />
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.formTitle}>{target.kind === 'supplement' ? 'Supplément' : target.kind === 'suivi' ? 'Suivi de chantier' : 'Conception'}</Text>
                <TextInput style={styles.input} placeholder="Libellé" placeholderTextColor={DS.textAlt} value={form.libelle} onChangeText={t => set({ libelle: t })} />
                <View style={styles.segRow}>
                  <FilterChip label="Forfait" active={form.mode === 'forfait'} onPress={() => set({ mode: 'forfait' })} activeColor={DS.bordeaux} />
                  <FilterChip label="Pourcentage" active={form.mode === 'pourcentage'} onPress={() => set({ mode: 'pourcentage' })} activeColor={DS.bordeaux} />
                </View>
                {form.mode === 'forfait' ? (
                  <TextInput style={styles.input} placeholder="Montant € HT" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.montantForfait} onChangeText={t => set({ montantForfait: t })} />
                ) : (
                  <>
                    <TextInput style={styles.input} placeholder="Pourcentage (ex: 8)" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.pourcentage} onChangeText={t => set({ pourcentage: t })} />
                    <View style={styles.segRow}>
                      <FilterChip label="Sur travaux" active={form.assiette === 'travaux'} onPress={() => set({ assiette: 'travaux' })} activeColor={DS.bordeaux} />
                      <FilterChip label="Travaux + déco" active={form.assiette === 'travaux_deco'} onPress={() => set({ assiette: 'travaux_deco' })} activeColor={DS.bordeaux} />
                    </View>
                  </>
                )}
                <Pressable style={styles.optToggle} onPress={() => set({ optionnelle: !form.optionnelle })}>
                  <View style={[styles.checkbox, form.optionnelle && styles.checkboxOn]} />
                  <Text style={styles.optText}>Mission optionnelle (le client l'octroie ou non)</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, target.kind === 'supplement' && !form.libelle.trim() && styles.saveBtnDisabled]} onPress={saveLigne}>
                  <Text style={styles.saveText}>Enregistrer</Text>
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
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl, gap: space.lg },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  hero: { backgroundColor: DS.bordeaux, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md },
  heroLabel: { fontSize: font.tiny, fontWeight: font.bold, color: DS.cremeNude, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.85 },
  heroValue: { fontSize: font.xxl, fontWeight: font.heavy, color: DS.cremeFond, marginTop: 2 },
  heroSub: { fontSize: font.compact, fontWeight: font.semibold, color: DS.cremeNude, marginTop: 2, opacity: 0.9 },
  assiette: { backgroundColor: DS.cremeNude, borderRadius: radius.md, padding: space.md, marginBottom: space.lg },
  assRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  assLabel: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron },
  assLabelMut: { fontSize: font.compact, fontWeight: font.medium, color: DS.textSecondary },
  assInput: { minWidth: 90, textAlign: 'right', fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  assVal: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron },
  assTot: { borderTopWidth: 1, borderTopColor: DS.border, marginTop: 4, paddingTop: 6 },
  assLabelTot: { fontSize: font.body, fontWeight: font.heavy, color: DS.sombre },
  assValTot: { fontSize: font.body, fontWeight: font.heavy, color: DS.sombre },
  sectionTitle: { fontSize: font.tiny, fontWeight: font.bold, color: DS.bordeaux, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: space.sm, marginTop: space.sm },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: space.md, marginBottom: space.sm },
  ligneOpt: { borderStyle: 'dashed', borderColor: DS.marron },
  ligneTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ligneNom: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  ligneMontant: { fontSize: font.body, fontWeight: font.heavy, color: DS.sombre },
  ligneMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xs },
  calc: { fontSize: font.compact, color: DS.textSecondary, flex: 1 },
  ligneActions: { gap: space.xs },
  iconBtn: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, borderStyle: 'dashed', marginBottom: space.sm },
  addLineText: { fontSize: font.body, fontWeight: font.semibold, color: DS.bordeaux },
  private: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: space.md },
  privateText: { flex: 1, fontSize: font.compact, fontWeight: font.medium, color: DS.marron },
  primaryBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center' },
  primaryText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
  // form
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  input: { backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm },
  segRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  optToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, marginBottom: space.sm },
  checkbox: { width: 22, height: 22, borderRadius: radius.xs, borderWidth: 2, borderColor: DS.border },
  checkboxOn: { backgroundColor: DS.bordeaux, borderColor: DS.bordeaux },
  optText: { flex: 1, fontSize: font.compact, color: DS.sombre },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
