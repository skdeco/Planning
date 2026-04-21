/**
 * Métier : string libre pour permettre à l'admin d'ajouter ses propres métiers.
 * Les métiers par défaut sont prédéfinis, mais l'admin peut en créer autant qu'il veut.
 */
export type Metier = string;

export interface MetierInfo {
  label: string;
  color: string;
  textColor: string;
}

/** Métier personnalisé (ajouté par l'admin) */
export interface MetierPerso {
  id: string;        // slug unique ex: 'staffeur'
  label: string;     // nom affiché ex: 'Staffeur'
  color: string;     // couleur du badge
  textColor: string; // couleur du texte
}

/** Métiers prédéfinis (toujours disponibles) */
export const METIER_COLORS_DEFAULT: Record<string, MetierInfo> = {
  electricien:   { label: 'Électricien',    color: '#FFB800', textColor: '#000' },
  plombier:      { label: 'Plombier',       color: '#0088FF', textColor: '#fff' },
  macon:         { label: 'Maçon',          color: '#888888', textColor: '#fff' },
  peintre:       { label: 'Peintre',        color: '#9B59B6', textColor: '#fff' },
  menuisier:     { label: 'Menuisier',      color: '#A0522D', textColor: '#fff' },
  plaquiste:     { label: 'Plaquiste',      color: '#FF6B35', textColor: '#fff' },
  carreleur:     { label: 'Carreleur',      color: '#27AE60', textColor: '#fff' },
  chef_chantier: { label: 'Chef de chantier', color: '#E74C3C', textColor: '#fff' },
  autre:         { label: 'Autre',          color: '#AAAAAA', textColor: '#fff' },
};

/** Palette de couleurs pour les nouveaux métiers personnalisés */
export const METIER_PERSO_COLORS = [
  '#16A085', '#D35400', '#2C3E50', '#8E44AD', '#1ABC9C',
  '#E91E63', '#607D8B', '#795548', '#00BCD4', '#FF5722',
];

/**
 * METIER_COLORS dynamique : combine les métiers par défaut + les métiers perso de l'admin.
 * Utiliser getMetierColors(data.metiersPerso) partout au lieu de METIER_COLORS directement.
 */
export function getMetierColors(metiersPerso?: MetierPerso[]): Record<string, MetierInfo> {
  const result: Record<string, MetierInfo> = { ...METIER_COLORS_DEFAULT };
  (metiersPerso || []).forEach(m => {
    result[m.id] = { label: m.label, color: m.color, textColor: m.textColor };
  });
  return result;
}

/** Rétro-compatibilité : METIER_COLORS = les métiers par défaut */
export const METIER_COLORS: Record<string, MetierInfo> = METIER_COLORS_DEFAULT;

/** Liste des métiers par défaut */
export const METIERS_LIST_DEFAULT: string[] = [
  'electricien', 'plombier', 'macon', 'peintre', 'menuisier',
  'plaquiste', 'carreleur', 'chef_chantier', 'autre',
];

/** Liste dynamique des métiers (défaut + perso) */
export function getMetiersList(metiersPerso?: MetierPerso[]): string[] {
  const persoIds = (metiersPerso || []).map(m => m.id);
  return [...METIERS_LIST_DEFAULT.filter(m => m !== 'autre'), ...persoIds, 'autre'];
}

/** Rétro-compatibilité */
export const METIERS_LIST: string[] = METIERS_LIST_DEFAULT;

export type StatutChantier = 'actif' | 'en_attente' | 'termine' | 'en_pause' | 'sav';

export const STATUT_LABELS: Record<StatutChantier, string> = {
  actif: 'En cours',
  en_attente: 'En attente',
  termine: 'Terminé',
  en_pause: 'En pause',
  sav: 'SAV',
};

export const STATUT_COLORS: Record<StatutChantier, { bg: string; text: string }> = {
  actif:      { bg: '#D4EDDA', text: '#155724' },
  en_attente: { bg: '#FFF3CD', text: '#856404' },
  termine:    { bg: '#D1ECF1', text: '#0C5460' },
  en_pause:   { bg: '#F8D7DA', text: '#721C24' },
  sav:        { bg: '#E8DAEF', text: '#6C3483' },
};

export const CHANTIER_COLORS = [
  '#1A3A6B', '#9B59B6', '#27AE60', '#E74C3C',
  '#0088FF', '#FF6B35', '#FFB800', '#A0522D',
];

/** Palette de couleurs pour les employés (badge dans le planning) */
export const EMPLOYE_COLORS = [
  '#1A3A6B', '#9B59B6', '#27AE60', '#E74C3C',
  '#0088FF', '#FF6B35', '#FFB800', '#A0522D',
  '#16A085', '#D35400', '#2C3E50', '#8E44AD',
  '#1ABC9C', '#E91E63', '#607D8B', '#795548',
];

/** Retourne la couleur d'un employé (couleur perso ou fallback par métier) */
export function getEmployeColor(employe: { couleur?: string; metier: Metier }): string {
  return employe.couleur || METIER_COLORS[employe.metier]?.color || '#1A3A6B';
}

/** Horaires théoriques pour un jour de la semaine */
export interface HorairesJour {
  actif: boolean;      // true si l'employé travaille ce jour
  debut: string;       // HH:MM
  fin: string;         // HH:MM
}

/** Horaires hebdomadaires de l'employé (0=Dim, 1=Lun, ..., 6=Sam) */
export type HorairesHebdo = Record<number, HorairesJour>;

export const HORAIRES_DEFAUT: HorairesHebdo = {
  0: { actif: false, debut: '08:00', fin: '17:00' }, // Dimanche
  1: { actif: true,  debut: '08:00', fin: '17:00' }, // Lundi
  2: { actif: true,  debut: '08:00', fin: '17:00' }, // Mardi
  3: { actif: true,  debut: '08:00', fin: '17:00' }, // Mercredi
  4: { actif: true,  debut: '08:00', fin: '17:00' }, // Jeudi
  5: { actif: true,  debut: '08:00', fin: '17:00' }, // Vendredi
  6: { actif: false, debut: '08:00', fin: '12:00' }, // Samedi
};

export interface Employe {
  id: string;
  prenom: string;
  nom: string;
  metier: Metier;
  role: 'admin' | 'employe';
  identifiant: string;
  motDePasse: string;
  couleur?: string;          // couleur personnalisée dans le planning
  salaireNet?: number;       // salaire net mensuel en euros (admin only)
  modeSalaire?: 'mensuel' | 'journalier'; // mensuel (fixe) ou journalier (nb jours ouvrables × tarif)
  tarifJournalier?: number;  // tarif journalier en euros (si modeSalaire === 'journalier')
  horaires?: HorairesHebdo;  // horaires théoriques par jour de semaine
  isAcheteur?: boolean;      // peut voir et gérer les listes matériel
  isRH?: boolean;            // accès au module Ressources Humaines
  isCommercial?: boolean;    // accès au module Commercial (devis/facturation)
  doitPointer?: boolean;     // true = l'employé doit pointer (défaut true)
  telephone?: string;        // numéro de téléphone
  email?: string;            // adresse email
  photoProfil?: string;      // base64 URI ou URL de la photo de profil
  penseBete?: string;        // ancien format texte simple (migration)
  penseBetes?: { id: string; chantierId?: string; texte: string; createdAt: string }[]; // notes par chantier
  pushToken?: string;        // Expo Push Token pour notifications push
  retardAfficheEmploye?: boolean; // true = l'employé voit ses propres retards dans le reporting
}

/** Fiche chantier : carte d'identité du chantier visible par tous les employés affectés */
export interface FicheChantier {
  codeAcces: string;        // code digicode / badge
  emplacementCle: string;   // où est la clé
  photoEmplacementCle?: string; // photo de la cachette de la clé (base64)
  codeAlarme: string;       // code alarme
  contacts: string;         // contacts utiles (gardien, proprio...)
  contactSyndic?: string;   // numéro syndic
  contactGardien?: string;  // numéro gardien
  contactPlombier?: string; // numéro plombier immeuble
  contactLibre?: string;    // contact libre (admin only)
  syndic?: string;          // alias legacy pour contactSyndic
  gardien?: string;         // alias legacy pour contactGardien
  plombier?: string;        // alias legacy pour contactPlombier
  noteAdmin?: string;       // note confidentielle admin uniquement
  notes: string;            // notes libres
  photos: string[];         // URIs base64 (photos, plans, PDF)
  plans?: PlanChantier[];   // plans PDF avec visibilité
  plansVisibilite?: 'tous' | 'employes' | 'soustraitants'; // visibilité globale des plans
  updatedAt: string;        // ISO datetime de dernière modification
}

/** Plan PDF attaché à un chantier */
export interface PlanChantier {
  id: string;
  nom: string;              // nom du plan (ex: "Plan RDC")
  fichier: string;          // base64 URI du PDF
  visiblePar: 'tous' | 'employes' | 'soustraitants' | 'admin' | 'specifique'; // qui peut voir
  visibleIds?: string[];    // IDs spécifiques (employés ou ST) si visiblePar === 'specifique'
  uploadedAt: string;
}

export interface Chantier {
  id: string;
  nom: string;
  adresse: string;          // adresse complète (legacy — gardée pour compatibilité)
  rue?: string;             // rue (ex: "45 avenue Foch")
  codePostal?: string;      // code postal (ex: "75016")
  ville?: string;           // ville (ex: "Paris")
  pays?: string;            // pays (ex: "France")
  dateDebut: string; // YYYY-MM-DD
  dateFin: string;   // YYYY-MM-DD
  statut: StatutChantier;
  visibleSurPlanning: boolean;
  employeIds: string[];
  couleur: string;
  latitude?: number;        // coordonnées GPS du chantier
  longitude?: number;       // coordonnées GPS du chantier
  fiche?: FicheChantier;   // fiche chantier (optionnelle)
  ordre?: number;           // ordre d'affichage dans le planning (0 = premier)
  // Legacy : client en texte libre
  client?: string;
  // Liens vers les 4 contacts externes (Apporteur selon son type)
  architecteId?: string;       // lié à un Apporteur type 'architecte'
  apporteurId?: string;        // lié à un Apporteur type 'apporteur'
  contractantId?: string;      // lié à un Apporteur type 'contractant'
  clientApporteurId?: string;  // lié à un Apporteur type 'client'
  // Portail client : photos sélectionnées pour affichage
  photosPortailClient?: string[];  // IDs des photos visibles dans le portail client
  // Avancement par corps de métier (affiché dans le portail client)
  avancementCorps?: {
    id: string;
    nom: string;
    pourcentage: number;
    montant?: number;
    commentaire?: string;                 // note admin visible par externes
    photos?: string[];                    // URIs des photos attachées au lot
    photosAvant?: string[];               // photos "avant travaux"
    photosApres?: string[];               // photos "après travaux"
    dateDebutPrevue?: string;             // YYYY-MM-DD
    dateFinPrevue?: string;               // YYYY-MM-DD
    enCours?: boolean;                    // marqué "en cours de réalisation"
    commentairesClient?: Array<{
      id: string;
      auteurId: string;                   // apporteurId ou 'admin'
      auteurNom: string;
      auteurType: 'admin' | 'client' | 'architecte' | 'apporteur' | 'contractant';
      texte: string;
      createdAt: string;                  // ISO datetime
      luParAdmin?: boolean;
      luParExternes?: string[];           // ids apporteurs qui ont lu
    }>;
    updatedAt?: string;                   // ISO datetime — pour détecter "nouveau"
  }[];
  // Historique des points financiers de situation figés (avant émission facture)
  situationsHistorique?: SituationFigee[];
  // Décomposition TVA extraite du devis (ex : [{taux:5.5, montant:55}, {taux:20, montant:16000}])
  devisTVABreakdown?: { taux: number; montant: number }[];
  // Total TTC extrait du devis (utilisé comme vérité pour calculer la part TTC de chaque situation)
  devisTotalTTC?: number;
  // Statut du chantier (pour filtrer actifs vs clôturés côté externes)
  statutChantier?: 'actif' | 'cloture';
  // Option admin : afficher ou masquer le planning approximatif du chantier aux externes (clients notamment)
  afficherPlanningAuClient?: boolean;  // par défaut true pour architectes/apporteurs, à confirmer pour client
  // Dernière vue du chantier par utilisateur externe (pour détecter "nouveau")
  dernieresVuesParApporteur?: Record<string, string>;  // apporteurId → ISO datetime
  // Dernière mise à jour "significative" (lot modifié, commentaire, situation figée)
  derniereMajContenu?: string;          // ISO datetime
}

/** Snapshot figé d'un point financier de situation (avant émission d'une facture). */
export interface SituationFigee {
  id: string;
  numero: string;                 // "PFS-2026-001"
  date: string;                   // ISO date (figement)
  lignes: {
    id: string;
    nom: string;
    montantLotHT: number;
    pourcentage: number;
    montantFactureHT: number;
  }[];
  totalHT: number;                // cumulé avancement × montants
  tva: number;
  totalTTC: number;
  dejaPayeAvant: number;          // somme des situations payées antérieures (TTC)
  montantSituation: number;       // TTC à demander sur CE point = totalTTC - dejaPayeAvant
  statut: 'en_attente' | 'payee';
  numeroFacture?: string;         // n° de facture créée dans le logiciel externe
  paidAt?: string;                // ISO datetime de paiement
  notes?: string;
}

/** Une tâche dans la checklist d'une note */
export interface TaskItem {
  id: string;
  texte: string;       // libellé de la tâche
  fait: boolean;       // cochée ou non
  faitPar?: string;    // nom de celui qui a coché
  faitAt?: string;     // ISO datetime du cochage
  photos?: string[];   // URIs photos de preuve
}

/** Une note laissée par un utilisateur (admin ou employé) sur une cellule du planning */
export interface Note {
  id: string;
  auteurId: string;    // 'admin' ou l'id de l'employé
  auteurNom: string;   // nom affiché
  date: string;        // YYYY-MM-DD : le jour exact auquel cette note est rattachée
  texte: string;
  photos: string[];    // URIs base64 ou file URI
  tasks?: TaskItem[];  // liste de tâches avec cases à cocher
  visiblePar?: 'tous' | 'employes' | 'soustraitants' | string[]; // visibilité : 'tous', 'employes', 'soustraitants', ou liste d'IDs spécifiques
  savTicketId?: string; // lié à un ticket SAV
  createdAt: string;   // ISO datetime
  updatedAt: string;   // ISO datetime
}

export type LieuTravail = 'chantier' | 'atelier';

export interface Affectation {
  id: string;
  chantierId: string;
  employeId: string;          // id employé OU 'st:{soustraitantId}' pour un ST
  soustraitantId?: string;    // défini si c'est une affectation ST
  dateDebut: string; // YYYY-MM-DD
  dateFin: string;   // YYYY-MM-DD
  lieu?: LieuTravail;         // 'chantier' (défaut) ou 'atelier'
  notes: Note[];     // tableau de notes (multi-auteurs, multi-notes)
}

/** Un acompte versé à un employé */
export interface Acompte {
  id: string;
  employeId: string;
  date: string;        // YYYY-MM-DD
  montant: number;     // en euros
  commentaire: string; // ex: "Acompte semaine 12"
  createdAt: string;   // ISO datetime
}

/** Catégories obligatoires de documents légaux sous-traitant */
export type DocumentSTType =
  | 'kbis'                    // K-bis de moins de 3 mois
  | 'carte_identite_gerant'   // Carte d'identité du gérant
  | 'attestation_vigilance_urssaf'   // Attestation de vigilance URSSAF
  | 'attestation_affiliation_urssaf' // Attestation d'affiliation URSSAF
  | 'attestation_rc_pro'      // Attestation RC Pro
  | 'attestation_decennale'   // Attestation Décennale
  | 'contrat_sous_traitance'  // Contrat de sous-traitance
  | 'autre';                  // Autre document libre

export const DOCUMENT_ST_LABELS: Record<DocumentSTType, string> = {
  kbis: 'K-bis de moins de 3 mois',
  carte_identite_gerant: 'Carte d\'identité du gérant',
  attestation_vigilance_urssaf: 'Attestation de vigilance URSSAF',
  attestation_affiliation_urssaf: 'Attestation d\'affiliation URSSAF',
  attestation_rc_pro: 'Attestation RC Pro',
  attestation_decennale: 'Attestation Décennale',
  contrat_sous_traitance: 'Contrat de sous-traitance',
  autre: 'Autre document',
};

/** Document légal d'un sous-traitant (Kbis, assurance, etc.) */
export interface DocumentST {
  id: string;
  libelle: string;      // ex: "Kbis", "Assurance décennale"
  type?: DocumentSTType; // catégorie obligatoire
  fichier: string;      // base64 URI
  uploadedAt: string;   // ISO datetime
  uploadeParAdmin?: boolean; // true si uploadé par l'admin (ex: contrat à signer)
  confirme?: boolean;   // true si le ST a confirmé l'envoi définitif
  confirmeAt?: string;  // ISO datetime de confirmation
  expirationDate?: string; // YYYY-MM-DD date d'expiration du document
}

/** Acompte versé à un sous-traitant pour un devis donné */
export interface AcompteST {
  id: string;
  devisId: string;      // référence au DevisST
  date: string;         // YYYY-MM-DD
  montant: number;      // en euros
  commentaire: string;
  facture?: string;     // base64 URI de la facture uploadée par le ST
  createdAt: string;
}

/** Devis d'un sous-traitant pour un chantier (plusieurs devis possibles par chantier/ST) */
export interface DevisST {
  id: string;
  soustraitantId: string;
  chantierId: string;
  objet: string;          // ex: "Peinture", "Suppléments", champ libre
  prixConvenu: number;    // montant total convenu en euros
  devisFichier?: string;  // base64 URI du devis uploadé par le ST
  devisSigne?: string;    // base64 URI du devis signé retourné par l'admin
  createdAt: string;
}

/** Alias pour compatibilité ascendante */
export type MarcheST = DevisST;

/** Un sous-traitant */
export interface SousTraitant {
  id: string;
  societe: string;          // nom de la société / raison sociale
  prenom: string;
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  identifiant: string;
  motDePasse: string;
  documents: DocumentST[];  // documents légaux
  couleur: string;          // couleur dans le planning
  pushToken?: string;       // Expo Push Token pour notifications push
}

/** Un architecte, apporteur d'affaires, contractant ou client associé aux chantiers */
export interface Apporteur {
  id: string;
  type: 'architecte' | 'apporteur' | 'contractant' | 'client';
  prenom: string;
  nom: string;
  societe?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  siret?: string;
  notes?: string;
  // Accès externe (optionnel) : l'admin peut activer un accès à l'app pour ce contact
  identifiant?: string;        // login pour se connecter
  motDePasse?: string;         // (legacy) mot de passe en clair — migré vers hash au premier login
  motDePasseHash?: string;     // hash SHA-256(salt + mdp) — utilisé pour l'auth
  motDePasseSalt?: string;     // salt aléatoire par compte
  motDePasseVisible?: string;  // copie visible côté admin seulement (masquée par défaut avec œil)
  accesApp?: boolean;          // true si l'admin a activé l'accès à l'app
  derniereConnexion?: string;  // ISO datetime
  createdAt: string;
  updatedAt: string;
}

/** Libellés / emojis / couleurs pour les 4 types d'Apporteur */
export const APPORTEUR_TYPE_LABELS: Record<string, { label: string; emoji: string; couleur: string }> = {
  architecte:  { label: 'Architecte',             emoji: '📐', couleur: '#6B8EBF' },
  apporteur:   { label: "Apporteur d'affaires",   emoji: '🤝', couleur: '#C9A96E' },
  contractant: { label: 'Contractant',            emoji: '🔗', couleur: '#10B981' },
  client:      { label: 'Client',                 emoji: '👤', couleur: '#E5A840' },
};

/** Commission versée à un apporteur sur un marché */
export interface CommissionApporteur {
  apporteurId: string;
  modeCommission: 'montant' | 'pourcentage';
  valeur: number;          // soit montant en €, soit pourcentage (ex: 5 pour 5%)
  baseCalcul?: 'HT' | 'TTC'; // si pourcentage : base de calcul
  statut: 'a_payer' | 'paye';
  datePaiement?: string;   // YYYY-MM-DD
  note?: string;
}

/** Un pointage (début ou fin de journée) enregistré par un employé */
export interface Pointage {
  id: string;
  employeId: string;
  chantierId?: string;      // chantier concerné (multi-chantier pointage)
  type: 'debut' | 'fin';   // début ou fin de journée
  date: string;            // YYYY-MM-DD
  heure: string;           // HH:MM
  timestamp: string;       // ISO datetime complet
  latitude: number | null;
  longitude: number | null;
  adresse: string | null;  // adresse résolue ou coordonnées brutes
  noteRetard?: string;     // note explicative (retard, oubli, etc.)
  saisiManuellement?: boolean; // true si saisi par admin/RH (pas par l'employé)
  saisiPar?: string;       // nom de l'admin/RH qui a saisi
  saisieManuelle?: boolean; // alias pour saisiManuellement
  saisieParId?: string;    // id de l'admin/RH qui a saisi
  note?: string;           // note libre sur ce pointage
}

/** Retard planifié à l'avance par un employé */
export interface RetardPlanifie {
  id: string;
  employeId: string;
  date: string;            // YYYY-MM-DD : le jour du retard prévu
  heureArrivee: string;    // HH:MM : heure d'arrivée prévue
  motif: string;           // explication du retard
  createdAt: string;       // ISO datetime
  lu?: boolean;            // true si l'admin/RH a pris connaissance
}

/** Intervention d'une entreprise externe sur un chantier (menuiserie, livraison, contrôle...) */
export interface Intervention {
  id: string;
  chantierId: string;
  libelle: string;       // ex: "Menuiserie Dupont", "Livraison matériaux"
  description?: string;  // détails optionnels
  dateDebut: string;     // YYYY-MM-DD
  dateFin: string;       // YYYY-MM-DD
  couleur: string;       // couleur du bandeau dans le planning
  createdAt: string;
}

/** Palette de couleurs pour les interventions externes */
export const INTERVENTION_COLORS = [
  '#FF9800', '#F44336', '#E91E63', '#9C27B0',
  '#673AB7', '#FF5722', '#795548', '#607D8B',
];

/** Un article dans une liste matériel */
export interface MateriauItem {
  id: string;
  texte: string;          // libellé de l'article
  quantite?: string;      // quantité optionnelle (ex: "3 rouleaux")
  commentaire?: string;   // commentaire libre de l'employé (précisions, marque, etc.)
  catalogueArticleId?: string; // lien vers le catalogue (pour vérifier la dispo)
  fournisseur?: string;   // fournisseur prévu (sélectionné à la création)
  achete: boolean;        // coché par l'acheteur
  achetePar?: string;     // nom de l'acheteur
  acheteAt?: string;      // ISO datetime
  prixReel?: number;      // prix d'achat réel (€)
  fournisseurReel?: string; // fournisseur réel d'achat
  ajoutePar?: string;     // nom de l'employé qui a ajouté l'article
  splitFromItemId?: string; // id de l'item d'origine si créé par un achat partiel (pour merge au désarchivage)
  createdAt: string;
}

/** Liste matériel créée par un employé pour un chantier */
export interface ListeMateriau {
  id: string;
  chantierId: string;
  employeId: string;      // employé qui a créé la liste
  items: MateriauItem[];
  createdAt: string;
  updatedAt: string;
}

// ─── Module RH ──────────────────────────────────────────────────────────────

/** Statut d'une demande RH */
export type StatutDemande = 'en_attente' | 'approuve' | 'refuse';

export const STATUT_DEMANDE_LABELS: Record<StatutDemande, string> = {
  en_attente: 'En attente',
  approuve: 'Approuvé',
  refuse: 'Refusé',
};

export const STATUT_DEMANDE_COLORS: Record<StatutDemande, { bg: string; text: string }> = {
  en_attente: { bg: '#FFF3CD', text: '#856404' },
  approuve:   { bg: '#D4EDDA', text: '#155724' },
  refuse:     { bg: '#F8D7DA', text: '#721C24' },
};

/** Demande de congés payés */
export interface DemandeConge {
  id: string;
  employeId: string;
  dateDebut: string;      // YYYY-MM-DD
  dateFin: string;        // YYYY-MM-DD
  motif?: string;         // motif optionnel
  statut: StatutDemande;
  commentaireRH?: string; // réponse de l'admin/RH
  createdAt: string;
  updatedAt: string;
}

/** Déclaration d'arrêt maladie */
export interface ArretMaladie {
  id: string;
  employeId: string;
  dateDebut: string;      // YYYY-MM-DD
  dateFin?: string;       // YYYY-MM-DD (peut être inconnu au départ)
  fichier?: string;       // base64 URI du justificatif (ancien champ)
  justificatif?: string;  // base64 URI du justificatif (nouveau champ)
  statut: StatutDemande;
  commentaireRH?: string;
  createdAt: string;
  updatedAt: string;
}

/** Demande d'avance sur salaire */
export interface DemandeAvance {
  id: string;
  employeId: string;
  montant: number;        // en euros
  motif?: string;
  statut: StatutDemande;
  commentaireRH?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fiche de paie (document uploadé par l'admin/RH) */
export interface FichePaie {
  id: string;
  employeId: string;
  mois: string;           // YYYY-MM (ex: 2026-03)
  fichier: string;        // base64 URI ou URL
  uploadedAt: string;
}

// ─── Module Suivi Chantier ──────────────────────────────────────────────────

/** Une dépense enregistrée sur un chantier */
export interface DepenseChantier {
  id: string;
  chantierId: string;
  libelle: string;          // description de la dépense
  montant: number;          // montant HT en euros
  montantTTC?: number;      // montant TTC en euros
  date: string;             // YYYY-MM-DD
  categorie?: string;       // catégorie libre (ex: 'achat', 'location', 'sous-traitance')
  fournisseur?: string;     // nom du fournisseur
  fichier?: string;         // base64 URI (photo, scan, PDF — facture)
  note?: string;            // note libre de l'administrateur
  createdAt: string;
  createdBy?: string;       // nom de l'admin qui a saisi
}

/** Un supplément (travaux non prévus au devis) */
export interface SupplementChantier {
  id: string;
  chantierId: string;
  libelle: string;          // description du supplément
  quantite?: number;        // quantité
  unite?: string;           // unité (m², ml, u...)
  prixUnitaire?: number;    // prix unitaire en euros
  montantTotal?: number;    // montant total en euros (calculé ou saisi)
  note?: string;            // note libre
  date: string;             // YYYY-MM-DD
  createdAt: string;
}

/** Document de suivi chantier (devis, facture, compte-rendu, PV...) */
export type DocSuiviType =
  | 'devis_initial_signe'
  | 'facture'
  | 'devis_supplement'
  | 'facture_supplement'
  | 'compte_rendu'
  | 'pv_reception'
  | 'sav'
  | 'autre';

export const DOC_SUIVI_LABELS: Record<DocSuiviType, string> = {
  devis_initial_signe: 'Devis initial signé',
  facture: 'Facture',
  devis_supplement: 'Devis suppléments',
  facture_supplement: 'Facture suppléments',
  compte_rendu: 'Compte-rendu de chantier',
  pv_reception: 'PV de réception',
  sav: 'SAV',
  autre: 'Autre document',
};

/** Document de suivi chantier */
export interface DocSuiviChantier {
  id: string;
  chantierId: string;
  type: DocSuiviType;
  libelle: string;          // titre libre
  fichier: string;          // base64 URI
  commentaire?: string;     // commentaire (ex: pour PV réception, SAV)
  photos?: string[];        // photos supplémentaires (ex: SAV)
  uploadedAt: string;
  uploadedBy?: string;      // nom de l'admin
}

/**
 * Photo de chantier prise par un employé en fin de journée (ou manuellement).
 * Structure arborescente : Chantier > Employé > Date > Photos
 */
export interface PhotoChantier {
  id: string;
  chantierId: string;    // chantier associé
  employeId: string;     // employé qui a pris la photo
  date: string;          // YYYY-MM-DD : jour de la prise de vue
  uri: string;           // base64 URI ou URL de la photo
  nom?: string;          // nom optionnel (ex: "Mur nord")
  legende?: string;      // légende/description (ex: "Mur nord terminé")
  createdAt: string;     // ISO datetime
  source: 'fin_journee' | 'manuel'; // déclenché par pointage fin ou ajout manuel
}

// ─── Documents RH par employé ──────────────────────────────────────────────

/** Type de document RH pour un employé */
export type DocRHType =
  | 'contrat_travail'
  | 'due'
  | 'cni'
  | 'carte_vitale'
  | 'justif_domicile';

export const DOC_RH_LABELS: Record<DocRHType, string> = {
  contrat_travail: 'Contrat de travail',
  due: 'DUE (Déclaration Unique d\'Embauche)',
  cni: 'CNI (Carte Nationale d\'Identité)',
  carte_vitale: 'Carte Vitale',
  justif_domicile: 'Justificatif de domicile',
};

export const DOC_RH_ORDER: DocRHType[] = [
  'contrat_travail',
  'due',
  'cni',
  'carte_vitale',
  'justif_domicile',
];

/** Document RH d'un employé (uploadé par admin/RH, consultable par l'employé concerné) */
export interface DocumentRHEmploye {
  id: string;
  employeId: string;        // employé concerné
  type: DocRHType;          // catégorie du document
  libelle?: string;         // titre libre (ex: "Contrat CDI 2024")
  fichier: string;          // base64 URI ou URL
  uploadedAt: string;       // ISO datetime
  uploadedBy?: string;      // nom de l'admin/RH qui a uploadé
}

/** Catégories de documents société */
export type DocSocieteCategorie =
  | 'juridique'       // Kbis, statuts, RCS, SIRENE
  | 'fiscal'          // liasses, TVA, IS
  | 'social'          // DPAE, URSSAF, Pôle emploi, contrats de travail
  | 'assurances'      // décennale, RC Pro, multirisque, flotte
  | 'bancaire'        // RIB, IBAN, garanties
  | 'certifications'  // Qualibat, RGE, Qualit'EnR, Handibat
  | 'fournisseurs'    // RIB ST, contrats cadres
  | 'divers';         // procurations, PV AG, bail

export const DOC_SOCIETE_CATEGORIES: { key: DocSocieteCategorie; label: string; emoji: string; suggestions: string[] }[] = [
  { key: 'juridique',      label: 'Juridique',      emoji: '⚖️', suggestions: ['Kbis', 'Statuts', 'Certificat RCS', 'Registre SIRENE'] },
  { key: 'fiscal',         label: 'Fiscal',         emoji: '📊', suggestions: ['Liasse fiscale', 'Déclaration TVA', 'Déclaration IS'] },
  { key: 'social',         label: 'Social',         emoji: '👷', suggestions: ['DPAE', 'Attestation URSSAF', 'Bordereau Pôle emploi', 'Contrat de travail'] },
  { key: 'assurances',     label: 'Assurances',     emoji: '🛡️', suggestions: ['Décennale', 'RC Pro', 'Multirisque entreprise', 'Flotte auto'] },
  { key: 'bancaire',       label: 'Bancaire',       emoji: '🏦', suggestions: ['RIB', 'IBAN', 'Garantie bancaire'] },
  { key: 'certifications', label: 'Certifications', emoji: '🏅', suggestions: ['Qualibat', 'RGE', "Qualit'EnR", 'Handibat'] },
  { key: 'fournisseurs',   label: 'Fournisseurs',   emoji: '🤝', suggestions: ['RIB sous-traitant', 'Contrat cadre'] },
  { key: 'divers',         label: 'Divers',         emoji: '📁', suggestions: ['Procuration', "PV d'AG", 'Bail commercial'] },
];

/** Document officiel de la société */
export interface DocumentSociete {
  id: string;
  categorie: DocSocieteCategorie;
  nom: string;                  // libellé libre (ex : "Décennale AXA 2026")
  fichierUri: string;           // URL Supabase ou base64
  fichierNom?: string;          // nom original du fichier
  fichierType?: 'image' | 'pdf';
  dateEmission?: string;        // YYYY-MM-DD
  dateExpiration?: string;      // YYYY-MM-DD — déclenche un rappel
  note?: string;                // texte libre
  uploadedAt: string;
  uploadedBy?: string;
}

/** Livraison attendue sur un chantier */
export interface LivraisonChantier {
  id: string;
  chantierId: string;
  titre: string;
  dateLivraison: string;          // YYYY-MM-DD
  heure?: string;                 // HH:MM
  numeroColis?: string;
  transporteur?: string;
  numeroTransporteur?: string;    // n° suivi
  nomContact?: string;
  telephoneContact?: string;
  adresseLivraison?: string;
  note?: string;
  photoEtiquetteUri?: string;
  recue: boolean;
  recueAt?: string;                // ISO datetime
  recuePhotoUri?: string;
  createdBy: string;               // admin | apporteurId | employeId
  createdByNom?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fréquence d'un RDV de chantier récurrent */
export type FrequenceRdv = 'hebdomadaire' | 'bimensuel' | 'mensuel' | 'ponctuel';

/** Remplacement ponctuel pour une occurrence donnée */
export interface RemplacementRdv {
  dateOccurrence: string;         // YYYY-MM-DD du RDV concerné
  remplacantId: string;           // id employé OU 'apporteur:id'
  remplacantNom: string;
  motif?: string;
}

/** RDV de chantier (hebdo, bi-mensuel, mensuel, ponctuel) */
export interface RdvChantier {
  id: string;
  chantierId: string;
  titre: string;
  dateDebut: string;              // YYYY-MM-DD de la première occurrence
  heureDebut?: string;            // HH:MM (défaut 09:00)
  dureeMinutes: number;           // défaut 90 (1h30)
  frequence: FrequenceRdv;
  jourSemaine?: number;           // 0=lundi ... 6=dimanche (pour hebdo/bimensuel)
  dateFinRecurrence?: string;     // YYYY-MM-DD — s'arrête à cette date
  /** Assigné par défaut : 'admin' ou id employé */
  assigneA: string;
  assigneNom: string;
  /** Participants supplémentaires : architectes, apporteurs, client (visibles chez eux) */
  participants?: string[];        // ids apporteurs
  /** Remplacements ponctuels pour certaines occurrences */
  remplacements?: RemplacementRdv[];
  /** Annulations ponctuelles (dates YYYY-MM-DD annulées) */
  annulations?: string[];
  lieu?: 'chantier' | 'visio' | 'bureau';
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Note/rappel sur un chantier, visible jusqu'à archivage */
export interface NoteChantier {
  id: string;
  chantierId: string;
  auteurId: string;          // 'admin' ou id employé
  auteurNom: string;
  texte: string;
  createdAt: string;         // ISO datetime
  // Destinataires : 'tous' = tout le monde, sinon liste d'IDs (employés/ST)
  destinataires: 'tous' | string[];
  // IDs des personnes ayant archivé cette note
  archivedBy: string[];      // 'admin' ou id employé/ST
  // Pièces jointes (photos base64 ou PDF base64)
  pieceJointe?: string;      // base64 URI (image ou PDF)
  pieceJointeNom?: string;   // nom du fichier
  pieceJointeType?: 'image' | 'pdf'; // type de fichier
  photos?: string[];         // tableau de base64 URIs (images ou PDFs)
  // Historique suppression (admin uniquement)
  deletedBy?: string;        // 'admin' ou id de celui qui a supprimé
  deletedAt?: string;        // ISO datetime de suppression
  deletedNom?: string;       // nom de l'auteur de la suppression
}

/** Note de suivi divers (texte libre + photos) */
export interface NoteSuiviChantier {
  id: string;
  chantierId: string;
  titre?: string;
  texte: string;
  photos?: string[];
  createdAt: string;
  createdBy?: string;
}

/** Journal d'activité — chaque action importante crée une entrée */
export interface ActivityLog {
  id: string;
  timestamp: string;       // ISO datetime
  userId: string;          // id de l'auteur (employeId, 'admin', soustraitantId)
  userName: string;        // prénom/nom lisible
  action: string;          // type d'action : 'pointage', 'affectation', 'conge', 'materiel', etc.
  description: string;     // description courte lisible
  targetId?: string;       // id de l'objet concerné (chantierId, employeId, etc.)
  destinataires?: string[]; // userIds ciblés ; vide = tous (admin notif globale)
  lecturesPar?: { userId: string; lu: string }[]; // accusés de lecture
}

// ─── Marché / Devis / Factures / Acomptes par chantier ─────────────────────

export type ModePaiement = 'virement' | 'cheque' | 'especes' | 'cb' | 'autre';

export const MODES_PAIEMENT: { value: ModePaiement; label: string }[] = [
  { value: 'virement', label: '🏦 Virement' },
  { value: 'cheque', label: '📝 Chèque' },
  { value: 'especes', label: '💵 Espèces' },
  { value: 'cb', label: '💳 Carte' },
  { value: 'autre', label: '❓ Autre' },
];

/** Acompte / paiement reçu sur un marché ou supplément */
export interface PaiementRecu {
  id: string;
  date: string;          // YYYY-MM-DD
  montant: number;       // €
  mode: ModePaiement;
  reference?: string;    // n° chèque, ref virement
  note?: string;
  factureUri?: string;   // facture d'acompte (pdf/image)
  factureNom?: string;
  // Commission sur ce paiement (si le marché parent a une commission configurée)
  commissionFactureUri?: string;  // facture commission liée à ce paiement
  commissionFactureNom?: string;
  commissionMontant?: number;     // montant de la commission calculé (figé au moment du paiement)
  commissionPaye?: boolean;       // true si la commission a été payée à l'apporteur
  commissionDatePaiement?: string;
}

/** Marché principal d'un chantier */
export interface MarcheChantier {
  id: string;
  chantierId: string;
  libelle: string;                  // "Marché initial", "Tranche 1"...
  montantHT: number;
  montantTTC: number;
  devisInitialUri?: string;         // pdf/image devis initial
  devisInitialNom?: string;
  devisSigneUri?: string;           // pdf/image devis signé
  devisSigneNom?: string;
  dateDevis?: string;               // YYYY-MM-DD
  dateSignature?: string;           // YYYY-MM-DD si signé
  signatureClientUri?: string;  // image base64/URL signature client
  signatureClientDate?: string; // ISO datetime
  paiements: PaiementRecu[];
  commission?: CommissionApporteur; // commission versée à un architecte / apporteur d'affaires
  createdAt: string;
  updatedAt: string;
}

/** Statut d'un supplément */
export type StatutSupplement = 'en_attente' | 'accepte' | 'refuse';

/** Supplément (avenant) sur un chantier */
export interface SupplementMarche {
  id: string;
  chantierId: string;
  marcheId?: string;                // marché parent (optionnel)
  libelle: string;
  description?: string;
  montantHT: number;
  montantTTC: number;
  statut: StatutSupplement;         // accepté/refusé/en attente client
  dateProposition?: string;         // YYYY-MM-DD
  dateAccord?: string;              // YYYY-MM-DD si accepté
  devisUri?: string;
  devisNom?: string;
  factureUri?: string;
  factureNom?: string;
  paiements: PaiementRecu[];
  createdAt: string;
  updatedAt: string;
}

// ─── SAV (tickets d'intervention) ─────────────────────────────────────────

export type StatutSAV = 'ouvert' | 'en_cours' | 'resolu' | 'clos';
export type PrioriteSAV = 'basse' | 'normale' | 'haute' | 'urgente';

export interface TicketSAV {
  id: string;
  chantierId: string;
  objet: string;           // ex: "Fuite robinet cuisine"
  description?: string;
  priorite: PrioriteSAV;
  statut: StatutSAV;
  dateOuverture: string;   // YYYY-MM-DD
  dateResolution?: string;
  resoluPar?: string;      // nom de l'employé qui a résolu
  assigneA?: string;       // employeId
  photos?: string[];       // URIs (photos du problème)
  photosResolution?: string[]; // URIs (photos de la résolution)
  fichiers?: { uri: string; nom: string }[]; // PDF/documents joints
  commentaires?: { id: string; auteur: string; texte: string; date: string }[];
  createdAt: string;
  updatedAt: string;
}

// ─── Catalogue articles (matériel) ────────────────────────────────────────
export type CategorieArticle = 'outillage' | 'plomberie' | 'electricite' | 'peinture' | 'maconnerie' | 'menuiserie' | 'quincaillerie' | 'securite' | 'nettoyage' | 'autre';

export const CATEGORIES_ARTICLES: { value: CategorieArticle; label: string }[] = [
  { value: 'outillage', label: 'Outillage' },
  { value: 'plomberie', label: 'Plomberie' },
  { value: 'electricite', label: 'Électricité' },
  { value: 'peinture', label: 'Peinture' },
  { value: 'maconnerie', label: 'Maçonnerie' },
  { value: 'menuiserie', label: 'Menuiserie' },
  { value: 'quincaillerie', label: 'Quincaillerie' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'nettoyage', label: 'Nettoyage' },
  { value: 'autre', label: 'Autre' },
];

export interface ArticleCatalogue {
  id: string;
  nom: string;                  // nom de l'article
  categorie: CategorieArticle;
  description?: string;         // description pour l'employé
  reference?: string;           // référence fournisseur
  marque?: string;              // marque de l'article (Legrand, Schneider, etc.)
  prixUnitaire?: number;        // prix en euros (masqué pour l'employé)
  fournisseur?: string;         // nom du fournisseur
  lienFournisseur?: string;     // URL vers le site du fournisseur
  ficheTechnique?: string;      // URL ou base64 de la fiche technique
  unite?: string;               // unité (pièce, m, m², kg...)
  createdAt: string;
  updatedAt: string;
}

// ─── Agenda admin partagé ──────────────────────────────────────────────────
export interface AgendaEvent {
  id: string;
  titre: string;
  description?: string;
  date: string;            // YYYY-MM-DD
  heureDebut: string;      // HH:MM
  heureFin?: string;       // HH:MM
  lieu?: string;
  couleur: string;
  chantierId?: string;     // chantier associé au RDV
  createdBy: string;       // 'admin' ou identifiant admin
  createdByNom: string;
  invites: string[];       // liste des IDs invités (participants)
  visiblePar: string[];    // IDs qui peuvent voir le RDV sans être invités
  acceptes: string[];      // IDs qui ont accepté
  refuses: string[];       // IDs qui ont refusé
  recurrence?: 'aucune' | 'quotidien' | 'hebdomadaire' | 'mensuel';
  recurrenceFinDate?: string; // YYYY-MM-DD fin de récurrence
  createdAt: string;
}

export interface BadgeEmploye {
  id: string;
  employeId: string;
  type: 'ponctualite' | 'qualite' | 'initiative' | 'equipe' | 'efficacite';
  message?: string;
  envoyePar: string;  // admin name
  createdAt: string;
}

export const BADGE_TYPES: Record<string, { label: string; emoji: string }> = {
  ponctualite: { label: 'Ponctualité', emoji: '⏰' },
  qualite: { label: 'Qualité du travail', emoji: '⭐' },
  initiative: { label: 'Prise d\'initiative', emoji: '💡' },
  equipe: { label: 'Esprit d\'équipe', emoji: '🤝' },
  efficacite: { label: 'Efficacité', emoji: '🚀' },
};

export interface AppData {
  employes: Employe[];
  chantiers: Chantier[];
  affectations: Affectation[];
  pointages: Pointage[];
  acomptes: Acompte[];          // acomptes versés aux employés (admin only)
  sousTraitants: SousTraitant[];
  devis: DevisST[];             // devis sous-traitants (remplace marches)
  marches: DevisST[];           // alias pour compatibilité ascendante
  acomptesst: AcompteST[];      // acomptes versés aux sous-traitants
  interventions: Intervention[]; // interventions entreprises externes
  listesMateriaux: ListeMateriau[]; // listes matériel par chantier/employé
  retardsPlanifies?: RetardPlanifie[]; // retards planifiés à l'avance par les employés
  // Module RH
  demandesConge: DemandeConge[];
  arretsMaladie: ArretMaladie[];
  demandesAvance: DemandeAvance[];
  fichesPaie: FichePaie[];
  // Module Suivi Chantier
  depenses?: DepenseChantier[];
  supplements?: SupplementChantier[];
  docsSuivi?: DocSuiviChantier[];
  notesSuivi?: NoteSuiviChantier[];
  // Alias pour compatibilité ascendante
  depensesChantier?: DepenseChantier[];
  supplementsChantier?: SupplementChantier[];
  docsSuiviChantier?: DocSuiviChantier[];
  notesSuiviChantier?: NoteSuiviChantier[];
  // Galerie photos chantier
  photosChantier?: PhotoChantier[];
  // Documents RH par employé
  documentsRH?: DocumentRHEmploye[];
  documentsSociete?: DocumentSociete[];
  livraisons?: LivraisonChantier[];
  rdvChantiers?: RdvChantier[];
  // Notes chantier (rappels/notifications)
  notesChantier?: NoteChantier[];
  // Historique des notes supprimées (admin uniquement)
  notesChantierSupprimees?: NoteChantier[];
  // Messagerie privée
  messagesPrive?: import('./messages').MessagePrive[];
  // Fiches chantier (données structurées par chantier)
  fichesChantier?: Record<string, any>;
  // Catalogue articles
  catalogueArticles?: ArticleCatalogue[];
  // Agenda admin partagé
  agendaEvents?: AgendaEvent[];
  // Identifiants administrateur (modifiables)
  adminIdentifiant?: string;       // identifiant de connexion admin (défaut : 'admin')
  adminPassword?: string;
  adminPasswordUpdatedAt?: string; // ISO datetime de la dernière modification du mot de passe
  adminEmployeId?: string;         // ID de l'employé lié au compte admin (visible par les autres)
  magasinPrefere?: string;         // Magasin préféré pour vérifier la dispo (ex: "Leroy Merlin Ivry-sur-Seine")
  metiersPerso?: MetierPerso[];    // Métiers personnalisés ajoutés par l'admin
  budgetsChantier?: Record<string, number>; // Budget prévisionnel par chantierId
  fournisseurs?: string[];         // Liste de fournisseurs prédéfinis (personnalisable par l'admin)
  // Plans chantier
  plansChantier?: Record<string, any>;
  // Présences forcées : jours où l'employé était présent sans pointer
  presencesForcees?: { employeId: string; date: string; forcePar?: string }[];
  // Marchés et suppléments par chantier
  marchesChantier?: MarcheChantier[];
  supplementsMarche?: SupplementMarche[];
  // Tickets SAV
  ticketsSAV?: TicketSAV[];
  // Ordre d'affectation quand un employé est sur plusieurs chantiers le même jour
  // clé : "employeId_YYYY-MM-DD", valeur : liste ordonnée de chantierId
  ordreAffectations?: Record<string, string[]>;
  // Ordre personnalisé des chantiers dans la vue Planning (admin, réorganisation par long-press)
  chantierOrderPlanning?: string[];
  // Journal d'activité pour les notifications cross-utilisateurs
  activityLog?: ActivityLog[];
  // Badges motivationnels envoyés aux employés
  badgesEmployes?: BadgeEmploye[];
  // Architectes / Apporteurs d'affaires (commissions sur marchés)
  apporteurs?: Apporteur[];
}

export type UserRole = 'admin' | 'employe' | 'soustraitant' | 'apporteur';

export interface CurrentUser {
  role: UserRole;
  employeId?: string;       // défini si role === 'employe'
  soustraitantId?: string;  // défini si role === 'soustraitant'
  apporteurId?: string;     // défini si role === 'apporteur'
  nom?: string;
}

/** Couleurs disponibles pour les sous-traitants dans le planning */
export const ST_COLORS = [
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A',
  '#CDDC39', '#00ACC1', '#26A69A', '#66BB6A',
];
