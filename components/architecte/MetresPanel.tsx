import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { X, Plus, Pencil, Trash2, Ruler } from 'lucide-react-native';
import type { PieceChantier } from '@/app/types';
import { PIECES_DEFAULT } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
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
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Métrés</Text>
            {chantierNom ? <Text style={styles.hSub}>{chantierNom}</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {pieces.length === 0 ? (
            <EmptyState iconComponent={Ruler} title="Aucune pièce" description="Ajoutez les pièces et leurs surfaces (sol, HSP, murs)." />
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

        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
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
