/** Pastilles « qui remplit » et « jamais visible par l'usine » d'une étape. */
import React from 'react';
import { View } from 'react-native';
import { DS } from '@/constants/design';
import type { DefEtape } from '@/lib/menuiserie/etapes';
import { Pastille, COULEUR_USINE } from './ui';

import { tm } from '@/lib/menuiserie/i18n';
export function BadgeRempliPar({ def }: { def: DefEtape }) {
  const p = def.rempliPar === 'admin'
    ? { label: tm("Admin"), fond: DS.primary, texte: DS.textInverse }
    : def.rempliPar === 'usine'
      ? { label: tm("Usine"), fond: COULEUR_USINE, texte: DS.textInverse }
      : { label: tm("Tous"), fond: DS.segment, texte: DS.text };
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      <Pastille label={p.label} fond={p.fond} texte={p.texte} />
      {!def.visibleUsine && <Pastille label={tm("Caché usine")} fond={DS.sombre} texte={DS.textInverse} />}
    </View>
  );
}
