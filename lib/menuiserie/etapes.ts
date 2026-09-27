/**
 * Les étapes d'un chantier menuiserie : qui remplit, et ce que l'usine voit.
 * Sert à l'affichage de la fiche chantier et, plus tard, aux droits par rôle.
 */
import type { GroupeMn, TypeMontantMn } from './types';
import { traduit } from '@/lib/menuiserie/i18n';

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

/** Qui voit par défaut les documents déposés à une étape */
export function visibiliteDocs(def: DefEtape): GroupeMn[] {
  const v: GroupeMn[] = ['admin'];
  if (def.visibleUsine) v.push('usine');
  if (['plan_exe', 'montage', 'verification', 'livraison', 'pose'].includes(def.cle)) v.push('poseur');
  return v;
}

/** Les 13 critères de vérification d'un meuble */
export const CRITERES_VERIF: { cle: string; label: string; aide?: string }[] = traduit([
  { cle: 'dimensions', label: 'Dimensions' },
  { cle: 'fixation', label: 'Système de fixation' },
  { cle: 'led', label: 'LED' },
  { cle: 'transformateur', label: 'Transformateur' },
  { cle: 'detecteur', label: 'Détecteur' },
  { cle: 'etat', label: 'État général' },
  { cle: 'ouverture', label: 'Ouverture', aide: 'poignée · push · prise de main' },
  { cle: 'pieds', label: 'Pieds' },
  { cle: 'laquage', label: 'Laquage qualité' },
  { cle: 'tissu', label: 'Tissu qualité' },
  { cle: 'charnieres', label: 'Charnières', aide: 'frigo · grand angle · quantités' },
  { cle: 'tringles', label: 'Tringles' },
  { cle: 'tiroirs', label: 'Tiroirs' },
]);

export const ETAPES_MN: DefEtape[] = traduit([
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
  { cle: 'verification', titre: 'Vérification des meubles', rempliPar: 'tous', visibleUsine: true, montants: [],
    aide: 'Chaque meuble est contrôlé sur 13 critères. Un critère non conforme peut devenir une réserve.' },
  { cle: 'emballage', titre: 'Emballage', rempliPar: 'usine', visibleUsine: true, montants: ['emballage'] },
  { cle: 'livraison', titre: 'Livraison', rempliPar: 'usine', visibleUsine: true, montants: ['transport'],
    champs: [
      { cle: 'transporteur', label: 'Qui livre' },
      { cle: 'date_depart', label: 'Date de départ', type: 'date' },
      { cle: 'date_reception', label: 'Date de réception', type: 'date' },
      { cle: 'airtag', label: 'Suivi AirTag (lien ou nom)' },
    ] },
  { cle: 'reception', titre: 'Réception', rempliPar: 'admin', visibleUsine: false, montants: ['monte_charge', 'demenageur'] },
  { cle: 'pose', titre: 'Pose', rempliPar: 'admin', visibleUsine: false, montants: ['pose'],
    champs: [
      { cle: 'date_debut', label: 'Début de pose', type: 'date' },
      { cle: 'date_fin', label: 'Fin de pose', type: 'date' },
      { cle: 'poseur', label: 'Qui pose' },
      { cle: 'facturation', label: 'Qui facture à qui (ex. sous-traitant → SK DECO, SK DECO → usine)' },
    ],
    aide: "Le planning de pose se cale sur la date de réception de la livraison. Le prix de pose est visible par le poseur rattaché." },
  { cle: 'pv', titre: 'PV de réception & réserves', rempliPar: 'admin', visibleUsine: false, montants: ['reserve', 'monte_charge', 'demenageur'],
    aide: "Le PV se crée ici. Les réserves transmises à l'usine ne portent ni prix ni nom de client : seulement le nom du chantier." },
  { cle: 'sav', titre: 'SAV', rempliPar: 'admin', visibleUsine: false, montants: [], aVenir: true },
]);

export function defEtape(cle: string): DefEtape | undefined {
  return ETAPES_MN.find(e => e.cle === cle);
}

/** Même règle que la fonction serveur mn_etape_modifiable (le serveur reste l'arbitre). */
export function etapeModifiable(groupe: GroupeMn, etape: string): boolean {
  if (groupe === 'admin') return true;
  if (groupe === 'usine') return ['devis', 'mesures', 'plan_exe', 'references', 'commande', 'production', 'montage', 'verification', 'emballage', 'livraison'].includes(etape);
  if (groupe === 'poseur') return ['mesures', 'verification'].includes(etape);
  if (groupe === 'client') return etape === 'mesures';
  return false;
}

/** Montants que l'usine peut saisir elle-même */
export const TYPES_MONTANT_USINE: TypeMontantMn[] = ['achat_usine', 'materiaux', 'emballage', 'transport'];

/** Même règle que la fonction serveur mn_etape_visible. */
export function etapeVisible(groupe: GroupeMn, etape: string): boolean {
  if (groupe === 'admin') return true;
  if (groupe === 'usine') return !['reception', 'pose', 'pv', 'sav'].includes(etape);
  if (groupe === 'poseur') return ['plan_exe', 'montage', 'verification', 'livraison', 'pose'].includes(etape);
  return false;
}
