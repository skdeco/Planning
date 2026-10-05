/**
 * Onglet Finances — lecture rapide, sans saisie :
 *  - côté client : devis + suppléments acceptés, facturé, encaissé, reste ;
 *  - côté usine : devis + suppléments, facturé, payé, reste ;
 *  - autres coûts du déroulement (matériaux, transport, pose…) et marge.
 * Tout se saisit dans Déroulement › Devis / Facture. Seule la commission
 * (architecte / apporteur) se saisit encore ici.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn, IntervenantMn, MontantMn, TypeMontantMn } from '@/lib/menuiserie/types';
import { TYPE_MONTANT_MN_LABELS } from '@/lib/menuiserie/types';
import { listerSupplementsMn, type SupplementMn } from '@/lib/menuiserie/supplements';
import { MontantsEtape } from './MontantsEtape';
import { bilanCote } from './DevisEtape';
import { Carte, Puce, Section, euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';

const AUTRES_COUTS: TypeMontantMn[] = ['materiaux', 'emballage', 'transport', 'pose', 'monte_charge', 'demenageur', 'reserve', 'autre'];

function Ligne({ label, valeur, sombre, fort }: { label: string; valeur: string; sombre?: boolean; fort?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 }}>
      <Text style={{ fontSize: 14, color: sombre ? 'rgba(255,255,255,0.72)' : DS.textSecondary, fontWeight: fort ? '800' : '500' }}>{label}</Text>
      <Text style={{ fontSize: fort ? 16 : 14, fontWeight: '800', color: sombre ? DS.textInverse : DS.text }}>{valeur}</Text>
    </View>
  );
}

function CarteBilan({ titre, b, cote }: { titre: string; b: ReturnType<typeof bilanCote>; cote: 'client' | 'usine' }) {
  const sombre = cote === 'client';
  const pct = b.total > 0 ? Math.min(1, b.regle / b.total) : 0;
  return (
    <View style={{ flex: 1, minWidth: 260, backgroundColor: sombre ? DS.primary : DS.surface, borderRadius: 20, borderWidth: sombre ? 0 : 1, borderColor: DS.border, padding: 18, gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: sombre ? 'rgba(255,255,255,0.7)' : DS.textSecondary }}>{titre}</Text>
      <Text style={{ fontSize: 28, fontFamily: 'Manrope_700Bold', color: sombre ? DS.textInverse : DS.text }}>{b.total ? `${euros(b.total)}` : '—'}<Text style={{ fontSize: 13 }}> {tm("HT")}</Text></Text>
      <Ligne sombre={sombre} label={tm("Devis")} valeur={euros(b.devis)} />
      {(b.supp > 0 || b.enAttente > 0) && <Ligne sombre={sombre} label={b.enAttente ? tm("Suppléments acceptés ({0} en attente)", b.enAttente) : tm("Suppléments acceptés")} valeur={`+ ${euros(b.supp)}`} />}
      <Ligne sombre={sombre} label={tm("Facturé")} valeur={euros(b.facture)} />
      <Ligne sombre={sombre} label={cote === 'client' ? tm("Encaissé") : tm("Payé à l'usine")} valeur={euros(b.regle)} />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: sombre ? 'rgba(255,255,255,0.18)' : DS.segment, marginVertical: 6, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: 6, backgroundColor: sombre ? '#FFFFFF' : DS.primary }} />
      </View>
      <Ligne sombre={sombre} fort label={cote === 'client' ? tm("Reste à encaisser") : tm("Reste à payer")} valeur={euros(b.reste)} />
    </View>
  );
}

export function FinancesChantier({ moi, chantierId, intervenants, montants, onChange }: {
  moi: CompteMn; chantierId: string; intervenants: IntervenantMn[]; montants: MontantMn[]; onChange: () => void;
}) {
  const [supplements, setSupplements] = useState<SupplementMn[]>([]);
  const charger = useCallback(() => { listerSupplementsMn(chantierId).then(setSupplements).catch(() => {}); }, [chantierId]);
  useEffect(() => { charger(); }, [charger, montants.length]);

  const client = bilanCote('client', montants, supplements);
  const usine = bilanCote('usine', montants, supplements);
  const autres = AUTRES_COUTS.map(t => ({ t, v: montants.filter(m => m.type === t).reduce((x, m) => x + Number(m.montant_ht), 0) })).filter(x => x.v > 0);
  const totalAutres = autres.reduce((x, a) => x + a.v, 0);
  const marge = client.total - usine.total - totalAutres;

  const beneficiaires = intervenants.filter(i => i.role === 'architecte' || i.role === 'apporteur');
  const [benefId, setBenefId] = useState<string | null>(beneficiaires[0]?.id || null);
  const benef = beneficiaires.find(b => b.id === benefId);
  const commissions = montants.filter(m => (m.type === 'commission' || m.type === 'reglement_commission')
    && (benef?.compte_id ? m.compte_id === benef.compte_id : (m.libelle || '').includes(benef?.nom || '###')));

  return (
    <>
      <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Lecture seule : les montants se saisissent dans Déroulement › Devis / Facture.")}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <CarteBilan titre={tm("Client")} b={client} cote="client" />
        <CarteBilan titre={tm("Usine")} b={usine} cote="usine" />
      </View>

      <Carte>
        {autres.map(a => <Ligne key={a.t} label={TYPE_MONTANT_MN_LABELS[a.t]} valeur={euros(a.v)} />)}
        {autres.length > 0 && <View style={{ height: 1, backgroundColor: DS.border, marginVertical: 4 }} />}
        <Ligne fort label={tm("Marge")} valeur={client.total > 0 ? `${euros(marge)} · ${Math.round((marge / client.total) * 100)} %` : '—'} />
        <Text style={{ fontSize: 12, color: DS.textMuted }}>{tm("Total client − total usine − autres coûts du déroulement.")}</Text>
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
