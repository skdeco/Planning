import { traduit } from '@/lib/menuiserie/i18n';
/** Modèle de données de l'espace Menuiserie (tables Supabase mn_*). */

export type RoleCompteMn = 'admin' | 'usine' | 'employe_usine' | 'client' | 'architecte' | 'apporteur' | 'poseur';
export type StatutChantierMn = 'en_cours' | 'cloture' | 'sav' | 'archive';
export type StatutEtapeMn = 'a_faire' | 'en_cours' | 'fait';
export type RoleIntervenantMn = 'client' | 'architecte' | 'apporteur' | 'responsable' | 'poseur';
export type TypeMontantMn =
  | 'achat_usine' | 'materiaux' | 'emballage' | 'transport' | 'vente_client'
  | 'pose' | 'monte_charge' | 'demenageur' | 'reserve'
  | 'reglement_client' | 'commission' | 'reglement_commission' | 'autre';
export type VisibiliteMontantMn = 'admin' | 'usine' | 'client' | 'poseur' | 'personnel';
/** Groupe de visibilité des documents (employé d'usine = usine, architecte = client) */
export type GroupeMn = 'admin' | 'usine' | 'client' | 'apporteur' | 'poseur';

export function groupeMn(role: RoleCompteMn): GroupeMn {
  if (role === 'employe_usine') return 'usine';
  if (role === 'architecte') return 'client';
  return role;
}

export interface UsineMn {
  id: string;
  nom: string;
  contact_nom: string | null;
  contact_tel: string | null;
  contact_email: string | null;
  adresse: string | null;
  actif: boolean;
  latitude: number | null;
  longitude: number | null;
  rayon_m: number;
  created_at: string;
}

export interface CompteMn {
  id: string;
  user_id: string | null;
  nom: string;
  role: RoleCompteMn;
  usine_id: string | null;
  identifiant: string | null;
  email: string | null;
  telephone: string | null;
  auth_email: string | null;
  app_ref: string | null;
  actif: boolean;
  conges_annuels: number;
  created_at: string;
}

export interface ChantierMn {
  id: string;
  nom: string;
  rue: string | null;
  code_postal: string | null;
  ville: string | null;
  code_acces: string | null;
  etage: string | null;
  cle: string | null;
  statut: StatutChantierMn;
  usine_id: string | null;
  date_livraison_prevue: string | null;
  client_nom: string | null;
  client_societe: string | null;
  client_rue: string | null;
  client_code_postal: string | null;
  client_ville: string | null;
  client_tel: string | null;
  client_email: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntervenantMn {
  id: string;
  chantier_id: string;
  role: RoleIntervenantMn;
  nom: string;
  compte_id: string | null;
  created_at: string;
}

export interface EtapeMn {
  chantier_id: string;
  etape: string;
  statut: StatutEtapeMn;
  infos: Record<string, string>;
  updated_by_nom: string | null;
  updated_at: string;
}

export interface DocumentMn {
  id: string;
  chantier_id: string;
  etape: string;
  piece: string | null;
  nom: string;
  chemin: string;
  mime: string | null;
  visibilite: string[];
  depose_par: string | null;
  depose_par_nom: string | null;
  categorie_client: string | null;
  supprime: boolean;
  created_at: string;
}

export interface MontantMn {
  id: string;
  chantier_id: string;
  etape: string | null;
  type: TypeMontantMn;
  libelle: string | null;
  montant_ht: number;
  visibilite: VisibiliteMontantMn;
  usine_id: string | null;
  compte_id: string | null;
  date_montant: string | null;
  created_by_nom: string | null;
  created_at: string;
}

export interface JournalMn {
  id: string;
  chantier_id: string | null;
  action: string;
  detail: string | null;
  par_nom: string | null;
  created_at: string;
}

export const ROLE_COMPTE_MN_LABELS: Record<RoleCompteMn, string> = traduit({
  admin: 'Administrateur',
  usine: 'Usine',
  employe_usine: "Employé d'usine",
  client: 'Client',
  architecte: 'Architecte',
  apporteur: "Apporteur d'affaires",
  poseur: 'Poseur',
});

export const STATUT_CHANTIER_MN_LABELS: Record<StatutChantierMn, string> = traduit({
  en_cours: 'En cours',
  cloture: 'Clôturé',
  sav: 'SAV',
  archive: 'Archivé',
});

export const ROLE_INTERVENANT_MN_LABELS: Record<RoleIntervenantMn, string> = traduit({
  client: 'Client',
  architecte: 'Architecte',
  apporteur: 'Apporteur',
  responsable: 'Responsable',
  poseur: 'Poseur',
});

export const TYPE_MONTANT_MN_LABELS: Record<TypeMontantMn, string> = traduit({
  achat_usine: 'Achat usine (devis)',
  materiaux: 'Matériaux',
  emballage: 'Emballage',
  transport: 'Transport',
  vente_client: 'Vente client',
  pose: 'Pose',
  monte_charge: 'Monte-charge',
  demenageur: 'Déménageur',
  reserve: 'Reprise de réserves',
  reglement_client: 'Règlement client',
  commission: 'Commission prévue',
  reglement_commission: 'Commission réglée',
  autre: 'Autre',
});

export interface VerificationMn {
  id: string;
  chantier_id: string;
  meuble: string;
  criteres: Record<string, 'ok' | 'nok' | 'na'>;
  commentaire: string | null;
  updated_by_nom: string | null;
  updated_at: string;
}

export interface ReserveMn {
  id: string;
  chantier_id: string;
  meuble: string | null;
  description: string;
  statut: 'a_reprendre' | 'envoye' | 'repris';
  transmise_usine: boolean;
  date_envoi_elements: string | null;
  created_by_nom: string | null;
  created_at: string;
}

export interface MessageMn {
  id: string;
  chantier_id: string;
  auteur_compte: string | null;
  auteur_nom: string;
  texte: string;
  created_at: string;
}

export interface RdvMn {
  id: string;
  chantier_id: string;
  titre: string;
  date_rdv: string;
  heure_debut: string;
  heure_fin: string | null;
  lieu: string | null;
  statut: 'validation_admins' | 'chez_client' | 'confirme' | 'refuse';
  accords: Record<string, boolean>;
  propose_par: string | null;
  propose_par_nom: string | null;
  created_at: string;
}

export interface SignalementMn {
  id: string;
  chantier_id: string;
  type: 'materiel' | 'probleme';
  meuble: string | null;
  texte: string;
  nouvelle_cote: string | null;
  statut: 'ouvert' | 'traite';
  par_compte: string | null;
  par_nom: string | null;
  created_at: string;
}

export interface PointageMn {
  id: string;
  compte_id: string;
  usine_id: string | null;
  chantier_id: string | null;
  type: 'arrivee' | 'depart';
  horodatage: string;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  hors_zone: boolean;
}

export interface CongeMn {
  id: string;
  compte_id: string;
  usine_id: string | null;
  type: 'conges' | 'absence';
  date_debut: string;
  date_fin: string;
  jours: number;
  motif: string | null;
  justificatif_chemin: string | null;
  statut: 'en_attente' | 'approuve' | 'refuse';
  traite_par_nom: string | null;
  created_at: string;
}

export interface DocRhMn {
  id: string;
  compte_id: string;
  usine_id: string | null;
  type: 'fiche_paie' | 'autre';
  mois: string | null;
  nom: string;
  chemin: string;
  created_at: string;
}

export interface FournisseurMn {
  id: string;
  usine_id: string | null;
  nom: string;
  categorie: string | null;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  notes: string | null;
}

export type CategorieCatalogueMn = 'panneaux' | 'tissus' | 'quincaillerie_dressing' | 'quincaillerie_cuisine' | 'eclairage' | 'stock' | 'autre';

export const CATEGORIE_CATALOGUE_LABELS: Record<CategorieCatalogueMn, string> = traduit({
  panneaux: 'Panneaux (Egger, Finsa, Decospan…)',
  tissus: 'Tissus',
  quincaillerie_dressing: 'Quincaillerie dressing',
  quincaillerie_cuisine: 'Quincaillerie cuisine',
  eclairage: 'Éclairage',
  stock: 'Stock usine',
  autre: 'Autre',
});

export interface ArticleCatalogueMn {
  id: string;
  usine_id: string | null;
  categorie: CategorieCatalogueMn;
  marque: string | null;
  reference: string | null;
  reference_interne: string | null;
  designation: string;
  quantite: string | null;
  photo_chemin: string | null;
  notes: string | null;
}

/** Rubriques de l'espace client (un document admin peut être « partagé » dans l'une d'elles). */
export const CATEGORIES_CLIENT: { cle: string; label: string }[] = traduit([
  { cle: 'plan_base', label: 'Plan de base' },
  { cle: 'devis', label: 'Devis' },
  { cle: 'devis_signe', label: 'Devis signé' },
  { cle: 'plan_exe', label: "Plan d'exécution" },
  { cle: 'plan_exe_signe', label: "Plan d'exécution signé" },
  { cle: 'supplements', label: 'Suppléments' },
  { cle: 'supplements_signes', label: 'Suppléments signés' },
  { cle: 'photos', label: 'Photos' },
  { cle: 'pv', label: 'PV de réception' },
  { cle: 'sav', label: 'SAV' },
]);
