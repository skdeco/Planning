/**
 * Admin : ce qu'un employé / responsable d'usine peut voir.
 * Les associés (comptes « Usine ») voient tout ce qui concerne leur usine ;
 * le prix de vente client reste réservé aux administrateurs dans tous les cas.
 */
import React, { useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { DS } from '@/constants/design';
import { majDroitsCompteMn } from '@/lib/menuiserie/api';
import { ETAPES_MN, etapeVisible } from '@/lib/menuiserie/etapes';
import type { CompteMn, DroitsCompteMn } from '@/lib/menuiserie/types';
import { Puce } from './ui';
import { tm } from '@/lib/menuiserie/i18n';

const ETAPES_USINE = ETAPES_MN.filter(e => etapeVisible('usine', e.cle) && !e.aVenir);

export function DroitsEmployeUsine({ compte, onChange }: { compte: CompteMn; onChange: () => void }) {
  const [droits, setDroits] = useState<DroitsCompteMn>(compte.droits || {});
  const [erreur, setErreur] = useState('');
  const etapes = droits.etapes || ETAPES_USINE.map(e => e.cle);

  const enregistrer = async (d: DroitsCompteMn) => {
    setDroits(d);
    try { setErreur(''); await majDroitsCompteMn(compte.id, d); onChange(); }
    catch (e) { setErreur((e as Error).message); }
  };
  const basculerEtape = (cle: string) =>
    enregistrer({ ...droits, etapes: etapes.includes(cle) ? etapes.filter(x => x !== cle) : [...etapes, cle] });

  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: DS.border, paddingTop: 10 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{tm("Ce que {0} peut voir", compte.nom)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 14, color: DS.text }}>{tm("Montants de l'usine (achat usine, matériaux, emballage, transport)")}</Text>
        <Switch value={droits.voir_montants_usine === true} onValueChange={v => enregistrer({ ...droits, voir_montants_usine: v })} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Étapes visibles")}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ETAPES_USINE.map(e => <Puce key={e.cle} label={e.titre} actif={etapes.includes(e.cle)} onPress={() => basculerEtape(e.cle)} />)}
      </View>
      <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Le prix de vente client n'est jamais visible par l'usine : il reste réservé aux administrateurs.")}</Text>
      {!!erreur && <Text style={{ fontSize: 13, color: DS.error }}>{erreur.includes('droits') ? tm("Réglage indisponible : exécute d'abord le script menuiserie_2e.sql dans Supabase.") : erreur}</Text>}
    </View>
  );
}
