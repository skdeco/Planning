/**
 * Usine de production du chantier : choix parmi toutes les usines
 * (avec ou sans compte) + création d'une nouvelle usine sur place.
 */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { DS } from '@/constants/design';
import { enregistrerUsineMn, listerUsinesMn, majChantierMn } from '@/lib/menuiserie/api';
import { ecrireCacheMn } from '@/lib/menuiserie/cache';
import type { ChantierMn, CompteMn, UsineMn } from '@/lib/menuiserie/types';
import { Bouton, Champ, Puce } from './ui';

import { tm } from '@/lib/menuiserie/i18n';
export function ChoixUsine({ moi, chantier, usines, onChange }: { moi: CompteMn; chantier: ChantierMn; usines: UsineMn[]; onChange: () => void }) {
  const [nouvelle, setNouvelle] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const choisir = async (u: UsineMn | null) => {
    try { await majChantierMn(moi, chantier.id, { usine_id: u?.id || null }, `Usine : ${u?.nom || 'à définir'}`); onChange(); }
    catch (e) { setMessage((e as Error).message); }
  };
  const creer = async () => {
    const nom = (nouvelle || '').trim();
    if (!nom) return;
    try {
      await enregistrerUsineMn({ nom });
      const liste = await listerUsinesMn();
      ecrireCacheMn('usines', liste);
      const u = liste.find(x => x.nom === nom);
      setNouvelle(null);
      if (u) await choisir(u); else onChange();
    } catch (e) { setMessage((e as Error).message); }
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Puce label={tm("À définir")} actif={!chantier.usine_id} onPress={() => choisir(null)} />
        {usines.filter(u => u.actif).map(u => <Puce key={u.id} label={u.nom} actif={chantier.usine_id === u.id} couleur="#1F4E79" onPress={() => choisir(u)} />)}
        {nouvelle === null && <Puce label={tm("+ Nouvelle usine")} onPress={() => setNouvelle('')} />}
      </View>
      {nouvelle !== null && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Champ label={tm("Nom de la nouvelle usine")} value={nouvelle} onChangeText={setNouvelle} />
          <View style={{ width: 100 }}><Bouton label={tm("Créer")} onPress={creer} /></View>
        </View>
      )}
      <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Une usine peut exister sans compte. Quand tu lui crées un compte (Comptes → rôle Usine), elle garde la même fiche.")}</Text>
      {!!message && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{message}</Text>}
    </View>
  );
}
