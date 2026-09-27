/** Vérification meuble par meuble sur les 13 critères (remplie par tous). */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS, radius } from '@/constants/design';
import { formatDateHeureFR } from '@/lib/date/format';
import { CRITERES_VERIF } from '@/lib/menuiserie/etapes';
import { ajouterReserveMn, enregistrerVerificationMn, listerVerificationsMn } from '@/lib/menuiserie/api2';
import type { CompteMn, VerificationMn } from '@/lib/menuiserie/types';
import { Bouton, Champ, Puce } from './ui';

import { tm, traduit } from '@/lib/menuiserie/i18n';
type Etat = 'ok' | 'nok' | 'na';
const ETATS: { cle: Etat; label: string; fond: string }[] = traduit([
  { cle: 'ok', label: 'OK', fond: '#2F6B4F' }, { cle: 'nok', label: 'Non conf.', fond: '#A3261F' }, { cle: 'na', label: 'N/A', fond: '#6E5F54' },
]);

export function VerificationMeubles({ moi, chantierId, modifiable }: { moi: CompteMn; chantierId: string; modifiable: boolean }) {
  const [liste, setListe] = useState<VerificationMn[]>([]);
  const [meuble, setMeuble] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [criteres, setCriteres] = useState<Record<string, Etat>>({});
  const [commentaire, setCommentaire] = useState('');
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);

  const charger = () => listerVerificationsMn(chantierId).then(setListe).catch(e => setMessage(e.message));
  useEffect(() => { charger(); }, [chantierId]);
  useEffect(() => {
    const v = liste.find(x => x.meuble === meuble);
    setCriteres(v?.criteres || {}); setCommentaire(v?.commentaire || '');
  }, [meuble, liste]);

  const actuel = liste.find(x => x.meuble === meuble);
  const nbNok = Object.values(criteres).filter(v => v === 'nok').length;

  const enregistrer = async () => {
    if (!meuble) return;
    setCharge(true); setMessage('');
    try {
      await enregistrerVerificationMn(moi, { chantier_id: chantierId, meuble, criteres, commentaire: commentaire.trim() || null });
      if (moi.role === 'admin' && nbNok > 0) {
        const nok = CRITERES_VERIF.filter(c => criteres[c.cle] === 'nok').map(c => c.label).join(', ');
        await ajouterReserveMn(moi, chantierId, meuble, `Non conforme : ${nok}${commentaire.trim() ? ` — ${commentaire.trim()}` : ''}`);
        setMessage(tm("Enregistré. Une réserve a été créée dans « PV de réception & réserves »."));
      } else setMessage(tm("Vérification enregistrée."));
      charger();
    } catch (e) { setMessage((e as Error).message); } finally { setCharge(false); }
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {liste.map(v => {
          const n = Object.values(v.criteres).filter(x => x === 'nok').length;
          return <Puce key={v.id} label={`${v.meuble}${n ? ` · ${n} ✗` : ''}`} actif={meuble === v.meuble} onPress={() => setMeuble(v.meuble)} />;
        })}
      </View>
      {modifiable && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Champ label={tm("Nouveau meuble (ex. M1 Dressing)")} value={nouveau} onChangeText={setNouveau} />
          <View style={{ width: 90 }}><Bouton label={tm("Ajouter")} variante="contour" onPress={() => { if (nouveau.trim()) { setMeuble(nouveau.trim()); setNouveau(''); } }} /></View>
        </View>
      )}
      {!!meuble && (
        <>
          <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{meuble}</Text>
          {actuel?.updated_by_nom && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Vérifié par")}{' '}{actuel.updated_by_nom} · {formatDateHeureFR(actuel.updated_at)}</Text>}
          {CRITERES_VERIF.map(c => (
            <View key={c.cle} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.surface, borderRadius: radius.sm, padding: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }}>{c.label}</Text>
                {!!c.aide && <Text style={{ fontSize: 11, color: DS.textSecondary }}>{c.aide}</Text>}
              </View>
              {ETATS.map(e => {
                const on = criteres[c.cle] === e.cle;
                return (
                  <Pressable key={e.cle} disabled={!modifiable} onPress={() => setCriteres(p => ({ ...p, [c.cle]: e.cle }))}
                    accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${c.label} : ${e.label}`}
                    style={{ minHeight: 34, paddingHorizontal: 8, borderRadius: 8, justifyContent: 'center', borderWidth: 1, borderColor: on ? e.fond : DS.border, backgroundColor: on ? e.fond : DS.surface }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: on ? '#FFFFFF' : DS.textSecondary }}>{e.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Champ label={tm("Commentaire")} value={commentaire} onChangeText={setCommentaire} editable={modifiable} multiline />
          {modifiable && <Bouton label={tm("Enregistrer la vérification{0}", nbNok ? ` (${nbNok} non conforme${nbNok > 1 ? 's' : ''})` : '')} onPress={enregistrer} charge={charge} />}
        </>
      )}
      {!!message && <Text style={{ fontSize: 13, fontWeight: '600', color: DS.primary }}>{message}</Text>}
    </View>
  );
}
