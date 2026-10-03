/** Employé d'usine / poseur : historique de pointage, congés & absences, documents (fiches de paie). */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS, radius } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { DateInput } from '@/components/ui/DateInput';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';
import { demanderCongeMn, listerCongesMn, listerDocsRhMn, listerPointagesMn } from '@/lib/menuiserie/api2';
import type { CongeMn, DocRhMn, PointageMn } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Pastille, Puce, Section } from '@/components/menuiserie/ui';
import { ouvrirDocumentMn } from '@/components/menuiserie/DocumentsEtape';
import { soldeConges } from '@/lib/menuiserie/rh';

import { tm, traduit, localeMn } from '@/lib/menuiserie/i18n';
const STATUT = traduit({ en_attente: ['En attente', '#F6EEDB', '#5A3E08'], approuve: ['Acceptée', '#E7F0EA', '#1F4D36'], refuse: ['Refusée', '#F6DCDA', '#7A1F18'] } as const);
const champDate = { borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.background };

export default function RhMn() {
  const router = useRouter();
  const moi = useCompteMn();
  const [pointages, setPointages] = useState<PointageMn[]>([]);
  const [conges, setConges] = useState<CongeMn[]>([]);
  const [docs, setDocs] = useState<DocRhMn[]>([]);
  const [f, setF] = useState<{ type: CongeMn['type']; debut: string; fin: string; jours: string; motif: string } | null>(null);
  const [justif, setJustif] = useState<{ uri: string; nom: string; mime: string } | null>(null);
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    try {
      const [p, c, d] = await Promise.all([listerPointagesMn({ compteId: moi.id }), listerCongesMn({ compteId: moi.id }), listerDocsRhMn({ compteId: moi.id })]);
      setPointages(p); setConges(c); setDocs(d);
    } catch (e) { setMessage((e as Error).message); }
  }, [moi.id]);
  useEffect(() => { charger(); }, [charger]);

  const envoyer = async () => {
    if (!f?.debut || !f.fin) { setMessage(tm("Indique les dates.")); return; }
    const jours = parseFloat(f.jours.replace(',', '.')) || 1;
    try {
      await demanderCongeMn(moi, { type: f.type, date_debut: f.debut, date_fin: f.fin, jours, motif: f.motif, justificatif: justif });
      setF(null); setJustif(null); setMessage(tm("Demande envoyée.")); charger();
    } catch (e) { setMessage((e as Error).message); }
  };

  const parJour = pointages.reduce<Record<string, PointageMn[]>>((acc, p) => {
    const j = p.horodatage.slice(0, 10); (acc[j] = acc[j] || []).push(p); return acc;
  }, {});

  return (
    <ScreenContainer containerClassName="bg-[#F4F4F2]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre={tm("Mon administratif")} retour={() => router.back()} />
        {!!message && <Text style={{ fontSize: 14, fontWeight: '600', color: DS.primary }}>{message}</Text>}

        {moi.role === 'employe_usine' && (
          <>
            <Section>{tm("Congés & absences")}</Section>
            <Carte>
              <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{tm("Solde de congés :")}{' '}{soldeConges(moi, conges)}{' '}{tm("jours")}</Text>
              {conges.map(c => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: DS.text }}>{c.type === 'conges' ? tm("Congés") : tm("Absence")} · {formatDateFR(c.date_debut)} → {formatDateFR(c.date_fin)} ({c.jours}{' '}{tm("j)")}</Text>
                  <Pastille label={STATUT[c.statut][0]} fond={STATUT[c.statut][1]} texte={STATUT[c.statut][2]} />
                </View>
              ))}
              {f ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Puce label={tm("Congés")} actif={f.type === 'conges'} onPress={() => setF(x => x && { ...x, type: 'conges' })} />
                    <Puce label={tm("Absence")} actif={f.type === 'absence'} onPress={() => setF(x => x && { ...x, type: 'absence' })} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Du")}</Text>
                  <DateInput value={f.debut} onChangeDate={d => setF(x => x && { ...x, debut: d })} style={champDate} accessibilityLabel={tm("Date de début")} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Au")}</Text>
                  <DateInput value={f.fin} onChangeDate={d => setF(x => x && { ...x, fin: d })} style={champDate} accessibilityLabel={tm("Date de fin")} />
                  <Champ label={tm("Nombre de jours")} value={f.jours} onChangeText={v => setF(x => x && { ...x, jours: v })} keyboardType="decimal-pad" />
                  <Champ label={tm("Motif")} value={f.motif} onChangeText={v => setF(x => x && { ...x, motif: v })} />
                  <Bouton label={justif ? tm("Justificatif : {0}", justif.nom) : tm("+ Joindre un justificatif")} variante="contour" onPress={async () => {
                    const r = await pickNativeFile({ acceptCamera: true, multiple: false });
                    if (r.length) setJustif({ uri: r[0].uri, mime: r[0].mimeType, nom: r[0].filename || 'justificatif' });
                  }} />
                  <Bouton label={tm("Envoyer la demande")} onPress={envoyer} />
                  <Bouton label={tm("Annuler")} variante="discret" onPress={() => setF(null)} />
                </View>
              ) : <Bouton label={tm("+ Demander un congé ou une absence")} variante="contour" onPress={() => setF({ type: 'conges', debut: '', fin: '', jours: '1', motif: '' })} />}
            </Carte>

            <Section>{tm("Mes fiches de paie")}</Section>
            <Carte>
              {docs.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucun document.")}</Text>}
              {docs.map(d => (
                <Pressable key={d.id} onPress={() => ouvrirDocumentMn(d)} accessibilityRole="link">
                  <Text style={{ fontSize: 14, fontWeight: '700', color: DS.primary }}>{d.mois ? `${d.mois} · ` : ''}{d.nom}</Text>
                </Pressable>
              ))}
            </Carte>
          </>
        )}

        <Section>{tm("Historique de pointage")}</Section>
        <Carte>
          {Object.keys(parJour).length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucun pointage.")}</Text>}
          {Object.entries(parJour).map(([jour, ps]) => (
            <Text key={jour} style={{ fontSize: 14, color: DS.text }}>
              <Text style={{ fontWeight: '800' }}>{formatDateFR(jour)}</Text> · {ps.slice().reverse().map(p => `${p.type === 'arrivee' ? '↘' : '↗'} ${new Date(p.horodatage).toLocaleTimeString(localeMn(), { hour: '2-digit', minute: '2-digit' })}${p.hors_zone ? ` (${tm('hors zone')})` : ''}`).join('  ')}
            </Text>
          ))}
        </Carte>
      </ScrollView>
    </ScreenContainer>
  );
}
