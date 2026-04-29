import { useState, useCallback } from 'react';
import { Platform, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '@/app/context/AppContext';
import { uploadFileToStorage } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';
import { getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';
import type { Note, TaskItem } from '@/app/types';
import type { CellNote } from '@/hooks/usePlanningWeekData';

// ─── Helpers internes ─────────────────────────────────────────────────────────

/** Convertit une `Date` en string `YYYY-MM-DD` en heure locale. */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Génère un identifiant unique pour une note ou tâche. */
function genId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ─── Types exportés ───────────────────────────────────────────────────────────

/**
 * État du modal Notes (notes journalières par cellule).
 * Détenu par le parent ; transmis au hook.
 */
export interface NoteModalState {
  chantierId:      string;
  date:            string;
  /** employeId de l'employé ciblé (ou pseudo `st:${stId}` pour ST). */
  targetEmployeId: string;
  /** Toutes les notes de toutes les affectations de cette cellule. */
  allNotes:        CellNote[];
  /** Note en cours d'édition (null = mode création nouvelle note). */
  editingNote:     CellNote | null;
}

/** Brouillon de la note en cours de saisie/édition. */
export interface NoteDraft {
  texte:       string;
  photos:      string[];
  tasks:       TaskItem[];
  repeatDays:  number;
  visiblePar:  'tous' | 'employes' | 'soustraitants';
  visibleIds:  string[];
  savTicketId: string | null;
}

/** État UI transient du modal (toggles, inputs intermédiaires). */
export interface NoteUi {
  showEditor:    boolean;
  showTaskInput: boolean;
  newTaskText:   string;
  mentionQuery:  string | null;
}

/** Actions exposées par le hook. */
export interface NoteActions {
  /** Bascule en mode création nouvelle note (reset draft + open editor). */
  startNew:    () => void;
  /** Bascule en mode édition d'une note existante. */
  startEdit:   (note: CellNote) => void;
  /** Ferme le modal en sauvegardant si contenu non vide. */
  close:       () => void;
  /** Sauvegarde la note (création ou édition). */
  save:        () => void;
  /** Supprime une note. */
  delete:      (note: CellNote) => void;
  /** Vérifie si l'utilisateur courant peut modifier/supprimer cette note. */
  canEdit:     (note: CellNote) => boolean;
  /** Ajoute une photo (upload Supabase) — web ou expo-image-picker mobile. */
  addPhoto:    () => Promise<void>;
  /** Ajoute un document PDF (mobile uniquement). */
  addDoc:      () => Promise<void>;
  /** Retire une photo du brouillon par index. */
  removePhoto: (idx: number) => void;
  /**
   * Importe un fichier depuis l'Inbox AppGroup (share extension iOS) :
   * upload Supabase + ajout au draft.photos. Retourne `true` si succès,
   * `false` si erreur (le caller doit garder l'item dans l'Inbox).
   */
  addFromInbox: (item: InboxItem) => Promise<boolean>;
}

/** API du hook regroupée en 5 returns top-level (cf. décision audit Option B). */
export interface NotesModalLogic {
  draft:    NoteDraft;
  setDraft: (partial: Partial<NoteDraft>) => void;
  ui:       NoteUi;
  setUi:    (partial: Partial<NoteUi>) => void;
  actions:  NoteActions;
}

// ─── État initial ─────────────────────────────────────────────────────────────

const INITIAL_DRAFT: NoteDraft = {
  texte:       '',
  photos:      [],
  tasks:       [],
  repeatDays:  0,
  visiblePar:  'tous',
  visibleIds:  [],
  savTicketId: null,
};

const INITIAL_UI: NoteUi = {
  showEditor:    false,
  showTaskInput: false,
  newTaskText:   '',
  mentionQuery:  null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook compagnon de `ModalNotes` — gère :
 * - Le brouillon de la note en cours (texte, photos, tâches, options admin)
 * - L'état UI transient (éditeur ouvert, input tâche, suggestions @mention)
 * - Les actions CRUD (start, save, close, delete) et upload (photo, doc)
 *
 * Pattern Option B : 5 returns top-level (`draft`, `setDraft`, `ui`, `setUi`,
 * `actions`) pour respecter le seuil de complexité d'API.
 *
 * Le `noteModal` parent reste contrôlé par le composant parent ; le hook
 * reçoit `setNoteModal` pour pouvoir mettre à jour `allNotes` et
 * `editingNote` après save/delete/start.
 *
 * Préservation 1:1 stricte par rapport aux helpers inline parent
 * (saveNote, handleAddPhoto, handleDeleteNote, etc.).
 */
export function useNotesModalLogic(
  noteModal: NoteModalState | null,
  setNoteModal: React.Dispatch<React.SetStateAction<NoteModalState | null>>,
): NotesModalLogic {
  const { data, currentUser, upsertNote, deleteNote, addTask, deleteTask } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const isST    = currentUser?.role === 'soustraitant';

  const [draftState, setDraftState] = useState<NoteDraft>(INITIAL_DRAFT);
  const [uiState, setUiState] = useState<NoteUi>(INITIAL_UI);

  const setDraft = useCallback((partial: Partial<NoteDraft>) => {
    setDraftState(prev => ({ ...prev, ...partial }));
  }, []);

  const setUi = useCallback((partial: Partial<NoteUi>) => {
    setUiState(prev => ({ ...prev, ...partial }));
  }, []);

  // ─── Helpers internes ─────────────────────────────────────────────────────

  /** Détermine l'auteurId et auteurNom de l'utilisateur courant. */
  const getCurrentAuthor = useCallback((): { auteurId: string; auteurNom: string } => {
    if (isAdmin) {
      return { auteurId: 'admin', auteurNom: 'Administrateur' };
    }
    if (isST) {
      const st = data.sousTraitants.find(s => s.id === currentUser?.soustraitantId);
      return {
        auteurId: `st:${currentUser?.soustraitantId || 'inconnu'}`,
        auteurNom: st ? `${st.prenom} ${st.nom}${st.societe ? ' (' + st.societe + ')' : ''}` : (currentUser?.nom || 'Sous-traitant'),
      };
    }
    const emp = data.employes.find(e => e.id === currentUser?.employeId);
    return {
      auteurId: currentUser?.employeId || 'inconnu',
      auteurNom: emp ? `${emp.prenom} ${emp.nom}` : (currentUser?.nom || 'Employé'),
    };
  }, [isAdmin, isST, currentUser, data]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const startEdit = useCallback((note: CellNote) => {
    setNoteModal(prev => prev ? { ...prev, editingNote: note } : prev);
    setDraftState({
      ...INITIAL_DRAFT,
      texte:  note.texte,
      photos: note.photos || [],
    });
    setUiState(prev => ({ ...prev, showEditor: true }));
  }, [setNoteModal]);

  const startNew = useCallback(() => {
    setNoteModal(prev => prev ? { ...prev, editingNote: null } : prev);
    setDraftState(INITIAL_DRAFT);
    setUiState({ ...INITIAL_UI, showEditor: true });
  }, [setNoteModal]);

  /** Sauvegarde la note (création ou mise à jour). Préservation 1:1. */
  const save = useCallback(() => {
    // Accepter la note si texte OU tâches présentes
    const hasTasks = noteModal?.editingNote
      ? (noteModal.editingNote.tasks || []).length > 0
      : draftState.tasks.length > 0;
    if (!noteModal || (!draftState.texte.trim() && !hasTasks)) return;
    const { auteurId, auteurNom } = getCurrentAuthor();
    const now = new Date().toISOString();

    // Récupérer les tâches : depuis editingNote.tasks (note existante) ou draft.tasks (nouvelle note)
    const tasksToSave = noteModal.editingNote ? (noteModal.editingNote.tasks || []) : draftState.tasks;

    // Déterminer la valeur finale de visiblePar
    const finalVisiblePar: Note['visiblePar'] = draftState.visiblePar === 'tous' || draftState.visiblePar === 'employes' || draftState.visiblePar === 'soustraitants'
      ? (draftState.visibleIds.length > 0 ? draftState.visibleIds : draftState.visiblePar)
      : draftState.visiblePar;

    if (noteModal.editingNote) {
      // Mise à jour d'une note existante
      const updated: Note = {
        ...noteModal.editingNote,
        texte: draftState.texte,
        photos: draftState.photos,
        tasks: tasksToSave,
        visiblePar: finalVisiblePar,
        updatedAt: now,
      };
      upsertNote({
        chantierId: noteModal.chantierId,
        employeId: noteModal.editingNote.affectationEmployeId,
        date: noteModal.date,
        note: updated,
      });
      setNoteModal(prev => {
        if (!prev) return null;
        const allNotes = prev.allNotes.map(n =>
          n.id === updated.id
            ? { ...updated, affectationId: n.affectationId, affectationEmployeId: n.affectationEmployeId }
            : n
        );
        return { ...prev, allNotes, editingNote: null };
      });
    } else {
      const employeId = noteModal.targetEmployeId || (isAdmin ? 'admin' : (currentUser?.employeId || 'inconnu'));
      // Créer la note pour la date courante + répétition si demandée
      const baseDate = new Date(noteModal.date);
      const datesACreer: string[] = [noteModal.date];
      if (draftState.repeatDays > 0 && isAdmin) {
        for (let d = 1; d <= draftState.repeatDays; d++) {
          const nd = new Date(baseDate);
          nd.setDate(nd.getDate() + d);
          datesACreer.push(toYMD(nd));
        }
      }
      datesACreer.forEach(dateStr => {
        const newNote: Note = {
          id: genId(),
          auteurId,
          auteurNom,
          date: dateStr,
          texte: draftState.texte,
          photos: draftState.photos,
          tasks: tasksToSave.length > 0 ? tasksToSave.map(t => ({ ...t, id: genId() })) : undefined,
          visiblePar: finalVisiblePar,
          savTicketId: draftState.savTicketId || undefined,
          createdAt: now,
          updatedAt: now,
        };
        upsertNote({
          chantierId: noteModal.chantierId,
          employeId,
          date: dateStr,
          note: newNote,
        });
        if (dateStr === noteModal.date) {
          const noteWithAff = { ...newNote, affectationId: `aff_pending_${employeId}`, affectationEmployeId: employeId };
          setNoteModal(prev => prev ? { ...prev, allNotes: [...prev.allNotes, noteWithAff], editingNote: null } : null);
        }
      });
      setDraftState(prev => ({ ...prev, repeatDays: 0, visiblePar: 'tous' }));
    }

    Keyboard.dismiss();
    setUiState(prev => ({ ...prev, showEditor: false }));
  }, [noteModal, setNoteModal, draftState, isAdmin, currentUser, upsertNote, getCurrentAuthor]);

  const close = useCallback(() => {
    if (noteModal && uiState.showEditor && (draftState.texte.trim() || draftState.tasks.length > 0)) {
      save();
    }
    setNoteModal(null);
    setDraftState(INITIAL_DRAFT);
    setUiState(INITIAL_UI);
    Keyboard.dismiss();
  }, [noteModal, uiState.showEditor, draftState.texte, draftState.tasks, save, setNoteModal]);

  const handleDelete = useCallback((note: CellNote) => {
    deleteNote(note.affectationId, note.id);
    setNoteModal(prev => {
      if (!prev) return null;
      return { ...prev, allNotes: prev.allNotes.filter(n => n.id !== note.id), editingNote: null };
    });
    setUiState(prev => ({ ...prev, showEditor: false }));
  }, [deleteNote, setNoteModal]);

  const canEdit = useCallback((note: CellNote): boolean => {
    // L'auteur peut toujours modifier/supprimer ses propres notes (même sur jours passés)
    const myId = isAdmin ? 'admin' : (currentUser?.employeId || '');
    return note.auteurId === myId;
  }, [isAdmin, currentUser]);

  // Ajout photo : web via input file, mobile via expo-image-picker
  // Les photos sont uploadées immédiatement vers Supabase Storage
  const addPhoto = useCallback(async (): Promise<void> => {
    const uploadAndAdd = async (base64Uri: string) => {
      const photoId = `note_photo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const chantierId = noteModal?.chantierId || 'general';
      const folder = `chantiers/${chantierId}/notes`;
      const storageUrl = await uploadFileToStorage(base64Uri, folder, photoId);
      setDraftState(prev => ({ ...prev, photos: [...prev.photos, storageUrl || base64Uri] }));
    };

    if (Platform.OS === 'web') {
      const input = document.createElement('input') as HTMLInputElement;
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const files: File[] = Array.from((e.target as HTMLInputElement).files || []);
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const uri = ev.target?.result as string;
            if (uri) await uploadAndAdd(uri);
          };
          reader.readAsDataURL(file);
        });
        document.body.removeChild(input);
      };
      input.click(); setTimeout(() => input.remove(), 60000);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled) {
        for (const asset of result.assets) {
          const compressed = await compressImage(asset.uri);
          await uploadAndAdd(compressed);
        }
      }
    }
  }, [noteModal]);

  // Ajout document PDF (mobile)
  const addDoc = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'web') {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        result.assets.forEach(asset => {
          setDraftState(prev => ({ ...prev, photos: [...prev.photos, asset.uri] }));
        });
      }
    }
  }, []);

  const removePhoto = useCallback((idx: number) => {
    setDraftState(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }));
  }, []);

  // Import depuis l'Inbox AppGroup (share extension iOS).
  // Réutilise uploadFileToStorage (mobile-compat REST API) ; pas de
  // duplication du pipeline web/mobile d'addPhoto. Le fichier source
  // reste dans l'Inbox tant que l'upload n'a pas réussi (caller fait
  // removeInboxItem côté InboxPickerButton).
  const addFromInbox = useCallback(async (item: InboxItem): Promise<boolean> => {
    try {
      const fileURI = getInboxItemPath(item);
      if (!fileURI) {
        console.warn('[notes] inbox file path missing', item.id);
        return false;
      }
      const chantierId = noteModal?.chantierId || 'general';
      const folder = `chantiers/${chantierId}/notes`;
      const photoId = `inbox_${item.id}`;
      const url = await uploadFileToStorage(fileURI, folder, photoId);
      if (!url) {
        console.warn('[notes] upload failed', item.id);
        return false;
      }
      setDraftState(prev => ({ ...prev, photos: [...prev.photos, url] }));
      return true;
    } catch (err) {
      console.warn('[notes] addFromInbox failed', err);
      return false;
    }
  }, [noteModal]);

  // ─── Référence (toggleTask + deleteTask + addTask) ────────────────────────
  // Note : ces mutations sont aussi nécessaires côté composant (callbacks
  // inline dans le JSX checklist). Elles ne passent pas par le hook —
  // le composant les consomme directement via useApp() ou via ses props.

  return {
    draft:    draftState,
    setDraft,
    ui:       uiState,
    setUi,
    actions:  {
      startNew,
      startEdit,
      close,
      save,
      delete:      handleDelete,
      canEdit,
      addPhoto,
      addDoc,
      removePhoto,
      addFromInbox,
    },
  };
}
