/** Adresse et accès du chantier, modifiables (onglet Général). */
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { DS, radius } from '@/constants/design';
import { DateInput } from '@/components/ui/DateInput';
import { majChantierMn } from '@/lib/menuiserie/api';
import type { ChantierMn, CompteMn } from '@/lib/menuiserie/types';
import { Bouton, Champ } from './ui';

import { tm } from '@/lib/menuiserie/i18n';
export function AdresseChantier({ moi, chantier, onChange }: { moi: CompteMn; chantier: ChantierMn; onChange: () => void }) {
  const init = () => ({
    rue: chantier.rue || '', code_postal: chantier.code_postal || '', ville: chantier.ville || '',
    code_acces: chantier.code_acces || '', etage: chantier.etage || '', cle: chantier.cle || '',
  });
  const [f, setF] = useState(init);
  const [livraison, setLivraison] = useState(chantier.date_livraison_prevue || '');
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);
  useEffect(() => { setF(init()); setLivraison(chantier.date_livraison_prevue || ''); }, [chantier.id, chantier.updated_at]);

  const modifie = JSON.stringify(f) !== JSON.stringify(init()) || livraison !== (chantier.date_livraison_prevue || '');
  const champ = (cle: keyof typeof f, label: string, extra?: object) => (
    <Champ label={tm(label)} value={f[cle]} onChangeText={v => setF(p => ({ ...p, [cle]: v }))} {...extra} />
  );
  const enregistrer = async () => {
    setCharge(true); setMessage('');
    try {
      const n = (s: string) => s.trim() || null;
      await majChantierMn(moi, chantier.id, {
        rue: n(f.rue), code_postal: n(f.code_postal), ville: n(f.ville), code_acces: n(f.code_acces), etage: n(f.etage), cle: n(f.cle),
        date_livraison_prevue: livraison || null,
      }, 'Adresse / accès modifiés');
      setMessage(tm("Enregistré.")); onChange();
    } catch (e) { setMessage((e as Error).message); } finally { setCharge(false); }
  };

  return (
    <View style={{ gap: 8 }}>
      {champ('rue', 'Rue')}
      <View style={{ flexDirection: 'row', gap: 8 }}>{champ('code_postal', 'Code postal', { keyboardType: 'number-pad' })}{champ('ville', 'Ville')}</View>
      <View style={{ flexDirection: 'row', gap: 8 }}>{champ('code_acces', 'Code')}{champ('etage', 'Étage')}</View>
      {champ('cle', 'Clé (où la trouver)')}
      <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Date de livraison prévue")}</Text>
      <DateInput value={livraison} onChangeDate={setLivraison} accessibilityLabel={tm("Date de livraison prévue")}
        style={{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.background }} />
      {modifie && <Bouton label={tm("Enregistrer l'adresse")} onPress={enregistrer} charge={charge} />}
      {!!message && <Text style={{ fontSize: 13, fontWeight: '600', color: DS.primary }}>{message}</Text>}
    </View>
  );
}
