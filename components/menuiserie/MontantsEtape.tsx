/**
 * Montants d'une étape (ou d'une rubrique). Chaque montant porte sa visibilité :
 * « usine » pour ce que l'usine facture, « client » pour les règlements du client,
 * « poseur » / « personnel » pour un compte précis (prix de pose, commission), « admin » sinon.
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS, radius } from '@/constants/design';
import { ajouterMontantMn, supprimerMontantMn } from '@/lib/menuiserie/api';
import type { CompteMn, MontantMn, TypeMontantMn, VisibiliteMontantMn } from '@/lib/menuiserie/types';
import { TYPE_MONTANT_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Champ, Pastille, Puce, euros } from './ui';

export const VISIBILITE_DEFAUT: Record<TypeMontantMn, VisibiliteMontantMn> = {
  achat_usine: 'usine', materiaux: 'usine', emballage: 'usine', transport: 'usine',
  vente_client: 'admin', pose: 'poseur', monte_charge: 'admin', demenageur: 'admin', reserve: 'admin',
  reglement_client: 'client', commission: 'personnel', reglement_commission: 'personnel', autre: 'admin',
};

const VIS_LABEL: Record<VisibiliteMontantMn, { label: string; fond: string; texte: string }> = {
  admin: { label: 'Admin seul', fond: DS.sombre, texte: DS.textInverse },
  usine: { label: 'Visible usine', fond: '#DCE6F0', texte: '#1F4E79' },
  client: { label: 'Visible client & archi', fond: DS.soft, texte: DS.primary },
  poseur: { label: 'Visible poseur', fond: '#E7F0EA', texte: '#1F4D36' },
  personnel: { label: 'Visible par le bénéficiaire', fond: '#F6EEDB', texte: '#5A3E08' },
};

const TEXTE_VIS: Record<VisibiliteMontantMn, string> = {
  admin: "Ce montant ne sera jamais visible par l'usine ni par le client.",
  usine: "Ce montant sera visible par l'usine du chantier (jamais par ses employés).",
  client: 'Ce montant sera visible par le client et son architecte.',
  poseur: 'Ce montant sera visible par le poseur rattaché au chantier.',
  personnel: 'Ce montant sera visible uniquement par la personne concernée (jamais par le client).',
};

export function MontantsEtape({ moi, chantierId, usineId, etape, types, montants, onChange, compteCible, lectureSeule, libelleDefaut }: {
  moi: CompteMn; chantierId: string; usineId: string | null; etape: string | null; types: TypeMontantMn[];
  montants: MontantMn[]; onChange: () => void;
  /** Compte visé par les montants « poseur » / « personnel » (poseur, architecte, apporteur) */
  compteCible?: { id: string; nom: string } | null;
  lectureSeule?: boolean;
  /** Libellé ajouté automatiquement (ex. nom du bénéficiaire sans compte) */
  libelleDefaut?: string;
}) {
  const [type, setType] = useState<TypeMontantMn>(types[0]);
  const [valeur, setValeur] = useState('');
  const [libelle, setLibelle] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  if (!types.length && !montants.length) return null;

  let vis = VISIBILITE_DEFAUT[type];
  if ((vis === 'poseur' || vis === 'personnel') && !compteCible) vis = 'admin';
  if (vis === 'usine' && !usineId) vis = 'admin';

  const ajouter = async () => {
    const n = parseFloat(valeur.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(n)) { setErreur('Montant invalide.'); return; }
    setCharge(true); setErreur('');
    try {
      await ajouterMontantMn(moi, {
        chantier_id: chantierId, etape, type, libelle: [libelle.trim(), libelleDefaut].filter(Boolean).join(' · ') || null, montant_ht: n, visibilite: vis,
        usine_id: vis === 'usine' ? usineId : null,
        compte_id: vis === 'poseur' || vis === 'personnel' ? compteCible?.id || null : null,
        date_montant: new Date().toISOString().slice(0, 10),
      });
      setValeur(''); setLibelle(''); onChange();
    } catch (e) { setErreur((e as Error).message); } finally { setCharge(false); }
  };

  const peutSupprimer = (m: MontantMn) => !lectureSeule && (moi.role === 'admin' || (moi.role === 'usine' && m.visibilite === 'usine'));

  return (
    <View style={{ gap: 8 }}>
      {montants.map(m => {
        const v = VIS_LABEL[m.visibilite];
        return (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }}>{m.libelle || TYPE_MONTANT_MN_LABELS[m.type]}</Text>
              {moi.role === 'admin' && <Pastille label={v.label} fond={v.fond} texte={v.texte} />}
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{euros(Number(m.montant_ht))} HT</Text>
            {peutSupprimer(m) && (
              <Pressable onPress={async () => { await supprimerMontantMn(moi, m); onChange(); }} accessibilityRole="button" accessibilityLabel="Supprimer le montant" style={{ padding: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: DS.error }}>Suppr.</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {!lectureSeule && types.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {types.map(t => <Puce key={t} label={TYPE_MONTANT_MN_LABELS[t]} actif={type === t} onPress={() => setType(t)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Champ label="Montant HT (€)" value={valeur} onChangeText={setValeur} keyboardType="decimal-pad" />
            <Champ label="Libellé (facultatif)" value={libelle} onChangeText={setLibelle} />
          </View>
          <Text style={{ fontSize: 12, color: DS.textSecondary }}>{TEXTE_VIS[vis]}{compteCible && (vis === 'poseur' || vis === 'personnel') ? ` (${compteCible.nom})` : ''}</Text>
          {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}
          <Bouton label="Ajouter le montant" variante="contour" onPress={ajouter} charge={charge} />
        </>
      )}
    </View>
  );
}
