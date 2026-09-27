/**
 * Onglet Général — argent du chantier :
 *  - Prix : libellé optionnel + montant HT (admin seul)
 *  - Règlements du client (visibles client & architecte)
 *  - Commission (architecte / apporteur) : prévue et payée — jamais visible par le client.
 */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn, IntervenantMn, MontantMn } from '@/lib/menuiserie/types';
import { MontantsEtape } from './MontantsEtape';
import { Carte, Puce, Section, euros } from './ui';

import { tm } from '@/lib/menuiserie/i18n';
export function FinancesChantier({ moi, chantierId, intervenants, montants, onChange }: {
  moi: CompteMn; chantierId: string; intervenants: IntervenantMn[]; montants: MontantMn[]; onChange: () => void;
}) {
  const beneficiaires = intervenants.filter(i => i.role === 'architecte' || i.role === 'apporteur');
  const [benefId, setBenefId] = useState<string | null>(beneficiaires[0]?.id || null);
  const benef = beneficiaires.find(b => b.id === benefId);

  const prix = montants.filter(m => m.type === 'vente_client' && !m.etape);
  const reglements = montants.filter(m => m.type === 'reglement_client');
  const total = prix.reduce((s, m) => s + Number(m.montant_ht), 0);
  const regle = reglements.reduce((s, m) => s + Number(m.montant_ht), 0);
  const commissions = montants.filter(m => (m.type === 'commission' || m.type === 'reglement_commission')
    && (benef?.compte_id ? m.compte_id === benef.compte_id : (m.libelle || '').includes(benef?.nom || '###')));

  return (
    <>
      <Section>{tm("Prix")}</Section>
      <Carte>
        <MontantsEtape moi={moi} chantierId={chantierId} usineId={null} etape={null} types={['vente_client']} montants={prix} onChange={onChange} />
        {prix.length > 1 && <Text style={{ fontSize: 14, fontWeight: '800', color: DS.text }}>{tm("Total :")}{' '}{euros(total)}{' '}{tm("HT")}</Text>}
      </Carte>

      <Section>{tm("Règlements")}</Section>
      <Carte>
        <MontantsEtape moi={moi} chantierId={chantierId} usineId={null} etape={null} types={['reglement_client']} montants={reglements} onChange={onChange} />
        {total > 0 && (
          <Text style={{ fontSize: 14, color: DS.text }}>{tm("Réglé :")}{' '}<Text style={{ fontWeight: '800' }}>{euros(regle)}</Text>{' '}{tm("· reste :")}{' '}<Text style={{ fontWeight: '800' }}>{euros(Math.max(0, total - regle))}</Text>
          </Text>
        )}
      </Carte>

      <Section>{tm("Commission")}</Section>
      <Carte>
        {beneficiaires.length === 0 ? (
          <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Pas de commission : ajoute un architecte ou un apporteur dans les intervenants si besoin.")}</Text>
        ) : (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {beneficiaires.map(b => <Puce key={b.id} label={b.nom} actif={benefId === b.id} onPress={() => setBenefId(b.id)} />)}
            </View>
            <MontantsEtape moi={moi} chantierId={chantierId} usineId={null} etape={null} types={['commission', 'reglement_commission']}
              montants={commissions} onChange={onChange}
              compteCible={benef?.compte_id ? { id: benef.compte_id, nom: benef.nom } : null}
              libelleDefaut={benef && !benef.compte_id ? benef.nom : undefined} />
            {benef && !benef.compte_id && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{benef.nom}{' '}{tm("n'a pas d'accès à l'app : la commission reste visible par l'admin seul.")}</Text>}
          </View>
        )}
      </Carte>
    </>
  );
}
