/**
 * Réserves du PV. L'admin les crée et décide lesquelles transmettre à l'usine.
 * L'usine ne voit que les réserves transmises (aucun prix, aucun nom de client)
 * et indique la date d'envoi des nouveaux éléments.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS, radius } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { DateInput } from '@/components/ui/DateInput';
import { ajouterReserveMn, listerReservesMn, majReserveMn, supprimerReserveMn } from '@/lib/menuiserie/api2';
import type { ChantierMn, CompteMn, ReserveMn } from '@/lib/menuiserie/types';
import { genererPvMn } from '@/lib/menuiserie/pv';
import { Bouton, Champ, Pastille } from './ui';

import { tm, traduit } from '@/lib/menuiserie/i18n';
const STATUT = traduit({ a_reprendre: 'À reprendre', envoye: 'Éléments envoyés', repris: 'Repris' } as const);

export function ReservesPanel({ moi, chantierId, chantier, onDocument }: { moi: CompteMn; chantierId: string; chantier?: ChantierMn; onDocument?: () => void }) {
  const [liste, setListe] = useState<ReserveMn[]>([]);
  const [meuble, setMeuble] = useState('');
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const admin = moi.role === 'admin';
  const charger = () => listerReservesMn(chantierId).then(setListe).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, [chantierId]);

  const ajouter = async () => {
    if (!texte.trim()) return;
    try { await ajouterReserveMn(moi, chantierId, meuble, texte); setMeuble(''); setTexte(''); charger(); } catch (e) { setErreur((e as Error).message); }
  };
  const maj = async (r: ReserveMn, patch: Parameters<typeof majReserveMn>[2]) => {
    try { await majReserveMn(moi, r, patch); charger(); } catch (e) { setErreur((e as Error).message); }
  };
  const nonTransmises = liste.filter(r => !r.transmise_usine);

  return (
    <View style={{ gap: 8 }}>
      {liste.length === 0 && <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Aucune réserve.")}</Text>}
      {liste.map(r => (
        <View key={r.id} style={{ backgroundColor: DS.surface, borderRadius: radius.sm, padding: 10, gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: DS.text }}>{r.meuble ? `${r.meuble} · ` : ''}{r.description}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Pastille label={STATUT[r.statut]} fond={r.statut === 'repris' ? '#E7F0EA' : '#F6EEDB'} texte={r.statut === 'repris' ? '#1F4D36' : '#5A3E08'} />
            {admin && <Pastille label={r.transmise_usine ? tm("Transmise à l'usine") : tm("Pas encore transmise")} fond={r.transmise_usine ? '#DCE6F0' : DS.segment} texte={r.transmise_usine ? '#1F4E79' : DS.text} />}
          </View>
          {(r.transmise_usine || admin) && (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Date d'envoi des nouveaux éléments (usine)")}</Text>
              {moi.role === 'usine' || admin ? (
                <DateInput value={r.date_envoi_elements || ''} onChangeDate={d => d && maj(r, { date_envoi_elements: d, statut: 'envoye' })} accessibilityLabel={tm("Date d'envoi des éléments")}
                  style={{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: DS.text, backgroundColor: DS.background }} />
              ) : <Text style={{ fontSize: 14, color: DS.text }}>{formatDateFR(r.date_envoi_elements, '—')}</Text>}
            </View>
          )}
          {admin && (
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              {r.statut !== 'repris' && <Pressable onPress={() => maj(r, { statut: 'repris' })} accessibilityRole="button"><Text style={{ fontWeight: '800', color: DS.primary }}>{tm("Marquer reprise")}</Text></Pressable>}
              <Pressable onPress={async () => { await supprimerReserveMn(r); charger(); }} accessibilityRole="button"><Text style={{ fontWeight: '800', color: DS.error }}>{tm("Supprimer")}</Text></Pressable>
            </View>
          )}
        </View>
      ))}
      {admin && (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ width: 110 }}><Champ label={tm("Meuble")} value={meuble} onChangeText={setMeuble} /></View>
            <Champ label={tm("Réserve (élément à reprendre ou terminer)")} value={texte} onChangeText={setTexte} />
          </View>
          <Bouton label={tm("Ajouter la réserve")} variante="contour" onPress={ajouter} />
          {nonTransmises.length > 0 && (
            <Bouton label={tm("Transmettre {0} réserve{1} à l'usine (sans prix)", nonTransmises.length, nonTransmises.length > 1 ? 's' : '')}
              onPress={async () => { for (const r of nonTransmises) await majReserveMn(moi, r, { transmise_usine: true }); charger(); }} />
          )}
        </>
      )}
      {admin && chantier && (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Bouton label={tm("Créer le PV de réception (PDF)")} onPress={async () => {
            try { const r = await genererPvMn(moi, chantier, liste, 'client'); setInfo(r === 'enregistre' ? tm("PV enregistré dans les documents de cette étape (bouton « Client » pour le partager).") : ''); onDocument?.(); }
            catch (e) { setErreur((e as Error).message); }
          }} />
          <Bouton label={tm("Document de reprise pour l'usine (sans prix ni client)")} variante="contour" onPress={async () => {
            try { const r = await genererPvMn(moi, chantier, liste, 'usine'); setInfo(r === 'enregistre' ? tm("Document de reprise envoyé à l'usine.") : ''); onDocument?.(); }
            catch (e) { setErreur((e as Error).message); }
          }} />
        </View>
      )}
      {!!info && <Text style={{ color: DS.primary, fontWeight: '600', fontSize: 13 }}>{info}</Text>}
      {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}
    </View>
  );
}
