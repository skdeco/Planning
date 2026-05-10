import type { MarcheChantier, SupplementMarche } from '@/app/types';

/** Pourcentage de retenue garantie standard (BTP FR). */
export const RETENUE_GARANTIE_PCT = 5;

export interface LignePaiement {
  libelle: string;
  montantTTC: number;
}

export interface CalculPaiementResult {
  marches: LignePaiement[];
  supplementsFactures: LignePaiement[];
  totalTTC: number;
  acomptesVerses: number;
  retenueGarantieMontant: number;
  retenueGarantiePct: number;
  resteAPayer: number;
}

/**
 * Calcule la situation financière d'un chantier pour le PV de réception.
 *
 * Règles :
 * - Total TTC = somme des marchés + suppléments (statut accepté ET factureUri présent)
 * - Acomptes versés = somme de TOUS les paiements reçus (marchés + tous suppléments,
 *   peu importe le statut du parent — cohérent avec le pattern de MarchesChantier)
 * - Retenue garantie = 5% du Total TTC
 * - Reste à payer = Total TTC − Acomptes − Retenue
 *
 * Les suppléments sont triés par createdAt et numérotés "Facture supplément n°N".
 */
export function calculPaiementChantier(
  chantierId: string,
  marchesChantier: MarcheChantier[] | undefined,
  supplementsMarche: SupplementMarche[] | undefined,
): CalculPaiementResult {
  const marches = (marchesChantier || []).filter(m => m.chantierId === chantierId);
  const allSupplements = (supplementsMarche || []).filter(s => s.chantierId === chantierId);

  const supplementsInclus = allSupplements.filter(s =>
    s.statut === 'accepte' && !!s.factureUri
  );

  const lignesMarches: LignePaiement[] = marches.map(m => ({
    libelle: m.libelle || 'Marché',
    montantTTC: m.montantTTC,
  }));

  const supplementsTries = [...supplementsInclus].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const lignesSupplements: LignePaiement[] = supplementsTries.map((s, idx) => ({
    libelle: `Facture supplément n°${idx + 1}${s.libelle ? ` — ${s.libelle}` : ''}`,
    montantTTC: s.montantTTC,
  }));

  const totalMarches = marches.reduce((sum, m) => sum + m.montantTTC, 0);
  const totalSupp = supplementsInclus.reduce((sum, s) => sum + s.montantTTC, 0);
  const totalTTC = totalMarches + totalSupp;

  const paiementsMarches = marches.reduce(
    (sum, m) => sum + m.paiements.reduce((a, p) => a + p.montant, 0),
    0
  );
  const paiementsSupp = allSupplements.reduce(
    (sum, s) => sum + s.paiements.reduce((a, p) => a + p.montant, 0),
    0
  );
  const acomptesVerses = paiementsMarches + paiementsSupp;

  const retenueGarantieMontant = totalTTC * (RETENUE_GARANTIE_PCT / 100);
  const resteAPayer = totalTTC - acomptesVerses - retenueGarantieMontant;

  return {
    marches: lignesMarches,
    supplementsFactures: lignesSupplements,
    totalTTC,
    acomptesVerses,
    retenueGarantieMontant,
    retenueGarantiePct: RETENUE_GARANTIE_PCT,
    resteAPayer,
  };
}

/** Format euro FR : "1 234,56 €". */
export function formatEUR(montant: number): string {
  return montant.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}
