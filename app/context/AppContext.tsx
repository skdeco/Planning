import { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadDataFromSupabase, saveDataToSupabase, createManualBackup, mergeDataSafely, LOCAL_DATA_KEY } from '@/lib/supabase';
import type {
  Employe, Chantier, Affectation, AppData, CurrentUser, Note, Pointage, Acompte, FicheChantier,
  SousTraitant, DevisST, MarcheST, AcompteST, Intervention, TaskItem, ListeMateriau, MateriauItem,
  DemandeConge, ArretMaladie, DemandeAvance, FichePaie, RetardPlanifie,
  DepenseChantier, SupplementChantier, DocSuiviChantier, NoteSuiviChantier,
  PhotoChantier,
  DocumentRHEmploye,
  NoteChantier,
  PlanChantier,
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
  toggleMateriau: (listeId: string, itemId: string, achetePar: string) => void;
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
  // Notes chantier
  addNoteChantier: (n: NoteChantier) => void;
  updateNoteChantier: (n: NoteChantier) => void;
  deleteNoteChantier: (id: string) => void;
  archiveNoteChantier: (noteId: string, userId: string) => void;
  deleteNoteChantierArchivee: (id: string) => void;
  // Plans chantier
  addPlanChantier: (chantierId: string, plan: PlanChantier) => void;
  deletePlanChantier: (chantierId: string, planId: string) => void;
  // Messagerie privée
  addMessagePrive: (m: MessagePrive) => void;
  updateMessagePrive: (m: MessagePrive) => void;
  deleteMessagePrive: (id: string) => void;
  marquerMessagesLus: (conversationId: string, lecteurRole: 'admin' | 'employe' | 'soustraitant') => void;
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
    depensesChantier: parsed.depensesChantier || [],
    supplementsChantier: parsed.supplementsChantier || [],
    docsSuiviChantier: parsed.docsSuiviChantier || [],
    notesSuiviChantier: parsed.notesSuiviChantier || [],
    // Galerie photos (ne jamais écraser)
    photosChantier: parsed.photosChantier || [],
    // Documents RH employé (ne jamais écraser)
    documentsRH: parsed.documentsRH || [],
    // Messagerie privée (ne jamais écraser)
    messagesPrive: parsed.messagesPrive || [],
    // Fiches chantier (ne jamais écraser)
    fichesChantier: parsed.fichesChantier || {},
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const isHydrated = loaded;
  // Ref pour éviter la sauvegarde au premier chargement
  const isFirstLoad = useRef(true);
  // Ref pour debounce de la sauvegarde Supabase
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref pour stocker les données les plus récentes (évite les closures stale dans le polling)
  const dataRef = useRef<AppData>(EMPTY_DATA);
  // Set des IDs de listes supprimées localement — le polling ne doit JAMAIS les réintroduire
  const deletedListeIdsRef = useRef<Set<string>>(new Set());
  // Map listeId -> Set<itemId> des items supprimés — le polling ne doit JAMAIS les réintroduire
  const deletedItemIdsRef = useRef<Map<string, Set<string>>>(new Map());
  // Timestamp de la dernière sauvegarde Supabase — évite que le polling réécrase les données locales
  const lastSaveRef = useRef<number>(0);
  // Timestamp de la dernière modification locale (suppression, ajout, toggle)
  const lastLocalChangeRef = useRef<number>(0);

  // ── Chargement initial : SUPABASE = SOURCE DE VÉRITÉ UNIQUE ──
  // Architecture :
  //   1. Supabase est la source de vérité (données partagées entre tous les appareils)
  //   2. localStorage = cache hors-ligne uniquement (fallback si Supabase inaccessible)
  //   3. Si Supabase a des données → les utiliser (même depuis un nouveau téléphone)
  //   4. Si Supabase est vide mais localStorage a des données → synchro vers Supabase
  useEffect(() => {
    const load = async () => {
      // ── 1. Charger l'utilisateur depuis AsyncStorage (local) ──
      let storedUser: CurrentUser | null = null;
      try {
        const raw = await AsyncStorage.getItem(USER_KEY);
        if (raw) storedUser = JSON.parse(raw);
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
        // CAS NORMAL : Supabase a des données → c'est la source de vérité
        // Fusionner avec le local pour récupérer les photos (stockées localement)
        if (localRaw) {
          const merged = mergeDataSafely(supabaseRaw, localRaw);
          // Mais Supabase est prioritaire pour les données structurelles
          const mergedWithSupabasePriority = mergeDataSafely(localRaw, supabaseRaw);
          loadedData = migrateData(mergedWithSupabasePriority);
          console.log(`✅ Supabase prioritaire (${supabaseEmployes} emp) + cache local fusionné`);
        } else {
          loadedData = migrateData(supabaseRaw);
          console.log(`✅ Données chargées depuis Supabase (${supabaseEmployes} emp)`);
        }
      } else if (localRaw && (localEmployes > 0 || localChantiers > 0)) {
        // CAS FALLBACK : Supabase vide ou inaccessible, mais cache local a des données
        // → Utiliser le cache local ET synchroniser vers Supabase
        loadedData = migrateData(localRaw);
        console.log(`⚠️ Supabase vide, utilisation du cache local (${localEmployes} emp)`);
        // Synchroniser immédiatement vers Supabase pour les autres appareils
        saveDataToSupabase(localRaw)
          .then(ok => console.log(ok ? '✅ Cache local synchronisé vers Supabase' : '⚠️ Sync Supabase échouée'))
          .catch(() => {});
      } else if (supabaseRaw && Object.keys(supabaseRaw).length > 0) {
        // Supabase a des données mais pas d'employés (notes, photos, etc.)
        loadedData = migrateData(supabaseRaw);
        console.log('✅ Données Supabase chargées (sans employés)');
      }

      // ── 4. Mettre à jour le cache local avec les données finales ──
      if (loadedData) {
        setData(loadedData);
        AsyncStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(loadedData)).catch(() => {});
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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const dataToSave = data as unknown as Record<string, unknown>;

      lastSaveRef.current = Date.now();

      // 1. Sauvegarder dans Supabase (SANS photos — stripPhotosForSupabase appliqué dans saveDataToSupabase)
      saveDataToSupabase(dataToSave)
        .then(ok => { if (!ok) console.warn('⚠️ Sauvegarde Supabase échouée'); })
        .catch(() => {});

      // 2. Sauvegarder le cache local COMPLET (avec photos) pour le fallback hors-ligne
      AsyncStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(dataToSave)).catch(() => {});
    }, 2000); // 2s de debounce
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, loaded]);

  // ── Backup automatique hebdomadaire ──
  // 1 backup par semaine maximum (le lundi) pour éviter de saturer Supabase.
  // Les photos sont exclues des backups (géré dans createManualBackup).
  // Purge automatique des backups de plus de 4 semaines.
  const lastBackupCheckRef = useRef<number>(0);
  useEffect(() => {
    if (!loaded) return;
    const checkAndBackup = async () => {
      // Vérifier max 1 fois par jour (24h) pour éviter les appels répétés
      if (Date.now() - lastBackupCheckRef.current < 86400000) return;
      lastBackupCheckRef.current = Date.now();
      try {
        // Ne faire un backup que si les données sont substantielles
        if (data.employes.length === 0 && data.chantiers.length === 0) return;

        // Ne faire un backup que le lundi (1 par semaine)
        const today = new Date();
        if (today.getDay() !== 1) return; // 1 = lundi

        // Vérifier si un backup a déjà été fait cette semaine
        const weekKey = `${today.getFullYear()}-W${String(Math.ceil(today.getDate() / 7)).padStart(2, '0')}`;
        const lastBackupWeek = await AsyncStorage.getItem('sk_last_backup_week').catch(() => null);
        if (lastBackupWeek === weekKey) return; // Déjà fait cette semaine

        const success = await createManualBackup(
          data as unknown as Record<string, unknown>,
          'weekly'
        );
        if (success) {
          await AsyncStorage.setItem('sk_last_backup_week', weekKey).catch(() => {});
          console.log('✅ Backup hebdomadaire créé (semaine ' + weekKey + ')');
        }
      } catch (e) {
        console.warn('Backup hebdomadaire échoué:', e);
      }
    };
    // Vérifier au chargement puis toutes les 24h
    checkAndBackup();
    const backupInterval = setInterval(checkAndBackup, 86400000); // 24h
    return () => clearInterval(backupInterval);
  }, [loaded]);

  // ── Polling Supabase toutes les 30s pour synchroniser entre utilisateurs ──
  // Permet à l'admin de voir en temps quasi-réel les demandes RH et listes matériel
  // créées par les employés depuis leur propre session.
  useEffect(() => {
    if (!loaded) return;
    const poll = setInterval(async () => {
      // Ne pas recharger si on vient de sauvegarder OU si un changement local récent n'est pas encore sauvegardé
      // Protection étendue à 15s pour couvrir le debounce 1.5s + marge réseau
      const timeSinceSave = Date.now() - lastSaveRef.current;
      const timeSinceChange = Date.now() - lastLocalChangeRef.current;
      if (timeSinceSave < 15000 || timeSinceChange < 15000) return;
      try {
        const supabaseData = await loadDataFromSupabase();
        if (supabaseData && Object.keys(supabaseData).length > 0) {
          setData(prev => {
            // Fusion ADDITIVE : on ne réduit JAMAIS une collection
            // mergeDataSafely garantit que le local est toujours prioritaire
            // et qu'aucun élément ne peut être perdu
            const prevAsRecord = prev as unknown as Record<string, unknown>;
            const merged = mergeDataSafely(prevAsRecord, supabaseData);

            // Appliquer la migration sur le résultat fusionné
            const result = migrateData(merged);

            // Cas spécial listes matériel : respecter les suppressions locales
            const mergedListes = (() => {
              const freshListes = result.listesMateriaux || [];
              const prevListes = prev.listesMateriaux || [];
              const finalListes: typeof prevListes = [];
              for (const item of freshListes) {
                // Ne pas réintroduire une liste supprimée localement
                if (deletedListeIdsRef.current.has(item.id)) continue;
                const prevItem = prevListes.find(l => l.id === item.id);
                if (prevItem) {
                  // Prendre la plus récente mais filtrer les items supprimés localement
                  const chosen = (prevItem.updatedAt || '') >= (item.updatedAt || '') ? prevItem : item;
                  const deletedItems = deletedItemIdsRef.current.get(item.id);
                  finalListes.push(deletedItems && deletedItems.size > 0
                    ? { ...chosen, items: chosen.items.filter(i => !deletedItems.has(i.id)) }
                    : chosen
                  );
                } else {
                  finalListes.push(item);
                }
              }
              return finalListes;
            })();

            return { ...result, listesMateriaux: mergedListes };
          });
        }
      } catch {}
    }, 300000); // toutes les 5 minutes (réduit le trafic réseau Supabase)
    return () => clearInterval(poll);
  }, [loaded]);

  const setCurrentUserPersisted = (user: CurrentUser | null) => {
    setCurrentUser(user);
    if (user) AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
    else AsyncStorage.removeItem(USER_KEY).catch(() => {});
  };

  // ── Chantiers ──
  const addChantier = (c: Chantier) =>
    setData(p => ({ ...p, chantiers: [...p.chantiers, c] }));
  const updateChantier = (c: Chantier) =>
    setData(p => ({ ...p, chantiers: p.chantiers.map(x => x.id === c.id ? c : x) }));
  const deleteChantier = (id: string) =>
    setData(p => ({
      ...p,
      chantiers: p.chantiers.filter(c => c.id !== id),
      affectations: p.affectations.filter(a => a.chantierId !== id),
      marches: p.marches.filter(m => m.chantierId !== id),
    }));

  // ── Employés ──
  const addEmploye = (e: Employe) =>
    setData(p => ({ ...p, employes: [...p.employes, e] }));
  const updateEmploye = (e: Employe) =>
    setData(p => ({ ...p, employes: p.employes.map(x => x.id === e.id ? e : x) }));
  const deleteEmploye = (id: string) =>
    setData(p => ({
      ...p,
      employes: p.employes.filter(e => e.id !== id),
      affectations: p.affectations.filter(a => a.employeId !== id),
      acomptes: p.acomptes.filter(a => a.employeId !== id),
      chantiers: p.chantiers.map(c => ({ ...c, employeIds: c.employeIds.filter(eid => eid !== id) })),
    }));

  // ── Affectations ──
  const addAffectation = (a: Affectation) =>
    setData(p => ({ ...p, affectations: [...p.affectations, a] }));
  const updateAffectation = (a: Affectation) =>
    setData(p => ({ ...p, affectations: p.affectations.map(x => x.id === a.id ? a : x) }));
  const removeAffectation = (chantierId: string, employeId: string, date: string) =>
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
      return { ...p, affectations: newAffectations };
    });

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
  const addPointage = (pointage: Pointage) =>
    setData(p => {
      const exists = p.pointages.some(x => x.id === pointage.id);
      if (exists) return { ...p, pointages: p.pointages.map(x => x.id === pointage.id ? pointage : x) };
      return { ...p, pointages: [...p.pointages, pointage] };
    });
  const updatePointage = (pointage: Pointage) =>
    setData(p => ({ ...p, pointages: p.pointages.map(x => x.id === pointage.id ? pointage : x) }));
  const deletePointage = (id: string) =>
    setData(p => ({ ...p, pointages: p.pointages.filter(x => x.id !== id) }));

  // ── Acomptes employés ──
  const addAcompte = (acompte: Acompte) =>
    setData(p => ({ ...p, acomptes: [...p.acomptes, acompte] }));
  const deleteAcompte = (id: string) =>
    setData(p => ({ ...p, acomptes: p.acomptes.filter(a => a.id !== id) }));

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
  const deleteSousTraitant = (id: string) =>
    setData(p => ({
      ...p,
      sousTraitants: p.sousTraitants.filter(s => s.id !== id),
      devis: p.devis.filter(d => d.soustraitantId !== id),
      marches: p.devis.filter(d => d.soustraitantId !== id),
      acomptesst: p.acomptesst.filter(a => {
        const devisIds = p.devis.filter(d => d.soustraitantId === id).map(d => d.id);
        return !devisIds.includes(a.devisId);
      }),
    }));

  // ── Devis ST ──
  const addDevis = (devis: DevisST) =>
    setData(p => ({ ...p, devis: [...p.devis, devis], marches: [...p.devis, devis] }));
  const updateDevis = (devis: DevisST) =>
    setData(p => ({
      ...p,
      devis: p.devis.map(x => x.id === devis.id ? devis : x),
      marches: p.devis.map(x => x.id === devis.id ? devis : x),
    }));
  const deleteDevis = (id: string) =>
    setData(p => ({
      ...p,
      devis: p.devis.filter(d => d.id !== id),
      marches: p.devis.filter(d => d.id !== id),
      acomptesst: p.acomptesst.filter(a => a.devisId !== id),
    }));
  const addMarche = addDevis;
  const updateMarche = updateDevis;
  const deleteMarche = deleteDevis;

  // ── Acomptes ST ──
  const addAcompteST = (acompte: AcompteST) =>
    setData(p => ({ ...p, acomptesst: [...p.acomptesst, acompte] }));
  const updateAcompteST = (acompte: AcompteST) =>
    setData(p => ({ ...p, acomptesst: p.acomptesst.map(x => x.id === acompte.id ? acompte : x) }));
  const deleteAcompteST = (id: string) =>
    setData(p => ({ ...p, acomptesst: p.acomptesst.filter(a => a.id !== id) }));

  // ── Interventions externes ──
  const addIntervention = (intervention: Intervention) =>
    setData(p => ({ ...p, interventions: [...(p.interventions || []), intervention] }));
  const updateIntervention = (intervention: Intervention) =>
    setData(p => ({ ...p, interventions: (p.interventions || []).map(x => x.id === intervention.id ? intervention : x) }));
  const deleteIntervention = (id: string) =>
    setData(p => ({ ...p, interventions: (p.interventions || []).filter(i => i.id !== id) }));

  // ── Listes matériel ──
  const upsertListeMateriau = (liste: ListeMateriau) =>
    setData(p => {
      const exists = (p.listesMateriaux || []).some(l => l.id === liste.id);
      return {
        ...p,
        listesMateriaux: exists
          ? (p.listesMateriaux || []).map(l => l.id === liste.id ? liste : l)
          : [...(p.listesMateriaux || []), liste],
      };
    });

  const deleteListeMateriau = (id: string) => {
    lastLocalChangeRef.current = Date.now();
    // Mémoriser l'ID supprimé pour que le polling ne le réintroduise jamais
    deletedListeIdsRef.current.add(id);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setData(p => {
      const newData = { ...p, listesMateriaux: (p.listesMateriaux || []).filter(l => l.id !== id) };
      // Sauvegarder immédiatement dans Supabase
      lastSaveRef.current = Date.now();
      saveDataToSupabase(newData as unknown as Record<string, unknown>).catch(() => {});
      return newData;
    });
  };

  const toggleMateriau = (listeId: string, itemId: string, achetePar: string) =>
    setData(p => ({
      ...p,
      listesMateriaux: (p.listesMateriaux || []).map(l => {
        if (l.id !== listeId) return l;
        const now = new Date().toISOString();
        return {
          ...l,
          updatedAt: now,
          items: l.items.map(item => item.id === itemId
            ? { ...item, achete: !item.achete, achetePar: !item.achete ? achetePar : undefined, acheteAt: !item.achete ? now : undefined }
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
      saveDataToSupabase(newData as unknown as Record<string, unknown>).catch(() => {});
      return newData;
    });
  };

  // ── Module RH ──
  const addDemandeConge = (d: DemandeConge) =>
    setData(p => ({ ...p, demandesConge: [...(p.demandesConge || []), d] }));
  const updateDemandeConge = (d: DemandeConge) =>
    setData(p => ({ ...p, demandesConge: (p.demandesConge || []).map(x => x.id === d.id ? d : x) }));
  const deleteDemandeConge = (id: string) =>
    setData(p => ({ ...p, demandesConge: (p.demandesConge || []).filter(x => x.id !== id) }));

  const addArretMaladie = (a: ArretMaladie) =>
    setData(p => ({ ...p, arretsMaladie: [...(p.arretsMaladie || []), a] }));
  const updateArretMaladie = (a: ArretMaladie) =>
    setData(p => ({ ...p, arretsMaladie: (p.arretsMaladie || []).map(x => x.id === a.id ? a : x) }));
  const deleteArretMaladie = (id: string) =>
    setData(p => ({ ...p, arretsMaladie: (p.arretsMaladie || []).filter(x => x.id !== id) }));

  const addDemandeAvance = (d: DemandeAvance) =>
    setData(p => ({ ...p, demandesAvance: [...(p.demandesAvance || []), d] }));
  const updateDemandeAvance = (d: DemandeAvance) =>
    setData(p => ({ ...p, demandesAvance: (p.demandesAvance || []).map(x => x.id === d.id ? d : x) }));
  const deleteDemandeAvance = (id: string) =>
    setData(p => ({ ...p, demandesAvance: (p.demandesAvance || []).filter(x => x.id !== id) }));

  const addFichePaie = (f: FichePaie) =>
    setData(p => ({ ...p, fichesPaie: [...(p.fichesPaie || []), f] }));
  const deleteFichePaie = (id: string) =>
    setData(p => ({ ...p, fichesPaie: (p.fichesPaie || []).filter(x => x.id !== id) }));

  // ── Module Suivi Chantier ──
  const addDepense = (d: DepenseChantier) =>
    setData(p => ({ ...p, depenses: [...(p.depenses || []), d] }));
  const updateDepense = (d: DepenseChantier) =>
    setData(p => ({ ...p, depenses: (p.depenses || []).map(x => x.id === d.id ? d : x) }));
  const deleteDepense = (id: string) =>
    setData(p => ({ ...p, depenses: (p.depenses || []).filter(x => x.id !== id) }));

  const addSupplement = (s: SupplementChantier) =>
    setData(p => ({ ...p, supplements: [...(p.supplements || []), s] }));
  const updateSupplement = (s: SupplementChantier) =>
    setData(p => ({ ...p, supplements: (p.supplements || []).map(x => x.id === s.id ? s : x) }));
  const deleteSupplement = (id: string) =>
    setData(p => ({ ...p, supplements: (p.supplements || []).filter(x => x.id !== id) }));

  const addDocSuivi = (d: DocSuiviChantier) =>
    setData(p => ({ ...p, docsSuivi: [...(p.docsSuivi || []), d] }));
  const updateDocSuivi = (d: DocSuiviChantier) =>
    setData(p => ({ ...p, docsSuivi: (p.docsSuivi || []).map(x => x.id === d.id ? d : x) }));
  const deleteDocSuivi = (id: string) =>
    setData(p => ({ ...p, docsSuivi: (p.docsSuivi || []).filter(x => x.id !== id) }));

  const addNoteSuivi = (n: NoteSuiviChantier) =>
    setData(p => ({ ...p, notesSuivi: [...(p.notesSuivi || []), n] }));
  const updateNoteSuivi = (n: NoteSuiviChantier) =>
    setData(p => ({ ...p, notesSuivi: (p.notesSuivi || []).map(x => x.id === n.id ? n : x) }));
  const deleteNoteSuivi = (id: string) =>
    setData(p => ({ ...p, notesSuivi: (p.notesSuivi || []).filter(x => x.id !== id) }));

  // ── Documents RH employé ──
  const addDocumentRH = (d: DocumentRHEmploye) =>
    setData(p => ({ ...p, documentsRH: [...(p.documentsRH || []), d] }));
  const deleteDocumentRH = (id: string) =>
    setData(p => ({ ...p, documentsRH: (p.documentsRH || []).filter(x => x.id !== id) }));

  // ── Messagerie privée ──
  const addMessagePrive = (m: MessagePrive) =>
    setData(p => ({ ...p, messagesPrive: [...(p.messagesPrive || []), m] }));
  const updateMessagePrive = (m: MessagePrive) =>
    setData(p => ({ ...p, messagesPrive: (p.messagesPrive || []).map(x => x.id === m.id ? m : x) }));
  const deleteMessagePrive = (id: string) =>
    setData(p => ({ ...p, messagesPrive: (p.messagesPrive || []).filter(x => x.id !== id) }));
  const marquerMessagesLus = (conversationId: string, lecteurRole: 'admin' | 'employe' | 'soustraitant') =>
    setData(p => ({
      ...p,
      messagesPrive: (p.messagesPrive || []).map(m =>
        m.conversationId === conversationId && m.expediteurRole !== lecteurRole
          ? { ...m, lu: true }
          : m
      ),
    }));

  // ── Galerie photos chantier ──
  const addPhotoChantier = (photo: PhotoChantier) =>
    setData(p => ({ ...p, photosChantier: [...(p.photosChantier || []), photo] }));
  const addPhotosChantier = (photos: PhotoChantier[]) =>
    setData(p => ({ ...p, photosChantier: [...(p.photosChantier || []), ...photos] }));
  const deletePhotoChantier = (id: string) =>
    setData(p => ({ ...p, photosChantier: (p.photosChantier || []).filter(x => x.id !== id) }));

  // ── Retards planifiés ──
  const addRetardPlanifie = (r: RetardPlanifie) =>
    setData(p => ({ ...p, retardsPlanifies: [...(p.retardsPlanifies || []), r] }));
  const updateRetardPlanifie = (r: RetardPlanifie) =>
    setData(p => ({ ...p, retardsPlanifies: (p.retardsPlanifies || []).map(x => x.id === r.id ? r : x) }));
  const deleteRetardPlanifie = (id: string) =>
    setData(p => ({ ...p, retardsPlanifies: (p.retardsPlanifies || []).filter(x => x.id !== id) }));

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
  const deleteNoteChantierArchivee = (id: string) =>
    setData(p => ({
      ...p,
      notesChantier: (p.notesChantier || []).filter(n => n.id !== id),
    }));

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

  const deletePlanChantier = (chantierId: string, planId: string) =>
    setData(p => ({
      ...p,
      chantiers: p.chantiers.map(c =>
        c.id === chantierId
          ? { ...c, fiche: c.fiche ? { ...c.fiche, plans: (c.fiche.plans || []).filter(pl => pl.id !== planId) } : c.fiche }
          : c
      ),
    }));

  const logout = () => setCurrentUserPersisted(null);

  return (
    <AppContext.Provider value={{
      data, currentUser, isHydrated, setCurrentUser: setCurrentUserPersisted,
      addChantier, updateChantier, deleteChantier,
      addEmploye, updateEmploye, deleteEmploye,
      addAffectation, updateAffectation, removeAffectation,
      upsertNote, deleteNote, toggleTask, addTask, deleteTask,
      addPointage, updatePointage, deletePointage,
      addAcompte, deleteAcompte,
      upsertFicheChantier,
      addSousTraitant, updateSousTraitant, deleteSousTraitant,
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
      addMessagePrive, updateMessagePrive, deleteMessagePrive, marquerMessagesLus,
      addNoteChantier, updateNoteChantier, deleteNoteChantier, archiveNoteChantier, deleteNoteChantierArchivee,
      addPlanChantier, deletePlanChantier,
      logout,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
