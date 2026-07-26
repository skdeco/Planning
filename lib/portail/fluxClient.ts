import type { AppData, Prescription, HonorairesLigne } from '@/app/types';

/**
 * Les 4 flux financiers que PAIE le client (vue « Mes finances », lecture seule).
 * Le client ne saisit jamais de budget — il constate / paie :
 *  1. Honoraires architecte (conception + suivi + suppléments acceptés)
 *  2. Marché entreprise (initial + suppléments, TTC)
 *  3. Matériaux (prescriptions nature='materiau')
 *  4. Mobilier / décoration (prescriptions nature='deco')
 */
export interface FluxClient {
  honoraires: number;             // honoraires engagés (phases acceptées)
  honorairesAConfirmer: number;   // phases proposées, pas encore acceptées
  marche: number;                 // marché entreprise TTC (initial + suppléments)
  materiaux: number;              // prescriptions matériaux (prix × qté)
  mobilierDeco: number;           // prescriptions mobilier / déco
  total: number;                  // somme des flux engagés (hors « à confirmer »)
}

const montantPresc = (p: Prescription) => (p.prixUnitaire || 0) * (p.quantite || 0);

export function computeFluxClient(data: AppData, chantierId: string): FluxClient {
  const prescriptions = (data.prescriptions || []).filter(p => p.chantierId === chantierId);
  const materiaux = prescriptions.filter(p => p.nature === 'materiau').reduce((s, p) => s + montantPresc(p), 0);
  const mobilierDeco = prescriptions.filter(p => p.nature === 'deco').reduce((s, p) => s + montantPresc(p), 0);
  const prescTotal = materiaux + mobilierDeco;

  const marche =
    (data.marchesChantier || []).filter(m => m.chantierId === chantierId).reduce((s, m) => s + (m.montantTTC || 0), 0) +
    (data.supplementsMarche || []).filter(s => s.chantierId === chantierId).reduce((s, x) => s + (x.montantTTC || 0), 0);

  // Honoraires : même logique de calcul que HonorairesPanel (assiette travaux saisie + prescriptions auto).
  const devis = (data.devisHonoraires || []).find(d => d.chantierId === chantierId);
  let honoraires = 0;
  let honorairesAConfirmer = 0;
  if (devis) {
    const assietteTravaux = devis.montantTravauxHT || 0;
    const assietteDeco = assietteTravaux + prescTotal;
    const ligneMontant = (l: HonorairesLigne) =>
      l.mode === 'forfait'
        ? (l.montantForfaitHT || 0)
        : ((l.assiette === 'travaux_deco' ? assietteDeco : assietteTravaux) * (l.pourcentage || 0)) / 100;
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
