/**
 * Types pour le PV de réception de chantier.
 * Refonte vers structure réserves libres par pièce
 * (annule les "lots métier prédéfinis" qui étaient trop rigides).
 */

/** Item d'une checklist de réception (1 vérification) — structure plate (legacy V1) */
export interface PVItem {
  id: string;
  libelle: string;
  categorie?: string;
  conforme: boolean | null;
  reserve?: string;
  photos?: string[];
}

/** Levée d'une réserve (preuve de réparation) */
export interface PVLevee {
  le: string;                       // ISO datetime
  photos?: string[];                // photos APRÈS réparation (max 5)
  commentaire?: string;             // note libre admin
}

/** Réserve saisie sur le PV (défaut constaté) */
export interface PVReserve {
  id: string;
  description: string;              // texte libre obligatoire

  // Catégorie (un seul des deux champs renseigné, ou aucun) :
  // - lotDevisId : référence au lot du devis chantier.avancementCorps
  // - categorieLibre : texte libre si pas de devis ou choix "Autre"
  lotDevisId?: string;              // ref vers chantier.avancementCorps[].id
  lotDevisNomSnapshot?: string;     // snapshot du nom (résilient si lot supprimé)
  categorieLibre?: string;          // texte libre si pas de rattachement devis

  // Photos initiales (constat du défaut) — max 5
  photos?: string[];                // URLs Storage Supabase

  // Levée (peut être annulée en remettant à undefined)
  levee?: PVLevee;

  // Audit
  createdAt: string;                // ISO datetime
}

/** Pièce du chantier (Cuisine, Chambre 1, ...) */
export interface PVPiece {
  id: string;
  nom: string;
  ordre?: number;
  reserves: PVReserve[];            // ⚠️ remplace 'lots' (refonte)
}

/** Modalité de paiement retenue garantie */
export interface PVPaiement {
  modalite: string;
}

/** Historique d'envoi mail */
export interface PVMailEnvoi {
  date: string;
  recipients: string[];
  pdfUri?: string;
  subject?: string;
}

/** Avenant / annexe complémentaire au PV de réception (document produit à la demande). */
export interface PVAvenant {
  id: string;
  numero?: string;        // ex "Avenant n°1"
  date: string;           // YYYY-MM-DD
  objet: string;          // titre de l'avenant
  contenu: string;        // corps libre (observations, réserves complémentaires…)
  createdAt: string;      // ISO datetime
}

/** PV de réception complet */
export interface PVReception {
  numeroPV?: string;
  dateReception?: string;

  /** Avenants / annexes complémentaires produits après le PV initial. */
  avenants?: PVAvenant[];

  // Checklist :
  // - Anciens PV V1 : items[] (legacy)
  // - Nouveaux PV V2 : pieces[] avec reserves[] par pièce
  items?: PVItem[];                 // legacy V1
  pieces?: PVPiece[];               // V2 refondu

  paiementRetenueGarantie?: PVPaiement;

  /** Afficher le récap chiffré des montants (default true). Admin peut
   *  masquer si toutes les factures de suppléments ne sont pas encore émises. */
  afficherRecapPaiement?: boolean;

  // Signatures
  signatureEntrepriseUri?: string;
  signatureEntrepriseDate?: string;
  signatureClientUri?: string;
  signatureClientDate?: string;
  nomSignataire?: string;

  clotureLe?: string;

  // Historique mail
  mailHistory?: PVMailEnvoi[];
}

/** Catalogue de pièces standards (utilisable comme template) */
export const PIECES_DEFAULT = [
  'Cuisine',
  'Salon',
  'Salle à manger',
  'Salon/Salle à manger',
  'Chambre 1', 'Chambre 2', 'Chambre 3', 'Chambre 4', 'Chambre 5',
  'SdB 1', 'SdB 2', 'SdB 3',
  'WC 1', 'WC 2',
  'Bureau',
  'Couloir',
  'Dressing',
  'Buanderie',
  'Entrée',
  'Garage',
  'Cave',
  'Terrasse',
  'Balcon',
  'Extérieur',
] as const;
