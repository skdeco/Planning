/**
 * Types du module Architecte / Maîtrise d'œuvre (mono-tenant).
 *
 * Se greffe sur le modèle existant sans le dupliquer :
 * réutilise SuiviCR (CR partagé), PVReserve (réserves), LivraisonChantier,
 * PlanChantier (plans/3D), SituationFigee (visa), Chantier.inspirations (moodboard).
 *
 * Conception de référence : maquette 26 écrans (cf. mémoire projet
 * "interface architecte / chantier partagé").
 */

// ─── Pièces du chantier (fondation partagée) ─────────────────────────────────
// Référencées par : prescriptions, plans/3D, décoration, moodboard, métrés.
// Généralise PVPiece (jusqu'ici limité au PV de réception). Le catalogue de
// noms par défaut reste PIECES_DEFAULT (app/types/pv.ts).

/** Une pièce du chantier (Cuisine, Salon, Chambre master…), porteuse des métrés. */
export interface PieceChantier {
  id: string;
  chantierId: string;
  nom: string;                    // ex: "Salon", "Chambre master"
  ordre?: number;                 // ordre d'affichage
  // ─── Métrés (optionnels — saisis par l'architecte) ───
  surfaceSolM2?: number;          // surface au sol en m²
  hauteurSousPlafondM?: number;   // HSP (hauteur sous plafond) en mètres
  surfaceMursM2?: number;         // surface des murs en m² (≈ périmètre × HSP)
  createdAt: string;              // ISO datetime
  updatedAt: string;              // ISO datetime
}

// ─── Visibilité d'une ressource partagée ─────────────────────────────────────
// Défaut sécurisé : tout absent = privé à l'architecte. Le partage est explicite.
// Le PRIX suit sa propre visibilité (satellite) — jamais partagé implicitement.

/** Audiences de visibilité d'une ressource (prescription, plan…). */
export interface VisibiliteRessource {
  client?: boolean;               // visible dans le portail client
  entreprise?: boolean;           // visible par l'entreprise de travaux (équipe)
  soustraitants?: boolean;        // visible par les sous-traitants
  prixVisibleClient?: boolean;    // le prix est-il montré au client
  prixVisibleEntreprise?: boolean;// le prix est-il montré à l'entreprise
}

// ─── Prescriptions matériaux & décoration ────────────────────────────────────

/** Nature d'une prescription : matériau (carrelage, parquet…) ou déco (mobilier, luminaire…). */
export type PrescriptionNature = 'materiau' | 'deco';

/** Statut d'un élément le long de la boucle archi → entreprise → client. */
export type PrescriptionStatut =
  | 'a_proposer'   // brouillon architecte (non publié)
  | 'propose'      // soumis au client pour validation
  | 'valide'       // accepté par le client
  | 'refuse'       // refusé par le client
  | 'commande'     // commandé par l'entreprise
  | 'pose';        // posé sur le chantier

export const PRESCRIPTION_STATUT_LABELS: Record<PrescriptionStatut, string> = {
  a_proposer: 'À proposer',
  propose: 'Proposé',
  valide: 'Validé',
  refuse: 'Refusé',
  commande: 'Commandé',
  pose: 'Posé',
};

/** Document attaché à une prescription (fiche technique, DoP…). */
export interface PrescriptionDocument {
  id: string;
  nom: string;                    // ex: "Fiche-technique.pdf"
  uri: string;                    // URI Supabase Storage
  type?: 'pdf' | 'image';
}

/** Une alternative proposée pour un élément (option comparée côte à côte). */
export interface PrescriptionAlternative {
  id: string;
  designation: string;
  marque?: string;
  reference?: string;
  lien?: string;
  imageUri?: string;
  prixUnitaire?: number;
  retenue?: boolean;              // true si c'est l'option retenue
}

/** Un élément prescrit par l'architecte (matériau ou décoration). */
export interface Prescription {
  id: string;
  chantierId: string;
  nature: PrescriptionNature;
  categorie: string;              // ex: "Carrelage & faïence", "Luminaires" (libre, réordonnable)
  pieceId?: string;               // pièce concernée (surtout pour la déco)
  ordre?: number;                 // ordre dans sa catégorie

  // ─── Produit ───
  designation: string;            // ex: "Grès cérame 60×60 mat"
  marque?: string;                // ex: "Marazzi"
  reference?: string;             // ex: "AZ-0912"
  coloris?: string;
  imageUri?: string;              // visuel produit (Storage)
  lien?: string;                  // (legacy) lien principal — repris dans `liens`
  liens?: string[];              // liens fournisseur multiples
  documents?: PrescriptionDocument[];  // visuels / fichiers de l'article (pdf/photo/caméra)
  /** Fiche technique dédiée : lien(s) + documents (DoP, notice, etc.). */
  ficheTechnique?: { liens?: string[]; documents?: PrescriptionDocument[] };

  // ─── Prix & quantité (sous-total = prixUnitaire × quantite) ───
  prixUnitaire?: number;          // € HT
  unite?: string;                 // 'm²' | 'ml' | 'u' | 'forfait'… (libre)
  quantite?: number;

  // ─── Comparaison au devis (budget) ───
  auDevis?: boolean;              // true = article prévu au devis (compare l'écart) ; sinon = hors devis (simple ajout au budget)
  montantDevis?: number;          // € HT prévu au devis pour cet article (si auDevis)

  // ─── Cycle de validation ───
  statut: PrescriptionStatut;
  decideParId?: string;           // apporteurId (client) qui a validé/refusé
  decideAt?: string;              // ISO datetime de la décision

  // ─── Partage & options ───
  visibilite?: VisibiliteRessource;
  alternatives?: PrescriptionAlternative[];

  // ─── Livraison (lien vers le module Livraison entreprise existant) ───
  livraisonId?: string;           // ref LivraisonChantier.id

  note?: string;
  /** Proposé par le CLIENT (envie/suggestion) — à formaliser par le prescripteur (archi ou entreprise). */
  sourceClient?: boolean;
  createParId: string;            // 'admin' ou apporteurId (architecte/client)
  createdAt: string;              // ISO datetime
  updatedAt: string;              // ISO datetime
}

// ─── Honoraires d'architecte ─────────────────────────────────────────────────
// 2e flux financier, PRIVÉ archi ↔ client — jamais visible par l'entreprise.
// Ledger distinct du marché entreprise (MarcheChantier / SituationFigee).

/** Mode de calcul d'une ligne d'honoraires : forfait fixe ou % d'une assiette. */
export type HonorairesMode = 'forfait' | 'pourcentage';

/** Assiette de calcul d'une ligne en pourcentage. */
export type HonorairesAssiette =
  | 'travaux'         // montant des travaux (SAISI par l'architecte, cf. montantTravauxHT)
  | 'travaux_deco';   // travaux + prescriptions/mobilier (assiette élargie, part déco auto)

/** Statut d'acceptation d'une phase — acceptation LIBRE, indépendante par phase. */
export type HonorairesPhaseStatut = 'a_confirmer' | 'accepte' | 'refuse';

/** Une phase / ligne du devis d'honoraires (conception, suivi, supplément). */
export interface HonorairesLigne {
  id: string;
  libelle: string;                // ex: "Conception", "Suivi de chantier", "Dépôt PC — mairie"
  mode: HonorairesMode;
  montantForfaitHT?: number;      // si mode = 'forfait'
  pourcentage?: number;           // si mode = 'pourcentage' — ex: 8 pour 8 %
  assiette?: HonorairesAssiette;  // si mode = 'pourcentage'
  optionnelle?: boolean;          // true pour le suivi de chantier (le client l'octroie ou non)
  statut: HonorairesPhaseStatut;  // acceptation propre à cette phase
  decideAt?: string;              // ISO datetime de la décision client
}

/** Un appel de fonds (échéance d'honoraires à régler) — ledger de suivi. */
export interface HonorairesAppel {
  id: string;
  libelle: string;                // ex: "À la signature", "Avancement 50 %"
  montantHT: number;
  emisLe?: string;                // YYYY-MM-DD
  statut: 'a_regler' | 'regle';
  regleLe?: string;               // YYYY-MM-DD
}

/** Devis d'honoraires de l'architecte pour un chantier (flux privé archi ↔ client). */
export interface DevisHonoraires {
  id: string;
  chantierId: string;
  architecteId: string;           // apporteurId (Apporteur type 'architecte')

  // Assiette — le montant travaux est SAISI par l'architecte (≠ marché entreprise,
  // qu'il n'a pas à voir). La part prescriptions/mobilier de l'assiette élargie
  // est calculée à la volée depuis prescriptions[] (non stockée ici).
  montantTravauxHT?: number;

  // Devis : 3 sections (a / b / c)
  phaseConception: HonorairesLigne;   // a
  phaseSuivi?: HonorairesLigne;       // b — optionnelle
  supplements?: HonorairesLigne[];    // c — ad hoc (mairie, étude…)

  // Suivi financier (ledger séparé — réutilise la logique du portail finances)
  appels?: HonorairesAppel[];

  tauxTVA?: number;               // ex: 20
  createdAt: string;              // ISO datetime
  updatedAt: string;              // ISO datetime
}

// ─── Planning de phases (DET) ────────────────────────────────────────────────
// Le retard (J+X) est calculé à la volée (avancementPct vs attendu à la date du
// jour) — non stocké.

/** Jalon clé du chantier (hors d'eau, hors d'air, réception…). */
export interface JalonChantier {
  id: string;
  chantierId: string;
  libelle: string;                // ex: "Hors d'eau"
  datePrevue?: string;            // YYYY-MM-DD
  atteintLe?: string;             // YYYY-MM-DD (renseigné quand atteint)
  ordre?: number;
}

/** Une phase / lot du planning, avec prévu vs réel. */
export interface PhaseChantier {
  id: string;
  chantierId: string;
  libelle: string;                // ex: "Menuiseries ext."
  lotId?: string;                 // lien vers un lot/corps de métier (constants/lots.ts)
  ordre?: number;
  dateDebutPrevue?: string;       // YYYY-MM-DD
  dateFinPrevue?: string;         // YYYY-MM-DD
  avancementPct?: number;         // 0..100 — constaté en visite / renseigné par l'entreprise
  createdAt: string;              // ISO datetime
  updatedAt: string;              // ISO datetime
}

// ─── Démarches administratives ───────────────────────────────────────────────

export type DemarchePhase = 'autorisations' | 'chantier' | 'achevement';
export type DemarcheStatut = 'a_faire' | 'fait' | 'en_attente';

/** Une démarche / échéance administrative (PC, DOC, DAACT, assurances…). */
export interface DemarcheAdministrative {
  id: string;
  chantierId: string;
  phase: DemarchePhase;
  libelle: string;                // ex: "Dépôt du permis de construire"
  statut: DemarcheStatut;
  dateEcheance?: string;          // YYYY-MM-DD (si applicable)
  faitLe?: string;                // YYYY-MM-DD
  note?: string;
  ordre?: number;
}

// ─── Consultation des entreprises (DCE) ──────────────────────────────────────

/** Une offre reçue d'une entreprise pour un lot. */
export interface OffreLot {
  id: string;
  entrepriseNom: string;          // nom de l'entreprise consultée
  soustraitantId?: string;        // lien optionnel vers un SousTraitant existant
  montantHT: number;
  delaiSemaines?: number;
  fichierUri?: string;            // devis reçu (Storage)
  retenue?: boolean;              // true si c'est l'offre retenue
  note?: string;
}

/** Consultation d'un lot : estimation de l'architecte + offres comparées. */
export interface ConsultationLot {
  id: string;
  chantierId: string;
  lotId?: string;
  libelle: string;                // ex: "Plomberie"
  estimationHT?: number;          // estimation de l'architecte
  offres: OffreLot[];
  createdAt: string;              // ISO datetime
  updatedAt: string;              // ISO datetime
}
