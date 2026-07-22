import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X, Plus, Pencil, Trash2, Check, Scale } from 'lucide-react-native';
import type { ConsultationLot, OffreLot } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * ConsultationPanel — consultation des entreprises par lot (DCE).
 * Estimation architecte + offres comparées (écart %) + choix du retenu.
 * Palette V10.
 */
export interface ConsultationPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function genId(p: string): string {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}
const num = (v: string): number => (v.trim() ? parseFloat(v.replace(',', '.')) || 0 : 0);

type FormKind = 'lot' | 'offre';
type FormState = { kind: FormKind; lotId?: string; libelle: string; estimation: string; entreprise: string; montant: string; delai: string };
const EMPTY: FormState = { kind: 'lot', libelle: '', estimation: '', entreprise: '', montant: '', delai: '' };

export function ConsultationPanel({ visible, onClose, chantierId }: ConsultationPanelProps) {
  const { data, addConsultationLot, updateConsultationLot, deleteConsultationLot } = useApp();
  const chantierNom = useMemo(() => data.chantiers.find(c => c.id === chantierId)?.nom ?? '', [data.chantiers, chantierId]);
  const lots = useMemo(
    () => (data.consultationsLot || []).filter(l => l.chantierId === chantierId),
    [data.consultationsLot, chantierId],
  );

  const [editLotId, setEditLotId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  const openNewLot = () => { setEditLotId(null); setForm({ ...EMPTY, kind: 'lot' }); setShowForm(true); };
  const openEditLot = (l: ConsultationLot) => { setEditLotId(l.id); setForm({ kind: 'lot', libelle: l.libelle, estimation: l.estimationHT != null ? String(l.estimationHT) : '', entreprise: '', montant: '', delai: '' }); setShowForm(true); };
  const openNewOffre = (l: ConsultationLot) => { setEditLotId(null); setForm({ ...EMPTY, kind: 'offre', lotId: l.id }); setShowForm(true); };

  const save = () => {
    const now = new Date().toISOString();
    if (form.kind === 'lot') {
      if (!form.libelle.trim()) return;
      const ex = editLotId ? lots.find(l => l.id === editLotId) : undefined;
      const entry: ConsultationLot = {
        id: editLotId || genId('dce'), chantierId, libelle: form.libelle.trim(),
        estimationHT: form.estimation.trim() ? num(form.estimation) : undefined,
        offres: ex?.offres || [], createdAt: ex?.createdAt || now, updatedAt: now,
      };
      editLotId ? updateConsultationLot(entry) : addConsultationLot(entry);
    } else {
      const lot = lots.find(l => l.id === form.lotId);
      if (!lot || !form.entreprise.trim()) return;
      const offre: OffreLot = { id: genId('offre'), entrepriseNom: form.entreprise.trim(), montantHT: num(form.montant), delaiSemaines: form.delai.trim() ? num(form.delai) : undefined };
      updateConsultationLot({ ...lot, offres: [...lot.offres, offre], updatedAt: now });
    }
    setShowForm(false);
  };

  const toggleRetenu = (lot: ConsultationLot, offreId: string) =>
    updateConsultationLot({ ...lot, offres: lot.offres.map(o => ({ ...o, retenue: o.id === offreId ? !o.retenue : false })), updatedAt: new Date().toISOString() });

  const deleteOffre = (lot: ConsultationLot, offreId: string) =>
    updateConsultationLot({ ...lot, offres: lot.offres.filter(o => o.id !== offreId), updatedAt: new Date().toISOString() });

  const confirmDeleteLot = (l: ConsultationLot) => {
    Alert.alert('Supprimer', `Supprimer la consultation « ${l.libelle} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteConsultationLot(l.id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Consultation</Text>
            {chantierNom ? <Text style={styles.hSub}>{chantierNom} · DCE</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {lots.length === 0 ? (
            <EmptyState iconComponent={Scale} title="Aucune consultation" description="Ajoutez un lot à consulter, puis comparez les offres des entreprises." />
          ) : (
            lots.map(lot => {
              const est = lot.estimationHT || 0;
              return (
                <View key={lot.id} style={styles.lot}>
                  <View style={styles.lotHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lotNom}>{lot.libelle}</Text>
                      <Text style={styles.lotEst}>{est ? `Estimation ${fmt(est)} €` : 'Sans estimation'} · {lot.offres.length} offre{lot.offres.length > 1 ? 's' : ''}</Text>
                    </View>
                    <Pressable hitSlop={8} onPress={() => openEditLot(lot)} style={styles.iconBtn}><Pencil size={14} color={DS.bordeaux} /></Pressable>
                    <Pressable hitSlop={8} onPress={() => confirmDeleteLot(lot)} style={styles.iconBtn}><Trash2 size={14} color={DS.marron} /></Pressable>
                  </View>

                  {lot.offres.map(o => {
                    const ecart = est > 0 ? Math.round(((o.montantHT - est) / est) * 100) : null;
                    return (
                      <View key={o.id} style={[styles.offre, o.retenue && styles.offreWin]}>
                        <View style={styles.offreR1}>
                          <Text style={styles.offreNom}>{o.entrepriseNom}</Text>
                          {o.retenue ? (
                            <Pressable onPress={() => toggleRetenu(lot, o.id)} style={styles.retenuPill}><Check size={11} color={DS.cremeFond} /><Text style={styles.retenuText}>Retenu</Text></Pressable>
                          ) : (
                            <Pressable onPress={() => toggleRetenu(lot, o.id)} style={styles.retenirBtn}><Text style={styles.retenirText}>Retenir</Text></Pressable>
                          )}
                        </View>
                        <View style={styles.offreR2}>
                          <Text style={styles.offreDelai}>{o.delaiSemaines ? `Délai ${o.delaiSemaines} sem.` : ''}</Text>
                          <View style={styles.offreAmt}>
                            <Text style={styles.offreMontant}>{fmt(o.montantHT)} €</Text>
                            {ecart != null ? <Text style={[styles.ecart, ecart <= 0 ? styles.ecartUnder : styles.ecartOver]}>{ecart > 0 ? '+' : ''}{ecart} %</Text> : null}
                            <Pressable hitSlop={6} onPress={() => deleteOffre(lot, o.id)} style={styles.offreDel}><Trash2 size={12} color={DS.marron} /></Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  <Pressable style={styles.addOffre} onPress={() => openNewOffre(lot)}>
                    <Plus size={15} color={DS.bordeaux} /><Text style={styles.addOffreText}>Ajouter une offre</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>

        <Pressable style={styles.fab} onPress={openNewLot}><Plus size={22} color={DS.cremeFond} /></Pressable>

        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formTitle}>{form.kind === 'offre' ? 'Nouvelle offre' : editLotId ? 'Modifier le lot' : 'Nouveau lot'}</Text>
                {form.kind === 'lot' ? (
                  <>
                    <TextInput style={styles.input} placeholder="Lot (ex: Plomberie)" placeholderTextColor={DS.textAlt} value={form.libelle} onChangeText={t => set({ libelle: t })} />
                    <TextInput style={styles.input} placeholder="Estimation € HT" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.estimation} onChangeText={t => set({ estimation: t })} />
                  </>
                ) : (
                  <>
                    <TextInput style={styles.input} placeholder="Entreprise" placeholderTextColor={DS.textAlt} value={form.entreprise} onChangeText={t => set({ entreprise: t })} />
                    <View style={styles.row2}>
                      <TextInput style={[styles.input, styles.flex1]} placeholder="Montant € HT" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.montant} onChangeText={t => set({ montant: t })} />
                      <TextInput style={[styles.input, styles.flex1]} placeholder="Délai (sem.)" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.delai} onChangeText={t => set({ delai: t })} />
                    </View>
                  </>
                )}
                <Pressable style={[styles.saveBtn, ((form.kind === 'lot' && !form.libelle.trim()) || (form.kind === 'offre' && !form.entreprise.trim())) && styles.saveBtnDisabled]} onPress={save}>
                  <Text style={styles.saveText}>Ajouter</Text>
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
  lot: { marginBottom: space.lg },
  lotHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  lotNom: { fontSize: font.subhead, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  lotEst: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron, marginTop: 1 },
  iconBtn: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  offre: { backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: space.md, marginBottom: space.xs },
  offreWin: { borderColor: DS.bordeaux, borderWidth: 1.5 },
  offreR1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offreNom: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  retenuPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: DS.bordeaux, borderRadius: radius.xs, paddingVertical: 3, paddingHorizontal: 8 },
  retenuText: { fontSize: font.tiny, fontWeight: font.bold, color: DS.cremeFond, textTransform: 'uppercase' },
  retenirBtn: { backgroundColor: DS.cremeNude, borderRadius: radius.xs, paddingVertical: 4, paddingHorizontal: 10 },
  retenirText: { fontSize: font.tiny, fontWeight: font.bold, color: DS.sombre, textTransform: 'uppercase' },
  offreR2: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.sm },
  offreDelai: { fontSize: font.compact, color: DS.textSecondary },
  offreAmt: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  offreMontant: { fontSize: font.body, fontWeight: font.heavy, color: DS.sombre, fontVariant: ['tabular-nums'] },
  ecart: { fontSize: font.tiny, fontWeight: font.bold },
  ecartUnder: { color: DS.marron },
  ecartOver: { color: DS.error },
  offreDel: { width: 26, height: 26, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  addOffre: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, borderStyle: 'dashed' },
  addOffreText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.bordeaux },
  fab: { position: 'absolute', right: space.lg, bottom: space.xl, width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux, alignItems: 'center', justifyContent: 'center' },
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
