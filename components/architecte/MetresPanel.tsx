import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X, Plus, Pencil, Trash2, Ruler, FileScan, Check } from 'lucide-react-native';
import type { PieceChantier } from '@/app/types';
import { PIECES_DEFAULT } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { extractTextFromPdfUrl } from '@/lib/pdfExtract';
import { extrairePiecesDuTexte } from '@/lib/plansMetresParser';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * MetresPanel — pièces du chantier + métrés (sol / HSP / murs).
 * Les pièces alimentent la déco/prescriptions/moodboard ; les m² pré-remplissent
 * les quantités. Palette V10.
 */
export interface MetresPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function genId(p: string): string {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function fmt(n: number, d = 0): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: d });
}
const num = (v: string): number | undefined => (v.trim() ? parseFloat(v.replace(',', '.')) || undefined : undefined);

type FormState = { nom: string; sol: string; hsp: string; murs: string };
const EMPTY: FormState = { nom: '', sol: '', hsp: '', murs: '' };

export function MetresPanel({ visible, onClose, chantierId }: MetresPanelProps) {
  const { data, addPieceChantier, updatePieceChantier, deletePieceChantier } = useApp();

  const chantierNom = useMemo(() => data.chantiers.find(c => c.id === chantierId)?.nom ?? '', [data.chantiers, chantierId]);
  const pieces = useMemo(
    () => (data.piecesChantier || []).filter(p => p.chantierId === chantierId).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [data.piecesChantier, chantierId],
  );
  const surfaceHabitable = useMemo(() => pieces.reduce((s, p) => s + (p.surfaceSolM2 || 0), 0), [pieces]);

  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  // Import depuis un plan PDF (extraction texte gratuite + parsing local)
  const [importing, setImporting] = useState(false);
  const [detected, setDetected] = useState<{ nom: string; surface: string; on: boolean }[] | null>(null);

  const importerPlan = async () => {
    try {
      const files = await pickNativeFile({ acceptPdf: true, acceptImages: false, multiple: false });
      if (!files.length) return;
      setImporting(true);
      const url = await uploadFileToStorage(files[0].uri, `chantiers/${chantierId}/plans`, genId('plan'));
      if (!url) { setImporting(false); Alert.alert('Import', "Le plan n'a pas pu être lu."); return; }
      const texte = await extractTextFromPdfUrl(url);
      setImporting(false);
      const found = extrairePiecesDuTexte(texte || '');
      if (!found.length) {
        Alert.alert('Aucune pièce détectée', "Le plan ne contient pas de surfaces en texte (c'est peut-être un scan / une image). Ajoute les pièces manuellement.");
        return;
      }
      setDetected(found.map(p => ({ nom: p.nom, surface: String(p.surfaceM2), on: true })));
    } catch { setImporting(false); }
  };

  const confirmImport = () => {
    if (!detected) return;
    const now = new Date().toISOString();
    let ordre = pieces.length;
    detected.filter(d => d.on && d.nom.trim()).forEach(d => {
      addPieceChantier({
        id: genId('piece'), chantierId, nom: d.nom.trim(), ordre: ordre++,
        surfaceSolM2: d.surface.trim() ? parseFloat(d.surface.replace(',', '.')) || undefined : undefined,
        createdAt: now, updatedAt: now,
      });
    });
    setDetected(null);
  };

  const openNew = () => { setEditId(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (p: PieceChantier) => {
    setEditId(p.id);
    setForm({
      nom: p.nom,
      sol: p.surfaceSolM2 != null ? String(p.surfaceSolM2) : '',
      hsp: p.hauteurSousPlafondM != null ? String(p.hauteurSousPlafondM) : '',
      murs: p.surfaceMursM2 != null ? String(p.surfaceMursM2) : '',
    });
    setShowForm(true);
  };

  const save = () => {
    if (!form.nom.trim()) return;
    const now = new Date().toISOString();
    const ex = editId ? pieces.find(p => p.id === editId) : undefined;
    const entry: PieceChantier = {
      id: editId || genId('piece'),
      chantierId,
      nom: form.nom.trim(),
      ordre: ex?.ordre ?? pieces.length,
      surfaceSolM2: num(form.sol),
      hauteurSousPlafondM: num(form.hsp),
      surfaceMursM2: num(form.murs),
      createdAt: ex?.createdAt || now,
      updatedAt: now,
    };
    editId ? updatePieceChantier(entry) : addPieceChantier(entry);
    setShowForm(false);
  };

  const confirmDelete = (p: PieceChantier) => {
    Alert.alert('Supprimer', `Supprimer « ${p.nom} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deletePieceChantier(p.id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <PanelHeader title="Métrés" sub={chantierNom} onClose={onClose} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.importBtn} onPress={importerPlan} disabled={importing}>
            {importing ? <ActivityIndicator size="small" color={DS.bordeaux} /> : <FileScan size={16} color={DS.bordeaux} />}
            <Text style={styles.importText}>{importing ? 'Lecture du plan…' : 'Importer depuis un plan (PDF)'}</Text>
          </Pressable>

          {pieces.length === 0 ? (
            <EmptyState iconComponent={Ruler} title="Aucune pièce" description="Importez un plan PDF coté (surfaces détectées automatiquement) ou ajoutez les pièces à la main." />
          ) : (
            <>
              <View style={styles.banner}>
                <View>
                  <Text style={styles.bannerLabel}>Surface habitable</Text>
                  <Text style={styles.bannerValue}>{fmt(surfaceHabitable, 1)} m²</Text>
                </View>
                <Ruler size={26} color={DS.cremeNude} />
              </View>

              <View style={styles.thead}>
                <Text style={styles.th1}>Pièce</Text>
                <Text style={styles.thn}>Sol</Text>
                <Text style={styles.thn}>HSP</Text>
                <Text style={styles.thn}>Murs</Text>
                <View style={styles.thAct} />
              </View>

              {pieces.map(p => (
                <Pressable key={p.id} onPress={() => openEdit(p)} onLongPress={() => confirmDelete(p)} style={styles.row}>
                  <Text style={styles.rNom} numberOfLines={1}>{p.nom}</Text>
                  <Text style={styles.rVal}>{p.surfaceSolM2 != null ? fmt(p.surfaceSolM2, 1) : '—'}</Text>
                  <Text style={styles.rValMut}>{p.hauteurSousPlafondM != null ? fmt(p.hauteurSousPlafondM, 2) : '—'}</Text>
                  <Text style={styles.rValMut}>{p.surfaceMursM2 != null ? fmt(p.surfaceMursM2, 1) : '—'}</Text>
                  <View style={styles.rActions}>
                    <Pressable hitSlop={8} onPress={() => openEdit(p)} style={styles.iconBtn}><Pencil size={14} color={DS.bordeaux} /></Pressable>
                  </View>
                </Pressable>
              ))}

              <Text style={styles.footNote}>La HSP calcule les murs (peinture) ; les m² pré-remplissent les quantités des prescriptions.</Text>
            </>
          )}
        </ScrollView>

        <Pressable style={styles.fab} onPress={openNew}><Plus size={22} color={DS.cremeFond} /></Pressable>

        {/* Revue des pièces détectées dans le plan */}
        {detected && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetected(null)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <Text style={styles.formTitle}>Pièces détectées ({detected.filter(d => d.on).length}/{detected.length})</Text>
              <Text style={styles.detHint}>Vérifie les surfaces, décoche ce qui n'est pas une pièce, puis ajoute.</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
                {detected.map((d, i) => (
                  <View key={i} style={styles.detRow}>
                    <Pressable hitSlop={8} onPress={() => setDetected(arr => arr!.map((x, j) => j === i ? { ...x, on: !x.on } : x))} style={[styles.check, d.on && styles.checkOn]}>
                      {d.on ? <Check size={13} color={DS.cremeFond} /> : null}
                    </Pressable>
                    <TextInput style={[styles.input, styles.detNom]} value={d.nom} onChangeText={t => setDetected(arr => arr!.map((x, j) => j === i ? { ...x, nom: t } : x))} placeholder="Pièce" placeholderTextColor={DS.textAlt} />
                    <TextInput style={[styles.input, styles.detSurf]} value={d.surface} onChangeText={t => setDetected(arr => arr!.map((x, j) => j === i ? { ...x, surface: t } : x))} keyboardType="decimal-pad" placeholder="m²" placeholderTextColor={DS.textAlt} />
                  </View>
                ))}
              </ScrollView>
              <Pressable style={[styles.saveBtn, detected.filter(d => d.on).length === 0 && styles.saveBtnDisabled]} onPress={confirmImport}>
                <Text style={styles.saveText}>Ajouter {detected.filter(d => d.on).length} pièce(s)</Text>
              </Pressable>
            </View>
            </KeyboardAvoidingView>
          </View>
        )}

        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formTitle}>{editId ? 'Modifier la pièce' : 'Nouvelle pièce'}</Text>
                <TextInput style={styles.input} placeholder="Nom de la pièce" placeholderTextColor={DS.textAlt} value={form.nom} onChangeText={t => set({ nom: t })} />
                {!editId ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggWrap}>
                    {PIECES_DEFAULT.map(n => (
                      <Pressable key={n} onPress={() => set({ nom: n })} style={styles.sugg}><Text style={styles.suggText}>{n}</Text></Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.row3}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Sol m²" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.sol} onChangeText={t => set({ sol: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="HSP m" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.hsp} onChangeText={t => set({ hsp: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Murs m²" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.murs} onChangeText={t => set({ murs: t })} />
                </View>
                <Pressable style={[styles.saveBtn, !form.nom.trim() && styles.saveBtnDisabled]} onPress={save}>
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
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: DS.cremeNude, borderRadius: radius.md, paddingVertical: space.md, marginBottom: space.md },
  importText: { fontSize: font.body, fontWeight: font.bold, color: DS.bordeaux },
  detHint: { fontSize: font.compact, color: DS.textSecondary, marginBottom: space.sm },
  detRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  check: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 1.5, borderColor: DS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surface },
  checkOn: { backgroundColor: DS.bordeaux, borderColor: DS.bordeaux },
  detNom: { flex: 1, marginBottom: 0 },
  detSurf: { width: 76, marginBottom: 0, textAlign: 'right' },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: DS.bordeaux, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.lg, marginBottom: space.md },
  bannerLabel: { fontSize: font.tiny, fontWeight: font.bold, color: DS.cremeNude, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.85 },
  bannerValue: { fontSize: font.xxl, fontWeight: font.heavy, color: DS.cremeFond },
  thead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.xs },
  th1: { flex: 1, fontSize: font.tiny, fontWeight: font.bold, color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  thn: { width: 52, textAlign: 'right', fontSize: font.tiny, fontWeight: font.bold, color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  thAct: { width: 34 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, paddingVertical: space.sm, paddingHorizontal: space.sm, marginBottom: space.xs },
  rNom: { flex: 1, fontSize: font.body, fontWeight: font.semibold, color: DS.sombre },
  rVal: { width: 52, textAlign: 'right', fontSize: font.body, fontWeight: font.bold, color: DS.sombre, fontVariant: ['tabular-nums'] },
  rValMut: { width: 52, textAlign: 'right', fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, fontVariant: ['tabular-nums'] },
  rActions: { width: 34, alignItems: 'flex-end' },
  iconBtn: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  footNote: { fontSize: font.compact, color: DS.textSecondary, marginTop: space.md, lineHeight: font.compact * 1.4 },
  fab: { position: 'absolute', right: space.lg, bottom: space.xl, width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux, alignItems: 'center', justifyContent: 'center' },
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  input: { backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm },
  suggWrap: { gap: space.xs, paddingBottom: space.sm },
  sugg: { backgroundColor: DS.cremeNude, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12 },
  suggText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.bordeaux },
  row3: { flexDirection: 'row', gap: space.sm },
  flex1: { flex: 1 },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
