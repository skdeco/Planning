import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import * as Sharing from 'expo-sharing';
import { X, Plus, Trash2, FileText, FileDown } from 'lucide-react-native';
import type { Chantier, PVAvenant, PVReception } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { genererAvenantPdf } from '@/lib/pv/genererAvenantPdf';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * AvenantPvPanel — avenants / annexes complémentaires au PV de réception.
 * Saisie d'un avenant (objet + contenu) + production du PDF à la demande.
 * Palette V10. Persiste dans Chantier.pvReception.avenants.
 */
export interface AvenantPvPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function genId(p: string): string {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function AvenantPvPanel({ visible, onClose, chantierId }: AvenantPvPanelProps) {
  const { data, updateChantier } = useApp();
  const chantier = useMemo(() => data.chantiers.find(c => c.id === chantierId), [data.chantiers, chantierId]);
  const avenants = useMemo<PVAvenant[]>(() => chantier?.pvReception?.avenants || [], [chantier]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ objet: '', contenu: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const set = (p: Partial<{ objet: string; contenu: string }>) => setForm(f => ({ ...f, ...p }));

  const persist = (next: PVAvenant[]) => {
    if (!chantier) return;
    const pv: PVReception = { ...(chantier.pvReception || {}), avenants: next };
    updateChantier({ ...chantier, pvReception: pv, derniereMajContenu: new Date().toISOString() } as Chantier);
  };

  const save = () => {
    if (!form.objet.trim()) return;
    const now = new Date().toISOString();
    const avenant: PVAvenant = {
      id: genId('avpv'),
      numero: `Avenant n°${avenants.length + 1}`,
      date: now.slice(0, 10),
      objet: form.objet.trim(),
      contenu: form.contenu.trim(),
      createdAt: now,
    };
    persist([...avenants, avenant]);
    setForm({ objet: '', contenu: '' });
    setShowForm(false);
  };

  const confirmDelete = (a: PVAvenant) => Alert.alert('Supprimer', `Supprimer « ${a.numero || a.objet} » ?`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: () => persist(avenants.filter(x => x.id !== a.id)) },
  ]);

  const produce = async (a: PVAvenant) => {
    if (!chantier || busyId) return;
    try {
      setBusyId(a.id);
      const { uri } = await genererAvenantPdf({ chantier, avenant: a });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${a.numero || 'Avenant'} — ${chantier.nom}`, UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF généré', uri);
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible de générer le PDF de l'avenant.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Avenant PV</Text>
            {chantier?.nom ? <Text style={styles.hSub}>{chantier.nom}</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {avenants.length === 0 ? (
            <EmptyState iconComponent={FileText} title="Aucun avenant" description="Créez une annexe complémentaire au PV de réception, puis produisez son PDF." />
          ) : (
            avenants.map(a => (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.numero}>{a.numero}</Text>
                    <Text style={styles.objet} numberOfLines={2}>{a.objet}</Text>
                    <Text style={styles.date}>{a.date.split('-').reverse().join('/')}</Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => confirmDelete(a)} style={styles.iconBtn}><Trash2 size={14} color={DS.marron} /></Pressable>
                </View>
                {a.contenu ? <Text style={styles.contenu} numberOfLines={3}>{a.contenu}</Text> : null}
                <Pressable style={styles.produceBtn} onPress={() => produce(a)} disabled={busyId === a.id}>
                  {busyId === a.id ? <ActivityIndicator size="small" color={DS.cremeFond} /> : <FileDown size={16} color={DS.cremeFond} />}
                  <Text style={styles.produceText}>Produire le PDF</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>

        <Pressable style={styles.fab} onPress={() => { setForm({ objet: '', contenu: '' }); setShowForm(true); }}><Plus size={22} color={DS.cremeFond} /></Pressable>

        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.formTitle}>Nouvel avenant</Text>
                <TextInput style={styles.input} placeholder="Objet (ex: Réserves complémentaires)" placeholderTextColor={DS.textAlt} value={form.objet} onChangeText={t => set({ objet: t })} />
                <TextInput style={[styles.input, styles.multiline]} placeholder="Contenu de l'avenant (observations, réserves…)" placeholderTextColor={DS.textAlt} multiline value={form.contenu} onChangeText={t => set({ contenu: t })} />
                <Pressable style={[styles.saveBtn, !form.objet.trim() && styles.saveBtnDisabled]} onPress={save}><Text style={styles.saveText}>Créer l'avenant</Text></Pressable>
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
  card: { backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: space.md, marginBottom: space.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  numero: { fontSize: font.tiny, fontWeight: font.bold, color: DS.bordeaux, textTransform: 'uppercase', letterSpacing: 0.6 },
  objet: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre, marginTop: 2 },
  date: { fontSize: font.compact, color: DS.textSecondary, marginTop: 2 },
  iconBtn: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  contenu: { fontSize: font.compact, color: DS.textSecondary, marginTop: space.sm, lineHeight: font.compact * 1.4 },
  produceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: DS.bordeaux, borderRadius: radius.md, paddingVertical: space.sm, marginTop: space.md },
  produceText: { fontSize: font.body, fontWeight: font.bold, color: DS.cremeFond },
  fab: { position: 'absolute', right: space.lg, bottom: space.xl, width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux, alignItems: 'center', justifyContent: 'center' },
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  input: { backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});
