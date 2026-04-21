import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadDataFromSupabase, saveDataToSupabase, createManualBackup, mergeDataSafely, LOCAL_DATA_KEY, subscribeToRealtimeUpdates, deleteFileFromStorage } from '@/lib/supabase';

// Clés AsyncStorage pour persister les IDs supprimés entre rechargements
const DELETED_AFFECTATIONS_KEY = 'sk_deleted_affectation_ids';
const DELETED_CHANTIERS_KEY = 'sk_deleted_chantier_ids';
const DELETED_EMPLOYES_KEY = 'sk_deleted_employe_ids';
const DELETED_POINTAGES_KEY = 'sk_deleted_pointage_ids';
const DELETED_GENERIC_KEY = 'sk_deleted_generic_ids';
const DELETED_LISTES_KEY = 'sk_deleted_liste_ids';
const LAST_SEEN_KEY = 'sk_deco_last_seen_at';

// ── Sauvegarde fiable avec retry ──────────────────────────────────────────────
const MAX_RETRY = 3;
const RETRY_DELAY_MS = 2000;

async function safeSaveToSupabase(
  data: Record<string, unknown>,
  onError: (msg: string) => void,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const ok = await saveDataToSupabase(data);
      if (ok) return true;
      console.warn(`[Save] Tentative ${attempt}/${MAX_RETRY} échouée (retour false)`);
    } catch (err) {
      console.warn(`[Save] Tentative ${attempt}/${MAX_RETRY} erreur:`, err);
    }
    if (attempt < MAX_RETRY) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  markPendingSave();
  onError('La sauvegarde vers le serveur a échoué après plusieurs tentatives. Vos données sont conservées localement et seront synchronisées dès que possible.');
  return false;
}

async function safeAsyncStorageSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[AsyncStorage] Erreur écriture ${key}:`, err);
  }
}

function persistDeletedIds(key: string, set: Set<string>): void {
  safeAsyncStorageSet(key, JSON.stringify([...set]));
}

// ── Queue offline : re-tente les sauvegardes échouées ─────────────────────────
const PENDING_SAVE_KEY = 'sk_deco_pending_save';
let offlineRetryTimer: ReturnType<typeof setInterval> | null = null;

async function markPendingSave(): Promise<void> {
  await safeAsyncStorageSet(PENDING_SAVE_KEY, 'true');
}

async function clearPendingSave(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_SAVE_KEY); } catch {}
}

async function hasPendingSave(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PENDING_SAVE_KEY)) === 'true';
  } catch { return false; }
}
import type {
  Employe, Chantier, Affectation, AppData, CurrentUser, Note, Pointage, Acompte, FicheChantier,
  SousTraitant, DevisST, MarcheST, AcompteST, Intervention, TaskItem, ListeMateriau, MateriauItem,
  DemandeConge, ArretMaladie, DemandeAvance, FichePaie, RetardPlanifie,
  DepenseChantier, SupplementChantier, DocSuiviChantier, NoteSuiviChantier,
  PhotoChantier,
  DocumentRHEmploye,
  DocumentSociete,
  LivraisonChantier,
  RdvChantier,
  NoteChantier,
  PlanChantier,
  ActivityLog,
  AgendaEvent,
  ArticleCatalogue,
} from '@/app/types';
import type { MessagePrive } from '@/app/types/messages';
import { EMPLOYE_COLORS } from '@/app/types';

interface AppContextType {
  data: AppData;
  currentUser: CurrentUser | null;
  isHydrated: boolean;
  setCurrentUser: (user: CurrentUser | null) => void;
  addChantier: (chantier: Chantier) => void;
  updateChantier: (chantier: Chantier) => void;
  deleteChantier: (id: string) => void;
  addEmploye: (employe: Employe) => void;
  updateEmploye: (employe: Employe) => void;
  deleteEmploye: (id: string) => void;
  addAffectation: (affectation: Affectation) => void;
  updateAffectation: (affectation: Affectation) => void;
  removeAffectation: (chantierId: string, employeId: string, date: string) => void;
  upsertNote: (params: { chantierId: string; employeId: string; date: string; note: Note; }) => void;
  deleteNote: (affectationId: string, noteId: string) => void;
  toggleTask: (affectationId: string, noteId: string, taskId: string, faitPar: string) => void;
  addTaskPhoto: (affectationId: string, noteId: string, taskId: string, photoUri: string) => void;
  addTask: (affectationId: string, noteId: string, task: TaskItem) => void;
  deleteTask: (affectationId: string, noteId: string, taskId: string) => void;
  addPointage: (pointage: Pointage) => void;
  updatePointage: (pointage: Pointage) => void;
  deletePointage: (id: string) => void;
  addAcompte: (acompte: Acompte) => void;
  deleteAcompte: (id: string) => void;
  upsertFicheChantier: (chantierId: string, fiche: FicheChantier) => void;
  addSousTraitant: (st: SousTraitant) => void;
  updateSousTraitant: (st: SousTraitant) => void;
  deleteSousTraitant: (id: string) => void;
  addApporteur: (a: import('@/app/types').Apporteur) => void;
  updateApporteur: (a: import('@/app/types').Apporteur) => void;
  deleteApporteur: (id: string) => void;
  addDevis: (devis: DevisST) => void;
  updateDevis: (devis: DevisST) => void;
  deleteDevis: (id: string) => void;
  addMarche: (marche: MarcheST) => void;
  updateMarche: (marche: MarcheST) => void;
  deleteMarche: (id: string) => void;
  addAcompteST: (acompte: AcompteST) => void;
  updateAcompteST: (acompte: AcompteST) => void;
  deleteAcompteST: (id: string) => void;
  addIntervention: (intervention: Intervention) => void;
  updateIntervention: (intervention: Intervention) => void;
  deleteIntervention: (id: string) => void;
  // Listes matériel
  upsertListeMateriau: (liste: ListeMateriau) => void;
  deleteListeMateriau: (id: string) => void;
  toggleMateriau: (listeId: string, itemId: string, achetePar: string, prixReel?: number, fournisseurReel?: string) => void;
  addMateriauItem: (listeId: string, item: MateriauItem) => void;
  deleteMateriauItem: (listeId: string, itemId: string) => void;
  // Module RH
  addDemandeConge: (d: DemandeConge) => void;
  updateDemandeConge: (d: DemandeConge) => void;
  deleteDemandeConge: (id: string) => void;
  addArretMaladie: (a: ArretMaladie) => void;
  updateArretMaladie: (a: ArretMaladie) => void;
  deleteArretMaladie: (id: string) => void;
  addDemandeAvance: (d: DemandeAvance) => void;
  updateDemandeAvance: (d: DemandeAvance) => void;
  deleteDemandeAvance: (id: string) => void;
  addFichePaie: (f: FichePaie) => void;
  deleteFichePaie: (id: string) => void;
  // Retards planifiés
  addRetardPlanifie: (r: RetardPlanifie) => void;
  updateRetardPlanifie: (r: RetardPlanifie) => void;
  deleteRetardPlanifie: (id: string) => void;
  // Module Suivi Chantier
  addDepense: (d: DepenseChantier) => void;
  updateDepense: (d: DepenseChantier) => void;
  deleteDepense: (id: string) => void;
  addSupplement: (s: SupplementChantier) => void;
  updateSupplement: (s: SupplementChantier) => void;
  deleteSupplement: (id: string) => void;
  addDocSuivi: (d: DocSuiviChantier) => void;
  updateDocSuivi: (d: DocSuiviChantier) => void;
  deleteDocSuivi: (id: string) => void;
  addNoteSuivi: (n: NoteSuiviChantier) => void;
  updateNoteSuivi: (n: NoteSuiviChantier) => void;
  deleteNoteSuivi: (id: string) => void;
  // Galerie photos chantier
  addPhotoChantier: (p: PhotoChantier) => void;
  addPhotosChantier: (photos: PhotoChantier[]) => void;
  deletePhotoChantier: (id: string) => void;
  // Documents RH employé
  addDocumentRH: (d: DocumentRHEmploye) => void;
  deleteDocumentRH: (id: string) => void;
  addDocumentSociete: (d: DocumentSociete) => void;
  updateDocumentSociete: (d: DocumentSociete) => void;
  deleteDocumentSociete: (id: string) => void;
  addLivraison: (l: LivraisonChantier) => void;
  updateLivraison: (l: LivraisonChantier) => void;
  deleteLivraison: (id: string) => void;
  addRdvChantier: (r: RdvChantier) => void;
  updateRdvChantier: (r: RdvChantier) => void;
  deleteRdvChantier: (id: string) => void;
  // Notes chantier
  addNoteChantier: (n: NoteChantier) => void;
  updateNoteChantier: (n: NoteChantier) => void;
  deleteNoteChantier: (id: string) => void;
  archiveNoteChantier: (noteId: string, userId: string) => void;
  deleteNoteChantierArchivee: (id: string) => void;
  // Plans chantier
  addPlanChantier: (chantierId: string, plan: PlanChantier) => void;
  deletePlanChantier: (chantierId: string, planId: string) => void;
  // Identifiants admin
  updateAdminPassword: (pwd: string) => void;
  updateAdminIdentifiant: (id: string) => void;
  updateAdminEmployeId: (employeId: string | undefined) => void;
  updateMagasinPrefere: (magasin: string | undefined) => void;
  // Métiers personnalisés
  addMetierPerso: (m: import('@/app/types').MetierPerso) => void;
  deleteMetierPerso: (id: string) => void;
  // Budget prévisionnel par chantier
  updateBudgetChantier: (chantierId: string, budget: number | undefined) => void;
  // Fournisseurs prédéfinis
  addFournisseur: (nom: string) => void;
  deleteFournisseur: (nom: string) => void;
  // Ordre affectations (multi-chantiers même jour)
  updateOrdreAffectation: (employeId: string, date: string, orderedChantierIds: string[]) => void;
  // Ordre personnalisé des chantiers dans la vue Planning (réorganisation par long-press)
  updateChantierOrderPlanning: (ids: string[]) => void;
  // Messagerie privée
  addMessagePrive: (m: MessagePrive) => void;
  updateMessagePrive: (m: MessagePrive) => void;
  deleteMessagePrive: (id: string) => void;
  marquerMessagesLus: (conversationId: string, lecteurRole: 'admin' | 'employe' | 'soustraitant') => void;
  // Notifications
  notifications: ActivityLog[];
  markNotificationsRead: () => void;
  // Catalogue articles
  addArticleCatalogue: (article: ArticleCatalogue) => void;
  updateArticleCatalogue: (article: ArticleCatalogue) => void;
  deleteArticleCatalogue: (id: string) => void;
  // Agenda admin
  addAgendaEvent: (event: AgendaEvent) => void;
  updateAgendaEvent: (event: AgendaEvent) => void;
  deleteAgendaEvent: (id: string) => void;
  // Présences forcées
  togglePresenceForcee: (employeId: string, date: string, forcePar?: string) => void;
  // Tickets SAV
  addTicketSAV: (t: import('@/app/types').TicketSAV) => void;
  updateTicketSAV: (t: import('@/app/types').TicketSAV) => void;
  deleteTicketSAV: (id: string) => void;
  // Marchés chantier
  addMarcheChantier: (m: import('@/app/types').MarcheChantier) => void;
  updateMarcheChantier: (m: import('@/app/types').MarcheChantier) => void;
  deleteMarcheChantier: (id: string) => void;
  addSupplementMarche: (s: import('@/app/types').SupplementMarche) => void;
  updateSupplementMarche: (s: import('@/app/types').SupplementMarche) => void;
  deleteSupplementMarche: (id: string) => void;
  // Badges motivationnels
  addBadgeEmploye: (b: import('@/app/types').BadgeEmploye) => void;
  // Sync status
  syncStatus: 'synced' | 'saving' | 'error' | 'offline';
  refreshData: () => Promise<void>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const USER_KEY = 'sk_deco_user';

// ─── Données de démonstration ─────────────────────────────────────────────────
const DEMO_DATA: AppData = {
  employes: [
    { id: 'e1', prenom: 'Sacha',  nom: 'Martin',  metier: 'electricien',   role: 'employe', identifiant: 'sacha',  motDePasse: '1234', couleur: '#1A3A6B' },
    { id: 'e2', prenom: 'Lucas',  nom: 'Bernard', metier: 'plombier',      role: 'employe', identifiant: 'lucas',  motDePasse: '1234', couleur: '#9B59B6' },
    { id: 'e3', prenom: 'Thomas', nom: 'Dupont',  metier: 'macon',         role: 'employe', identifiant: 'thomas', motDePasse: '1234', couleur: '#27AE60' },
    { id: 'e4', prenom: 'Emma',   nom: 'Leroy',   metier: 'peintre',       role: 'employe', identifiant: 'emma',   motDePasse: '1234', couleur: '#E74C3C' },
    { id: 'e5', prenom: 'Hugo',   nom: 'Moreau',  metier: 'chef_chantier', role: 'employe', identifiant: 'hugo',   motDePasse: '1234', couleur: '#0088FF' },
    { id: 'e6', prenom: 'Léa',    nom: 'Simon',   metier: 'carreleur',     role: 'employe', identifiant: 'lea',    motDePasse: '1234', couleur: '#FF6B35' },
    { id: 'e7', prenom: 'Kev',    nom: 'Blanc',   metier: 'macon',         role: 'employe', identifiant: 'kev',    motDePasse: '1234', couleur: '#FFB800' },
  ],
  chantiers: [
    { id: 'c1', nom: 'Résidence Les Pins', adresse: '12 rue des Pins, Lyon', dateDebut: '2026-03-01', dateFin: '2026-06-30', statut: 'actif' as const, employeIds: ['e1', 'e2', 'e6'], visibleSurPlanning: true, couleur: '#1A3A6B' },
    { id: 'c2', nom: 'Appartement Bellecour', adresse: '5 place Bellecour, Lyon', dateDebut: '2026-03-15', dateFin: '2026-05-15', statut: 'actif' as const, employeIds: ['e3', 'e4'], visibleSurPlanning: true, couleur: '#27AE60' },
    { id: 'c3', nom: 'Villa Moderne', adresse: '8 allée des Roses, Villeurbanne', dateDebut: '2026-04-01', dateFin: '2026-07-31', statut: 'en_attente' as const, employeIds: ['e5', 'e7'], visibleSurPlanning: true, couleur: '#9B59B6' },
  ],
  affectations: [
    { id: 'a1', chantierId: 'c1', employeId: 'e1', dateDebut: '2026-03-17', dateFin: '2026-03-21', notes: [] },
    { id: 'a2', chantierId: 'c1', employeId: 'e2', dateDebut: '2026-03-17', dateFin: '2026-03-21', notes: [] },
    { id: 'a3', chantierId: 'c1', employeId: 'e6', dateDebut: '2026-03-17', dateFin: '2026-03-21', notes: [] },
    { id: 'a4', chantierId: 'c2', employeId: 'e3', dateDebut: '2026-03-17', dateFin: '2026-03-21', notes: [] },
    { id: 'a5', chantierId: 'c2', employeId: 'e4', dateDebut: '2026-03-17', dateFin: '2026-03-21', notes: [] },
    { id: 'a6', chantierId: 'c3', employeId: 'e5', dateDebut: '2026-03-17', dateFin: '2026-03-21', notes: [] },
    { id: 'a7', chantierId: 'c3', employeId: 'e7', dateDebut: '2026-03-17', dateFin: '2026-03-21', notes: [] },
  ],
  pointages: [],
  acomptes: [],
  sousTraitants: [],
  devis: [],
  marches: [],
  acomptesst: [],
  interventions: [],
  listesMateriaux: [],
  demandesConge: [],
  arretsMaladie: [],
  demandesAvance: [],
  fichesPaie: [],
};

// ─── DONNÉES VIDES (base propre sans données démo) ────────────────────────
const EMPTY_DATA: AppData = {
  employes: [],
  chantiers: [],
  affectations: [],
  pointages: [],
  acomptes: [],
  sousTraitants: [],
  devis: [],
  marches: [],
  acomptesst: [],
  interventions: [],
  listesMateriaux: [],
  demandesConge: [],
  arretsMaladie: [],
  demandesAvance: [],
  fichesPaie: [],
  retardsPlanifies: [],
  depensesChantier: [],
  supplementsChantier: [],
  docsSuiviChantier: [],
  notesSuiviChantier: [],
  photosChantier: [],
  documentsRH: [],
  messagesPrive: [],
  fichesChantier: {},
  activityLog: [],
};

/**
 * Vérifie si les données sont les données de démonstration.
 * Protège les données réelles contre un écrasement accidentel par les données démo.
 */
function isDemoData(d: AppData): boolean {
  const demoEmployeIds = new Set(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
  const demoChantierIds = new Set(['c1', 'c2', 'c3']);
  if (d.employes.length === 0 || d.chantiers.length === 0) return false;
  const allEmpDemo = d.employes.every(e => demoEmployeIds.has(e.id));
  const allChDemo = d.chantiers.every(c => demoChantierIds.has(c.id));
  return allEmpDemo && allChDemo;
}

function migrateData(parsed: Record<string, any>): AppData {
  // IMPORTANT : cette fonction ne doit JAMAIS supprimer de données existantes.
  // Elle ne fait qu'ajouter les champs manquants avec des valeurs par défaut.
  // Toute modification ici doit être additive, jamais destructive.
  return {
    ...parsed,
    chantiers: parsed.chantiers || [],
    employes: (parsed.employes || []).map((e: any, idx: number) => ({
      ...e,
      identifiant: e.identifiant || e.prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      motDePasse: e.motDePasse || '1234',
      couleur: e.couleur || EMPLOYE_COLORS[idx % EMPLOYE_COLORS.length],
    })),
    affectations: (parsed.affectations || []).map((a: any) => {
      if (!a.notes) {
        const notes: Note[] = [];
        if (a.note && a.note.trim()) {
          notes.push({
            id: `migrated_${a.id}`,
            auteurId: a.employeId,
            auteurNom: 'Employé',
            date: a.dateDebut,
            texte: a.note,
            photos: a.photos || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return { ...a, notes, note: undefined, photos: undefined };
      }
      const migratedNotes = (a.notes || []).map((n: any) => ({
        ...n,
        date: n.date || a.dateDebut,
      }));
      return { ...a, notes: migratedNotes };
    }),
    pointages: parsed.pointages || [],
    acomptes: parsed.acomptes || [],
    sousTraitants: (parsed.sousTraitants || []).map((s: any) => ({
      ...s,
      societe: s.societe || '',
    })),
    devis: parsed.devis || (parsed.marches || []).map((m: any) => ({
      ...m,
      objet: m.description || m.objet || 'Marché',
      devisFichier: m.devisST || m.devisFichier,
    })),
    marches: parsed.devis || parsed.marches || [],
    acomptesst: (parsed.acomptesst || []).map((a: any) => ({
      ...a,
      devisId: a.devisId || a.marcheId || '',
    })),
    interventions: parsed.interventions || [],
    listesMateriaux: parsed.listesMateriaux || [],
    demandesConge: parsed.demandesConge || [],
    arretsMaladie: parsed.arretsMaladie || [],
    demandesAvance: parsed.demandesAvance || [],
    fichesPaie: parsed.fichesPaie || [],
    retardsPlanifies: parsed.retardsPlanifies || [],
    // Modules de suivi chantier (ajoutés progressivement, ne jamais écraser)
    // Support des deux noms (courts et longs) pour compatibilité
    depensesChantier: parsed.depensesChantier || parsed.depenses || [],
    supplementsChantier: parsed.supplementsChantier || parsed.supplements || [],
    docsSuiviChantier: parsed.docsSuiviChantier || parsed.docsSuivi || [],
    notesSuiviChantier: parsed.notesSuiviChantier || parsed.notesSuivi || [],
    depenses: parsed.depenses || parsed.depensesChantier || [],
    supplements: parsed.supplements || parsed.supplementsChantier || [],
    docsSuivi: parsed.docsSuivi || parsed.docsSuiviChantier || [],
    notesSuivi: parsed.notesSuivi || parsed.notesSuiviChantier || [],
    // Notes chantier (ne jamais écraser)
    notesChantier: parsed.notesChantier || [],
    catalogueArticles: parsed.catalogueArticles || [],
    agendaEvents: parsed.agendaEvents || [],
    notesChantierSupprimees: parsed.notesChantierSupprimees || [],
    // Galerie photos (ne jamais écraser)
    photosChantier: parsed.photosChantier || [],
    // Documents RH employé (ne jamais écraser)
    documentsRH: parsed.documentsRH || [],
    // Messagerie privée (ne jamais écraser)
    messagesPrive: parsed.messagesPrive || [],
    // Fiches chantier (ne jamais écraser)
    fichesChantier: parsed.fichesChantier || {},
    // Journal d'activité (ne jamais écraser)
    activityLog: parsed.activityLog || [],
    // Marchés & supplements chantier
    marchesChantier: parsed.marchesChantier || [],
    supplementsMarche: parsed.supplementsMarche || [],
    // Tickets SAV
    ticketsSAV: parsed.ticketsSAV || [],
    // Présences forcées
    presencesForcees: parsed.presencesForcees || [],
    // Ordre affectations multi-chantier
    ordreAffectations: parsed.ordreAffectations || {},
  };
}

// ─── Gestion session unique (un seul onglet actif PAR COMPTE) ────────────────
const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const canUseBroadcast = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined';

/** Canal partagé entre tous les comptes pour notifier les mises à jour en temps réel */
const DATA_CHANNEL = canUseBroadcast ? new BroadcastChannel('sk_deco_data_updates') : null;

/** Notifie tous les autres onglets (tous comptes confondus) qu'une sauvegarde vient d'avoir lieu */
export function notifyDataUpdated(authorSessionId: string): void {
  DATA_CHANNEL?.postMessage({ type: 'DATA_UPDATED', sessionId: authorSessionId });
}

/** Crée un canal BroadcastChannel isolé par compte utilisateur */
function makeSessionChannel(accountKey: string): BroadcastChannel | null {
  if (!canUseBroadcast) return null;
  return new BroadcastChannel(`sk_deco_session_${accountKey}`);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const isHydrated = loaded;
  // Session expirée : un autre onglet plus récent a pris le contrôle
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notifications, setNotifications] = useState<ActivityLog[]>([]);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'error' | 'offline'>('synced');
  // Bannière d'erreur de sauvegarde visible par l'utilisateur
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSaveError = useCallback((msg: string) => {
    setSaveError(msg);
    if (saveErrorTimeout.current) clearTimeout(saveErrorTimeout.current);
    saveErrorTimeout.current = setTimeout(() => setSaveError(null), 15000);
  }, []);
  // Ref pour éviter la sauvegarde au premier chargement
  const isFirstLoad = useRef(true);
  // Ref pour debounce de la sauvegarde Supabase
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref pour stocker les données les plus récentes (évite les closures stale dans le polling)
  const dataRef = useRef<AppData>(EMPTY_DATA);
  // Sets des IDs supprimés — persistés dans AsyncStorage pour survivre aux rechargements
  const deletedAffectationIdsRef = useRef<Set<string>>(new Set());
  const deletedChantierIdsRef = useRef<Set<string>>(new Set());
  const deletedEmployeIdsRef = useRef<Set<string>>(new Set());
  const deletedPointageIdsRef = useRef<Set<string>>(new Set());
  // Set des IDs de listes supprimées localement — le polling ne doit JAMAIS les réintroduire
  const deletedListeIdsRef = useRef<Set<string>>(new Set());
  // Map listeId -> Set<itemId> des items supprimés — le polling ne doit JAMAIS les réintroduire
  const deletedItemIdsRef = useRef<Map<string, Set<string>>>(new Map());
  // Set générique pour toutes les autres entités (acomptes, devis, marches, sousTraitants, notes, etc.)
  const deletedGenericIdsRef = useRef<Set<string>>(new Set());
  // Timestamp de la dernière sauvegarde Supabase — évite que le polling réécrase les données locales
  const lastSaveRef = useRef<number>(0);
  // Timestamp de la dernière modification locale (suppression, ajout, toggle)
  const lastLocalChangeRef = useRef<number>(0);
  // Compteur : incrémenté à chaque reload distant, le useEffect de sauvegarde skip quand il change
  const remoteReloadCountRef = useRef<number>(0);
  const lastSavedReloadCountRef = useRef<number>(0);

  // ── Session unique PAR COMPTE : invalider les anciens onglets du même utilisateur ──
  // Le canal est créé uniquement quand on connaît le compte connecté.
  // Un admin et un employé peuvent avoir chacun leur onglet actif sans interférence.
  useEffect(() => {
    if (!currentUser) return;

    // Clé unique par compte : admin, employeId, ou soustraitantId
    const accountKey = currentUser.role === 'admin'
      ? 'admin'
      : currentUser.employeId || currentUser.soustraitantId || 'unknown';

    const channel = makeSessionChannel(accountKey);
    if (!channel) return;

    // Réinitialiser sessionExpired si on vient de se reconnecter
    setSessionExpired(false);

    // Annoncer notre présence aux autres onglets du MÊME compte
    channel.postMessage({ type: 'NEW_SESSION', sessionId: SESSION_ID, accountKey });

    // Écouter les nouvelles sessions du même compte
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NEW_SESSION' && e.data?.sessionId !== SESSION_ID) {
        // Un autre onglet du même compte vient de s'ouvrir → lecture seule
        setSessionExpired(true);
        if (saveTimer.current) clearTimeout(saveTimer.current);
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [currentUser]);

  // ── Chargement initial : SUPABASE = SOURCE DE VÉRITÉ UNIQUE ──
  // Architecture :
  //   1. Supabase est la source de vérité (données partagées entre tous les appareils)
  //   2. localStorage = cache hors-ligne uniquement (fallback si Supabase inaccessible)
  //   3. Si Supabase a des données → les utiliser (même depuis un nouveau téléphone)
  //   4. Si Supabase est vide mais localStorage a des données → synchro vers Supabase
  useEffect(() => {
    const load = async () => {
      // ── 1. Charger l'utilisateur ET les IDs supprimés depuis AsyncStorage ──
      let storedUser: CurrentUser | null = null;
      try {
        const raw = await AsyncStorage.getItem(USER_KEY);
        if (raw) storedUser = JSON.parse(raw);
      } catch {}

      // Recharger les IDs supprimés persistés pour que le polling ne les réintroduise pas
      try {
        const rawAff = await AsyncStorage.getItem(DELETED_AFFECTATIONS_KEY);
        if (rawAff) deletedAffectationIdsRef.current = new Set(JSON.parse(rawAff));
        const rawCh = await AsyncStorage.getItem(DELETED_CHANTIERS_KEY);
        if (rawCh) deletedChantierIdsRef.current = new Set(JSON.parse(rawCh));
        const rawEmp = await AsyncStorage.getItem(DELETED_EMPLOYES_KEY);
        if (rawEmp) deletedEmployeIdsRef.current = new Set(JSON.parse(rawEmp));
        const rawPt = await AsyncStorage.getItem(DELETED_POINTAGES_KEY);
        if (rawPt) deletedPointageIdsRef.current = new Set(JSON.parse(rawPt));
        const rawGeneric = await AsyncStorage.getItem(DELETED_GENERIC_KEY);
        if (rawGeneric) deletedGenericIdsRef.current = new Set(JSON.parse(rawGeneric));
        const rawListes = await AsyncStorage.getItem(DELETED_LISTES_KEY);
        if (rawListes) deletedListeIdsRef.current = new Set(JSON.parse(rawListes));
      } catch {}

      // ── 2. Charger Supabase ET le cache local en parallèle ──
      let supabaseRaw: Record<string, unknown> | null = null;
      let localRaw: Record<string, unknown> | null = null;

      const [supabaseResult, localResult] = await Promise.allSettled([
        loadDataFromSupabase(),
        AsyncStorage.getItem(LOCAL_DATA_KEY).then(raw => raw ? JSON.parse(raw) : null),
      ]);

      if (supabaseResult.status === 'fulfilled') supabaseRaw = supabaseResult.value;
      if (localResult.status === 'fulfilled') localRaw = localResult.value;

      const supabaseEmployes = (supabaseRaw?.employes as unknown[] || []).length;
      const supabaseChantiers = (supabaseRaw?.chantiers as unknown[] || []).length;
      const localEmployes = (localRaw?.employes as unknown[] || []).length;
      const localChantiers = (localRaw?.chantiers as unknown[] || []).length;

      console.log(`📊 Chargement: Supabase=${supabaseEmployes} emp / Local=${localEmployes} emp`);

      let loadedData: ReturnType<typeof migrateData> | null = null;

      // ── 3. Stratégie de sélection des données ──
      if (supabaseRaw && (supabaseEmployes > 0 || supabaseChantiers > 0)) {
        // CAS NORMAL : Supabase est la SOURCE DE VÉRITÉ unique
        // On utilise directement les données Supabase, sans merge avec le cache local
        // Le cache local ne sert qu'au fallback offline
        loadedData = migrateData(supabaseRaw);
        console.log(`✅ Données chargées depuis Supabase (${supabaseEmployes} emp, ${supabaseChantiers} ch)`);
      } else if (localRaw && (localEmployes > 0 || localChantiers > 0)) {
        // CAS FALLBACK : Supabase vide ou inaccessible, mais cache local a des données
        // → Utiliser le cache local ET synchroniser vers Supabase
        loadedData = migrateData(localRaw);
        console.log(`⚠️ Supabase vide, utilisation du cache local (${localEmployes} emp)`);
        // Synchroniser immédiatement vers Supabase pour les autres appareils
        safeSaveToSupabase(localRaw, showSaveError)
          .then(ok => console.log(ok ? '✅ Cache local synchronisé vers Supabase' : '⚠️ Sync Supabase échouée'));
      } else if (supabaseRaw && Object.keys(supabaseRaw).length > 0) {
        // Supabase a des données mais pas d'employés (notes, photos, etc.)
        loadedData = migrateData(supabaseRaw);
        console.log('✅ Données Supabase chargées (sans employés)');
      }

      // ── 4. Mettre à jour le cache local avec les données finales ──
      if (loadedData) {
        setData(loadedData);
        safeAsyncStorageSet(LOCAL_DATA_KEY, JSON.stringify(loadedData));
      }

      if (storedUser) setCurrentUser(storedUser);
      setLoaded(true);
      isFirstLoad.current = false;
    };
    load();
  }, []);

  // ── Synchroniser dataRef avec le state courant ──
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // ── Sauvegarde automatique : Supabase (source de vérité) + cache local ──
  // Supabase est la source de vérité unique : toute modification est sauvegardée
  // immédiatement dans Supabase pour être disponible sur tous les appareils.
  useEffect(() => {
    if (!loaded || isFirstLoad.current) return;
    // Session expirée → ne jamais écrire dans Supabase
    if (sessionExpired) return;
    // Reload distant → ne PAS re-sauvegarder (sinon boucle infinie)
    if (remoteReloadCountRef.current !== lastSavedReloadCountRef.current) {
      lastSavedReloadCountRef.current = remoteReloadCountRef.current;
      // Mettre à jour le cache local uniquement
      safeAsyncStorageSet(LOCAL_DATA_KEY, JSON.stringify(data));
      return;
    }
    lastLocalChangeRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const dataToSave = data as unknown as Record<string, unknown>;

      lastSaveRef.current = Date.now();

      // 1. Sauvegarder dans Supabase (SANS photos — stripPhotosForSupabase appliqué dans saveDataToSupabase)
      setSyncStatus('saving');
      safeSaveToSupabase(dataToSave, showSaveError)
        .then(ok => {
          lastSaveRef.current = Date.now(); // Marquer la fin de la sauvegarde
          if (ok) {
            clearPendingSave();
            notifyDataUpdated(SESSION_ID);
            setSyncStatus('synced');
            // NE PAS vider les sets de suppression ici.
            // On les garde jusqu'au prochain reload réussi depuis Supabase,
            // pour éviter qu'un autre appareil non-syncé ne ramène les données supprimées.
          }
          else { setSyncStatus('error'); }
        });

      // 2. Sauvegarder le cache local COMPLET (avec photos) pour le fallback hors-ligne
      safeAsyncStorageSet(LOCAL_DATA_KEY, JSON.stringify(dataToSave));
    }, 800); // 0.8s de debounce — sauvegarde rapide
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, loaded, sessionExpired]);

  // ── Backup automatique hebdomadaire ──
  // 1 backup par semaine maximum (le lundi) pour éviter de saturer Supabase.
  // Les photos sont exclues des backups (géré dans createManualBackup).
  // Purge automatique des backups de plus de 4 semaines.
  const lastBackupCheckRef = useRef<number>(0);
  useEffect(() => {
    if (!loaded) return;
    const checkAndBackup = async () => {
      // Maximum 1 backup par jour
      if (Date.now() - lastBackupCheckRef.current < 86400000) return;
      lastBackupCheckRef.current = Date.now();
      try {
        if (data.employes.length === 0 && data.chantiers.length === 0) return;

        const today = new Date();
        const dayKey = today.toISOString().slice(0, 10); // YYYY-MM-DD
        const lastBackupDay = await AsyncStorage.getItem('sk_last_backup_day').catch(() => null);
        if (lastBackupDay === dayKey) return; // Déjà fait aujourd'hui

        const success = await createManualBackup(
          data as unknown as Record<string, unknown>,
          'daily'
        );
        if (success) {
          await safeAsyncStorageSet('sk_last_backup_day', dayKey);
          console.log('✅ Backup quotidien créé (' + dayKey + ')');
        }
      } catch (e) {
        console.warn('Backup quotidien échoué:', e);
      }
    };
    // Vérifier au chargement puis toutes les 24h
    checkAndBackup();
    const backupInterval = setInterval(checkAndBackup, 86400000); // 24h
    return () => clearInterval(backupInterval);
  }, [loaded]);

  // ── Queue offline : re-tente les sauvegardes échouées toutes les 30s ──
  useEffect(() => {
    if (!loaded || sessionExpired) return;
    const retryPendingSave = async () => {
      const pending = await hasPendingSave();
      if (!pending) return;
      console.log('[Offline] Tentative de re-synchronisation…');
      const dataToSave = dataRef.current as unknown as Record<string, unknown>;
      const ok = await safeSaveToSupabase(dataToSave, showSaveError);
      if (ok) {
        await clearPendingSave();
        setSaveError(null);
        setSyncStatus('synced');
        notifyDataUpdated(SESSION_ID);
        console.log('[Offline] Re-synchronisation réussie');
      } else {
        setSyncStatus('offline');
      }
    };
    offlineRetryTimer = setInterval(retryPendingSave, 30000);
    // Tenter immédiatement au chargement
    retryPendingSave();
    return () => {
      if (offlineRetryTimer) clearInterval(offlineRetryTimer);
    };
  }, [loaded, sessionExpired, showSaveError]);

  // ── Rechargement depuis Supabase (utilisé par polling, Realtime ET BroadcastChannel) ──
  // Supabase est la SOURCE DE VÉRITÉ : les données distantes remplacent les locales.
  // Seules les suppressions locales non encore propagées sont protégées.
  const reloadFromSupabase = useCallback(async () => {
    // Ne pas recharger si un changement local récent n'est pas encore sauvegardé
    // Protection étendue : debounce 1.5s + temps réseau (jusqu'à 10s avec retries)
    const timeSinceChange = Date.now() - lastLocalChangeRef.current;
    const timeSinceSave = Date.now() - lastSaveRef.current;
    if (timeSinceChange < 8000 || timeSinceSave < 5000) return;
    try {
      const supabaseData = await loadDataFromSupabase();
      if (supabaseData && Object.keys(supabaseData).length > 0) {
        remoteReloadCountRef.current += 1;
        setData(prev => {
          // Utiliser les données Supabase comme base (source de vérité)
          const result = migrateData(supabaseData);

          // Protéger les photos locales : fusionner en préférant la version avec URI
          const localPhotos = prev.photosChantier || [];
          const remotePhotos = result.photosChantier || [];
          const localMap = new Map(localPhotos.map(p => [p.id, p]));
          const remoteMap = new Map(remotePhotos.map(p => [p.id, p]));
          const allPhotoIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
          const mergedPhotos: PhotoChantier[] = [];
          allPhotoIds.forEach(id => {
            const local = localMap.get(id);
            const remote = remoteMap.get(id);
            // Préférer la version qui a un URI valide (https://)
            if (local?.uri?.startsWith('http')) { mergedPhotos.push(local); }
            else if (remote?.uri?.startsWith('http')) { mergedPhotos.push(remote); }
            else if (local?.uri) { mergedPhotos.push(local); }
            else if (remote) { mergedPhotos.push(remote); }
            else if (local) { mergedPhotos.push(local); }
          });

          // Protéger les listes matériaux localement supprimées
          const mergedListes = (result.listesMateriaux || []).filter(
            l => !deletedListeIdsRef.current.has(l.id)
          ).map(l => {
            const deletedItems = deletedItemIdsRef.current.get(l.id);
            if (deletedItems && deletedItems.size > 0) {
              return { ...l, items: l.items.filter(i => !deletedItems.has(i.id)) };
            }
            return l;
          });

          // Protéger les suppressions locales non encore propagées
          return {
            ...result,
            affectations: (result.affectations || []).filter(
              (a: Affectation) => !deletedAffectationIdsRef.current.has(a.id)
            ),
            chantiers: (result.chantiers || []).filter(
              (c: Chantier) => !deletedChantierIdsRef.current.has(c.id)
            ),
            employes: (result.employes || []).filter(
              (e: Employe) => !deletedEmployeIdsRef.current.has(e.id)
            ),
            pointages: (result.pointages || []).filter(
              (p: Pointage) => !deletedPointageIdsRef.current.has(p.id)
            ),
            listesMateriaux: mergedListes,
            photosChantier: mergedPhotos.filter((p: PhotoChantier) => !deletedGenericIdsRef.current.has(p.id)),
            // Filtrer les suppressions génériques sur toutes les collections restantes
            acomptes: (result.acomptes || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            sousTraitants: (result.sousTraitants || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            devis: (result.devis || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            marches: (result.marches || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            acomptesst: (result.acomptesst || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            interventions: (result.interventions || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            demandesConge: (result.demandesConge || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            arretsMaladie: (result.arretsMaladie || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            demandesAvance: (result.demandesAvance || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            fichesPaie: (result.fichesPaie || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            depenses: (result.depenses || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            supplements: (result.supplements || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            docsSuivi: (result.docsSuivi || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            notesSuivi: (result.notesSuivi || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            documentsRH: (result.documentsRH || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            messagesPrive: (result.messagesPrive || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            retardsPlanifies: (result.retardsPlanifies || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            notesChantier: (result.notesChantier || []).filter((x: { id: string }) => !deletedGenericIdsRef.current.has(x.id)),
            // Conserver les données locales qui ne sont pas dans Supabase (plans, fiches)
            fichesChantier: { ...(result.fichesChantier || {}), ...(prev.fichesChantier || {}) },
            plansChantier: { ...(result.plansChantier || {}), ...(prev.plansChantier || {}) },
          };
        });

        // Nettoyer les IDs de suppression APRÈS le reload réussi :
        // Supabase est maintenant à jour, on peut vider les sets en toute sécurité.
        // On vérifie d'abord que les éléments ne sont plus dans les données Supabase.
        const cleanDeletedSet = (ref: React.MutableRefObject<Set<string>>, key: string, remoteItems: { id: string }[]) => {
          const remoteIds = new Set(remoteItems.map(x => x.id));
          const stillInRemote = new Set<string>();
          ref.current.forEach(id => { if (remoteIds.has(id)) stillInRemote.add(id); });
          // Garder uniquement ceux qui sont encore dans Supabase (pas encore propagé)
          ref.current = stillInRemote;
          persistDeletedIds(key, ref.current);
        };
        cleanDeletedSet(deletedChantierIdsRef, DELETED_CHANTIERS_KEY, supabaseData.chantiers || []);
        cleanDeletedSet(deletedEmployeIdsRef, DELETED_EMPLOYES_KEY, supabaseData.employes || []);
        cleanDeletedSet(deletedPointageIdsRef, DELETED_POINTAGES_KEY, supabaseData.pointages || []);
        cleanDeletedSet(deletedListeIdsRef, DELETED_LISTES_KEY, supabaseData.listesMateriaux || []);
      }
    } catch {}
  }, []);

  // ── Supabase Realtime : mise à jour instantanée cross-devices ──
  useEffect(() => {
    if (!loaded) return;
    const unsubscribe = subscribeToRealtimeUpdates(() => {
      // Un autre utilisateur a sauvegardé → recharger
      reloadFromSupabase();
    });
    // Polling court en fallback (30s) pour garantir la sync si Realtime échoue
    const poll = setInterval(reloadFromSupabase, 30000);
    return () => { unsubscribe(); clearInterval(poll); };
  }, [loaded, reloadFromSupabase]);

  // ── Mise à jour en temps réel : écouter les notifications des autres onglets ──
  // Quand un employé sauvegarde (liste matériel, demande RH, pointage...),
  // il notifie tous les autres onglets via DATA_CHANNEL.
  // L'admin reçoit la notification et recharge immédiatement depuis Supabase.
  useEffect(() => {
    if (!loaded || !DATA_CHANNEL) return;
    const handleDataUpdate = (e: MessageEvent) => {
      // Ignorer nos propres notifications
      if (e.data?.type === 'DATA_UPDATED' && e.data?.sessionId !== SESSION_ID) {
        reloadFromSupabase();
      }
    };
    DATA_CHANNEL.addEventListener('message', handleDataUpdate);
    return () => DATA_CHANNEL.removeEventListener('message', handleDataUpdate);
  }, [loaded, reloadFromSupabase]);

  const setCurrentUserPersisted = (user: CurrentUser | null) => {
    setCurrentUser(user);
    if (user) safeAsyncStorageSet(USER_KEY, JSON.stringify(user));
    else AsyncStorage.removeItem(USER_KEY).catch(err => console.warn('[AsyncStorage] Erreur suppression user:', err));
  };

  // Helper : tracker la suppression d'un ID générique (acomptes, devis, marchés, notes, etc.)
  const trackGenericDeletion = (id: string) => {
    deletedGenericIdsRef.current.add(id);
    persistDeletedIds(DELETED_GENERIC_KEY, deletedGenericIdsRef.current);
    lastLocalChangeRef.current = Date.now();
  };

  // ── Chantiers ──
  const addChantier = (c: Chantier) =>
    setData(p => ({ ...p, chantiers: [...p.chantiers, c] }));
  const updateChantier = (c: Chantier) =>
    setData(p => ({ ...p, chantiers: p.chantiers.map(x => x.id === c.id ? c : x) }));
  const deleteChantier = (id: string) => {
    deletedChantierIdsRef.current.add(id);
    persistDeletedIds(DELETED_CHANTIERS_KEY, deletedChantierIdsRef.current);
    setData(p => ({
      ...p,
      chantiers: p.chantiers.filter(c => c.id !== id),
      affectations: p.affectations.filter(a => a.chantierId !== id),
      marches: p.marches.filter(m => m.chantierId !== id),
      // Cascade : nettoyer toutes les données liées au chantier
      listesMateriaux: (p.listesMateriaux || []).filter(l => l.chantierId !== id),
      depensesChantier: (p.depensesChantier || []).filter(d => d.chantierId !== id),
      supplementsChantier: (p.supplementsChantier || []).filter(s => s.chantierId !== id),
      photosChantier: (p.photosChantier || []).filter(ph => ph.chantierId !== id),
      notesChantier: (p.notesChantier || []).filter(n => n.chantierId !== id),
      notesChantierSupprimees: (p.notesChantierSupprimees || []).filter(n => n.chantierId !== id),
      marchesChantier: (p.marchesChantier || []).filter(m => m.chantierId !== id),
      supplementsMarche: (p.supplementsMarche || []).filter(s => s.chantierId !== id),
      ticketsSAV: (p.ticketsSAV || []).filter(t => t.chantierId !== id),
      interventions: (p.interventions || []).filter(i => i.chantierId !== id),
    }));
  };

  // ── Employés ──
  const addEmploye = (e: Employe) =>
    setData(p => ({ ...p, employes: [...p.employes, e] }));
  const updateEmploye = (e: Employe) =>
    setData(p => ({ ...p, employes: p.employes.map(x => x.id === e.id ? e : x) }));
  const deleteEmploye = (id: string) => {
    deletedEmployeIdsRef.current.add(id);
    persistDeletedIds(DELETED_EMPLOYES_KEY, deletedEmployeIdsRef.current);
    setData(p => ({
      ...p,
      employes: p.employes.filter(e => e.id !== id),
      affectations: p.affectations.filter(a => a.employeId !== id),
      acomptes: p.acomptes.filter(a => a.employeId !== id),
      pointages: p.pointages.filter(pt => pt.employeId !== id),
      demandesConge: (p.demandesConge || []).filter(d => d.employeId !== id),
      arretsMaladie: (p.arretsMaladie || []).filter(d => d.employeId !== id),
      demandesAvance: (p.demandesAvance || []).filter(d => d.employeId !== id),
      fichesPaie: (p.fichesPaie || []).filter(f => f.employeId !== id),
      chantiers: p.chantiers.map(c => ({ ...c, employeIds: c.employeIds.filter(eid => eid !== id) })),
    }));
  };

  // ── Affectations ──
  const addAffectation = (a: Affectation) => {
    const emp = data.employes.find(e => e.id === a.employeId);
    const ch = data.chantiers.find(c => c.id === a.chantierId);
    if (emp && ch) logActivity('affectation', `${emp.prenom} ${emp.nom} affecté à ${ch.nom} (${a.dateDebut})`, a.chantierId);
    setData(p => {
      // Anti-doublon : ne pas ajouter si même employé+chantier+dateDebut+dateFin existe déjà
      const duplicate = p.affectations.some(x =>
        x.chantierId === a.chantierId &&
        x.employeId === a.employeId &&
        x.dateDebut === a.dateDebut &&
        x.dateFin === a.dateFin
      );
      if (duplicate) return p;
      return { ...p, affectations: [...p.affectations, a] };
    });
  };
  const updateAffectation = (a: Affectation) =>
    setData(p => ({ ...p, affectations: p.affectations.map(x => x.id === a.id ? a : x) }));
  const removeAffectation = (chantierId: string, employeId: string, date: string) => {
    lastLocalChangeRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => {
      const newAffectations: Affectation[] = [];
      for (const a of p.affectations) {
        // Si ce n'est pas l'affectation concernée, on la garde telle quelle
        if (a.chantierId !== chantierId || a.employeId !== employeId) {
          newAffectations.push(a);
          continue;
        }
        // Si la date n'est pas dans la plage, on garde
        if (!(a.dateDebut <= date && a.dateFin >= date)) {
          newAffectations.push(a);
          continue;
        }
        // Mémoriser l'ID supprimé pour que le polling ne le réintroduise jamais (persisté)
        deletedAffectationIdsRef.current.add(a.id);
        persistDeletedIds(DELETED_AFFECTATIONS_KEY, deletedAffectationIdsRef.current);
        // L'affectation couvre ce jour : on la découpe
        // Utiliser la date locale (pas UTC) pour éviter les décalages de fuseau horaire
        const toLocalYMD = (d: Date) => {
          const y = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const da = String(d.getDate()).padStart(2, '0');
          return `${y}-${mo}-${da}`;
        };
        // Partie avant le jour supprimé
        if (a.dateDebut < date) {
          const dayBefore = new Date(date);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const dateBefore = toLocalYMD(dayBefore);
          newAffectations.push({ ...a, id: `${a.id}_before`, dateFin: dateBefore });
        }
        // Partie après le jour supprimé
        if (a.dateFin > date) {
          const dayAfter = new Date(date);
          dayAfter.setDate(dayAfter.getDate() + 1);
          const dateAfter = toLocalYMD(dayAfter);
          newAffectations.push({ ...a, id: `${a.id}_after`, dateDebut: dateAfter });
        }
        // Si dateDebut === dateFin === date : on ne pousse rien (suppression totale)
      }
      const newData = { ...p, affectations: newAffectations };
      // Sauvegarder immédiatement dans Supabase pour éviter que d'autres appareils ne réintroduisent l'affectation
      lastSaveRef.current = Date.now();
      safeSaveToSupabase(newData as unknown as Record<string, unknown>, showSaveError);
      safeAsyncStorageSet(LOCAL_DATA_KEY, JSON.stringify(newData));
      return newData;
    });
  };

  // ── Notes ──
  const upsertNote = ({ chantierId, employeId, date, note }: {
    chantierId: string; employeId: string; date: string; note: Note;
  }) => {
    setData(p => {
      const existing = p.affectations.find(a =>
        a.chantierId === chantierId && a.employeId === employeId &&
        a.dateDebut <= date && a.dateFin >= date
      );
      if (existing) {
        const updatedNotes = existing.notes.some(n => n.id === note.id)
          ? existing.notes.map(n => n.id === note.id ? note : n)
          : [...existing.notes, note];
        return { ...p, affectations: p.affectations.map(a => a.id === existing.id ? { ...a, notes: updatedNotes } : a) };
      } else {
        const newAff: Affectation = {
          id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          chantierId, employeId, dateDebut: date, dateFin: date, notes: [note],
        };
        return { ...p, affectations: [...p.affectations, newAff] };
      }
    });
  };
  const deleteNote = (affectationId: string, noteId: string) =>
    setData(p => ({
      ...p,
      affectations: p.affectations.map(a =>
        a.id === affectationId ? { ...a, notes: a.notes.filter(n => n.id !== noteId) } : a
      ),
    }));

  // ── Tâches (checklist dans les notes) ──
  const toggleTask = (affectationId: string, noteId: string, taskId: string, faitPar: string) =>
    setData(p => ({
      ...p,
      affectations: p.affectations.map(a => {
        if (a.id !== affectationId) return a;
        return {
          ...a,
          notes: a.notes.map(n => {
            if (n.id !== noteId) return n;
            const now = new Date().toISOString();
            return {
              ...n,
              updatedAt: now,
              tasks: (n.tasks || []).map(t => t.id === taskId
                ? { ...t, fait: !t.fait, faitPar: !t.fait ? faitPar : undefined, faitAt: !t.fait ? now : undefined }
                : t
              ),
            };
          }),
        };
      }),
    }));

  const addTaskPhoto = (affectationId: string, noteId: string, taskId: string, photoUri: string) =>
    setData(p => ({
      ...p,
      affectations: p.affectations.map(a => {
        if (a.id !== affectationId) return a;
        return { ...a, notes: a.notes.map(n => {
          if (n.id !== noteId) return n;
          return { ...n, updatedAt: new Date().toISOString(), tasks: (n.tasks || []).map(t => t.id === taskId ? { ...t, photos: [...(t.photos || []), photoUri] } : t) };
        }) };
      }),
    }));

  const addTask = (affectationId: string, noteId: string, task: TaskItem) =>
    setData(p => ({
      ...p,
      affectations: p.affectations.map(a => {
        if (a.id !== affectationId) return a;
        return {
          ...a,
          notes: a.notes.map(n => {
            if (n.id !== noteId) return n;
            return { ...n, tasks: [...(n.tasks || []), task], updatedAt: new Date().toISOString() };
          }),
        };
      }),
    }));

  const deleteTask = (affectationId: string, noteId: string, taskId: string) =>
    setData(p => ({
      ...p,
      affectations: p.affectations.map(a => {
        if (a.id !== affectationId) return a;
        return {
          ...a,
          notes: a.notes.map(n => {
            if (n.id !== noteId) return n;
            return { ...n, tasks: (n.tasks || []).filter(t => t.id !== taskId), updatedAt: new Date().toISOString() };
          }),
        };
      }),
    }));

  // ── Pointages ──
  const addPointage = (pointage: Pointage) => {
    const emp = data.employes.find(e => e.id === pointage.employeId);
    const empName = emp ? `${emp.prenom} ${emp.nom}` : pointage.employeId;
    const ch = data.chantiers.find(c => c.id === pointage.chantierId);
    const label = pointage.type === 'debut' ? 'Arrivée' : 'Départ';
    logActivity('pointage', `${label} de ${empName} à ${pointage.heure}${ch ? ` — ${ch.nom}` : ''}`, pointage.employeId);
    setData(p => {
      const exists = p.pointages.some(x => x.id === pointage.id);
      if (exists) return { ...p, pointages: p.pointages.map(x => x.id === pointage.id ? pointage : x) };
      return { ...p, pointages: [...p.pointages, pointage] };
    });
  };
  const updatePointage = (pointage: Pointage) =>
    setData(p => ({ ...p, pointages: p.pointages.map(x => x.id === pointage.id ? pointage : x) }));
  const deletePointage = (id: string) => {
    deletedPointageIdsRef.current.add(id);
    persistDeletedIds(DELETED_POINTAGES_KEY, deletedPointageIdsRef.current);
    lastLocalChangeRef.current = Date.now();
    setData(p => ({ ...p, pointages: p.pointages.filter(x => x.id !== id) }));
  };

  // ── Acomptes employés ──
  const addAcompte = (acompte: Acompte) =>
    setData(p => ({ ...p, acomptes: [...p.acomptes, acompte] }));
  const deleteAcompte = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, acomptes: p.acomptes.filter(a => a.id !== id) }));
  };

  // ── Fiche chantier ──
  const upsertFicheChantier = (chantierId: string, fiche: FicheChantier) =>
    setData(p => ({
      ...p,
      chantiers: p.chantiers.map(c => c.id === chantierId ? { ...c, fiche } : c),
    }));

  // ── Sous-traitants ──
  const addSousTraitant = (st: SousTraitant) =>
    setData(p => ({ ...p, sousTraitants: [...p.sousTraitants, st] }));
  const updateSousTraitant = (st: SousTraitant) =>
    setData(p => ({ ...p, sousTraitants: p.sousTraitants.map(x => x.id === st.id ? st : x) }));
  const deleteSousTraitant = (id: string) => {
    trackGenericDeletion(id);
    setData(p => {
      const devisIds = p.devis.filter(d => d.soustraitantId === id).map(d => d.id);
      const marcheIds = p.marches.filter(m => m.soustraitantId === id).map(m => m.id);
      const allIds = new Set([...devisIds, ...marcheIds]);
      return {
        ...p,
        sousTraitants: p.sousTraitants.filter(s => s.id !== id),
        devis: p.devis.filter(d => d.soustraitantId !== id),
        marches: p.marches.filter(m => m.soustraitantId !== id),
        acomptesst: p.acomptesst.filter(a => !allIds.has(a.devisId)),
      };
    });
  };

  // ── Devis ST ──
  const addDevis = (devis: DevisST) =>
    setData(p => ({ ...p, devis: [...p.devis, devis], marches: [...p.marches, devis] }));
  const updateDevis = (devis: DevisST) =>
    setData(p => ({
      ...p,
      devis: p.devis.map(x => x.id === devis.id ? devis : x),
      marches: p.marches.map(x => x.id === devis.id ? devis : x),
    }));
  const deleteDevis = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({
      ...p,
      devis: p.devis.filter(d => d.id !== id),
      marches: p.marches.filter(d => d.id !== id),
      acomptesst: p.acomptesst.filter(a => a.devisId !== id),
    }));
  };
  const addMarche = addDevis;
  const updateMarche = updateDevis;
  const deleteMarche = deleteDevis;

  // ── Acomptes ST ──
  const addAcompteST = (acompte: AcompteST) =>
    setData(p => ({ ...p, acomptesst: [...p.acomptesst, acompte] }));
  const updateAcompteST = (acompte: AcompteST) =>
    setData(p => ({ ...p, acomptesst: p.acomptesst.map(x => x.id === acompte.id ? acompte : x) }));
  const deleteAcompteST = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, acomptesst: p.acomptesst.filter(a => a.id !== id) }));
  };

  // ── Interventions externes ──
  const addIntervention = (intervention: Intervention) =>
    setData(p => ({ ...p, interventions: [...(p.interventions || []), intervention] }));
  const updateIntervention = (intervention: Intervention) =>
    setData(p => ({ ...p, interventions: (p.interventions || []).map(x => x.id === intervention.id ? intervention : x) }));
  const deleteIntervention = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, interventions: (p.interventions || []).filter(i => i.id !== id) }));
  };

  // ── Listes matériel ──
  const upsertListeMateriau = (liste: ListeMateriau) => {
    const ch = data.chantiers.find(c => c.id === liste.chantierId);
    const emp = data.employes.find(e => e.id === liste.employeId);
    const isNew = !(data.listesMateriaux || []).some(l => l.id === liste.id);
    if (isNew && emp && ch) logActivity('materiel', `Liste matériel ajoutée par ${emp.prenom} pour ${ch.nom}`, liste.chantierId);
    setData(p => {
      const exists = (p.listesMateriaux || []).some(l => l.id === liste.id);
      return {
        ...p,
        listesMateriaux: exists
          ? (p.listesMateriaux || []).map(l => l.id === liste.id ? liste : l)
          : [...(p.listesMateriaux || []), liste],
      };
    });
  };

  const deleteListeMateriau = (id: string) => {
    lastLocalChangeRef.current = Date.now();
    // Mémoriser l'ID supprimé pour que le polling ne le réintroduise jamais
    deletedListeIdsRef.current.add(id);
    persistDeletedIds(DELETED_LISTES_KEY, deletedListeIdsRef.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => {
      const newData = { ...p, listesMateriaux: (p.listesMateriaux || []).filter(l => l.id !== id) };
      // Sauvegarder immédiatement dans Supabase
      lastSaveRef.current = Date.now();
      safeSaveToSupabase(newData as unknown as Record<string, unknown>, showSaveError);
      return newData;
    });
  };

  const toggleMateriau = (listeId: string, itemId: string, achetePar: string, prixReel?: number, fournisseurReel?: string) =>
    setData(p => ({
      ...p,
      listesMateriaux: (p.listesMateriaux || []).map(l => {
        if (l.id !== listeId) return l;
        const now = new Date().toISOString();
        return {
          ...l,
          updatedAt: now,
          items: l.items.map(item => item.id === itemId
            ? { ...item, achete: !item.achete, achetePar: !item.achete ? achetePar : undefined, acheteAt: !item.achete ? now : undefined, prixReel: !item.achete ? prixReel : undefined, fournisseurReel: !item.achete ? fournisseurReel : undefined }
            : item
          ),
        };
      }),
    }));

  const addMateriauItem = (listeId: string, item: MateriauItem) =>
    setData(p => ({
      ...p,
      listesMateriaux: (p.listesMateriaux || []).map(l => {
        if (l.id !== listeId) return l;
        return { ...l, items: [...l.items, item], updatedAt: new Date().toISOString() };
      }),
    }));

  const deleteMateriauItem = (listeId: string, itemId: string) => {
    lastLocalChangeRef.current = Date.now();
    // Mémoriser l'item supprimé pour que le polling ne le réintroduise jamais
    if (!deletedItemIdsRef.current.has(listeId)) deletedItemIdsRef.current.set(listeId, new Set());
    deletedItemIdsRef.current.get(listeId)!.add(itemId);
    // Sauvegarder immédiatement sans attendre le debounce
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => {
      const newData = {
        ...p,
        listesMateriaux: (p.listesMateriaux || []).map(l => {
          if (l.id !== listeId) return l;
          return { ...l, items: l.items.filter(i => i.id !== itemId), updatedAt: new Date().toISOString() };
        }),
      };
      // Sauvegarder immédiatement dans Supabase (pas de debounce pour les suppressions)
      lastSaveRef.current = Date.now();
      safeSaveToSupabase(newData as unknown as Record<string, unknown>, showSaveError);
      return newData;
    });
  };

  // ── Module RH ──
  const addDemandeConge = (d: DemandeConge) => {
    const emp = data.employes.find(e => e.id === d.employeId);
    const empName = emp ? `${emp.prenom} ${emp.nom}` : 'Employé';
    logActivity('conge', `Demande de congé de ${empName} (${d.dateDebut} → ${d.dateFin})`, d.employeId);
    setData(p => ({ ...p, demandesConge: [...(p.demandesConge || []), d] }));
  };
  const updateDemandeConge = (d: DemandeConge) =>
    setData(p => ({ ...p, demandesConge: (p.demandesConge || []).map(x => x.id === d.id ? d : x) }));
  const deleteDemandeConge = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, demandesConge: (p.demandesConge || []).filter(x => x.id !== id) }));
  };

  const addArretMaladie = (a: ArretMaladie) =>
    setData(p => ({ ...p, arretsMaladie: [...(p.arretsMaladie || []), a] }));
  const updateArretMaladie = (a: ArretMaladie) =>
    setData(p => ({ ...p, arretsMaladie: (p.arretsMaladie || []).map(x => x.id === a.id ? a : x) }));
  const deleteArretMaladie = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, arretsMaladie: (p.arretsMaladie || []).filter(x => x.id !== id) }));
  };

  const addDemandeAvance = (d: DemandeAvance) => {
    const emp = data.employes.find(e => e.id === d.employeId);
    const empName = emp ? `${emp.prenom} ${emp.nom}` : 'Employé';
    logActivity('avance', `Demande d'avance de ${empName} (${d.montant} €)`, d.employeId);
    setData(p => ({ ...p, demandesAvance: [...(p.demandesAvance || []), d] }));
  };
  const updateDemandeAvance = (d: DemandeAvance) =>
    setData(p => ({ ...p, demandesAvance: (p.demandesAvance || []).map(x => x.id === d.id ? d : x) }));
  const deleteDemandeAvance = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, demandesAvance: (p.demandesAvance || []).filter(x => x.id !== id) }));
  };

  const addFichePaie = (f: FichePaie) =>
    setData(p => ({ ...p, fichesPaie: [...(p.fichesPaie || []), f] }));
  const deleteFichePaie = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, fichesPaie: (p.fichesPaie || []).filter(x => x.id !== id) }));
  };

  // ── Module Suivi Chantier ──
  const addDepense = (d: DepenseChantier) =>
    setData(p => ({ ...p, depenses: [...(p.depenses || []), d] }));
  const updateDepense = (d: DepenseChantier) =>
    setData(p => ({ ...p, depenses: (p.depenses || []).map(x => x.id === d.id ? d : x) }));
  const deleteDepense = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, depenses: (p.depenses || []).filter(x => x.id !== id) }));
  };

  const addSupplement = (s: SupplementChantier) =>
    setData(p => ({ ...p, supplements: [...(p.supplements || []), s] }));
  const updateSupplement = (s: SupplementChantier) =>
    setData(p => ({ ...p, supplements: (p.supplements || []).map(x => x.id === s.id ? s : x) }));
  const deleteSupplement = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, supplements: (p.supplements || []).filter(x => x.id !== id) }));
  };

  const addDocSuivi = (d: DocSuiviChantier) =>
    setData(p => ({ ...p, docsSuivi: [...(p.docsSuivi || []), d] }));
  const updateDocSuivi = (d: DocSuiviChantier) =>
    setData(p => ({ ...p, docsSuivi: (p.docsSuivi || []).map(x => x.id === d.id ? d : x) }));
  const deleteDocSuivi = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, docsSuivi: (p.docsSuivi || []).filter(x => x.id !== id) }));
  };

  const addNoteSuivi = (n: NoteSuiviChantier) =>
    setData(p => ({ ...p, notesSuivi: [...(p.notesSuivi || []), n] }));
  const updateNoteSuivi = (n: NoteSuiviChantier) =>
    setData(p => ({ ...p, notesSuivi: (p.notesSuivi || []).map(x => x.id === n.id ? n : x) }));
  const deleteNoteSuivi = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, notesSuivi: (p.notesSuivi || []).filter(x => x.id !== id) }));
  };

  // ── Documents RH employé ──
  const addDocumentRH = (d: DocumentRHEmploye) =>
    setData(p => ({ ...p, documentsRH: [...(p.documentsRH || []), d] }));
  const deleteDocumentRH = (id: string) => {
    trackGenericDeletion(id);
    // Supprimer le fichier du Storage Supabase si c'est une URL distante
    const doc = data.documentsRH?.find(d => d.id === id);
    if (doc?.fichier?.startsWith('http')) deleteFileFromStorage(doc.fichier).catch(() => {});
    setData(p => ({ ...p, documentsRH: (p.documentsRH || []).filter(x => x.id !== id) }));
  };

  // ── Documents société ──
  const addDocumentSociete = (d: DocumentSociete) =>
    setData(p => ({ ...p, documentsSociete: [...(p.documentsSociete || []), d] }));
  const updateDocumentSociete = (d: DocumentSociete) =>
    setData(p => ({ ...p, documentsSociete: (p.documentsSociete || []).map(x => x.id === d.id ? d : x) }));
  const deleteDocumentSociete = (id: string) => {
    trackGenericDeletion(id);
    const doc = data.documentsSociete?.find(d => d.id === id);
    if (doc?.fichierUri?.startsWith('http')) deleteFileFromStorage(doc.fichierUri).catch(() => {});
    setData(p => ({ ...p, documentsSociete: (p.documentsSociete || []).filter(x => x.id !== id) }));
  };

  // ── Livraisons ──
  const addLivraison = (l: LivraisonChantier) =>
    setData(p => ({ ...p, livraisons: [...(p.livraisons || []), l] }));
  const updateLivraison = (l: LivraisonChantier) =>
    setData(p => ({ ...p, livraisons: (p.livraisons || []).map(x => x.id === l.id ? l : x) }));
  const deleteLivraison = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, livraisons: (p.livraisons || []).filter(x => x.id !== id) }));
  };

  // ── RDV de chantier récurrents ──
  const addRdvChantier = (r: RdvChantier) =>
    setData(p => ({ ...p, rdvChantiers: [...(p.rdvChantiers || []), r] }));
  const updateRdvChantier = (r: RdvChantier) =>
    setData(p => ({ ...p, rdvChantiers: (p.rdvChantiers || []).map(x => x.id === r.id ? r : x) }));
  const deleteRdvChantier = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, rdvChantiers: (p.rdvChantiers || []).filter(x => x.id !== id) }));
  };

  // ── Messagerie privée ──
  const addMessagePrive = (m: MessagePrive) =>
    setData(p => ({ ...p, messagesPrive: [...(p.messagesPrive || []), m] }));
  const updateMessagePrive = (m: MessagePrive) =>
    setData(p => ({ ...p, messagesPrive: (p.messagesPrive || []).map(x => x.id === m.id ? m : x) }));
  const deleteMessagePrive = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, messagesPrive: (p.messagesPrive || []).filter(x => x.id !== id) }));
  };
  const marquerMessagesLus = (conversationId: string, lecteurRole: 'admin' | 'employe' | 'soustraitant') =>
    setData(p => ({
      ...p,
      messagesPrive: (p.messagesPrive || []).map(m =>
        m.conversationId === conversationId && m.expediteurRole !== lecteurRole && !m.lu
          ? { ...m, lu: true, luAt: new Date().toISOString() }
          : m
      ),
    }));

  // ── Galerie photos chantier ──
  const addPhotoChantier = (photo: PhotoChantier) => {
    lastLocalChangeRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => ({ ...p, photosChantier: [...(p.photosChantier || []), photo] }));
  };
  const addPhotosChantier = (photos: PhotoChantier[]) =>
    setData(p => ({ ...p, photosChantier: [...(p.photosChantier || []), ...photos] }));
  const deletePhotoChantier = (id: string) => {
    trackGenericDeletion(id);
    // Supprimer le fichier du Storage Supabase si c'est une URL distante
    const photo = data.photosChantier?.find(p => p.id === id);
    if (photo?.uri?.startsWith('http')) deleteFileFromStorage(photo.uri).catch(() => {});
    setData(p => ({ ...p, photosChantier: (p.photosChantier || []).filter(x => x.id !== id) }));
  };

  // ── Retards planifiés ──
  const addRetardPlanifie = (r: RetardPlanifie) =>
    setData(p => ({ ...p, retardsPlanifies: [...(p.retardsPlanifies || []), r] }));
  const updateRetardPlanifie = (r: RetardPlanifie) =>
    setData(p => ({ ...p, retardsPlanifies: (p.retardsPlanifies || []).map(x => x.id === r.id ? r : x) }));
  const deleteRetardPlanifie = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, retardsPlanifies: (p.retardsPlanifies || []).filter(x => x.id !== id) }));
  };

  // ── Notes chantier ──
  const addNoteChantier = (n: NoteChantier) =>
    setData(p => {
      // IMPORTANT : on ne duplique PAS les photos des notes dans photosChantier
      // pour éviter d'envoyer des base64 dans Supabase (saturation).
      // Les photos des notes sont accessibles via la note elle-même.
      return {
        ...p,
        notesChantier: [...(p.notesChantier || []), n],
      };
    });
  const updateNoteChantier = (n: NoteChantier) =>
    setData(p => ({ ...p, notesChantier: (p.notesChantier || []).map(x => x.id === n.id ? n : x) }));
  const deleteNoteChantier = (id: string) =>
    setData(p => {
      const note = (p.notesChantier || []).find(x => x.id === id);
      if (!note) return p;
      const deletedNote: NoteChantier = {
        ...note,
        deletedAt: new Date().toISOString(),
        deletedBy: 'admin',
        deletedNom: 'Admin',
      };
      return {
        ...p,
        notesChantier: (p.notesChantier || []).filter(x => x.id !== id),
        notesChantierSupprimees: [...(p.notesChantierSupprimees || []), deletedNote],
      };
    });
  const archiveNoteChantier = (noteId: string, userId: string) =>
    setData(p => ({
      ...p,
      notesChantier: (p.notesChantier || []).map(n =>
        n.id === noteId
          ? { ...n, archivedBy: n.archivedBy.includes(userId) ? n.archivedBy : [...n.archivedBy, userId] }
          : n
      ),
    }));

  // Suppression définitive d'une note archivée (admin uniquement)
  const deleteNoteChantierArchivee = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({
      ...p,
      notesChantier: (p.notesChantier || []).filter(n => n.id !== id),
    }));
  };

  // ── Plans chantier ──
  const addPlanChantier = (chantierId: string, plan: PlanChantier) =>
    setData(p => ({
      ...p,
      chantiers: p.chantiers.map(c =>
        c.id === chantierId
          ? { ...c, fiche: { ...(c.fiche || { codeAcces: '', emplacementCle: '', codeAlarme: '', contacts: '', notes: '', photos: [], updatedAt: '' }), plans: [...(c.fiche?.plans || []), plan] } }
          : c
      ),
    }));

  const deletePlanChantier = (chantierId: string, planId: string) => {
    // Supprimer le fichier du Storage Supabase si c'est une URL distante
    const chantier = data.chantiers.find(c => c.id === chantierId);
    const plan = chantier?.fiche?.plans?.find(p => p.id === planId);
    if (plan?.fichier?.startsWith('http')) deleteFileFromStorage(plan.fichier).catch(() => {});
    setData(p => ({
      ...p,
      chantiers: p.chantiers.map(c =>
        c.id === chantierId
          ? { ...c, fiche: c.fiche ? { ...c.fiche, plans: (c.fiche.plans || []).filter(pl => pl.id !== planId) } : c.fiche }
          : c
      ),
    }));
  };

  const updateAdminPassword = (pwd: string) =>
    setData(p => ({ ...p, adminPassword: pwd, adminPasswordUpdatedAt: new Date().toISOString() }));

  const updateAdminIdentifiant = (id: string) =>
    setData(p => ({ ...p, adminIdentifiant: id }));

  const updateAdminEmployeId = (employeId: string | undefined) =>
    setData(p => ({ ...p, adminEmployeId: employeId }));

  const updateMagasinPrefere = (magasin: string | undefined) =>
    setData(p => ({ ...p, magasinPrefere: magasin }));

  // Métiers personnalisés
  const addMetierPerso = (m: import('@/app/types').MetierPerso) =>
    setData(p => ({ ...p, metiersPerso: [...(p.metiersPerso || []), m] }));
  const deleteMetierPerso = (id: string) =>
    setData(p => ({ ...p, metiersPerso: (p.metiersPerso || []).filter(m => m.id !== id) }));

  // Badges motivationnels
  const addBadgeEmploye = (b: import('@/app/types').BadgeEmploye) =>
    setData(p => ({ ...p, badgesEmployes: [...(p.badgesEmployes || []), b] }));

  // Fournisseurs prédéfinis
  const addFournisseur = (nom: string) =>
    setData(p => ({ ...p, fournisseurs: [...new Set([...(p.fournisseurs || []), nom.trim()])] }));
  const deleteFournisseur = (nom: string) =>
    setData(p => ({ ...p, fournisseurs: (p.fournisseurs || []).filter(f => f !== nom) }));

  // Apporteurs (architectes / apporteurs d'affaires)
  const addApporteur = (a: import('@/app/types').Apporteur) =>
    setData(p => ({ ...p, apporteurs: [...(p.apporteurs || []), a] }));
  const updateApporteur = (a: import('@/app/types').Apporteur) =>
    setData(p => ({ ...p, apporteurs: (p.apporteurs || []).map(x => x.id === a.id ? a : x) }));
  const deleteApporteur = (id: string) =>
    setData(p => ({ ...p, apporteurs: (p.apporteurs || []).filter(a => a.id !== id) }));

  // Budget prévisionnel par chantier
  const updateBudgetChantier = (chantierId: string, budget: number | undefined) =>
    setData(p => {
      const budgets = { ...(p.budgetsChantier || {}) };
      if (budget === undefined) { delete budgets[chantierId]; } else { budgets[chantierId] = budget; }
      return { ...p, budgetsChantier: budgets };
    });

  const updateOrdreAffectation = (employeId: string, date: string, orderedChantierIds: string[]) =>
    setData(p => ({
      ...p,
      ordreAffectations: {
        ...(p.ordreAffectations || {}),
        [`${employeId}_${date}`]: orderedChantierIds,
      },
    }));

  const updateChantierOrderPlanning = (ids: string[]) =>
    setData(p => ({ ...p, chantierOrderPlanning: ids }));

  // ── Système de notifications / journal d'activité ──
  const logActivity = useCallback((action: string, description: string, targetId?: string) => {
    if (!currentUser) return;
    const userId = currentUser.role === 'admin' ? 'admin' : currentUser.employeId || currentUser.soustraitantId || 'unknown';
    const adminEmp = data.adminEmployeId ? data.employes.find(e => e.id === data.adminEmployeId) : undefined;
    const userName = currentUser.role === 'admin' ? (adminEmp ? `${adminEmp.prenom} ${adminEmp.nom}` : 'Admin') :
      (() => {
        const emp = data.employes.find(e => e.id === currentUser.employeId);
        if (emp) return `${emp.prenom} ${emp.nom}`;
        const st = data.sousTraitants.find(s => s.id === currentUser.soustraitantId);
        if (st) return st.nom;
        return 'Utilisateur';
      })();
    const entry: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action,
      description,
      targetId,
    };
    setData(p => ({
      ...p,
      activityLog: [...(p.activityLog || []).slice(-199), entry], // garder les 200 dernières entrées
    }));
  }, [currentUser, data.employes, data.sousTraitants]);

  // ── Catalogue articles ──
  const addArticleCatalogue = (article: ArticleCatalogue) =>
    setData(p => ({ ...p, catalogueArticles: [...(p.catalogueArticles || []), article] }));
  const updateArticleCatalogue = (article: ArticleCatalogue) =>
    setData(p => ({ ...p, catalogueArticles: (p.catalogueArticles || []).map(a => a.id === article.id ? article : a) }));
  const deleteArticleCatalogue = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, catalogueArticles: (p.catalogueArticles || []).filter(a => a.id !== id) }));
  };

  // ── Agenda admin ──
  const addAgendaEvent = (event: AgendaEvent) =>
    setData(p => ({ ...p, agendaEvents: [...(p.agendaEvents || []), event] }));
  const updateAgendaEvent = (event: AgendaEvent) =>
    setData(p => ({ ...p, agendaEvents: (p.agendaEvents || []).map(e => e.id === event.id ? event : e) }));
  const deleteAgendaEvent = (id: string) => {
    trackGenericDeletion(id);
    setData(p => ({ ...p, agendaEvents: (p.agendaEvents || []).filter(e => e.id !== id) }));
  };

  // Calculer les notifications non lues après chaque reload
  const lastSeenRef = useRef<string>('');
  useEffect(() => {
    if (!loaded || !currentUser) return;
    const userId = currentUser.role === 'admin' ? 'admin' : currentUser.employeId || currentUser.soustraitantId || 'unknown';
    const userKey = `${LAST_SEEN_KEY}_${userId}`;
    AsyncStorage.getItem(userKey).then(raw => {
      const lastSeen = raw || '1970-01-01T00:00:00.000Z';
      lastSeenRef.current = lastSeen;
      const unread = (data.activityLog || []).filter(
        log => log.timestamp > lastSeen && log.userId !== userId
      );
      setNotifications(unread);
    }).catch(err => console.warn('[Notifications] Erreur chargement lastSeen:', err));
  }, [loaded, currentUser, data.activityLog]);

  const markNotificationsRead = useCallback(() => {
    if (!currentUser) return;
    const userId = currentUser.role === 'admin' ? 'admin' : currentUser.employeId || currentUser.soustraitantId || 'unknown';
    const now = new Date().toISOString();
    lastSeenRef.current = now;
    safeAsyncStorageSet(`${LAST_SEEN_KEY}_${userId}`, now);
    // Enregistrer les accusés de lecture sur les notifs concernées
    setData(prev => {
      const log = prev.activityLog || [];
      const updatedLog = log.map(entry => {
        // Si l'entrée a déjà été lue par cet user, ne pas dupliquer
        const alreadyRead = (entry.lecturesPar || []).some(l => l.userId === userId);
        if (alreadyRead) return entry;
        // Si l'entrée nous est destinée (ou pas de destinataires = pour tous)
        const isForMe = !entry.destinataires || entry.destinataires.length === 0 || entry.destinataires.includes(userId);
        if (!isForMe) return entry;
        if (entry.userId === userId) return entry; // pas notre propre action
        return { ...entry, lecturesPar: [...(entry.lecturesPar || []), { userId, lu: now }] };
      });
      return { ...prev, activityLog: updatedLog };
    });
    setNotifications([]);
  }, [currentUser]);

  const addTicketSAV = (t: import('@/app/types').TicketSAV) => setData(p => ({ ...p, ticketsSAV: [...(p.ticketsSAV || []), t] }));
  const updateTicketSAV = (t: import('@/app/types').TicketSAV) => setData(p => ({ ...p, ticketsSAV: (p.ticketsSAV || []).map(x => x.id === t.id ? t : x) }));
  const deleteTicketSAV = (id: string) => { deletedGenericIdsRef.current.add(id); setData(p => ({ ...p, ticketsSAV: (p.ticketsSAV || []).filter(x => x.id !== id) })); };

  const addMarcheChantier = (m: import('@/app/types').MarcheChantier) => {
    lastLocalChangeRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => ({ ...p, marchesChantier: [...(p.marchesChantier || []), m] }));
  };
  const updateMarcheChantier = (m: import('@/app/types').MarcheChantier) => {
    lastLocalChangeRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => ({ ...p, marchesChantier: (p.marchesChantier || []).map(x => x.id === m.id ? m : x) }));
  };
  const deleteMarcheChantier = (id: string) => {
    deletedGenericIdsRef.current.add(id);
    setData(p => ({ ...p, marchesChantier: (p.marchesChantier || []).filter(x => x.id !== id) }));
  };
  const addSupplementMarche = (s: import('@/app/types').SupplementMarche) => {
    lastLocalChangeRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => ({ ...p, supplementsMarche: [...(p.supplementsMarche || []), s] }));
  };
  const updateSupplementMarche = (s: import('@/app/types').SupplementMarche) => {
    lastLocalChangeRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => ({ ...p, supplementsMarche: (p.supplementsMarche || []).map(x => x.id === s.id ? s : x) }));
  };
  const deleteSupplementMarche = (id: string) => {
    deletedGenericIdsRef.current.add(id);
    setData(p => ({ ...p, supplementsMarche: (p.supplementsMarche || []).filter(x => x.id !== id) }));
  };

  const togglePresenceForcee = (employeId: string, date: string, forcePar?: string) => {
    setData(p => {
      const list = p.presencesForcees || [];
      const exists = list.some(pf => pf.employeId === employeId && pf.date === date);
      if (exists) return { ...p, presencesForcees: list.filter(pf => !(pf.employeId === employeId && pf.date === date)) };
      return { ...p, presencesForcees: [...list, { employeId, date, forcePar }] };
    });
  };

  const logout = () => setCurrentUserPersisted(null);

  return (
    <AppContext.Provider value={{
      data, currentUser, isHydrated, setCurrentUser: setCurrentUserPersisted,
      addChantier, updateChantier, deleteChantier,
      addEmploye, updateEmploye, deleteEmploye,
      addAffectation, updateAffectation, removeAffectation,
      upsertNote, deleteNote, toggleTask, addTaskPhoto, addTask, deleteTask,
      addPointage, updatePointage, deletePointage,
      addAcompte, deleteAcompte,
      upsertFicheChantier,
      addSousTraitant, updateSousTraitant, deleteSousTraitant,
      addApporteur, updateApporteur, deleteApporteur,
      addDevis, updateDevis, deleteDevis,
      addMarche, updateMarche, deleteMarche,
      addAcompteST, updateAcompteST, deleteAcompteST,
      addIntervention, updateIntervention, deleteIntervention,
      upsertListeMateriau, deleteListeMateriau, toggleMateriau, addMateriauItem, deleteMateriauItem,
      addDemandeConge, updateDemandeConge, deleteDemandeConge,
      addArretMaladie, updateArretMaladie, deleteArretMaladie,
      addDemandeAvance, updateDemandeAvance, deleteDemandeAvance,
      addFichePaie, deleteFichePaie,
      addRetardPlanifie, updateRetardPlanifie, deleteRetardPlanifie,
      addDepense, updateDepense, deleteDepense,
      addSupplement, updateSupplement, deleteSupplement,
      addDocSuivi, updateDocSuivi, deleteDocSuivi,
      addNoteSuivi, updateNoteSuivi, deleteNoteSuivi,
      addPhotoChantier, addPhotosChantier, deletePhotoChantier,
      addDocumentRH, deleteDocumentRH,
      addDocumentSociete, updateDocumentSociete, deleteDocumentSociete,
      addLivraison, updateLivraison, deleteLivraison,
      addRdvChantier, updateRdvChantier, deleteRdvChantier,
      addMessagePrive, updateMessagePrive, deleteMessagePrive, marquerMessagesLus,
      addNoteChantier, updateNoteChantier, deleteNoteChantier, archiveNoteChantier, deleteNoteChantierArchivee,
      addPlanChantier, deletePlanChantier,
      updateAdminPassword, updateAdminIdentifiant, updateAdminEmployeId, updateMagasinPrefere,
      addMetierPerso, deleteMetierPerso, updateBudgetChantier,
      addFournisseur, deleteFournisseur,
      updateOrdreAffectation,
      updateChantierOrderPlanning,
      addArticleCatalogue, updateArticleCatalogue, deleteArticleCatalogue,
      addAgendaEvent, updateAgendaEvent, deleteAgendaEvent,
      togglePresenceForcee,
      addTicketSAV, updateTicketSAV, deleteTicketSAV,
      addMarcheChantier, updateMarcheChantier, deleteMarcheChantier,
      addSupplementMarche, updateSupplementMarche, deleteSupplementMarche,
      addBadgeEmploye,
      notifications, markNotificationsRead,
      syncStatus,
      refreshData: reloadFromSupabase,
      logout,
    }}>
      {children}
      {saveError && (
        <View style={saveErrorStyles.banner}>
          <View style={saveErrorStyles.content}>
            <Text style={saveErrorStyles.icon}>&#9888;</Text>
            <Text style={saveErrorStyles.text}>{saveError}</Text>
            <Pressable onPress={() => setSaveError(null)} style={saveErrorStyles.close}>
              <Text style={saveErrorStyles.closeText}>&#10005;</Text>
            </Pressable>
          </View>
        </View>
      )}
      {sessionExpired && (
        <View style={sessionStyles.overlay}>
          <View style={sessionStyles.box}>
            <Text style={sessionStyles.icon}>⚠️</Text>
            <Text style={sessionStyles.title}>Session expirée</Text>
            <Text style={sessionStyles.message}>
              Cette application a été ouverte dans un autre onglet.{'\n'}
              Pour éviter tout conflit de données, cet onglet est maintenant en lecture seule.
            </Text>
            <Pressable
              style={sessionStyles.btn}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
            >
              <Text style={sessionStyles.btnText}>Recharger cet onglet</Text>
            </Pressable>
          </View>
        </View>
      )}
    </AppContext.Provider>
  );
}

const sessionStyles = StyleSheet.create({
  overlay: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    maxWidth: 380,
    width: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#11181C', marginBottom: 10, textAlign: 'center' },
  message: { fontSize: 14, color: '#687076', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: {
    backgroundColor: '#1A3A6B',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const saveErrorStyles = StyleSheet.create({
  banner: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0,
    zIndex: 99998,
    backgroundColor: '#EF4444',
    paddingTop: Platform.OS === 'web' ? 8 : 48,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: { fontSize: 18, color: '#fff' },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  close: { padding: 4 },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
