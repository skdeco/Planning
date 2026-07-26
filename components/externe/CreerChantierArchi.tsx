import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { CHANTIER_COLORS } from '@/app/types';
import type { Apporteur, Chantier } from '@/app/types';
import { DS } from '@/constants/design';

/**
 * CreerChantierArchi — l'ARCHITECTE crée lui-même un chantier (Niveau 1, mono-tenant).
 * Il renseigne les champs primaires (nom, adresse, dates) + lie/crée un client.
 * Le chantier vit dans la base SK DECO : SK DECO (entreprise) le voit et complète
 * ensuite ses champs (marché, situations…). L'architecte en est le créateur (architecteId).
 */
export interface CreerChantierArchiProps {
  visible: boolean;
  onClose: () => void;
  /** id de l'apporteur architecte connecté (créateur). */
  architecteId: string;
  /** Appelé avec l'id du chantier créé (pour l'ouvrir). */
  onCreated: (chantierId: string) => void;
}

const rid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]/g, '');

export function CreerChantierArchi({ visible, onClose, architecteId, onCreated }: CreerChantierArchiProps) {
  const { data, addChantier, addApporteur } = useApp();

  const [nom, setNom] = useState('');
  const [rue, setRue] = useState('');
  const [cp, setCp] = useState('');
  const [ville, setVille] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [clientMode, setClientMode] = useState<'aucun' | 'existant' | 'nouveau'>('aucun');
  const [clientId, setClientId] = useState('');
  const [nc, setNc] = useState({ prenom: '', nom: '', email: '', telephone: '' });
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<{ identifiant: string; motDePasse: string; chantierId: string } | null>(null);

  const clients = useMemo(() => (data.apporteurs || []).filter(a => a.type === 'client'), [data.apporteurs]);

  const reset = () => {
    setNom(''); setRue(''); setCp(''); setVille(''); setDateDebut(''); setDateFin('');
    setClientMode('aucun'); setClientId(''); setNc({ prenom: '', nom: '', email: '', telephone: '' }); setCreds(null);
  };
  const close = () => { reset(); onClose(); };

  const canSave = nom.trim().length > 0
    && (clientMode !== 'existant' || !!clientId)
    && (clientMode !== 'nouveau' || (nc.prenom.trim() && nc.nom.trim()));

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      let finalClientId: string | undefined;
      let newCreds: { identifiant: string; motDePasse: string } | null = null;

      if (clientMode === 'existant') {
        finalClientId = clientId || undefined;
      } else if (clientMode === 'nouveau') {
        const { generatePassword, preparerChangementMotDePasse } = await import('@/lib/externAuth');
        const base = nc.email.trim() ? normalize(nc.email.split('@')[0]) : `${normalize(nc.prenom)}.${normalize(nc.nom)}`;
        let ident = base || 'client';
        let i = 2;
        while ((data.apporteurs || []).some(a => (a.identifiant || '').toLowerCase() === ident)) { ident = `${base}${i}`; i++; }
        const mdp = generatePassword(10);
        const mdpFields = await preparerChangementMotDePasse(mdp);
        finalClientId = rid('app');
        addApporteur({
          id: finalClientId, type: 'client', prenom: nc.prenom.trim(), nom: nc.nom.trim(),
          email: nc.email.trim() || undefined, telephone: nc.telephone.trim() || undefined,
          identifiant: ident, accesApp: true, ...mdpFields, createdAt: now, updatedAt: now,
        } as Apporteur);
        newCreds = { identifiant: ident, motDePasse: mdp };
      }

      const chantierId = rid('c');
      const adresse = [rue.trim(), cp.trim(), ville.trim()].filter(Boolean).join(', ');
      addChantier({
        id: chantierId,
        nom: nom.trim(),
        adresse,
        rue: rue.trim() || undefined,
        codePostal: cp.trim() || undefined,
        ville: ville.trim() || undefined,
        dateDebut: dateDebut.trim(),
        dateFin: dateFin.trim(),
        statut: 'a_letude',
        couleur: CHANTIER_COLORS[Math.abs(chantierId.length) % CHANTIER_COLORS.length],
        employeIds: [],
        visibleSurPlanning: true,
        architecteId,
        clientApporteurId: finalClientId,
        afficherPlanningAuClient: true,
        createdAt: now,
      } as Chantier);

      if (newCreds) {
        setCreds({ ...newCreds, chantierId });   // affiche les identifiants à communiquer
      } else {
        close();
        onCreated(chantierId);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{creds ? 'Chantier créé' : 'Nouveau chantier'}</Text>
            <Pressable onPress={close} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          </View>

          {creds ? (
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={styles.credIntro}>Le chantier est créé. Communiquez ces identifiants à votre client pour qu'il accède à l'application :</Text>
              <View style={styles.credBox}>
                <View style={styles.credRow}><Text style={styles.credLabel}>Identifiant</Text><Text style={styles.credVal}>{creds.identifiant}</Text></View>
                <View style={styles.credRow}><Text style={styles.credLabel}>Mot de passe</Text><Text style={styles.credVal}>{creds.motDePasse}</Text></View>
              </View>
              <Text style={styles.credNote}>SK DECO (entreprise) verra ce chantier et pourra le compléter (marché, situations…).</Text>
              <Pressable style={styles.saveBtn} onPress={() => { const id = creds.chantierId; close(); onCreated(id); }}>
                <Text style={styles.saveTxt}>Ouvrir le chantier</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Nom du chantier *</Text>
              <TextInput style={styles.input} placeholder="Ex : Appartement Mozart" placeholderTextColor="#B0A594" value={nom} onChangeText={setNom} />

              <Text style={styles.label}>Adresse</Text>
              <TextInput style={styles.input} placeholder="Rue" placeholderTextColor="#B0A594" value={rue} onChangeText={setRue} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[styles.input, { width: 110 }]} placeholder="Code postal" placeholderTextColor="#B0A594" keyboardType="number-pad" value={cp} onChangeText={setCp} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ville" placeholderTextColor="#B0A594" value={ville} onChangeText={setVille} />
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Début</Text>
                  <TextInput style={styles.input} placeholder="AAAA-MM-JJ" placeholderTextColor="#B0A594" autoCapitalize="none" value={dateDebut} onChangeText={setDateDebut} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Fin prévue</Text>
                  <TextInput style={styles.input} placeholder="AAAA-MM-JJ" placeholderTextColor="#B0A594" autoCapitalize="none" value={dateFin} onChangeText={setDateFin} />
                </View>
              </View>

              <Text style={styles.label}>Client</Text>
              <View style={styles.segRow}>
                {([['aucun', 'Aucun'], ['existant', 'Existant'], ['nouveau', 'Nouveau']] as const).map(([k, lbl]) => (
                  <Pressable key={k} onPress={() => setClientMode(k)} style={[styles.seg, clientMode === k && styles.segOn]}>
                    <Text style={[styles.segTxt, clientMode === k && styles.segTxtOn]}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>

              {clientMode === 'existant' && (
                <View style={styles.chipWrap}>
                  {clients.length === 0 ? <Text style={styles.hint}>Aucun client existant — créez-en un.</Text> : clients.map(c => (
                    <Pressable key={c.id} onPress={() => setClientId(c.id)} style={[styles.chip, clientId === c.id && styles.chipOn]}>
                      <Text style={[styles.chipTxt, clientId === c.id && styles.chipTxtOn]}>{c.prenom} {c.nom}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {clientMode === 'nouveau' && (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Prénom *" placeholderTextColor="#B0A594" value={nc.prenom} onChangeText={t => setNc(s => ({ ...s, prenom: t }))} />
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nom *" placeholderTextColor="#B0A594" value={nc.nom} onChangeText={t => setNc(s => ({ ...s, nom: t }))} />
                  </View>
                  <TextInput style={styles.input} placeholder="Email (optionnel)" placeholderTextColor="#B0A594" autoCapitalize="none" keyboardType="email-address" value={nc.email} onChangeText={t => setNc(s => ({ ...s, email: t }))} />
                  <TextInput style={styles.input} placeholder="Téléphone (optionnel)" placeholderTextColor="#B0A594" keyboardType="phone-pad" value={nc.telephone} onChangeText={t => setNc(s => ({ ...s, telephone: t }))} />
                  <Text style={styles.hint}>Un accès à l'application sera généré pour ce client.</Text>
                </View>
              )}

              <Text style={styles.entrepriseNote}>Ce chantier sera visible par SK DECO (entreprise), qui pourra le compléter.</Text>

              <Pressable style={[styles.saveBtn, !canSave && styles.saveBtnOff]} onPress={save} disabled={!canSave || saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveTxt}>Créer le chantier</Text>}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF7F2', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDE4D8' },
  title: { fontSize: 18, fontWeight: '800', color: '#2C2C2C' },
  close: { fontSize: 20, color: '#8C8077', paddingHorizontal: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#8C8077', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8DDD0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2C2C2C' },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F0E6DC', alignItems: 'center' },
  segOn: { backgroundColor: DS.bordeaux },
  segTxt: { fontSize: 13, fontWeight: '700', color: '#8C6D2F' },
  segTxtOn: { color: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8DDD0' },
  chipOn: { backgroundColor: DS.bordeaux, borderColor: DS.bordeaux },
  chipTxt: { fontSize: 13, fontWeight: '600', color: '#2C2C2C' },
  chipTxtOn: { color: '#fff' },
  hint: { fontSize: 12, color: '#8C8077', fontStyle: 'italic' },
  entrepriseNote: { fontSize: 12, color: '#8C6D2F', backgroundColor: '#F5ECDD', borderRadius: 10, padding: 10, marginTop: 6 },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnOff: { opacity: 0.4 },
  saveTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  credIntro: { fontSize: 14, color: '#2C2C2C' },
  credBox: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E8DDD0', padding: 14, gap: 10 },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  credLabel: { fontSize: 12, fontWeight: '700', color: '#8C8077', textTransform: 'uppercase' },
  credVal: { fontSize: 16, fontWeight: '800', color: DS.bordeaux },
  credNote: { fontSize: 12, color: '#8C8077', fontStyle: 'italic' },
});
