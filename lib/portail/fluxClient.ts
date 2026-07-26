import type { AppData, Prescription, HonorairesLigne } from '@/app/types';

/**
 * Les 4 flux financiers que PAIE le client (vue « Mes finances », lecture seule),
 * TOUS EN TTC. Le client ne saisit jamais de budget — il constate / paie :
 *  1. Honoraires architecte (phases acceptées × TVA du devis)
 *  2. Marché entreprise (initial + suppléments, TTC)
 *  3. Matériaux (prescriptions nature='materiau', ACCEPTÉES, HORS devis entreprise)
 *  4. Mobilier / décoration (prescriptions nature='deco', ACCEPTÉES, HORS devis)
 *
 * Règles :
 *  - On ne compte que les prescriptions ACCEPTÉES (statut 'valide'). Le client peut
 *    changer d'avis (repasser en attente) → l'article ressort du décompte.
 *  - Les prescriptions « prévues au devis » (auDevis) sont déjà payées via le marché
 *    entreprise → exclues des flux Matériaux/Déco pour ne pas doubler.
 */
export interface FluxClient {
  honoraires: number;             // honoraires engagés TTC (phases acceptées)
  honorairesAConfirmer: number;   // phases proposées, pas encore acceptées (TTC)
  marche: number;                 // marché entreprise TTC (initial + suppléments)
  materiaux: number;              // matériaux hors devis, acceptés (TTC)
  mobilierDeco: number;           // mobilier / déco hors devis, acceptés (TTC)
  total: number;                  // somme des flux engagés (hors « à confirmer »)
}

const montantPrescHT = (p: Prescription) => (p.prixUnitaire || 0) * (p.quantite || 0);
const montantPrescTTC = (p: Prescription) => montantPrescHT(p) * (1 + (p.tauxTVA ?? 20) / 100);

/** Total HT du marché entreprise (marchés + suppléments) — sert d'assiette travaux. */
export function marcheTotalHT(data: AppData, chantierId: string): number {
  return (
    (data.marchesChantier || []).filter(m => m.chantierId === chantierId).reduce((s, m) => s + (m.montantHT || 0), 0) +
    (data.supplementsMarche || []).filter(s => s.chantierId === chantierId).reduce((s, x) => s + (x.montantHT || 0), 0)
  );
}

/** Un devis entreprise a-t-il été uploadé (initial ou signé) ? Si oui, l'assiette suit le marché. */
export function marcheDevisUploade(data: AppData, chantierId: string): boolean {
  return (data.marchesChantier || []).some(m => m.chantierId === chantierId && (m.devisSigneUri || m.devisInitialUri || (m.montantHT || 0) > 0));
}

/**
 * Assiette « montant travaux » des honoraires :
 *  - si un devis entreprise est uploadé → le montant HT du marché (auto, l'archi peut le voir) ;
 *  - sinon → la saisie manuelle de l'architecte (devis.montantTravauxHT).
 */
export function assietteTravauxHT(data: AppData, chantierId: string, montantTravauxManuelHT?: number): number {
  return marcheDevisUploade(data, chantierId) ? marcheTotalHT(data, chantierId) : (montantTravauxManuelHT || 0);
}

export function computeFluxClient(data: AppData, chantierId: string): FluxClient {
  const prescriptions = (data.prescriptions || []).filter(p => p.chantierId === chantierId);
  const acceptees = prescriptions.filter(p => p.statut === 'valide');
  const materiaux = acceptees.filter(p => p.nature === 'materiau' && !p.auDevis).reduce((s, p) => s + montantPrescTTC(p), 0);
  const mobilierDeco = acceptees.filter(p => p.nature === 'deco' && !p.auDevis).reduce((s, p) => s + montantPrescTTC(p), 0);

  const marche =
    (data.marchesChantier || []).filter(m => m.chantierId === chantierId).reduce((s, m) => s + (m.montantTTC || 0), 0) +
    (data.supplementsMarche || []).filter(s => s.chantierId === chantierId).reduce((s, x) => s + (x.montantTTC || 0), 0);

  // Honoraires : même logique que HonorairesPanel, converties en TTC via le taux du devis.
  const devis = (data.devisHonoraires || []).find(d => d.chantierId === chantierId);
  let honoraires = 0;
  let honorairesAConfirmer = 0;
  if (devis) {
    const assietteTravaux = assietteTravauxHT(data, chantierId, devis.montantTravauxHT);
    const prescTotal = prescriptions.reduce((s, p) => s + montantPrescHT(p), 0);
    const assietteDeco = assietteTravaux + prescTotal;
    const ttc = 1 + (devis.tauxTVA ?? 20) / 100;
    const ligneMontant = (l: HonorairesLigne) =>
      (l.mode === 'forfait'
        ? (l.montantForfaitHT || 0)
        : ((l.assiette === 'travaux_deco' ? assietteDeco : assietteTravaux) * (l.pourcentage || 0)) / 100) * ttc;
    const lignes: HonorairesLigne[] = [devis.phaseConception, ...(devis.phaseSuivi ? [devis.phaseSuivi] : []), ...(devis.supplements || [])];
    honoraires = lignes.filter(l => l.statut === 'accepte').reduce((s, l) => s + ligneMontant(l), 0);
    honorairesAConfirmer = lignes.filter(l => l.statut === 'a_confirmer').reduce((s, l) => s + ligneMontant(l), 0);
  }

  return {
    honoraires,
    honorairesAConfirmer,
    marche,
    materiaux,
    mobilierDeco,
    total: honoraires + marche + materiaux + mobilierDeco,
  };
}
