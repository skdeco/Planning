/**
 * PV de réception de chantier : checklist + signature client.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Modal, Alert, Platform, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SignaturePad } from '@/components/SignaturePad';
import { todayYMD } from '@/lib/date/today';

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

const CHECKLIST_DEFAUT = [
  { cat: 'Finitions', items: ['Peintures', 'Plinthes', 'Enduits', 'Joints carrelage', 'Propreté générale'] },
  { cat: 'Plomberie', items: ['Robinetterie fonctionnelle', 'Étanchéité douche/baignoire', 'WC + chasse d\'eau', 'Évacuations'] },
  { cat: 'Électricité', items: ['Tableau électrique', 'Prises et interrupteurs', 'Éclairage', 'Test disjoncteurs'] },
  { cat: 'Menuiserie', items: ['Portes (serrures/fermeture)', 'Fenêtres', 'Placards', 'Plans de travail'] },
  { cat: 'Sols', items: ['Parquet / carrelage', 'Joints', 'Niveau / planéité'] },
  { cat: 'Livraison', items: ['Clés remises', 'Notices et garanties fournies', 'Nettoyage final'] },
];

interface Props {
  chantier: Chantier;
  isAdmin: boolean;
  externAp?: { type: 'client' | 'architecte' | 'apporteur' | 'contractant'; prenom: string; nom: string };
}

export function PVReceptionChantier({ chantier, isAdmin, externAp }: Props) {
  const { updateChantier } = useApp();
  const pv = chantier.pvReception;
  const [show, setShow] = useState(false);
  const [items, setItems] = useState(pv?.items || []);
  const [dateReception, setDateReception] = useState(pv?.dateReception || todayYMD());
  const [signaturePadVisible, setSignaturePadVisible] = useState(false);

  const hasPv = !!pv;
  const cloture = !!pv?.clotureLe;
  const nbReserves = (pv?.items || []).filter(i => i.conforme === false).length;
  const nbConformes = (pv?.items || []).filter(i => i.conforme === true).length;

  const isClient = externAp?.type === 'client';
  const canEdit = isAdmin && !cloture;
  const canSign = isClient && !cloture;

  const openForm = () => {
    if (pv?.items?.length) {
      setItems(pv.items);
    } else {
      // Initialiser avec la checklist par défaut
      const init: typeof items = [];
      CHECKLIST_DEFAUT.forEach(g => g.items.forEach(lib => init.push({ id: genId('pv'), libelle: lib, categorie: g.cat, conforme: null })));
      setItems(init);
    }
    setDateReception(pv?.dateReception || todayYMD());
    setShow(true);
  };

  const save = () => {
    updateChantier({
      ...chantier,
      pvReception: {
        ...(pv || {}),
        dateReception,
        items,
      },
    });
    setShow(false);
  };

  const addReserve = () => {
    setItems(prev => [...prev, { id: genId('pv'), libelle: '', categorie: 'Autre', conforme: null }]);
  };

  const toggleItem = (id: string, conforme: boolean | null) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, conforme } : i));
  };

  const signerClient = async (signatureUri: string) => {
    let uri = signatureUri;
    if (!uri.startsWith('http')) {
      const up = await uploadFileToStorage(uri, `chantiers/${chantier.id}/pv`, genId('sig'));
      if (up) uri = up;
    }
    const now = new Date().toISOString();
    updateChantier({
      ...chantier,
      pvReception: {
        ...(chantier.pvReception || { items: [] }),
        signatureClientUri: uri,
        signatureClientDate: now,
        nomSignataire: externAp ? `${externAp.prenom} ${externAp.nom}` : undefined,
        clotureLe: now,
      },
    });
    setSignaturePadVisible(false);
  };

  // Groupés par catégorie pour l'affichage
  const grouped = useMemo(() => {
    const map: Record<string, typeof items> = {};
    items.forEach(i => { (map[i.categorie || 'Autre'] ||= []).push(i); });
    return map;
  }, [items]);

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.title}>🏁 PV de réception</Text>
        {cloture && (
          <View style={{ backgroundColor: '#2E7D32', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓ Clôturé</Text>
          </View>
        )}
      </View>

      {!hasPv ? (
        <Text style={styles.empty}>Aucun PV de réception démarré.</Text>
      ) : (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.meta}>📅 Réception : {pv?.dateReception || '—'}</Text>
          <Text style={styles.meta}>✓ {nbConformes} conforme{nbConformes > 1 ? 's' : ''} · 🔴 {nbReserves} réserve{nbReserves > 1 ? 's' : ''}</Text>
          {cloture && pv?.signatureClientDate && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.meta}>✍️ Signé le {new Date(pv.signatureClientDate).toLocaleString('fr-FR')}</Text>
              {pv.nomSignataire && <Text style={styles.meta}>Par {pv.nomSignataire}</Text>}
              {pv.signatureClientUri && <Image source={{ uri: pv.signatureClientUri }} style={{ width: 160, height: 80, marginTop: 6, borderWidth: 1, borderColor: '#E8DDD0', borderRadius: 6 }} resizeMode="contain" />}
            </View>
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {canEdit && (
          <Pressable style={styles.btn} onPress={openForm}>
            <Text style={styles.btnText}>{hasPv ? '✏️ Modifier le PV' : '+ Démarrer un PV'}</Text>
          </Pressable>
        )}
        {hasPv && !cloture && canSign && (
          <Pressable style={[styles.btn, styles.btnSign]} onPress={() => setSignaturePadVisible(true)}>
            <Text style={[styles.btnText, { color: '#fff' }]}>✍️ Signer le PV</Text>
          </Pressable>
        )}
      </View>

      {/* Modal édition */}
      <Modal visible={show} animationType="slide" transparent onRequestClose={() => setShow(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', flex: 1 }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8DDD0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800' }}>PV de réception</Text>
                <Text style={{ fontSize: 11, color: '#8C8077' }}>Cochez chaque point, indiquez les réserves</Text>
              </View>
              <Pressable onPress={() => setShow(false)} style={{ width: 32, height: 32, backgroundColor: '#F5EDE3', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
              <Text style={styles.label}>Date de réception</Text>
              <DatePickerField value={dateReception} onChange={setDateReception} placeholder="Date" />

              {Object.entries(grouped).map(([cat, list]) => (
                <View key={cat} style={{ marginTop: 14 }}>
                  <Text style={styles.catTitle}>{cat}</Text>
                  {list.map(item => (
                    <View key={item.id} style={styles.itemRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={item.libelle}
                        onChangeText={v => setItems(prev => prev.map(i => i.id === item.id ? { ...i, libelle: v } : i))}
                        placeholder="Élément à contrôler"
                      />
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <Pressable onPress={() => toggleItem(item.id, true)} style={[styles.statusBtn, item.conforme === true && styles.statusOk]}>
                          <Text style={[styles.statusBtnText, item.conforme === true && { color: '#fff' }]}>✓</Text>
                        </Pressable>
                        <Pressable onPress={() => toggleItem(item.id, false)} style={[styles.statusBtn, item.conforme === false && styles.statusKo]}>
                          <Text style={[styles.statusBtnText, item.conforme === false && { color: '#fff' }]}>🔴</Text>
                        </Pressable>
                        <Pressable onPress={() => toggleItem(item.id, null)} style={[styles.statusBtn, item.conforme === null && styles.statusNeutral]}>
                          <Text style={[styles.statusBtnText, item.conforme === null && { color: '#fff' }]}>?</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ))}

              <Pressable onPress={addReserve} style={[styles.btn, { marginTop: 14 }]}>
                <Text style={styles.btnText}>+ Ajouter un point</Text>
              </Pressable>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                <Pressable onPress={() => setShow(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700' }}>Annuler</Text>
                </Pressable>
                <Pressable onPress={save} style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#C9A96E', fontWeight: '800' }}>Enregistrer</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pad de signature */}
      <Modal visible={signaturePadVisible} animationType="fade" transparent onRequestClose={() => setSignaturePadVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', marginBottom: 10, color: '#2C2C2C' }}>✍️ Signature client — PV de réception</Text>
            <SignaturePad
              onSave={(b64) => signerClient(b64)}
              onCancel={() => setSignaturePadVisible(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '800', color: '#2C2C2C' },
  empty: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  meta: { fontSize: 12, color: '#687076', marginTop: 2 },
  btn: { backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E8DDD0' },
  btnSign: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  btnText: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 4, color: '#2C2C2C' },
  catTitle: { fontSize: 13, fontWeight: '800', color: '#8C6D2F', marginBottom: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  input: { backgroundColor: '#FAF7F3', borderRadius: 8, borderWidth: 1, borderColor: '#E8DDD0', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  statusBtn: { width: 32, height: 32, backgroundColor: '#FAF7F3', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8DDD0' },
  statusOk: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  statusKo: { backgroundColor: '#B83A2E', borderColor: '#B83A2E' },
  statusNeutral: { backgroundColor: '#8C8077', borderColor: '#8C8077' },
  statusBtnText: { fontSize: 13, fontWeight: '800' },
});
