/**
 * Types pour le PV de réception de chantier.
 * Extrait depuis le type inline dans Chantier (rétrocompat préservée).
 */

/** Item d'une checklist de réception (1 vérification) */
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
  itemId: string;            // référence à PVItem.id
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

/** PV de réception complet */
export interface PVReception {
  // Identification
  numeroPV?: string;                  // format "PV-2026-001" (auto-généré)
  dateReception?: string;             // YYYY-MM-DD (date prévue ou effective)

  // Checklist
  items: PVItem[];

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
