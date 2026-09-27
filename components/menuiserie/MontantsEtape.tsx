/**
 * Montants d'une étape. Chaque montant porte sa visibilité :
 * « usine » pour ce que l'usine facture, « admin » pour tout le reste (vente, pose…).
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS, radius } from '@/constants/design';
import { ajouterMontantMn, supprimerMontantMn } from '@/lib/menuiserie/api';
import type { CompteMn, MontantMn, TypeMontantMn, VisibiliteMontantMn } from '@/lib/menuiserie/types';
import { TYPE_MONTANT_MN_LABELS } from '@/lib/menuiserie/types';
import type { DefEtape } from '@/lib/menuiserie/etapes';
import { Bouton, Champ, Pastille, Puce, euros } from './ui';

/** Montants facturés par l'usine : visibles par l'usine. Le reste reste admin. */
const VISIBILITE_DEFAUT: Record<TypeMontantMn, VisibiliteMontantMn> = {
  achat_usine: 'usine', materiaux: 'usine', emballage: 'usine', transport: 'usine',
  vente_client: 'admin', pose: 'admin', monte_charge: 'admin', demenageur: 'admin', reserve: 'admin', autre: 'admin',
};

const VIS_LABEL: Record<VisibiliteMontantMn, { label: string; fond: string; texte: string }> = {
  admin: { label: 'Admin seul', fond: DS.sombre, texte: DS.textInverse },
  usine: { label: 'Visible usine', fond: '#DCE6F0', texte: '#1F4E79' },
  client: { label: 'Visible client', fond: DS.soft, texte: DS.primary },
};

export function MontantsEtape({ moi, chantierId, usineId, def, montants, onChange }: {
  moi: CompteMn; chantierId: string; usineId: string | null; def: DefEtape; montants: MontantMn[]; onChange: () => void;
}) {
  const [type, setType] = useState<TypeMontantMn>(def.montants[0]);
  const [valeur, setValeur] = useState('');
  const [libelle, setLibelle] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  if (!def.montants.length) return null;

  const ajouter = async () => {
    const n = parseFloat(valeur.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(n)) { setErreur('Montant invalide.'); return; }
    setCharge(true); setErreur('');
    try {
      await ajouterMontantMn(moi, {
        chantier_id: chantierId, etape: def.cle, type, libelle: libelle.trim() || null, montant_ht: n,
        visibilite: VISIBILITE_DEFAUT[type], usine_id: VISIBILITE_DEFAUT[type] === 'usine' ? usineId : null,
        date_montant: new Date().toISOString().slice(0, 10),
      });
      setValeur(''); setLibelle(''); onChange();
    } catch (e) { setErreur((e as Error).message); } finally { setCharge(false); }
  };

  return (
    <View style={{ gap: 8 }}>
      {montants.map(m => {
        const vis = VIS_LABEL[m.visibilite];
        return (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }}>{m.libelle || TYPE_MONTANT_MN_LABELS[m.type]}</Text>
              <Pastille label={vis.label} fond={vis.fond} texte={vis.texte} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{euros(Number(m.montant_ht))} HT</Text>
            <Pressable onPress={async () => { await supprimerMontantMn(moi, m); onChange(); }} accessibilityRole="button" accessibilityLabel="Supprimer le montant" style={{ padding: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: DS.error }}>Suppr.</Text>
            </Pressable>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {def.montants.map(t => <Puce key={t} label={TYPE_MONTANT_MN_LABELS[t]} actif={type === t} onPress={() => setType(t)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Champ label="Montant HT (€)" value={valeur} onChangeText={setValeur} keyboardType="decimal-pad" />
        <Champ label="Libellé (facultatif)" value={libelle} onChangeText={setLibelle} />
      </View>
      <Text style={{ fontSize: 12, color: DS.textSecondary }}>
        {VISIBILITE_DEFAUT[type] === 'usine' ? "Ce montant sera visible par l'usine du chantier." : "Ce montant ne sera jamais visible par l'usine."}
      </Text>
      {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}
      <Bouton label="Ajouter le montant" variante="contour" onPress={ajouter} charge={charge} />
    </View>
  );
}
