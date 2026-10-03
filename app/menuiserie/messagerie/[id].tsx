/**
 * Messagerie d'un chantier (admins, client, architecte) + RDV :
 * un RDV proposé doit être accepté par tous les administrateurs, puis par le client ;
 * une fois confirmé il s'ajoute au planning.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS, radius } from '@/constants/design';
import { formatDateFR, formatDateHeureFR } from '@/lib/date/format';
import { DateInput } from '@/components/ui/DateInput';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';
import { envoyerMessageMn, listerMessagesMn, listerRdvMn, proposerRdvMn, repondreRdvMn } from '@/lib/menuiserie/api2';
import type { MessageMn, RdvMn } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Pastille, Section } from '@/components/menuiserie/ui';

import { tm, traduit } from '@/lib/menuiserie/i18n';
const STATUT_RDV: Record<RdvMn['statut'], { label: string; fond: string; texte: string }> = traduit({
  validation_admins: { label: "En validation par l'équipe SK DECO", fond: '#F6EEDB', texte: '#5A3E08' },
  chez_client: { label: 'En attente du client', fond: '#DCE6F0', texte: '#1F4E79' },
  confirme: { label: 'Confirmé', fond: '#E7F0EA', texte: '#1F4D36' },
  refuse: { label: 'Refusé', fond: '#F6DCDA', texte: '#7A1F18' },
});

export default function MessagerieMn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const moi = useCompteMn();
  const admin = moi.role === 'admin';
  const [messages, setMessages] = useState<MessageMn[]>([]);
  const [rdvs, setRdvs] = useState<RdvMn[]>([]);
  const [texte, setTexte] = useState('');
  const [form, setForm] = useState<{ titre: string; date: string; debut: string; fin: string } | null>(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([listerMessagesMn(String(id)), listerRdvMn(String(id))]);
      setMessages(m); setRdvs(r); setErreur('');
    } catch (e) { setErreur((e as Error).message); }
  }, [id]);
  useEffect(() => { charger(); }, [charger]);

  const envoyer = async () => {
    if (!texte.trim()) return;
    try { await envoyerMessageMn(moi, String(id), texte); setTexte(''); charger(); } catch (e) { setErreur((e as Error).message); }
  };
  const proposer = async () => {
    if (!form?.titre.trim() || !form.date || !/^\d{2}:\d{2}$/.test(form.debut)) { setErreur(tm("Titre, date et heure (HH:MM) obligatoires.")); return; }
    try { await proposerRdvMn({ chantierId: String(id), titre: form.titre.trim(), date: form.date, debut: form.debut, fin: form.fin }); setForm(null); charger(); }
    catch (e) { setErreur((e as Error).message); }
  };
  const repondre = async (r: RdvMn, ok: boolean) => { try { await repondreRdvMn(r.id, ok); charger(); } catch (e) { setErreur((e as Error).message); } };

  const doitRepondre = (r: RdvMn) => r.accords[moi.id] === undefined
    && ((admin && r.statut === 'validation_admins') || (!admin && r.statut === 'chez_client'));

  return (
    <ScreenContainer containerClassName="bg-[#F4F4F2]" edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }} keyboardShouldPersistTaps="handled">
          <EnTete titre={tm("Messagerie & RDV")} retour={() => router.back()} />

          <Section>{tm("Rendez-vous")}</Section>
          {rdvs.length === 0 && <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Aucun RDV proposé.")}</Text>}
          {rdvs.map(r => {
            const st = STATUT_RDV[r.statut];
            return (
              <Carte key={r.id}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{r.titre}</Text>
                <Text style={{ fontSize: 14, color: DS.text }}>{formatDateFR(r.date_rdv)} · {r.heure_debut}{r.heure_fin ? `–${r.heure_fin}` : ''}</Text>
                <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Proposé par")}{' '}{r.propose_par_nom}</Text>
                <Pastille label={st.label} fond={st.fond} texte={st.texte} />
                {doitRepondre(r) && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><Bouton label={tm("Accepter")} onPress={() => repondre(r, true)} /></View>
                    <View style={{ flex: 1 }}><Bouton label={tm("Refuser")} variante="contour" onPress={() => repondre(r, false)} /></View>
                  </View>
                )}
              </Carte>
            );
          })}
          {form ? (
            <Carte>
              <Champ label={tm("Objet du RDV")} value={form.titre} onChangeText={v => setForm(f => f && { ...f, titre: v })} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Date")}</Text>
              <DateInput value={form.date} onChangeDate={d => setForm(f => f && { ...f, date: d })} accessibilityLabel={tm("Date du RDV")}
                style={{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.background }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Champ label={tm("Début (HH:MM)")} value={form.debut} onChangeText={v => setForm(f => f && { ...f, debut: v })} />
                <Champ label={tm("Fin (HH:MM)")} value={form.fin} onChangeText={v => setForm(f => f && { ...f, fin: v })} />
              </View>
              <Text style={{ fontSize: 12, color: DS.textSecondary }}>
                {admin ? tm("Les autres administrateurs doivent d'abord accepter ; ensuite le client reçoit la proposition.") : tm("L'équipe SK DECO doit accepter la proposition.")}
              </Text>
              <Bouton label={tm("Proposer le RDV")} onPress={proposer} />
              <Bouton label={tm("Annuler")} variante="discret" onPress={() => setForm(null)} />
            </Carte>
          ) : (
            <Bouton label={tm("+ Proposer un RDV")} variante="contour" onPress={() => setForm({ titre: '', date: '', debut: '10:00', fin: '11:00' })} />
          )}

          <Section>{tm("Messages")}</Section>
          {messages.length === 0 && <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Aucun message.")}</Text>}
          {messages.map(m => {
            const mien = m.auteur_compte === moi.id;
            return (
              <View key={m.id} style={{ alignSelf: mien ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: mien ? DS.primary : DS.surface, borderRadius: radius.lg, padding: 10, borderWidth: mien ? 0 : 1, borderColor: DS.border }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: mien ? '#F1DCE1' : DS.textSecondary }}>{m.auteur_nom} · {formatDateHeureFR(m.created_at)}</Text>
                <Text style={{ fontSize: 15, color: mien ? DS.textInverse : DS.text, marginTop: 2 }}>{m.texte}</Text>
              </View>
            );
          })}
          {!!erreur && <Text style={{ color: DS.error, fontWeight: '600' }}>{erreur}</Text>}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: DS.border, backgroundColor: DS.surface, alignItems: 'flex-end' }}>
          <Champ label={tm("Message")} value={texte} onChangeText={setTexte} multiline />
          <Pressable onPress={envoyer} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: DS.primary, justifyContent: 'center' }}>
            <Text style={{ color: DS.textInverse, fontWeight: '800' }}>{tm("Envoyer")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
