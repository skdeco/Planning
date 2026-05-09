/**
 * Types pour le PV de réception de chantier.
 * Extrait depuis le type inline dans Chantier (rétrocompat préservée).
 */

/** Item d'une checklist de réception (1 vérification) — structure plate (legacy) */
export interface PVItem {
  id: string;
  libelle: string;          // ex: "Carrelage salle de bain"
  categorie?: string;        // ex: "Sols"
  conforme: boolean | null;  // null = non contrôlé
  reserve?: string;          // description de la réserve si non-conforme
  photos?: string[];         // jusqu'à 5 URLs Storage Supabase
}

/** Levée d'une réserve post-signature */
export interface LeveeReserve {
  id: string;
  itemId: string;            // référence à PVItem.id ou PVPieceLot.id
  dateLevee: string;         // ISO datetime
  commentaire?: string;
  photoUri?: string;         // URL Storage (preuve visuelle de levée)
}

/** Modalité de paiement retenue garantie */
export interface PVPaiement {
  modalite: string;          // texte libre, default "chèque ou virement..."
}

/** Historique d'envoi mail */
export interface PVMailEnvoi {
  date: string;              // ISO datetime
  recipients: string[];      // emails envoyés
  pdfUri?: string;           // URL Storage du PDF envoyé
  subject?: string;          // sujet du mail
}

/** Type de lot de réception (modules métier) */
export type PVLotType =
  | 'plomberie'
  | 'electricite'
  | 'menuiserie'
  | 'sols'           // carrelage, parquet, lino, etc.
  | 'murs'           // peinture, papier peint, faïence
  | 'plafond'        // peinture, faux-plafond, spots
  | 'sanitaire'      // évier, lavabo, baignoire, douche, robinetterie
  | 'cuisine'        // équipée, plan de travail (pour pièce Cuisine)
  | 'climatisation'  // VMC, clim, chauffage
  | 'autre';

/** Lot vérifié dans une pièce */
export interface PVPieceLot {
  id: string;
  type: PVLotType;
  libelle?: string;          // override du label par défaut (ex: "Plomberie principale")
                             // si type='autre' : libellé libre obligatoire
  conforme: boolean | null;  // null = non contrôlé (par défaut)
  reserve?: string;          // description de la réserve si non-conforme
  photos?: string[];         // jusqu'à 5 URLs Storage
}

/** Pièce du chantier (Cuisine, Chambre 1, ...) */
export interface PVPiece {
  id: string;
  nom: string;                // "Cuisine", "Chambre 1", "Chambre parents"
  ordre?: number;             // pour l'ordre d'affichage
  lots: PVPieceLot[];
}

/** PV de réception complet */
export interface PVReception {
  // Identification
  numeroPV?: string;                  // format "PV-2026-001" (auto-généré)
  dateReception?: string;             // YYYY-MM-DD (date prévue ou effective)

  // Checklist :
  // - Anciens PV : items[] (catégories plates) — préservé pour rétrocompat
  // - Nouveaux PV : pieces[] (par pièce + par lot) — créé par PV-3
  items?: PVItem[];                   // ⚠️ optionnel (legacy)
  pieces?: PVPiece[];                 // structure pièce → lots (nouveau)

  // Modalité paiement (modifiable avant clôture)
  paiementRetenueGarantie?: PVPaiement;

  // Signatures
  signatureEntrepriseUri?: string;    // URL Storage signature SK DECO (admin)
  signatureEntrepriseDate?: string;   // ISO datetime
  signatureClientUri?: string;        // URL Storage signature client/MO
  signatureClientDate?: string;       // ISO datetime
  nomSignataire?: string;             // nom du signataire client (optionnel)

  // État
  clotureLe?: string;                 // ISO datetime — posé quand les 2 signatures présentes

  // Levées de réserves (post-clôture)
  levees?: LeveeReserve[];

  // Historique mail
  mailHistory?: PVMailEnvoi[];
}

/** Catalogue de pièces standards (utilisable comme template) */
export const PIECES_DEFAULT = [
  'Cuisine',
  'Salon',
  'Salle à manger',
  'Salon/Salle à manger',     // alternative pour open-space
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

/** Lots par défaut suggérés selon le type de pièce */
export const LOTS_BY_PIECE_TYPE: Record<string, PVLotType[]> = {
  // Pièces humides
  'Cuisine':              ['plomberie', 'electricite', 'sols', 'murs', 'plafond', 'cuisine'],
  'SdB':                  ['plomberie', 'electricite', 'sols', 'murs', 'plafond', 'sanitaire', 'climatisation'],
  'WC':                   ['plomberie', 'electricite', 'sols', 'murs', 'sanitaire'],
  'Buanderie':            ['plomberie', 'electricite', 'sols', 'murs'],

  // Pièces sèches
  'Salon':                ['electricite', 'sols', 'murs', 'plafond', 'menuiserie', 'climatisation'],
  'Salle à manger':       ['electricite', 'sols', 'murs', 'plafond', 'menuiserie', 'climatisation'],
  'Salon/Salle à manger': ['electricite', 'sols', 'murs', 'plafond', 'menuiserie', 'climatisation'],
  'Chambre':              ['electricite', 'sols', 'murs', 'plafond', 'menuiserie', 'climatisation'],
  'Bureau':               ['electricite', 'sols', 'murs', 'plafond', 'menuiserie'],
  'Dressing':             ['electricite', 'sols', 'murs', 'menuiserie'],

  // Circulations
  'Couloir':              ['electricite', 'sols', 'murs', 'plafond'],
  'Entrée':               ['electricite', 'sols', 'murs', 'plafond', 'menuiserie'],

  // Annexes
  'Garage':               ['electricite', 'sols', 'murs'],
  'Cave':                 ['electricite', 'sols', 'murs'],
  'Terrasse':             ['sols', 'murs'],
  'Balcon':               ['sols', 'murs'],
  'Extérieur':            ['murs'],
};

/** Helper : retourne les lots par défaut pour une pièce donnée
 * (matching tolérant : "Chambre 1" → "Chambre", "SdB 2" → "SdB")
 */
export function getLotsByPieceName(pieceName: string): PVLotType[] {
  const normalized = pieceName.trim();

  // Match exact d'abord
  if (LOTS_BY_PIECE_TYPE[normalized]) {
    return LOTS_BY_PIECE_TYPE[normalized];
  }

  // Match par préfixe (ex: "Chambre 3" → "Chambre")
  const prefixMatch = Object.keys(LOTS_BY_PIECE_TYPE).find(key =>
    normalized.toLowerCase().startsWith(key.toLowerCase())
  );
  if (prefixMatch) return LOTS_BY_PIECE_TYPE[prefixMatch];

  // Fallback : lots génériques pour pièce sèche
  return ['electricite', 'sols', 'murs', 'plafond'];
}

/** Labels FR des types de lots */
export const PV_LOT_LABELS: Record<PVLotType, string> = {
  plomberie:     'Plomberie',
  electricite:   'Électricité',
  menuiserie:    'Menuiserie',
  sols:          'Sols',
  murs:          'Murs',
  plafond:       'Plafond',
  sanitaire:     'Sanitaire',
  cuisine:       'Cuisine équipée',
  climatisation: 'Climatisation/VMC',
  autre:         'Autre',
};
