/** Modèle de données de l'espace Menuiserie (tables Supabase mn_*). */

export type RoleCompteMn = 'admin' | 'usine' | 'employe_usine' | 'client' | 'architecte' | 'apporteur' | 'poseur';
export type StatutChantierMn = 'en_cours' | 'cloture' | 'sav';
export type StatutEtapeMn = 'a_faire' | 'en_cours' | 'fait';
export type RoleIntervenantMn = 'client' | 'architecte' | 'apporteur' | 'responsable' | 'poseur';
export type TypeMontantMn =
  | 'achat_usine' | 'materiaux' | 'emballage' | 'transport' | 'vente_client'
  | 'pose' | 'monte_charge' | 'demenageur' | 'reserve' | 'autre';
export type VisibiliteMontantMn = 'admin' | 'usine' | 'client';

export interface UsineMn {
  id: string;
  nom: string;
  contact_nom: string | null;
  contact_tel: string | null;
  contact_email: string | null;
  adresse: string | null;
  actif: boolean;
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

export const ROLE_COMPTE_MN_LABELS: Record<RoleCompteMn, string> = {
  admin: 'Administrateur',
  usine: 'Usine',
  employe_usine: "Employé d'usine",
  client: 'Client',
  architecte: 'Architecte',
  apporteur: "Apporteur d'affaires",
  poseur: 'Poseur',
};

export const STATUT_CHANTIER_MN_LABELS: Record<StatutChantierMn, string> = {
  en_cours: 'En cours',
  cloture: 'Clôturé',
  sav: 'SAV',
};

export const ROLE_INTERVENANT_MN_LABELS: Record<RoleIntervenantMn, string> = {
  client: 'Client',
  architecte: 'Architecte',
  apporteur: 'Apporteur',
  responsable: 'Responsable',
  poseur: 'Poseur',
};

export const TYPE_MONTANT_MN_LABELS: Record<TypeMontantMn, string> = {
  achat_usine: 'Achat usine (devis)',
  materiaux: 'Matériaux',
  emballage: 'Emballage',
  transport: 'Transport',
  vente_client: 'Vente client',
  pose: 'Pose',
  monte_charge: 'Monte-charge',
  demenageur: 'Déménageur',
  reserve: 'Reprise de réserves',
  autre: 'Autre',
};
