/**
 * Les étapes d'un chantier menuiserie : qui remplit, et ce que l'usine voit.
 * Sert à l'affichage de la fiche chantier et, plus tard, aux droits par rôle.
 */
import type { TypeMontantMn } from './types';

export type RempliPar = 'admin' | 'usine' | 'tous';

export interface DefEtape {
  cle: string;
  titre: string;
  rempliPar: RempliPar;
  /** false = jamais visible par l'usine (Réception, Pose, PV avec prix) */
  visibleUsine: boolean;
  /** Montants que l'on peut saisir à cette étape */
  montants: TypeMontantMn[];
  /** Champs libres propres à l'étape (dates, noms…) */
  champs?: { cle: string; label: string; type?: 'texte' | 'date' }[];
  /** Photos classées par pièce (prises de mesure) */
  parPiece?: boolean;
  /** Seul l'admin peut supprimer un document de cette étape */
  suppressionAdminSeul?: boolean;
  /** Étape pas encore disponible (étapes suivantes) */
  aVenir?: boolean;
  aide?: string;
}

export const ETAPES_MN: DefEtape[] = [
  { cle: 'plan_devis', titre: 'Plan pour devis', rempliPar: 'admin', visibleUsine: true, montants: [] },
  { cle: 'devis', titre: 'Devis', rempliPar: 'usine', visibleUsine: true, montants: ['achat_usine', 'vente_client'],
    aide: "Le devis de l'usine (achat) et ton prix de vente client. Le prix de vente n'est jamais visible par l'usine." },
  { cle: 'mesures', titre: 'Prise de mesure', rempliPar: 'tous', visibleUsine: true, montants: [], parPiece: true, suppressionAdminSeul: true,
    aide: 'Photos classées par pièce. Seul un administrateur peut supprimer.' },
  { cle: 'plan_exe', titre: "Plan d'exécution", rempliPar: 'usine', visibleUsine: true, montants: [],
    aide: "Déposé par l'usine ; l'administrateur peut renvoyer une version annotée." },
  { cle: 'references', titre: 'Références matériaux', rempliPar: 'usine', visibleUsine: true, montants: [],
    champs: [{ cle: 'liste', label: 'Références (marque, référence, finition)' }] },
  { cle: 'commande', titre: 'Commande matériaux', rempliPar: 'usine', visibleUsine: true, montants: ['materiaux'] },
  { cle: 'production', titre: 'Production', rempliPar: 'usine', visibleUsine: true, montants: [],
    champs: [{ cle: 'semaine_debut', label: 'Semaine de début (ex. S41)' }, { cle: 'semaine_fin', label: 'Semaine de fin (ex. S43)' }] },
  { cle: 'montage', titre: 'Plan de montage', rempliPar: 'usine', visibleUsine: true, montants: [] },
  { cle: 'verification', titre: 'Vérification des meubles', rempliPar: 'tous', visibleUsine: true, montants: [], aVenir: true },
  { cle: 'emballage', titre: 'Emballage', rempliPar: 'usine', visibleUsine: true, montants: ['emballage'] },
  { cle: 'livraison', titre: 'Livraison', rempliPar: 'usine', visibleUsine: true, montants: ['transport'],
    champs: [
      { cle: 'transporteur', label: 'Qui livre' },
      { cle: 'date_depart', label: 'Date de départ', type: 'date' },
      { cle: 'date_reception', label: 'Date de réception', type: 'date' },
      { cle: 'airtag', label: 'Suivi AirTag (lien ou nom)' },
    ] },
  { cle: 'reception', titre: 'Réception', rempliPar: 'admin', visibleUsine: false, montants: ['monte_charge', 'demenageur'] },
  { cle: 'pose', titre: 'Pose', rempliPar: 'admin', visibleUsine: false, montants: ['pose'], aVenir: true },
  { cle: 'pv', titre: 'PV de réception & réserves', rempliPar: 'admin', visibleUsine: false, montants: ['reserve', 'transport'], aVenir: true },
  { cle: 'sav', titre: 'SAV', rempliPar: 'admin', visibleUsine: false, montants: [], aVenir: true },
];

export function defEtape(cle: string): DefEtape | undefined {
  return ETAPES_MN.find(e => e.cle === cle);
}
