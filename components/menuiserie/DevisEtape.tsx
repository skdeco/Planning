/**
 * Étape « Devis / Facture » : tout l'argent du chantier, saisi à un seul endroit,
 * en deux onglets bien séparés (le client ne voit jamais l'usine, et inversement) :
 *  - Client : devis SK DECO, suppléments (acceptés par le client), factures ↔ règlements liés ;
 *  - Usine  : devis usine, suppléments usine, factures usine, règlements versés à l'usine.
 * Les PDF déposés sont lus automatiquement (HT et TTC). L'usine ne voit que son onglet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn, DocumentMn, MontantMn } from '@/lib/menuiserie/types';
import type { DefEtape } from '@/lib/menuiserie/etapes';
import { majMontantMn } from '@/lib/menuiserie/api';
import { coteDevis } from '@/lib/menuiserie/importDevis';
import { listerSupplementsMn, totalAccepte, type SupplementMn } from '@/lib/menuiserie/supplements';
import { TYPES_COTE, type CoteMn } from '@/lib/menuiserie/pieces';
import { LignesPieces, docDeLigne } from './LignesPieces';
import { SupplementsDevis } from './SupplementsDevis';
import { FacturesReglements } from './FacturesReglements';
import { euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';

const somme = (l: MontantMn[]) => l.reduce((x, m) => x + Number(m.montant_ht), 0);

/** Bilan d'un côté (utilisé aussi par l'onglet Finances). */
export function bilanCote(cote: CoteMn, montants: MontantMn[], supplements: SupplementMn[]) {
  const t = TYPES_COTE[cote];
  const devis = somme(montants.filter(m => m.type === t.devis));
  const supp = totalAccepte(supplements.filter(s => s.cote === cote));
  const enAttente = supplements.filter(s => s.cote === cote && s.statut === 'propose').length;
  const facture = somme(montants.filter(m => m.type === t.facture));
  const regle = somme(montants.filter(m => m.type === t.reglement));
  const total = devis + supp;
  return { devis, supp, enAttente, total, facture, regle, reste: Math.max(0, total - regle) };
}

function Ligne({ label, valeur, clair, fort }: { label: string; valeur: string; clair: boolean; fort?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={{ fontSize: 13, color: clair ? DS.textSecondary : 'rgba(255,255,255,0.7)', fontWeight: fort ? '800' : '500' }}>{label}</Text>
      <Text style={{ fontSize: fort ? 15 : 13, fontWeight: '800', color: clair ? DS.text : DS.textInverse }}>{valeur}</Text>
    </View>
  );
}

export function DevisEtape({ moi, chantierId, usineId, documents, montants, onChange, modifiable }: {
  moi: CompteMn; chantierId: string; usineId: string | null; def: DefEtape;
  documents: DocumentMn[]; montants: MontantMn[]; onChange: () => void; modifiable: boolean;
}) {
  const admin = moi.role === 'admin';
  const [onglet, setOnglet] = useState<CoteMn>(admin ? 'client' : 'usine');
  const cote: CoteMn = admin ? onglet : 'usine';
  const t = TYPES_COTE[cote];
  const [supplements, setSupplements] = useState<SupplementMn[]>([]);
  const chargerSupp = useCallback(() => { listerSupplementsMn(chantierId).then(setSupplements).catch(() => {}); }, [chantierId]);
  useEffect(() => { chargerSupp(); }, [chargerSupp]);
  const toutRecharger = () => { chargerSupp(); onChange(); };

  const b = bilanCote(cote, montants, supplements);
  const lignesDevis = montants.filter(m => m.type === t.devis);
  // Anciens PDF de devis sans ligne : proposés à la lecture
  const lies = new Set(montants.map(m => docDeLigne(m, documents)?.id).filter(Boolean) as string[]);
  const orphelins = documents.filter(d => !lies.has(d.id) && !(d.piece || '').startsWith('supp_') && coteDevis(d, montants) === cote);
  const peutSaisir = modifiable && (admin || (moi.role === 'usine' && cote === 'usine'));
  const clair = cote === 'usine';
  const ttcDevis = lignesDevis.length && lignesDevis.every(m => m.montant_ttc != null) ? lignesDevis.reduce((x, m) => x + Number(m.montant_ttc), 0) : null;
  const venteVisible = lignesDevis.length > 0 && lignesDevis.every(m => m.visibilite === 'client');
  const achat = bilanCote('usine', montants, supplements).total, vente = bilanCote('client', montants, supplements).total;

  return (
    <>
      {admin && (
        <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: 999, padding: 4 }}>
          {(['client', 'usine'] as const).map(o => {
            const on = onglet === o;
            return (
              <Pressable key={o} onPress={() => setOnglet(o)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, minHeight: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? DS.primary : 'transparent' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: on ? DS.textInverse : DS.textSecondary }}>{o === 'client' ? tm("Client") : tm("Usine")}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Bilan du côté affiché */}
      <View style={{ backgroundColor: clair ? DS.surface : DS.primary, borderRadius: 20, borderWidth: clair ? 1 : 0, borderColor: DS.border, padding: 18, gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: clair ? DS.textSecondary : 'rgba(255,255,255,0.7)' }}>
          {cote === 'client' ? tm("Total client") : tm("Total usine")} · {tm("HT")}
        </Text>
        <Text style={{ fontSize: 32, fontFamily: 'Manrope_700Bold', color: clair ? DS.text : DS.textInverse }}>{b.total ? euros(b.total) : '—'}</Text>
        {ttcDevis != null && b.supp === 0 && <Text style={{ fontSize: 13, color: clair ? DS.textSecondary : 'rgba(255,255,255,0.7)' }}>{euros(ttcDevis)} {tm("TTC")}</Text>}
        <View style={{ gap: 3, marginTop: 4 }}>
          <Ligne clair={clair} label={tm("Devis")} valeur={euros(b.devis)} />
          {(b.supp > 0 || b.enAttente > 0) && <Ligne clair={clair} label={b.enAttente ? tm("Suppléments acceptés ({0} en attente)", b.enAttente) : tm("Suppléments acceptés")} valeur={`+ ${euros(b.supp)}`} />}
          <Ligne clair={clair} label={tm("Facturé")} valeur={euros(b.facture)} />
          <Ligne clair={clair} label={cote === 'client' ? tm("Encaissé") : tm("Payé à l'usine")} valeur={euros(b.regle)} />
          <Ligne clair={clair} fort label={cote === 'client' ? tm("Reste à encaisser") : tm("Reste à payer")} valeur={euros(b.reste)} />
        </View>
        {admin && cote === 'client' && lignesDevis.length > 0 && (
          <Pressable onPress={async () => { for (const m of lignesDevis) await majMontantMn(moi, m, { visibilite: venteVisible ? 'admin' : 'client' }); onChange(); }}
            accessibilityRole="switch" accessibilityState={{ checked: venteVisible }}
            style={{ marginTop: 6, alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: venteVisible ? '#FFFFFF' : 'rgba(255,255,255,0.15)' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: venteVisible ? DS.primary : '#FFFFFF' }}>{venteVisible ? tm("Prix visible par le client ✓") : tm("Montrer le prix au client")}</Text>
          </Pressable>
        )}
        {admin && achat > 0 && vente > 0 && (
          <Text style={{ fontSize: 13, color: clair ? DS.textSecondary : 'rgba(255,255,255,0.8)' }}>{tm("Marge")} {euros(vente - achat)} · {Math.round(((vente - achat) / vente) * 100)} %</Text>
        )}
      </View>

      <LignesPieces key={`d${cote}`} moi={moi} chantierId={chantierId} usineId={usineId} cote={cote} type={t.devis} titre={cote === 'client' ? tm("Devis SK DECO") : tm("Devis de l'usine")}
        lignes={lignesDevis} documents={documents} orphelins={orphelins} onChange={onChange} peutSaisir={peutSaisir}
        options={{ pdf: true, ttc: true, date: false, partageClient: cote === 'client' ? 'devis' : undefined }}
        vide={tm("Dépose le devis (PDF) : les montants HT et TTC sont lus automatiquement.")} />

      <SupplementsDevis key={`s${cote}`} moi={moi} chantierId={chantierId} usineId={usineId} cote={cote} documents={documents}
        liste={supplements.filter(s => s.cote === cote)} onChange={toutRecharger} />

      <FacturesReglements key={`fr${cote}`} moi={moi} chantierId={chantierId} usineId={usineId} cote={cote} montants={montants} documents={documents}
        onChange={onChange} peutFactures={peutSaisir} peutReglements={modifiable && admin} />
    </>
  );
}
