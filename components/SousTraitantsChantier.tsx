import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, Linking, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X, Plus, Trash2, FileText, Paperclip, Pencil } from 'lucide-react-native';
import type { DevisST, AcompteST } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { DocInboxButton } from '@/components/share/DocInboxButton';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * SousTraitantsChantier — sous-traitants affiliés à un chantier : devis + acomptes
 * + factures ouvrables. Alimente la rentabilité (bilan) par chantier. Palette V10.
 */
export interface SousTraitantsChantierProps {
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
const openFile = (url?: string) => { if (url && url.startsWith('http')) Linking.openURL(url).catch(() => {}); };

type FormState =
  | { kind: 'devis'; editId?: string; soustraitantId: string; objet: string; prix: string; fichier?: string; note: string }
  | { kind: 'acompte'; devisId: string; montant: string; date: string; commentaire: string; facture?: string };

export function SousTraitantsChantier({ visible, onClose, chantierId }: SousTraitantsChantierProps) {
  const { data, addDevis, updateDevis, deleteDevis, addAcompteST, deleteAcompteST } = useApp();
  const chantierNom = useMemo(() => data.chantiers.find(c => c.id === chantierId)?.nom ?? '', [data.chantiers, chantierId]);

  const devisChantier = useMemo(() => (data.devis || []).filter(d => d.chantierId === chantierId), [data.devis, chantierId]);

  // Regroupe les devis par sous-traitant
  const parST = useMemo(() => {
    const map = new Map<string, DevisST[]>();
    for (const d of devisChantier) {
      const arr = map.get(d.soustraitantId) || [];
      arr.push(d);
      map.set(d.soustraitantId, arr);
    }
    return Array.from(map.entries()).map(([stId, devis]) => ({
      st: (data.sousTraitants || []).find(s => s.id === stId),
      stId,
      devis,
    }));
  }, [devisChantier, data.sousTraitants]);

  const acomptesOf = (devisId: string) => (data.acomptesst || []).filter(a => a.devisId === devisId);
  const totalVerse = (devisId: string) => acomptesOf(devisId).reduce((s, a) => s + a.montant, 0);

  const [form, setForm] = useState<FormState | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = async (onDone: (url: string) => void) => {
    try {
      const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: false, compressImages: false });
      if (!files.length) return;
      setUploading(true);
      const url = await uploadFileToStorage(files[0].uri, `chantiers/${chantierId}/st`, genId('stf'));
      setUploading(false);
      if (url) onDone(url); else Alert.alert('Upload', "Le fichier n'a pas pu être envoyé.");
    } catch { setUploading(false); }
  };

  const openEditDevis = (d: DevisST) => setForm({
    kind: 'devis', editId: d.id, soustraitantId: d.soustraitantId,
    objet: d.objet, prix: d.prixConvenu ? String(d.prixConvenu) : '', fichier: d.devisFichier, note: d.note || '',
  });

  const saveDevis = () => {
    if (!form || form.kind !== 'devis' || !form.soustraitantId || !form.objet.trim()) return;
    const note = form.note.trim() || undefined;
    if (form.editId) {
      const ex = devisChantier.find(d => d.id === form.editId);
      if (ex) updateDevis({ ...ex, soustraitantId: form.soustraitantId, objet: form.objet.trim(), prixConvenu: num(form.prix), devisFichier: form.fichier, note });
    } else {
      addDevis({
        id: genId('devis'), soustraitantId: form.soustraitantId, chantierId,
        objet: form.objet.trim(), prixConvenu: num(form.prix),
        devisFichier: form.fichier, note, createdAt: new Date().toISOString(),
      });
    }
    setForm(null);
  };

  const saveAcompte = () => {
    if (!form || form.kind !== 'acompte' || !form.montant.trim()) return;
    addAcompteST({
      id: genId('acst'), devisId: form.devisId, date: form.date || new Date().toISOString().slice(0, 10),
      montant: num(form.montant), commentaire: form.commentaire.trim(), facture: form.facture,
      createdAt: new Date().toISOString(),
    });
    setForm(null);
  };

  const confirmDeleteDevis = (d: DevisST) => Alert.alert('Supprimer', `Supprimer le devis « ${d.objet} » et ses acomptes ?`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: () => { acomptesOf(d.id).forEach(a => deleteAcompteST(a.id)); deleteDevis(d.id); } },
  ]);
  const confirmDeleteAcompte = (a: AcompteST) => Alert.alert('Supprimer', 'Supprimer cet acompte ?', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: () => deleteAcompteST(a.id) },
  ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <PanelHeader title="Sous-traitants" sub={chantierNom} onClose={onClose} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {parST.length === 0 ? (
            <EmptyState iconComponent={Plus} title="Aucun sous-traitant" description="Affiliez un sous-traitant en lui créant un devis sur ce chantier." />
          ) : (
            parST.map(({ st, stId, devis }) => {
              const totalConvenu = devis.reduce((s, d) => s + d.prixConvenu, 0);
              const verse = devis.reduce((s, d) => s + totalVerse(d.id), 0);
              return (
                <View key={stId} style={styles.stBlock}>
                  <View style={styles.stHead}>
                    <Text style={styles.stNom} numberOfLines={1}>{st?.societe || st?.nom || 'Sous-traitant'}</Text>
                    <Text style={styles.stMontant}>{fmt(verse)} / {fmt(totalConvenu)} €</Text>
                  </View>
                  {devis.map(d => (
                    <View key={d.id} style={styles.devis}>
                      <View style={styles.devisTop}>
                        <Text style={styles.devisObjet} numberOfLines={1}>{d.objet}</Text>
                        <Text style={styles.devisPrix}>{fmt(d.prixConvenu)} €</Text>
                        <Pressable hitSlop={8} onPress={() => openEditDevis(d)} style={styles.iconBtn}><Pencil size={13} color={DS.bordeaux} /></Pressable>
                        <Pressable hitSlop={8} onPress={() => confirmDeleteDevis(d)} style={styles.iconBtn}><Trash2 size={13} color={DS.marron} /></Pressable>
                      </View>
                      {d.note ? <Text style={styles.devisNote}>{d.note}</Text> : null}
                      <View style={styles.devisMeta}>
                        {d.devisFichier ? (
                          <Pressable onPress={() => openFile(d.devisFichier)} style={styles.fileChip}><FileText size={12} color={DS.bordeaux} /><Text style={styles.fileChipText}>Devis</Text></Pressable>
                        ) : null}
                        <Text style={styles.verseText}>Versé {fmt(totalVerse(d.id))} €</Text>
                      </View>
                      {acomptesOf(d.id).map(a => (
                        <View key={a.id} style={styles.acompte}>
                          <Text style={styles.acDate}>{a.date.split('-').reverse().join('/')}</Text>
                          <Text style={styles.acMontant}>{fmt(a.montant)} €</Text>
                          {a.facture ? (
                            <Pressable onPress={() => openFile(a.facture)} style={styles.factChip}><Paperclip size={11} color={DS.marron} /><Text style={styles.factChipText}>Facture</Text></Pressable>
                          ) : <Text style={styles.noFact}>—</Text>}
                          <Pressable hitSlop={6} onPress={() => confirmDeleteAcompte(a)} style={styles.acDel}><Trash2 size={12} color={DS.marron} /></Pressable>
                        </View>
                      ))}
                      <Pressable style={styles.addAcompte} onPress={() => setForm({ kind: 'acompte', devisId: d.id, montant: '', date: new Date().toISOString().slice(0, 10), commentaire: '' })}>
                        <Plus size={14} color={DS.bordeaux} /><Text style={styles.addAcompteText}>Acompte + facture</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>

        <Pressable style={styles.fab} onPress={() => setForm({ kind: 'devis', soustraitantId: '', objet: '', prix: '', note: '' })}><Plus size={22} color={DS.cremeFond} /></Pressable>

        {form && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setForm(null)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {form.kind === 'devis' ? (
                  <>
                    <Text style={styles.formTitle}>{form.editId ? 'Modifier le devis' : 'Affilier un sous-traitant · devis'}</Text>
                    <Text style={styles.formLabel}>Sous-traitant</Text>
                    <View style={styles.chipRow}>
                      {(data.sousTraitants || []).map(s => (
                        <Pressable key={s.id} onPress={() => setForm({ ...form, soustraitantId: s.id })} style={[styles.chip, form.soustraitantId === s.id && styles.chipOn]}>
                          <Text style={[styles.chipText, form.soustraitantId === s.id && styles.chipTextOn]}>{s.societe || `${s.prenom} ${s.nom}`}</Text>
                        </Pressable>
                      ))}
                      {(data.sousTraitants || []).length === 0 ? <Text style={styles.hint}>Aucun ST — créez-en dans Équipe d'abord.</Text> : null}
                    </View>
                    <TextInput style={styles.input} placeholder="Objet (ex: Peinture)" placeholderTextColor={DS.textAlt} value={form.objet} onChangeText={t => setForm({ ...form, objet: t })} />
                    <TextInput style={styles.input} placeholder="Prix convenu € HT" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.prix} onChangeText={t => setForm({ ...form, prix: t })} />
                    <Pressable style={styles.attach} onPress={() => pickAndUpload(url => setForm(f => (f && f.kind === 'devis' ? { ...f, fichier: url } : f)))} disabled={uploading}>
                      {uploading ? <ActivityIndicator size="small" color={DS.bordeaux} /> : <FileText size={16} color={DS.bordeaux} />}
                      <Text style={styles.attachText}>{form.fichier ? '✓ Devis joint' : 'Joindre le devis (PDF)'}</Text>
                    </Pressable>
                    <DocInboxButton folder={`chantiers/${chantierId}/st`} onUploaded={({ url }) => setForm(f => (f && f.kind === 'devis' ? { ...f, fichier: url } : f))} />
                    <TextInput style={[styles.input, styles.multiline]} placeholder="Note (optionnel — précision, condition…)" placeholderTextColor={DS.textAlt} multiline value={form.note} onChangeText={t => setForm({ ...form, note: t })} />
                    <Pressable style={[styles.saveBtn, (!form.soustraitantId || !form.objet.trim()) && styles.saveBtnDisabled]} onPress={saveDevis}><Text style={styles.saveText}>{form.editId ? 'Enregistrer' : 'Ajouter'}</Text></Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.formTitle}>Acompte versé</Text>
                    <View style={styles.row2}>
                      <TextInput style={[styles.input, styles.flex1]} placeholder="Montant € HT" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.montant} onChangeText={t => setForm({ ...form, montant: t })} />
                      <TextInput style={[styles.input, styles.flex1]} placeholder="Date (AAAA-MM-JJ)" placeholderTextColor={DS.textAlt} autoCapitalize="none" value={form.date} onChangeText={t => setForm({ ...form, date: t })} />
                    </View>
                    <TextInput style={styles.input} placeholder="Commentaire (optionnel)" placeholderTextColor={DS.textAlt} value={form.commentaire} onChangeText={t => setForm({ ...form, commentaire: t })} />
                    <Pressable style={styles.attach} onPress={() => pickAndUpload(url => setForm(f => (f && f.kind === 'acompte' ? { ...f, facture: url } : f)))} disabled={uploading}>
                      {uploading ? <ActivityIndicator size="small" color={DS.bordeaux} /> : <Paperclip size={16} color={DS.bordeaux} />}
                      <Text style={styles.attachText}>{form.facture ? '✓ Facture jointe' : 'Joindre la facture (PDF)'}</Text>
                    </Pressable>
                    <DocInboxButton folder={`chantiers/${chantierId}/st`} onUploaded={({ url }) => setForm(f => (f && f.kind === 'acompte' ? { ...f, facture: url } : f))} />
                    <Pressable style={[styles.saveBtn, !form.montant.trim() && styles.saveBtnDisabled]} onPress={saveAcompte}><Text style={styles.saveText}>Ajouter</Text></Pressable>
                  </>
                )}
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
  stBlock: { marginBottom: space.lg },
  stHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.sm },
  stNom: { flex: 1, fontSize: font.subhead, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  stMontant: { fontSize: font.compact, fontWeight: font.bold, color: DS.marron },
  devis: { backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: space.md, marginBottom: space.sm },
  devisTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  devisObjet: { flex: 1, fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  devisNote: { fontSize: font.compact, color: DS.textSecondary, fontStyle: 'italic', marginTop: 4 },
  devisPrix: { fontSize: font.body, fontWeight: font.heavy, color: DS.sombre },
  iconBtn: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  devisMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: DS.cremeNude, borderRadius: radius.xs, paddingVertical: 3, paddingHorizontal: 8 },
  fileChipText: { fontSize: font.tiny, fontWeight: font.bold, color: DS.bordeaux, textTransform: 'uppercase' },
  verseText: { fontSize: font.compact, color: DS.textSecondary, marginLeft: 'auto' },
  acompte: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: DS.border, paddingTop: space.sm, marginTop: space.sm },
  acDate: { fontSize: font.compact, color: DS.textSecondary, width: 66 },
  acMontant: { flex: 1, fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  factChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: DS.nudeMoyen, borderRadius: radius.xs, paddingVertical: 3, paddingHorizontal: 7 },
  factChipText: { fontSize: font.tiny, fontWeight: font.bold, color: DS.marron, textTransform: 'uppercase' },
  noFact: { fontSize: font.compact, color: DS.textMuted, width: 54, textAlign: 'center' },
  acDel: { width: 26, height: 26, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  addAcompte: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingVertical: space.xs },
  addAcompteText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.bordeaux },
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
  hint: { fontSize: font.compact, color: DS.textSecondary },
  input: { backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: space.sm },
  flex1: { flex: 1 },
  attach: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: DS.cremeNude, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg, marginBottom: space.md },
  attachText: { fontSize: font.body, fontWeight: font.semibold, color: DS.bordeaux },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
