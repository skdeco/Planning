import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { X, Plus, Check, Flag, Trash2 } from 'lucide-react-native';
import type { Chantier, PVReception, PVPiece, PVReserve } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * ReservesPanel — réserves de réception (punch-list), par pièce.
 * Réutilise la structure PVReserve du PV de réception (Chantier.pvReception) :
 * même donnée, vue dédiée. Co-édité archi/entreprise. Palette V10.
 */
export interface ReservesPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function genId(p: string): string {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

type FlatReserve = { piece: PVPiece; reserve: PVReserve };

export function ReservesPanel({ visible, onClose, chantierId }: ReservesPanelProps) {
  const { data, updateChantier } = useApp();
  const chantier = useMemo(() => data.chantiers.find(c => c.id === chantierId), [data.chantiers, chantierId]);
  const pieces = useMemo<PVPiece[]>(() => chantier?.pvReception?.pieces || [], [chantier]);

  const flat = useMemo<FlatReserve[]>(
    () => pieces.flatMap(p => (p.reserves || []).map(r => ({ piece: p, reserve: r }))),
    [pieces],
  );
  const total = flat.length;
  const levees = flat.filter(f => !!f.reserve.levee).length;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ piece: '', description: '' });
  const set = (p: Partial<{ piece: string; description: string }>) => setForm(f => ({ ...f, ...p }));

  const persist = (nextPieces: PVPiece[]) => {
    if (!chantier) return;
    const pv: PVReception = { ...(chantier.pvReception || {}), pieces: nextPieces };
    updateChantier({ ...chantier, pvReception: pv, derniereMajContenu: new Date().toISOString() } as Chantier);
  };

  const addReserve = () => {
    if (!chantier || !form.piece.trim() || !form.description.trim()) return;
    const now = new Date().toISOString();
    const reserve: PVReserve = { id: genId('res'), description: form.description.trim(), createdAt: now };
    const nom = form.piece.trim();
    const existing = pieces.find(p => p.nom.toLowerCase() === nom.toLowerCase());
    let next: PVPiece[];
    if (existing) {
      next = pieces.map(p => (p.id === existing.id ? { ...p, reserves: [...(p.reserves || []), reserve] } : p));
    } else {
      next = [...pieces, { id: genId('piece'), nom, ordre: pieces.length, reserves: [reserve] }];
    }
    persist(next);
    setShowForm(false);
    setForm({ piece: '', description: '' });
  };

  const toggleLevee = (f: FlatReserve) => {
    const next = pieces.map(p => p.id !== f.piece.id ? p : {
      ...p,
      reserves: (p.reserves || []).map(r => r.id !== f.reserve.id ? r : { ...r, levee: r.levee ? undefined : { le: new Date().toISOString() } }),
    });
    persist(next);
  };

  const deleteReserve = (f: FlatReserve) => {
    Alert.alert('Supprimer', 'Supprimer cette réserve ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
        const next = pieces.map(p => p.id !== f.piece.id ? p : { ...p, reserves: (p.reserves || []).filter(r => r.id !== f.reserve.id) });
        persist(next);
      } },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Réserves</Text>
            {chantier?.nom ? <Text style={styles.hSub}>{chantier.nom} · réception</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {total === 0 ? (
            <EmptyState iconComponent={Flag} title="Aucune réserve" description="Ajoutez les réserves constatées à la réception, par pièce." />
          ) : (
            <>
              <View style={styles.summary}>
                <Text style={styles.sumLabel}>Levée des réserves</Text>
                <Text style={styles.sumValue}>{levees} / {total} levées</Text>
              </View>
              <View style={{ marginBottom: space.md }}>
                <ProgressBar value={total > 0 ? (levees / total) * 100 : 0} variant="bordeaux" showPercent />
              </View>
              {pieces.filter(p => (p.reserves || []).length > 0).map(p => (
                <View key={p.id} style={styles.group}>
                  <Text style={styles.groupTitle}>{p.nom}</Text>
                  {(p.reserves || []).map((r, i) => {
                    const f = { piece: p, reserve: r };
                    const levee = !!r.levee;
                    return (
                      <View key={r.id} style={styles.item}>
                        <Pressable hitSlop={6} onPress={() => toggleLevee(f)} style={[styles.num, levee && styles.numDone]}>
                          {levee ? <Check size={12} color={DS.cremeFond} /> : <Text style={styles.numText}>{i + 1}</Text>}
                        </Pressable>
                        <Text style={[styles.desc, levee && styles.descDone]}>{r.description}</Text>
                        <View style={[styles.pill, levee ? styles.pillDone : styles.pillOpen]}>
                          <Text style={[styles.pillText, { color: levee ? DS.marron : DS.bordeaux }]}>{levee ? 'Levée' : 'Ouverte'}</Text>
                        </View>
                        <Pressable hitSlop={8} onPress={() => deleteReserve(f)} style={styles.del}><Trash2 size={13} color={DS.marron} /></Pressable>
                      </View>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </ScrollView>

        <Pressable style={styles.fab} onPress={() => { setForm({ piece: '', description: '' }); setShowForm(true); }}><Plus size={22} color={DS.cremeFond} /></Pressable>

        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.formTitle}>Nouvelle réserve</Text>
                <TextInput style={styles.input} placeholder="Pièce (ex: Salon)" placeholderTextColor={DS.textAlt} value={form.piece} onChangeText={t => set({ piece: t })} />
                <TextInput style={[styles.input, styles.multiline]} placeholder="Description du défaut constaté" placeholderTextColor={DS.textAlt} multiline value={form.description} onChangeText={t => set({ description: t })} />
                <Pressable style={[styles.saveBtn, (!form.piece.trim() || !form.description.trim()) && styles.saveBtnDisabled]} onPress={addReserve}>
                  <Text style={styles.saveText}>Ajouter</Text>
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
  summary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.sm },
  sumLabel: { fontSize: font.tiny, fontWeight: font.bold, color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sumValue: { fontSize: font.body, fontWeight: font.heavy, color: DS.sombre },
  group: { marginBottom: space.lg },
  groupTitle: { fontSize: font.tiny, fontWeight: font.bold, color: DS.bordeaux, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.xs },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: DS.bordeaux, alignItems: 'center', justifyContent: 'center' },
  numDone: { backgroundColor: DS.marron },
  numText: { fontSize: font.tiny, fontWeight: font.heavy, color: DS.cremeFond },
  desc: { flex: 1, fontSize: font.body, fontWeight: font.semibold, color: DS.sombre },
  descDone: { color: DS.textSecondary },
  pill: { borderRadius: radius.xs, paddingVertical: 3, paddingHorizontal: 7 },
  pillOpen: { backgroundColor: DS.cremeNude },
  pillDone: { backgroundColor: DS.nudeMoyen },
  pillText: { fontSize: font.tiny, fontWeight: font.bold, textTransform: 'uppercase' },
  del: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  fab: { position: 'absolute', right: space.lg, bottom: space.xl, width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux, alignItems: 'center', justifyContent: 'center' },
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  input: { backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
