/**
 * Règlements du client (visibles client & architecte) et commissions
 * de l'architecte / apporteur (visibles par le seul bénéficiaire, jamais par le client).
 */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn, IntervenantMn, MontantMn } from '@/lib/menuiserie/types';
import { MontantsEtape } from './MontantsEtape';
import { Puce, Section } from './ui';

export function FinancesChantier({ moi, chantierId, intervenants, montants, onChange }: {
  moi: CompteMn; chantierId: string; intervenants: IntervenantMn[]; montants: MontantMn[]; onChange: () => void;
}) {
  const beneficiaires = intervenants.filter(i => (i.role === 'architecte' || i.role === 'apporteur') && i.compte_id);
  const [benefId, setBenefId] = useState<string | null>(beneficiaires[0]?.compte_id || null);
  const benef = beneficiaires.find(b => b.compte_id === benefId);

  return (
    <View style={{ gap: 8 }}>
      <Section>Règlements du client</Section>
      <MontantsEtape moi={moi} chantierId={chantierId} usineId={null} etape={null} types={['vente_client', 'reglement_client']}
        montants={montants.filter(m => m.type === 'reglement_client' || (m.type === 'vente_client' && !m.etape))} onChange={onChange} />

      <Section>Commissions</Section>
      {beneficiaires.length === 0 ? (
        <Text style={{ fontSize: 13, color: DS.textSecondary }}>Ajoute un architecte ou un apporteur avec un accès (Intervenants) pour suivre sa commission.</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {beneficiaires.map(b => <Puce key={b.id} label={b.nom} actif={benefId === b.compte_id} onPress={() => setBenefId(b.compte_id)} />)}
          </View>
          <MontantsEtape moi={moi} chantierId={chantierId} usineId={null} etape={null} types={['commission', 'reglement_commission']}
            montants={montants.filter(m => (m.type === 'commission' || m.type === 'reglement_commission') && m.compte_id === benefId)}
            onChange={onChange} compteCible={benef && benef.compte_id ? { id: benef.compte_id, nom: benef.nom } : null} />
        </>
      )}
    </View>
  );
}
