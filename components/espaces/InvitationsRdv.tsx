/**
 * Invitations du Planning direction à traiter :
 *  - invitations reçues → Accepter ou Proposer d'autres dates (1 ou 2 créneaux) ;
 *  - mes RDV avec contre-proposition → choisir un créneau ou garder le mien.
 * N'affiche rien s'il n'y a rien à traiter.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, TextInput } from 'react-native';
import { DS, radius } from '@/constants/design';
import type { AgendaEvent, CreneauPropose } from '@/app/types';
import { useInvitationsRdv } from '@/hooks/useInvitationsRdv';
import { formatDateFR } from '@/lib/date/format';
import { DateInput } from '@/components/ui/DateInput';

import { useLanguage } from '@/app/context/LanguageContext';
import { tm } from '@/lib/menuiserie/i18n';
import { ModalKeyboard } from '@/components/ModalKeyboard';
const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function libelleCreneau(c: { date: string; heureDebut: string; heureFin?: string }) {
  return `${formatDateFR(c.date)} · ${c.heureDebut}${c.heureFin ? `–${c.heureFin}` : ''}`;
}

function Bouton({ label, onPress, plein }: { label: string; onPress: () => void; plein?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
        backgroundColor: plein ? DS.primary : DS.surface, borderWidth: 1.5, borderColor: DS.primary,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '800', color: plein ? DS.textInverse : DS.primary }}>{label}</Text>
    </Pressable>
  );
}

const champ = {
  borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 9,
  fontSize: 15, color: DS.text, backgroundColor: DS.surface,
} as const;

export function InvitationsRdv() {
  useLanguage(); // re-rendu au changement de langue
  const { aRepondre, aChoisir, accepter, proposer, choisir, garderCreneau } = useInvitationsRdv();
  const [cible, setCible] = useState<AgendaEvent | null>(null);
  const [c1, setC1] = useState<CreneauPropose>({ date: '', heureDebut: '09:00' });
  const [c2, setC2] = useState<CreneauPropose>({ date: '', heureDebut: '14:00' });
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  if (aRepondre.length === 0 && aChoisir.length === 0) return null;

  const ouvrir = (evt: AgendaEvent) => {
    setCible(evt);
    setC1({ date: '', heureDebut: evt.heureDebut, heureFin: evt.heureFin });
    setC2({ date: '', heureDebut: evt.heureDebut, heureFin: evt.heureFin });
    setMessage(''); setErreur('');
  };

  const envoyer = () => {
    if (!cible) return;
    const creneaux = [c1, c2].filter(c => c.date);
    if (creneaux.length === 0) { setErreur(tm("Indique au moins une date.")); return; }
    if (creneaux.some(c => !HEURE_RE.test(c.heureDebut) || (c.heureFin && !HEURE_RE.test(c.heureFin)))) {
      setErreur(tm("Heure au format HH:MM.")); return;
    }
    proposer(cible, creneaux, message);
    setCible(null);
  };

  return (
    <View style={{ padding: 12, gap: 10 }}>
      {aRepondre.map(evt => (
        <View key={evt.id} style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: DS.warning, padding: 14, gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>{tm("Invitation de")}{' '}{evt.createdByNom}
          </Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text }}>{evt.titre}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.text }}>{libelleCreneau(evt)}</Text>
          {!!evt.lieu && <Text style={{ fontSize: 13, color: DS.textSecondary }}>{evt.lieu}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Bouton label={tm("Accepter")} plein onPress={() => accepter(evt)} />
            <Bouton label={tm("Proposer d'autres dates")} onPress={() => ouvrir(evt)} />
          </View>
        </View>
      ))}

      {aChoisir.map(evt => (evt.contrePropositions || []).filter(c => c.statut === 'en_attente').map(cp => (
        <View key={cp.id} style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: DS.primary, padding: 14, gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {cp.parNom}{' '}{tm("propose d'autres dates")}</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{evt.titre}</Text>
          <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Créneau prévu :")}{' '}{libelleCreneau(evt)}</Text>
          {!!cp.message && <Text style={{ fontSize: 14, color: DS.text, fontStyle: 'italic' }}>« {cp.message} »</Text>}
          {cp.creneaux.map((c, i) => (
            <Bouton key={i} label={tm("Choisir le {0}", libelleCreneau(c))} plein onPress={() => choisir(evt, cp.id, c)} />
          ))}
          <Bouton label={tm("Garder mon créneau")} onPress={() => garderCreneau(evt, cp.id)} />
        </View>
      )))}

      <ModalKeyboard visible={!!cible} transparent animationType="fade" onRequestClose={() => setCible(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.xxl, padding: 18, gap: 10 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: DS.text }}>{tm("Proposer d'autres dates")}</Text>
            <Text style={{ fontSize: 13, color: DS.textSecondary }}>{cible?.titre}{' '}{tm("· prévu le")}{' '}{cible ? libelleCreneau(cible) : ''}</Text>
            {[{ c: c1, set: setC1, titre: tm("Créneau 1") }, { c: c2, set: setC2, titre: tm("Créneau 2 (facultatif)") }].map(({ c, set, titre }) => (
              <View key={titre} style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{titre}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <DateInput value={c.date} onChangeDate={d => set({ ...c, date: d })} style={[champ, { flex: 1 }]} accessibilityLabel={tm("{0} : date", titre)} />
                  <TextInput value={c.heureDebut} onChangeText={h => set({ ...c, heureDebut: h })} placeholder={tm("HH:MM")} style={[champ, { width: 76 }]} accessibilityLabel={tm("{0} : heure de début", titre)} />
                  <TextInput value={c.heureFin || ''} onChangeText={h => set({ ...c, heureFin: h || undefined })} placeholder="fin" style={[champ, { width: 70 }]} accessibilityLabel={tm("{0} : heure de fin", titre)} />
                </View>
              </View>
            ))}
            <TextInput value={message} onChangeText={setMessage} placeholder={tm("Message (facultatif)")} style={champ} multiline accessibilityLabel={tm("Message")} />
            {!!erreur && <Text style={{ color: DS.error, fontSize: 13, fontWeight: '600' }}>{erreur}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Bouton label={tm("Annuler")} onPress={() => setCible(null)} />
              <Bouton label={tm("Envoyer")} plein onPress={envoyer} />
            </View>
          </View>
        </View>
      </ModalKeyboard>
    </View>
  );
}
