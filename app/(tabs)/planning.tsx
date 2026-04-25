import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  FlatList, Dimensions, Platform, TextInput, KeyboardAvoidingView, useWindowDimensions,
  TouchableWithoutFeedback, Keyboard, Image, Alert, RefreshControl, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { compressImage } from '@/lib/imageUtils';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { LanguageFlag } from '@/components/LanguageFlag';
import { useRefresh } from '@/hooks/useRefresh';
import { usePlanningWeekData } from '@/hooks/usePlanningWeekData';
import { useCellAffectationManager } from '@/hooks/useCellAffectationManager';
import { PlanningDirection } from '@/components/PlanningDirection';
import { AlertesChantiersRetard } from '@/components/planning/AlertesChantiersRetard';
import {
  AdminPlanningModeSwitcher,
  type PlanningMode,
} from '@/components/planning/AdminPlanningModeSwitcher';
import { ModalRetardPlanifie } from '@/components/planning/ModalRetardPlanifie';
import {
  MonthViewGrid,
  type MonthGridCell,
} from '@/components/planning/MonthViewGrid';
import {
  ModalPlansChantier,
  type PlanChantierEntry,
  type PlanParticipant,
  type PlanChantierValues,
} from '@/components/planning/ModalPlansChantier';
import {
  ModalNotesChantier,
  type NoteChantierEntry,
  type NoteChantierFormValues,
  type NoteParticipant,
} from '@/components/planning/ModalNotesChantier';
import { GanttTimelineAdmin } from '@/components/planning/GanttTimelineAdmin';
import {
  ModalAjoutEmployesST,
  type InterventionFormValues,
} from '@/components/planning/ModalAjoutEmployesST';
import {
  METIER_COLORS, METIERS_LIST, EMPLOYE_COLORS, INTERVENTION_COLORS, getEmployeColor,
  type Note, type TaskItem,
  type NoteChantier,
  type PlanChantier,
} from '@/app/types';
import { DatePicker } from '@/components/DatePicker';
import { uploadFileToStorage } from '@/lib/supabase';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { ChantierActionsModal } from '@/components/ChantierActionsModal';
import { PortailClient } from '@/components/PortailClient';
import { BilanFinancierChantier } from '@/components/BilanFinancierChantier';
import { MarchesChantier } from '@/components/MarchesChantier';
// expo-print et expo-sharing nécessitent un build natif — import dynamique uniquement
const getPrintModule = () => import('expo-print').catch(() => null);
const getSharingModule = () => import('expo-sharing').catch(() => null);

// ─── Mini calendrier inline pour la navigation planning ───────────────────────
const CAL_JOURS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const CAL_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
function parseYMDLocal(str: string): Date | null {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}
function DatePickerCalendar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const init = parseYMDLocal(value) || new Date();
  const [calYear, setCalYear] = useState(init.getFullYear());
  const [calMonth, setCalMonth] = useState(init.getMonth());
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const getDays = () => {
    let dow = new Date(calYear, calMonth, 1).getDay();
    dow = dow === 0 ? 6 : dow - 1;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(dow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };
  const todayD = new Date();
  const isToday2 = (day: number) => todayD.getFullYear() === calYear && todayD.getMonth() === calMonth && todayD.getDate() === day;
  const isSelected = (day: number) => {
    const sel = parseYMDLocal(value);
    return sel ? sel.getFullYear() === calYear && sel.getMonth() === calMonth && sel.getDate() === day : false;
  };
  const cells = getDays();
  return (
    <View>
      <View style={calStyles.header}>
        <Pressable style={calStyles.navBtn} onPress={prevMonth}><Text style={calStyles.navArrow}>‹</Text></Pressable>
        <Text style={calStyles.title}>{CAL_MOIS[calMonth]} {calYear}</Text>
        <Pressable style={calStyles.navBtn} onPress={nextMonth}><Text style={calStyles.navArrow}>›</Text></Pressable>
      </View>
      <View style={calStyles.weekRow}>
        {CAL_JOURS.map(j => <Text key={j} style={calStyles.weekDay}>{j}</Text>)}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={idx} style={calStyles.cell} />;
          const sel = isSelected(day);
          const tod = isToday2(day);
          return (
            <Pressable key={idx} style={[calStyles.cell, tod && calStyles.cellToday, sel && calStyles.cellSel]} onPress={() => { const d = new Date(calYear, calMonth, day); onChange(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }}>
              <Text style={[calStyles.cellText, tod && calStyles.cellTextToday, sel && calStyles.cellTextSel]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const calStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 18, color: '#2C2C2C', fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#687076', textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginVertical: 1 },
  cellToday: { borderWidth: 1.5, borderColor: '#2C2C2C' },
  cellSel: { backgroundColor: '#2C2C2C' },
  cellText: { fontSize: 13, color: '#11181C', fontWeight: '500' },
  cellTextToday: { color: '#2C2C2C', fontWeight: '700' },
  cellTextSel: { color: '#fff', fontWeight: '700' },
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('@/assets/images/sk_deco_logo.png') as number;

// Dimensions recalculées dynamiquement dans le composant
// Ces valeurs servent uniquement de fallback pour les styles statiques
const NAME_COL_DEFAULT = 70;
const DAY_COL = 80; // fallback pour les styles statiques

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toYMD(date: Date): string {
  // Utiliser la date locale (pas UTC) pour éviter les décalages lors du changement d'heure
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  return d.getTime() >= s.getTime() && d.getTime() <= e.getTime();
}

function isToday(date: Date): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

function isPast(dateStr: string): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function genId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** État du modal de notes */
interface NoteModalState {
  chantierId: string;
  date: string;
  /** employeId de l'employé ciblé (pour associer la note à cet employé) */
  targetEmployeId: string;
  /** Toutes les notes de toutes les affectations de cette cellule */
  allNotes: Array<Note & { affectationId: string; affectationEmployeId: string }>;
  /** Note en cours d'édition (null = nouvelle note) */
  editingNote: (Note & { affectationId: string; affectationEmployeId: string }) | null;
}

export default function PlanningScreen() {
  const { data, currentUser, isHydrated, addAffectation, upsertNote, deleteNote, toggleTask, addTask, deleteTask, addIntervention, updateIntervention, deleteIntervention, logout, addRetardPlanifie, deleteRetardPlanifie, addNoteChantier, archiveNoteChantier, deleteNoteChantier, addPlanChantier, deletePlanChantier, updateAdminPassword, updateAdminIdentifiant, updateAdminEmployeId, updateMagasinPrefere, updateOrdreAffectation, updateChantierOrderPlanning, addAgendaEvent, updateAgendaEvent, deleteAgendaEvent, deleteChantier } = useApp();
  const { t } = useLanguage();
  const { refreshing, onRefresh } = useRefresh();
  const { width: windowWidth } = useWindowDimensions();
  // Calcul dynamique : la grille tient TOUJOURS dans l'écran
  const NAME_COL = Math.max(50, Math.floor(windowWidth * 0.15)); // 15% de l'écran, min 50px
  const dayCol = Math.floor((windowWidth - NAME_COL) / 7);
  const needsHorizontalScroll = false; // Plus jamais de scroll horizontal
  // Mode planning : Équipe (grille) ou Direction (agenda)
  const [planningMode, setPlanningMode] = useState<PlanningMode>('equipe');
  // Weekend (samedi/dimanche) : afficher par défaut la semaine suivante
  const [weekOffset, setWeekOffset] = useState(() => {
    const dow = new Date().getDay(); // 0=dim, 6=sam
    return (dow === 0 || dow === 6) ? 1 : 0;
  });
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'semaine' | 'mois' | 'gantt'>('semaine');
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Modal admin : ajout/suppression d'employés dans une cellule
  const [modal, setModal] = useState<{ chantierId: string; date: string } | null>(null);
  // Modal notes : visible par admin et employés
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  // Modal fiche chantier
  const [ficheModal, setFicheModal] = useState<{ chantier: typeof data.chantiers[0] } | null>(null);
  // Modal Actions chantier (nouveau menu roue d'actions)
  const [actionsChantierId, setActionsChantierId] = useState<string | null>(null);
  // Sous-modales ouvertes depuis ChantierActionsModal (unifié avec l'onglet Chantiers)
  const [portailClientIdPlanning, setPortailClientIdPlanning] = useState<string | null>(null);
  const [bilanChantierIdPlanning, setBilanChantierIdPlanning] = useState<string | null>(null);
  const [marchesIdPlanning, setMarchesIdPlanning] = useState<string | null>(null);
  // Modal intervention (admin)
  const [interventionModal, setInterventionModal] = useState<{ chantierId: string; editId: string | null } | null>(null);
  const [interventionForm, setInterventionForm] = useState<InterventionFormValues>({ libelle: '', description: '', dateDebut: '', dateFin: '', couleur: INTERVENTION_COLORS[0] });
  const [noteText, setNoteText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [notePhotos, setNotePhotos] = useState<string[]>([]);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  // Checklist dans les notes
  const [newTaskText, setNewTaskText] = useState('');
  const [showTaskInput, setShowTaskInput] = useState(false);
  // Tâches en attente (pour une nouvelle note avant enregistrement)
  const [pendingTasksList, setPendingTasksList] = useState<TaskItem[]>([]);
  // Options de la note : répétition et visibilité
  const [noteRepeatDays, setNoteRepeatDays] = useState(0); // 0 = pas de répétition
  const [noteVisiblePar, setNoteVisiblePar] = useState<'tous' | 'employes' | 'soustraitants'>('tous');
  const [noteSavTicketId, setNoteSavTicketId] = useState<string | null>(null);
  // Visibilité de note : sélection spécifique d'acteurs
  const [noteVisibleIds, setNoteVisibleIds] = useState<string[]>([]);
  // Galerie photos globale
  const [showGalerieGlobale, setShowGalerieGlobale] = useState(false);
  const [galerieChantierId, setGalerieChantierId] = useState<string | undefined>(undefined);
  // Notes chantier (modal dans planning)
  const [showNotesPlanning, setShowNotesPlanning] = useState(false);
  const [notesPlanningChantierId, setNotesPlanningChantierId] = useState<string | null>(null);

  const chantierNomNotes = useMemo(() => {
    if (!notesPlanningChantierId) return '';
    return data.chantiers.find(c => c.id === notesPlanningChantierId)?.nom ?? '';
  }, [notesPlanningChantierId, data.chantiers]);

  const notesVisibles = useMemo<NoteChantierEntry[]>(() => {
    if (!notesPlanningChantierId) return [];
    const isAdminUser = currentUser?.role === 'admin';
    const userId = isAdminUser ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || '');
    return (data.notesChantier || [])
      .filter(n => {
        if (n.chantierId !== notesPlanningChantierId) return false;
        if (n.archivedBy.includes(userId)) return false;
        if (n.destinataires === 'tous') return true;
        if (isAdminUser) return true;
        return (n.destinataires as string[]).includes(userId);
      })
      .map(n => ({
        id:              n.id,
        auteurId:        n.auteurId,
        auteurNom:       n.auteurNom,
        texte:           n.texte,
        createdAt:       n.createdAt,
        destinataires:   n.destinataires,
        photos:          n.photos,
        pieceJointe:     n.pieceJointe,
        pieceJointeType: n.pieceJointeType,
        pieceJointeNom:  n.pieceJointeNom,
      }));
  }, [notesPlanningChantierId, data.notesChantier, currentUser]);

  const participantsForNotes = useMemo<NoteParticipant[]>(() => [
    ...data.employes.map(e => ({ id: e.id, label: e.prenom, kind: 'employe' as const })),
    ...(data.sousTraitants || []).map(s => ({ id: s.id, label: s.nom, kind: 'soustraitant' as const })),
  ], [data.employes, data.sousTraitants]);

  const handlePickNotePhotos = async (): Promise<string[]> => {
    if (Platform.OS !== 'web') return [];
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.multiple = true;
      const collected: string[] = [];
      let pending = 0;
      input.onchange = (e: Event) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        if (files.length === 0) { resolve([]); return; }
        pending = files.length;
        files.forEach(file => {
          const reader = new FileReader();
          const finalize = () => { pending -= 1; if (pending === 0) resolve(collected); };
          reader.onload  = () => { collected.push(reader.result as string); finalize(); };
          reader.onerror = finalize;
          reader.readAsDataURL(file);
        });
      };
      input.click();
      setTimeout(() => input.remove(), 60000);
    });
  };

  const handleAddNoteChantier = (values: NoteChantierFormValues): void => {
    if (!notesPlanningChantierId) return;
    const isAdminUser = currentUser?.role === 'admin';
    const userId = isAdminUser ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    const nom = isAdminUser
      ? 'Admin'
      : (data.employes.find(e => e.id === userId)?.prenom
        || (data.sousTraitants || []).find(s => s.id === userId)?.nom
        || 'Inconnu');
    addNoteChantier({
      id:            `nc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      chantierId:    notesPlanningChantierId,
      auteurId:      userId,
      auteurNom:     nom,
      texte:         values.texte.trim(),
      createdAt:     new Date().toISOString(),
      destinataires: isAdminUser ? values.destinataires : 'tous',
      archivedBy:    [],
      photos:        values.photos.length > 0 ? values.photos : undefined,
    });
  };

  const handleArchiveNoteChantier = (noteId: string): void => {
    const isAdminUser = currentUser?.role === 'admin';
    const userId = isAdminUser ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    archiveNoteChantier(noteId, userId);
  };

  const handleDeleteNoteChantier = (noteId: string): void => {
    deleteNoteChantier(noteId);
  };

  // Plans chantier (modal dans planning)
  const [showPlansPlanning, setShowPlansPlanning] = useState(false);
  const [plansPlanningChantierId, setPlansPlanningChantierId] = useState<string | null>(null);

  const chantierNomPlans = useMemo(() => {
    if (!plansPlanningChantierId) return '';
    return data.chantiers.find(c => c.id === plansPlanningChantierId)?.nom ?? '';
  }, [plansPlanningChantierId, data.chantiers]);

  const plansVisibles = useMemo<PlanChantierEntry[]>(() => {
    if (!plansPlanningChantierId) return [];
    const chantier = data.chantiers.find(c => c.id === plansPlanningChantierId);
    const allPlans = chantier?.fiche?.plans || [];
    const isAdminUser = currentUser?.role === 'admin';
    const filtered = isAdminUser ? allPlans : allPlans.filter(p => {
      const userId = currentUser?.employeId || currentUser?.soustraitantId || '';
      const isSTUser = !!currentUser?.soustraitantId;
      if (p.visiblePar === 'tous') return true;
      if (p.visiblePar === 'employes' && !isSTUser) return true;
      if (p.visiblePar === 'soustraitants' && isSTUser) return true;
      if (p.visiblePar === 'specifique') return (p.visibleIds || []).includes(userId);
      return false;
    });
    return filtered.map(p => ({
      id:         p.id,
      nom:        p.nom,
      fichier:    p.fichier,
      uploadedAt: p.uploadedAt,
    }));
  }, [plansPlanningChantierId, data.chantiers, currentUser]);

  const participantsForPlans = useMemo<PlanParticipant[]>(() => [
    ...data.employes.map(e => ({ id: e.id, label: e.prenom, kind: 'employe' as const })),
    ...(data.sousTraitants || []).map(s => ({ id: s.id, label: s.nom, kind: 'soustraitant' as const })),
  ], [data.employes, data.sousTraitants]);

  const handlePickPlanFile = async (): Promise<string | null> => {
    if (Platform.OS !== 'web') return null;
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const chantierId = plansPlanningChantierId || 'general';
          const storageUrl = await uploadFileToStorage(base64, `chantiers/${chantierId}/plans`, planId);
          resolve(storageUrl || base64);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      setTimeout(() => input.remove(), 60000);
    });
  };

  const handleAddPlan = (values: PlanChantierValues): void => {
    if (!plansPlanningChantierId) return;
    const plan: PlanChantier = {
      id:         `pl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      nom:        values.nom,
      fichier:    values.fichier,
      visiblePar: values.visiblePar,
      visibleIds: values.visibleIds,
      uploadedAt: new Date().toISOString(),
    };
    addPlanChantier(plansPlanningChantierId, plan);
  };

  const handleDeletePlan = (planId: string): void => {
    if (!plansPlanningChantierId) return;
    deletePlanChantier(plansPlanningChantierId, planId);
  };

  // Retard planifié (employé)
  const [showRetardModal, setShowRetardModal] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const isST = currentUser?.role === 'soustraitant';

  // ─── Données dérivées de la vue Semaine (hook usePlanningWeekData) ────────
  const {
    days,
    weekLabel,
    visibleChantiers,
    getEmployesForCell,
    getInterventionsForCell,
    getSTForCell,
    getAllNotesForCell,
    cellHasNotes,
    getOrdreChantiers,
    getOrdreNum,
  } = usePlanningWeekData(weekOffset);

  // ─── Mutations cellule (hook useCellAffectationManager) ───────────────────
  const {
    moveEmploye,
    toggleLieuTravail,
    removeEmployeFromCell,
    removeSTFromCell,
  } = useCellAffectationManager();

  // Modal déplacer un employé (drag & drop simplifié)
  const [moveModal, setMoveModal] = useState<{ employeId: string; chantierId: string; date: string } | null>(null);
  const [moveTargetChantierId, setMoveTargetChantierId] = useState<string | null>(null);
  const [moveTargetDate, setMoveTargetDate] = useState<string>('');

  // Modal paramètres compte admin (identifiant + mot de passe + employé lié)
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [adminIdEdit, setAdminIdEdit] = useState('');
  const [adminEmployeIdEdit, setAdminEmployeIdEdit] = useState<string | undefined>(undefined);
  const [magasinEdit, setMagasinEdit] = useState('');
  const [pwdActuel, setPwdActuel] = useState('');
  const [pwdNouveau, setPwdNouveau] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const openAdminSettings = () => {
    setAdminIdEdit(data.adminIdentifiant || 'admin');
    setAdminEmployeIdEdit(data.adminEmployeId);
    setMagasinEdit(data.magasinPrefere || '');
    setPwdActuel(''); setPwdNouveau(''); setPwdConfirm(''); setPwdError(''); setPwdSuccess(false);
    setShowPwdModal(true);
  };
  const handleSaveAdminSettings = () => {
    // Valider identifiant
    const newId = adminIdEdit.trim();
    if (!newId) { setPwdError("L'identifiant ne peut pas être vide."); return; }
    // Vérifier que l'identifiant n'est pas déjà pris par un employé ou sous-traitant
    const idLower = newId.toLowerCase();
    const currentAdminId = (data.adminIdentifiant || 'admin').toLowerCase();
    if (idLower !== currentAdminId) {
      const conflict = data.employes.find(e => e.identifiant.toLowerCase() === idLower)
        || data.sousTraitants.find(s => s.identifiant.toLowerCase() === idLower);
      if (conflict) { setPwdError("Cet identifiant est déjà utilisé par un employé ou sous-traitant."); return; }
    }
    // Valider mot de passe (seulement si l'utilisateur veut le changer)
    if (pwdActuel || pwdNouveau || pwdConfirm) {
      const current = data.adminPassword || 'admin';
      if (pwdActuel !== current) { setPwdError('Mot de passe actuel incorrect.'); return; }
      if (pwdNouveau.length < 4) { setPwdError('Le nouveau mot de passe doit faire au moins 4 caractères.'); return; }
      if (pwdNouveau !== pwdConfirm) { setPwdError('Les mots de passe ne correspondent pas.'); return; }
      updateAdminPassword(pwdNouveau);
    }
    // Sauvegarder identifiant
    updateAdminIdentifiant(newId);
    // Sauvegarder employé lié
    updateAdminEmployeId(adminEmployeIdEdit);
    // Sauvegarder magasin préféré
    updateMagasinPrefere(magasinEdit.trim() || undefined);
    setPwdSuccess(true);
    setPwdError('');
    setTimeout(() => { setShowPwdModal(false); setPwdSuccess(false); }, 1500);
  };
  // ── Ordre affectations multi-chantiers ────────────────────────────────────
  const [ordreModal, setOrdreModal] = useState<{ employeId: string; date: string; chantierIds: string[] } | null>(null);

  const currentEmployePlanning = data.employes.find(e => e.id === currentUser?.employeId);
  const isAcheteurPlanning = isAdmin || (currentEmployePlanning?.isAcheteur === true);

  // Badge matériel : total articles non achetés dans les listes des chantiers actifs
  // Se remet à 0 en temps réel dès que toutes les listes sont vides ou complètement cochées
  const nbArticlesNonAchetes = useMemo(() => {
    if (!isAcheteurPlanning) return 0;
    const listes = data.listesMateriaux || [];
    if (listes.length === 0) return 0;
    // Exclure les chantiers terminés
    const chantiersActifsIds = new Set(
      data.chantiers.filter(c => c.statut !== 'termine').map(c => c.id)
    );
    let total = 0;
    for (const l of listes) {
      if (!chantiersActifsIds.has(l.chantierId)) continue;
      if (!l.items || l.items.length === 0) continue;
      for (const item of l.items) {
        if (item.achete !== true) total++;
      }
    }
    return total;
  }, [data.listesMateriaux, data.chantiers, isAcheteurPlanning]);
  const router = useRouter();

  // Rediriger vers /login quand currentUser devient null (après logout)
  // IMPORTANT : attendre l'hydratation pour éviter une redirection prématurée
  useEffect(() => {
    if (isHydrated && !currentUser) {
      router.replace('/login');
    }
  }, [isHydrated, currentUser, router]);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm ? (typeof window !== 'undefined' && window.confirm ? window.confirm('Se déconnecter ?') : true) : true) logout();
    } else {
      Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: logout },
      ]);
    }
  };

  // ── Export / sauvegarde manuelle des données ─────────────────────────────
  const handleExportData = () => {
    try {
      const exportObj = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        employes: data.employes.length,
        chantiers: data.chantiers.length,
        data: data,
      };
      const jsonStr = JSON.stringify(exportObj, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = 'sk_deco_sauvegarde_' + dateStr + '.json';
        a.click();
        URL.revokeObjectURL(url);
        if (Platform.OS === 'web') {
          window.alert('Sauvegarde téléchargée : ' + data.employes.length + ' employés, ' + data.chantiers.length + ' chantiers, ' + data.sousTraitants.length + ' sous-traitants.');
        }
      } else {
        Alert.alert('Sauvegarde', 'Vos données sont synchronisées en temps réel sur Supabase.\n' + data.employes.length + ' employés, ' + data.chantiers.length + ' chantiers, ' + data.sousTraitants.length + ' sous-traitants.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'exporter les données.');
    }
  };

  // ── Export PDF planning de la semaine ────────────────────────────────────
  const handleExportPDF = async () => {
    try {
      const JOURS_PDF = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
      const weekDays = days.slice(0, 5); // Lundi à Vendredi
      const mondayStr = `${weekDays[0].getDate()} ${MOIS[weekDays[0].getMonth()]}`;
      const fridayStr = `${weekDays[4].getDate()} ${MOIS[weekDays[4].getMonth()]}`;
      const titre = `Semaine du ${mondayStr} au ${fridayStr} ${weekDays[4].getFullYear()}`;

      // Collecter tous les employés qui ont au moins une affectation cette semaine
      const employeMap = new Map<string, { nom: string; prenom: string; jours: { chantierId: string; chantierNom: string; couleur: string }[][] }>();
      data.employes.forEach(emp => {
        const joursData = weekDays.map(day => {
          const affs = data.affectations.filter(a =>
            a.employeId === emp.id && !a.soustraitantId && dateInRange(day, a.dateDebut, a.dateFin)
          );
          return affs.map(a => {
            const ch = data.chantiers.find(c => c.id === a.chantierId);
            return { chantierId: a.chantierId, chantierNom: ch?.nom || '?', couleur: ch?.couleur || '#2C2C2C' };
          });
        });
        if (joursData.some(j => j.length > 0)) {
          employeMap.set(emp.id, { nom: emp.nom, prenom: emp.prenom, jours: joursData });
        }
      });

      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Planning ${titre}</title><style>
        @page { size: landscape; margin: 10mm; }
        body { font-family: -apple-system, 'Segoe UI', sans-serif; margin: 0; padding: 20px; color: #11181C; }
        .header { text-align: center; margin-bottom: 16px; }
        .header h1 { font-size: 14px; color: #2C2C2C; margin: 0 0 4px; letter-spacing: 2px; }
        .header h2 { font-size: 18px; color: #11181C; margin: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #2C2C2C; color: #fff; padding: 8px 6px; text-align: center; font-weight: 700; }
        th:first-child { text-align: left; width: 140px; }
        td { border: 1px solid #E2E6EA; padding: 6px; vertical-align: top; text-align: center; min-height: 32px; }
        td:first-child { font-weight: 600; background: #FAFBFC; text-align: left; }
        .chantier-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 11px; font-weight: 600; margin: 1px 0; }
        .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #687076; }
      </style></head><body>`;
      html += `<div class="header"><h1>SK DECO</h1><h2>${titre}</h2></div>`;
      html += `<table><tr><th>Employé</th>`;
      JOURS_PDF.forEach((j, i) => {
        html += `<th>${j} ${weekDays[i].getDate()}/${weekDays[i].getMonth() + 1}</th>`;
      });
      html += `</tr>`;

      employeMap.forEach(({ nom, prenom, jours }) => {
        html += `<tr><td>${prenom} ${nom}</td>`;
        jours.forEach(dayChantiers => {
          html += `<td>`;
          if (dayChantiers.length === 0) {
            html += `—`;
          } else {
            dayChantiers.forEach(ch => {
              html += `<span class="chantier-tag" style="background:${ch.couleur}">${ch.chantierNom}</span><br/>`;
            });
          }
          html += `</td>`;
        });
        html += `</tr>`;
      });

      html += `</table>`;
      html += `<div class="footer">SK DECO Planning — Généré le ${new Date().toLocaleDateString('fr-FR')}</div>`;
      html += `</body></html>`;

      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
      } else {
        // Mobile: tenter expo-print + expo-sharing (nécessite build natif)
        try {
          const PrintMod = await getPrintModule();
          const SharingMod = await getSharingModule();
          if (PrintMod && SharingMod) {
            const { uri } = await PrintMod.printToFileAsync({ html, width: 842, height: 595 });
            await SharingMod.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Planning PDF' });
          } else {
            Alert.alert('Export PDF', 'Cette fonctionnalité sera disponible après la prochaine mise à jour de l\'app.');
          }
        } catch {
          Alert.alert('Export PDF', 'Cette fonctionnalité sera disponible après la prochaine mise à jour de l\'app.');
        }
      }
    } catch {
      if (Platform.OS === 'web') window.alert('Erreur lors de la génération du PDF.');
      else Alert.alert('Erreur', 'Impossible de générer le PDF.');
    }
  };

  // Calcul du mois courant (vue mensuelle)
  const monthData = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + monthOffset;
    const d = new Date(year, month, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    let dow = d.getDay(); dow = dow === 0 ? 6 : dow - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = Array(dow).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(y, m, i));
    while (cells.length % 7 !== 0) cells.push(null);
    return { cells, year: y, month: m, label: `${CAL_MOIS[m]} ${y}` };
  }, [monthOffset]);

  // ─── Précalcul pour la vue mensuelle ──────────────────────────────────────
  const monthCells = useMemo<MonthGridCell[]>(() =>
    monthData.cells.map(day => {
      if (!day) return { day: null, chantiers: [] };
      const active = visibleChantiers.filter(c =>
        dateInRange(day, c.dateDebut, c.dateFin) &&
        data.affectations.some(a =>
          a.chantierId === c.id &&
          dateInRange(day, a.dateDebut, a.dateFin) &&
          !a.soustraitantId &&
          (isAdmin || a.employeId === currentUser?.employeId)
        )
      );
      return {
        day,
        chantiers: active.map(c => ({ id: c.id, nom: c.nom, couleur: c.couleur })),
      };
    }),
    [monthData, visibleChantiers, data.affectations, isAdmin, currentUser?.employeId],
  );

  const chantiersLegend = useMemo(() =>
    visibleChantiers.map(c => ({ id: c.id, nom: c.nom, couleur: c.couleur })),
    [visibleChantiers],
  );

  // ─── Réorganisation des chantiers sur le Planning (admin) ─────────────────
  // L'ordre de référence part de visibleChantiers pour que les nouveaux chantiers
  // (non encore dans chantierOrderPlanning) soient pris en compte automatiquement.
  const moveChantierInPlanning = useCallback((id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const base = (data.chantierOrderPlanning && data.chantierOrderPlanning.length > 0)
      ? [...data.chantierOrderPlanning]
      : visibleChantiers.map(c => c.id);
    // S'assurer que tous les chantiers visibles sont dans la liste (ajoute les absents en fin)
    visibleChantiers.forEach(c => { if (!base.includes(c.id)) base.push(c.id); });
    const idx = base.indexOf(id);
    if (idx === -1) return;
    const newOrder = [...base];
    if (direction === 'up') {
      if (idx <= 0) return;
      [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    } else if (direction === 'down') {
      if (idx >= newOrder.length - 1) return;
      [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
    } else if (direction === 'top') {
      if (idx === 0) return;
      newOrder.splice(idx, 1);
      newOrder.unshift(id);
    } else if (direction === 'bottom') {
      if (idx === newOrder.length - 1) return;
      newOrder.splice(idx, 1);
      newOrder.push(id);
    }
    updateChantierOrderPlanning(newOrder);
  }, [data.chantierOrderPlanning, visibleChantiers, updateChantierOrderPlanning]);

  const showReorderMenu = useCallback((chantierId: string) => {
    if (!isAdmin) return;
    const chantier = data.chantiers.find(c => c.id === chantierId);
    if (!chantier) return;
    Alert.alert(
      chantier.nom,
      'Réorganiser dans le planning :',
      [
        { text: '⇱ En premier', onPress: () => moveChantierInPlanning(chantierId, 'top') },
        { text: '↑ Monter', onPress: () => moveChantierInPlanning(chantierId, 'up') },
        { text: '↓ Descendre', onPress: () => moveChantierInPlanning(chantierId, 'down') },
        { text: '⇲ En dernier', onPress: () => moveChantierInPlanning(chantierId, 'bottom') },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  }, [isAdmin, data.chantiers, moveChantierInPlanning]);

  /** Ouvre le modal de création/édition d'intervention */
  const openInterventionModal = (chantierId: string, dateStr: string, editId: string | null = null) => {
    if (editId) {
      const existing = (data.interventions || []).find(i => i.id === editId);
      if (existing) {
        setInterventionForm({ libelle: existing.libelle, description: existing.description || '', dateDebut: existing.dateDebut, dateFin: existing.dateFin, couleur: existing.couleur });
      }
    } else {
      setInterventionForm({ libelle: '', description: '', dateDebut: dateStr, dateFin: dateStr, couleur: INTERVENTION_COLORS[0] });
    }
    setInterventionModal({ chantierId, editId });
  };

  const handleSaveIntervention = () => {
    if (!interventionForm.libelle.trim() || !interventionModal) return;
    const now = new Date().toISOString();
    if (interventionModal.editId) {
      const existing = (data.interventions || []).find(i => i.id === interventionModal.editId);
      if (existing) updateIntervention({ ...existing, ...interventionForm });
    } else {
      addIntervention({
        id: `int_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        chantierId: interventionModal.chantierId,
        libelle: interventionForm.libelle.trim(),
        description: interventionForm.description.trim() || undefined,
        dateDebut: interventionForm.dateDebut,
        dateFin: interventionForm.dateFin,
        couleur: interventionForm.couleur,
        createdAt: now,
      });
    }
    setInterventionModal(null);
  };

  /** Ouvre le modal de notes pour une cellule, associé à un employé spécifique */
  const openNoteModal = (chantierId: string, dateStr: string, targetEmployeId: string) => {
    // On affiche les notes de l'employé ciblé + les notes de l'admin
    const allNotes = getAllNotesForCell(chantierId, dateStr).filter(
      n => n.affectationEmployeId === targetEmployeId ||
           n.affectationEmployeId === 'admin' ||
           n.auteurId === 'admin'
    );
    setNoteModal({ chantierId, date: dateStr, targetEmployeId, allNotes, editingNote: null });
    setShowNoteEditor(false);
    setNoteText('');
    setNotePhotos([]);
  };

  /** Commence l'édition d'une note existante */
  const startEditNote = (note: NoteModalState['allNotes'][0]) => {
    setNoteModal(prev => prev ? { ...prev, editingNote: note } : prev);
    setNoteText(note.texte);
    setNotePhotos(note.photos || []);
    setShowNoteEditor(true);
  };

  /** Commence la création d'une nouvelle note */
  const startNewNote = () => {
    setNoteModal(prev => prev ? { ...prev, editingNote: null } : prev);
    setNoteText('');
    setNotePhotos([]);
    setPendingTasksList([]);
    setShowTaskInput(false);
    setNewTaskText('');
    setNoteVisiblePar('tous');
    setNoteVisibleIds([]);
    setNoteSavTicketId(null);
    setShowNoteEditor(true);
  };

  /** Détermine l'auteurId et auteurNom de l'utilisateur courant */
  const getCurrentAuthor = () => {
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
  };

  /** Ouvre le modal de notes pour un sous-traitant dans une cellule */
  const openSTNoteModal = (chantierId: string, dateStr: string, stId: string) => {
    const stPseudoId = `st:${stId}`;
    // Notes de cet ST + notes de l'admin sur cette cellule
    const allNotes = getAllNotesForCell(chantierId, dateStr).filter(
      n => n.affectationEmployeId === stPseudoId ||
           n.affectationEmployeId === 'admin' ||
           n.auteurId === 'admin' ||
           n.auteurId === stPseudoId
    );
    setNoteModal({ chantierId, date: dateStr, targetEmployeId: stPseudoId, allNotes, editingNote: null });
    setShowNoteEditor(false);
    setNoteText('');
    setNotePhotos([]);
  };

  /** Ferme le modal note en sauvegardant automatiquement si contenu non vide */
  const closeNoteModal = () => {
    if (noteModal && showNoteEditor && (noteText.trim() || pendingTasksList.length > 0)) {
      saveNote();
    }
    setNoteModal(null);
    setNoteText('');
    setNotePhotos([]);
    setPendingTasksList([]);
    setNewTaskText('');
    setShowTaskInput(false);
    setShowNoteEditor(false);
    Keyboard.dismiss();
  };

  /** Sauvegarde la note en cours d'édition */
  const saveNote = () => {
    // Accepter la note si texte OU tâches présentes
    const hasTasks = noteModal?.editingNote
      ? (noteModal.editingNote.tasks || []).length > 0
      : pendingTasksList.length > 0;
    if (!noteModal || (!noteText.trim() && !hasTasks)) return;
    const { auteurId, auteurNom } = getCurrentAuthor();
    const now = new Date().toISOString();

    // Récupérer les tâches : depuis editingNote.tasks (note existante) ou pendingTasksList (nouvelle note)
    const tasksToSave = noteModal.editingNote ? (noteModal.editingNote.tasks || []) : pendingTasksList;

    // Déterminer la valeur finale de visiblePar
    const finalVisiblePar: Note['visiblePar'] = noteVisiblePar === 'tous' || noteVisiblePar === 'employes' || noteVisiblePar === 'soustraitants'
      ? (noteVisibleIds.length > 0 ? noteVisibleIds : noteVisiblePar)
      : noteVisiblePar;

    if (noteModal.editingNote) {
      // Mise à jour d'une note existante
      const updated: Note = {
        ...noteModal.editingNote,
        texte: noteText,
        photos: notePhotos,
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
      if (noteRepeatDays > 0 && isAdmin) {
        for (let d = 1; d <= noteRepeatDays; d++) {
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
          texte: noteText,
          photos: notePhotos,
          tasks: tasksToSave.length > 0 ? tasksToSave.map(t => ({ ...t, id: genId() })) : undefined,
          visiblePar: finalVisiblePar,
          savTicketId: noteSavTicketId || undefined,
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
      setNoteRepeatDays(0);
      setNoteVisiblePar('tous');
    }

    Keyboard.dismiss();
    setShowNoteEditor(false);
  };

  /** Supprime une note */
  const handleDeleteNote = (note: NoteModalState['allNotes'][0]) => {
    deleteNote(note.affectationId, note.id);
    setNoteModal(prev => {
      if (!prev) return null;
      return { ...prev, allNotes: prev.allNotes.filter(n => n.id !== note.id), editingNote: null };
    });
    setShowNoteEditor(false);
  };

  /** Vérifie si l'utilisateur courant peut modifier/supprimer une note */
  const canEditNote = (note: NoteModalState['allNotes'][0], _dateStr: string): boolean => {
    // L'auteur peut toujours modifier/supprimer ses propres notes (même sur jours passés)
    const myId = isAdmin ? 'admin' : (currentUser?.employeId || '');
    return note.auteurId === myId;
  };

  // Ref pour l'input file web (images)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Ref pour l'input file web (documents PDF)
  const docInputRef = useRef<HTMLInputElement | null>(null);

  // Ajout photo : web via input file, mobile via expo-image-picker
  // Les photos sont uploadées immédiatement vers Supabase Storage
  const handleAddPhoto = async () => {
    const uploadAndAdd = async (base64Uri: string) => {
      const photoId = `note_photo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const chantierId = noteModal?.chantierId || 'general';
      const folder = `chantiers/${chantierId}/notes`;
      const storageUrl = await uploadFileToStorage(base64Uri, folder, photoId);
      setNotePhotos(prev => [...prev, storageUrl || base64Uri]);
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
  };

  // Ajout document PDF (mobile)
  const handleAddDoc = async () => {
    if (Platform.OS !== 'web') {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        result.assets.forEach(asset => {
          setNotePhotos(prev => [...prev, asset.uri]);
        });
      }
    }
  };

  const removePhoto = (idx: number) => {
    setNotePhotos(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <ScreenContainer containerClassName="bg-[#F5EDE3]" edges={['top', 'left', 'right']}>
      {/* En-tête */}
      <View style={styles.header}>
        {/* Logo + titre sur une seule ligne */}
        <View style={styles.headerLogoWrap}>
          <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          {isAdmin && (
            <Pressable style={{ marginLeft: 4 }} onPress={openAdminSettings}>
              <Text style={{ fontSize: 14 }}>⚙️</Text>
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
          {/* Toggle vue semaine / mois / gantt — masqué en planning direction */}
          {planningMode === 'equipe' && (
            <>
              <View style={styles.viewToggle}>
                <Pressable style={[styles.viewToggleBtn, viewMode === 'semaine' && styles.viewToggleBtnActive]} onPress={() => setViewMode('semaine')}>
                  <Text style={[styles.viewToggleBtnText, viewMode === 'semaine' && styles.viewToggleBtnTextActive]}>7j</Text>
                </Pressable>
                <Pressable style={[styles.viewToggleBtn, viewMode === 'mois' && styles.viewToggleBtnActive]} onPress={() => setViewMode('mois')}>
                  <Text style={[styles.viewToggleBtnText, viewMode === 'mois' && styles.viewToggleBtnTextActive]}>Mois</Text>
                </Pressable>
                {isAdmin && (
                  <Pressable style={[styles.viewToggleBtn, viewMode === 'gantt' && styles.viewToggleBtnActive]} onPress={() => setViewMode('gantt')}>
                    <Text style={[styles.viewToggleBtnText, viewMode === 'gantt' && styles.viewToggleBtnTextActive]}>Chantiers</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
          {/* Bouton retard planifié (employé non-admin) */}
          {!isAdmin && !isST && currentUser?.employeId && (() => {
            const nbRetards = (data.retardsPlanifies || []).filter(r => r.employeId === currentUser.employeId && !r.lu).length;
            return (
              <Pressable
                style={[styles.saisieBtn, { position: 'relative' }]}
                onPress={() => setShowRetardModal(true)}
              >
                <Text style={styles.saisieBtnText}>⏰</Text>
                {nbRetards > 0 && (
                  <View style={[styles.materielBadgeCount, { position: 'absolute', top: -4, right: -4, width: 16, height: 16 }]}>
                    <Text style={[styles.materielBadgeCountText, { fontSize: 9 }]}>{nbRetards}</Text>
                  </View>
                )}
              </Pressable>
            );
          })()}
          {/* Bouton saisie manuelle pointage déplacé vers l'accueil */}
          {/* Bouton dupliquer semaine — admin uniquement */}
          {isAdmin && viewMode === 'semaine' && (
            <Pressable style={styles.galerieBtn} onPress={() => {
              const prevWeekDays = days.map(d => {
                const prev = new Date(d);
                prev.setDate(prev.getDate() - 7);
                return prev;
              });
              // Trouver les affectations de la semaine précédente
              const prevStart = toYMD(prevWeekDays[0]);
              const prevEnd = toYMD(prevWeekDays[6]);
              const prevAffectations = data.affectations.filter(a =>
                a.dateFin >= prevStart && a.dateDebut <= prevEnd
              );
              if (prevAffectations.length === 0) {
                if (Platform.OS === 'web') alert('Aucune affectation la semaine précédente');
                else Alert.alert('Info', 'Aucune affectation la semaine précédente');
                return;
              }
              const msg = `Dupliquer ${prevAffectations.length} affectation(s) de la semaine précédente vers cette semaine ?`;
              const doDuplicate = () => {
                prevAffectations.forEach(a => {
                  const debutDate = new Date(a.dateDebut + 'T12:00:00');
                  debutDate.setDate(debutDate.getDate() + 7);
                  const finDate = new Date(a.dateFin + 'T12:00:00');
                  finDate.setDate(finDate.getDate() + 7);
                  const newDebut = toYMD(debutDate);
                  const newFin = toYMD(finDate);
                  // Vérifier qu'elle n'existe pas déjà
                  const exists = data.affectations.some(x =>
                    x.chantierId === a.chantierId && x.employeId === a.employeId &&
                    x.dateDebut === newDebut && x.dateFin === newFin
                  );
                  if (!exists) {
                    addAffectation({
                      ...a,
                      id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                      dateDebut: newDebut,
                      dateFin: newFin,
                      notes: [],
                    });
                  }
                });
              };
              if (Platform.OS === 'web') { if (window.confirm(msg)) doDuplicate(); }
              else Alert.alert('Dupliquer', msg, [{ text: 'Annuler', style: 'cancel' }, { text: 'Dupliquer', onPress: doDuplicate }]);
            }} accessibilityLabel="Dupliquer semaine">
              <Text style={styles.galerieBtnText}>📋</Text>
            </Pressable>
          )}
          {/* Bouton galerie photos — visible pour tous */}
          <Pressable style={styles.galerieBtn} onPress={() => { setGalerieChantierId(undefined); setShowGalerieGlobale(true); }}>
            <Text style={styles.galerieBtnText}>📷</Text>
          </Pressable>
          {/* Bouton PDF planning — admin uniquement */}
          {isAdmin && (
            <Pressable style={styles.galerieBtn} onPress={handleExportPDF} accessibilityLabel="Exporter planning PDF">
              <Text style={styles.galerieBtnText}>📄</Text>
            </Pressable>
          )}
          {/* Bouton export/sauvegarde — admin uniquement */}
          {isAdmin && (
            <Pressable style={styles.galerieBtn} onPress={handleExportData} accessibilityLabel="Exporter les données">
              <Text style={styles.galerieBtnText}>💾</Text>
            </Pressable>
          )}
          <LanguageFlag />
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>⏻</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Sélecteur Planning Équipe / Direction (admin) */}
      {isAdmin && <AdminPlanningModeSwitcher value={planningMode} onChange={setPlanningMode} />}

      {/* ═══ ALERTES RETARD CHANTIERS — bannière pliable (admin) ═══ */}
      {isAdmin && <AlertesChantiersRetard chantiers={data.chantiers} />}

      {/* ═══ PLANNING DIRECTION ═══ */}
      {planningMode === 'direction' && isAdmin && <PlanningDirection />}

      {/* ═══ PLANNING ÉQUIPE (existant) ═══ */}
      {(planningMode === 'equipe' || !isAdmin) && (
      <>
      <View style={styles.weekInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.weekLabel}>{viewMode === 'semaine' ? weekLabel : monthData.label}</Text>
          <Pressable style={{ padding: 4 }} onPress={() => viewMode === 'semaine' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}>
            <Text style={{ fontSize: 16, color: '#2C2C2C' }}>‹</Text>
          </Pressable>
          <Pressable style={{ backgroundColor: '#F5EDE3', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }} onPress={() => setShowDatePicker(true)}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#2C2C2C' }}>Auj.</Text>
          </Pressable>
          <Pressable style={{ padding: 4 }} onPress={() => viewMode === 'semaine' ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)}>
            <Text style={{ fontSize: 16, color: '#2C2C2C' }}>›</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Text style={styles.chantierCount}>{visibleChantiers.length} chantier{visibleChantiers.length !== 1 ? 's' : ''}</Text>
          {isAdmin && viewMode === 'semaine' && (() => {
            const todayStr = toYMD(new Date());
            // Employés en congé cette semaine
            const startWeek = toYMD(days[0]);
            const endWeek = toYMD(days[6]);
            const enConge = (data.demandesConge || []).filter(d =>
              d.statut === 'approuve' && d.dateFin >= startWeek && d.dateDebut <= endWeek
            );
            const nbEnConge = new Set(enConge.map(d => d.employeId)).size;
            const nbAffectes = new Set(data.affectations.filter(a => a.dateDebut <= todayStr && a.dateFin >= todayStr).map(a => a.employeId)).size;
            const nbPointes = new Set(data.pointages.filter(p => p.date === todayStr && p.type === 'debut').map(p => p.employeId)).size;
            const nbRetards = data.pointages.filter(p => {
              if (p.date !== todayStr || p.type !== 'debut') return false;
              const emp = data.employes.find(e => e.id === p.employeId);
              const dow = new Date().getDay();
              const horaire = emp?.horaires?.[dow];
              if (!horaire?.actif || !horaire.debut) return false;
              const [h, m] = horaire.debut.split(':').map(Number);
              const [ph, pm] = p.heure.split(':').map(Number);
              return (ph * 60 + pm) > (h * 60 + m) + 5;
            }).length;
            return (
              <>
                <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600' }}>{nbPointes}/{nbAffectes} pointés</Text>
                {nbRetards > 0 && <Text style={{ fontSize: 11, color: '#E74C3C', fontWeight: '600' }}>{nbRetards} retard{nbRetards > 1 ? 's' : ''}</Text>}
                {nbEnConge > 0 && <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '600' }}>🏖 {nbEnConge} en congé</Text>}
              </>
            );
          })()}
        </View>
      </View>

      {/* Modal calendrier de navigation */}
      <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
        <Pressable style={styles.datePickerOverlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={styles.datePickerSheet} onPress={() => {}}>
            <Text style={styles.datePickerTitle}>Aller à la semaine du…</Text>
            <DatePickerCalendar
              value={toYMD(days[0])}
              onChange={(ymd) => {
                const picked = new Date(ymd + 'T12:00:00');
                const today2 = new Date();
                today2.setHours(0, 0, 0, 0);
                const dow = today2.getDay();
                const mondayOffset = dow === 0 ? -6 : 1 - dow;
                const thisMonday = addDays(today2, mondayOffset);
                const pickedDow = picked.getDay();
                const pickedMondayOff = pickedDow === 0 ? -6 : 1 - pickedDow;
                const pickedMonday = addDays(picked, pickedMondayOff);
                const diffDays = Math.round((pickedMonday.getTime() - thisMonday.getTime()) / (1000 * 60 * 60 * 24));
                setWeekOffset(Math.round(diffDays / 7));
                setShowDatePicker(false);
              }}
            />
            <Pressable style={styles.datePickerTodayBtn} onPress={() => { setWeekOffset(0); setShowDatePicker(false); }}>
              <Text style={styles.datePickerTodayText}>{t.planning.today}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Vue mensuelle */}
      {viewMode === 'mois' && (
        <MonthViewGrid
          cells={monthCells}
          chantiersLegend={chantiersLegend}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onDayPress={(day) => {
            const today2 = new Date();
            const dow = today2.getDay();
            const mondayOffset = dow === 0 ? -6 : 1 - dow;
            const thisMonday = addDays(today2, mondayOffset);
            const pickedDow = day.getDay();
            const pickedMondayOff = pickedDow === 0 ? -6 : 1 - pickedDow;
            const pickedMonday = addDays(day, pickedMondayOff);
            const diffDays = Math.round((pickedMonday.getTime() - thisMonday.getTime()) / (1000 * 60 * 60 * 24));
            setWeekOffset(Math.round(diffDays / 7));
            setViewMode('semaine');
          }}
        />
      )}

      {/* ═══ VUE GANTT ═══ */}
      {viewMode === 'gantt' && isAdmin && (
        <GanttTimelineAdmin
          monthOffset={monthOffset}
          onPrevMonths={() => setMonthOffset(m => m - 3)}
          onNextMonths={() => setMonthOffset(m => m + 3)}
        />
      )}

      {/* Grille hebdomadaire */}
      {viewMode === 'semaine' && (
      <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C2C2C']} tintColor="#2C2C2C" />}>
        {/* En-tête des jours */}
        <View style={styles.gridRow}>
          <View style={[styles.nameCell, styles.headerCell, { width: NAME_COL }]} />
          {days.map((day, i) => {
            const today = isToday(day);
            return (
              <View
                key={i}
                style={[
                  styles.dayHeaderCell,
                  { width: dayCol },
                  today && styles.dayHeaderCellToday,
                ]}
              >
                <Text style={[styles.dayName, today && styles.dayNameToday]}>
                  {JOURS[i]}
                </Text>
                <Text style={[styles.dayNum, today && styles.dayNumToday]}>
                  {day.getDate()}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Lignes des chantiers */}
        {visibleChantiers.map(chantier => (
          <View key={chantier.id} style={styles.chantierRow}>
            {/* Colonne nom — clic = ouvrir le menu d'actions chantier
                Appui long (admin) = menu de réorganisation */}
            <Pressable
              style={[styles.nameCell, { width: NAME_COL }]}
              onPress={() => setActionsChantierId(chantier.id)}
              onLongPress={isAdmin ? () => showReorderMenu(chantier.id) : undefined}
              delayLongPress={400}
            >
              <View style={[styles.colorBar, { backgroundColor: chantier.couleur }]} />
              <Text style={styles.chantierName} numberOfLines={2}>{chantier.nom}</Text>
              {/* Les Notes sont désormais accessibles depuis le menu Actions */}
            </Pressable>

            {/* Cellules des jours */}
            {days.map((day, i) => {
              const inRange = dateInRange(day, chantier.dateDebut, chantier.dateFin);
              const employes = getEmployesForCell(chantier.id, day);
              const today = isToday(day);
              const dateStr = toYMD(day);
              const hasNotes = cellHasNotes(chantier.id, dateStr);
              // Vérifie si l'employé courant est affecté à ce chantier ce jour (même hors plage chantier)
              const currentEmpInCell = !isAdmin && data.affectations.some(
                a => a.chantierId === chantier.id &&
                  a.employeId === currentUser?.employeId &&
                  dateInRange(day, a.dateDebut, a.dateFin)
              );

              return (
                <Pressable
                  key={i}
                  style={[
                    styles.cell,
                    { width: dayCol },
                    today && styles.cellToday,
                    !inRange && styles.cellOutOfRange,
                    hasNotes && !today && { backgroundColor: '#FFF9E6' },
                  ]}
                  onPress={isAdmin ? () => {
                    setInterventionForm({ libelle: '', description: '', dateDebut: dateStr, dateFin: dateStr, couleur: INTERVENTION_COLORS[0] });
                    setModal({ chantierId: chantier.id, date: dateStr });
                  } : undefined}
                >
                  {/* Badges employés : couleur personnalisée, masqués pour le sous-traitant connecté */}
                  {!isST && employes.map(emp => {
                    const empColor = getEmployeColor(emp);
                    const empAff = data.affectations.find(a =>
                      a.chantierId === chantier.id && a.employeId === emp.id &&
                      a.dateDebut <= dateStr && a.dateFin >= dateStr
                    );
                    const empHasNotes = empAff && (empAff.notes || []).some(n => !n.date || n.date === dateStr);
                    const ordreNum = getOrdreNum(emp.id, chantier.id, dateStr);
                    const isAtelier = empAff?.lieu === 'atelier';
                    return (
                      <View key={emp.id} style={styles.badgeWrapper}>
                        <Pressable
                          style={[styles.empBadge, { backgroundColor: empColor }, isAtelier && { borderWidth: 2, borderColor: '#F59E0B', borderStyle: 'dashed' }]}
                          onPress={() => openNoteModal(chantier.id, dateStr, emp.id)}
                          onLongPress={isAdmin ? () => {
                            if (Platform.OS === 'web') {
                              const choice = window.prompt(`${emp.prenom} — Choisir :\n1 = Déplacer\n2 = ${isAtelier ? 'Remettre sur chantier' : 'Mettre en atelier 🏭'}`);
                              if (choice === '2') toggleLieuTravail(chantier.id, emp.id, dateStr);
                              else if (choice === '1') {
                                const ids = getOrdreChantiers(emp.id, dateStr);
                                if (ids.length >= 2) setOrdreModal({ employeId: emp.id, date: dateStr, chantierIds: ids });
                                else { setMoveTargetChantierId(null); setMoveTargetDate(dateStr); setMoveModal({ employeId: emp.id, chantierId: chantier.id, date: dateStr }); }
                              }
                            } else {
                              Alert.alert(emp.prenom, 'Que voulez-vous faire ?', [
                                { text: 'Annuler', style: 'cancel' },
                                { text: isAtelier ? '🏗 Remettre sur chantier' : '🏭 Mettre en atelier', onPress: () => toggleLieuTravail(chantier.id, emp.id, dateStr) },
                                { text: '↔ Déplacer', onPress: () => {
                                  const ids = getOrdreChantiers(emp.id, dateStr);
                                  if (ids.length >= 2) setOrdreModal({ employeId: emp.id, date: dateStr, chantierIds: ids });
                                  else { setMoveTargetChantierId(null); setMoveTargetDate(dateStr); setMoveModal({ employeId: emp.id, chantierId: chantier.id, date: dateStr }); }
                                }},
                              ]);
                            }
                          } : undefined}
                        >
                          <Text style={[styles.empBadgeText, { color: '#fff' }]} numberOfLines={1}>
                            {isAtelier ? '🏭' : ''}{emp.prenom.slice(0, 3) + '.'}
                          </Text>
                          {empHasNotes && <View style={styles.noteDot} />}
                          {ordreNum > 0 && (
                            <View style={styles.ordreBadge}>
                              <Text style={styles.ordreBadgeText}>{ordreNum}</Text>
                            </View>
                          )}
                        </Pressable>
                        {isAdmin && (
                          <Pressable
                            style={styles.removeBadgeBtn}
                            onPress={() => {
                              const hasPointage = data.pointages.some(p => p.employeId === emp.id && p.date === dateStr);
                              const aff = data.affectations.find(a => a.chantierId === chantier.id && a.employeId === emp.id && a.dateDebut <= dateStr && a.dateFin >= dateStr);
                              const hasNotes = aff && (aff.notes || []).some(n => (n.date === dateStr || !n.date) && (n.texte?.trim() || (n.tasks && n.tasks.length > 0)));

                              const doRemove = (deletePointages?: boolean) => {
                                removeEmployeFromCell(chantier.id, emp.id, dateStr, { deletePointages });
                              };

                              if (hasNotes || hasPointage) {
                                const messages: string[] = [];
                                if (hasNotes) messages.push('des notes/tâches');
                                if (hasPointage) messages.push('un pointage');
                                Alert.alert(
                                  `Retirer ${emp.prenom}`,
                                  `${emp.prenom} a ${messages.join(' et ')} ce jour. Que faire ?`,
                                  [
                                    { text: 'Annuler', style: 'cancel' },
                                    { text: '↔ Déplacer', onPress: () => {
                                      setMoveTargetChantierId(null);
                                      setMoveTargetDate(dateStr);
                                      setMoveModal({ employeId: emp.id, chantierId: chantier.id, date: dateStr });
                                    }},
                                    { text: 'Retirer du planning', onPress: () => doRemove(false) },
                                    ...(hasPointage ? [{ text: 'Retirer + suppr. pointage', style: 'destructive' as const, onPress: () => doRemove(true) }] : []),
                                  ]
                                );
                              } else {
                                removeEmployeFromCell(chantier.id, emp.id, dateStr);
                              }
                            }}
                          >
                            <Text style={styles.removeBadgeBtnText}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  {/* Badges sous-traitants : cliquables pour ouvrir les notes */}
                  {(isAdmin || isST) && getSTForCell(chantier.id, day).map(st => {
                    const stHasNotes = data.affectations.some(a =>
                      a.chantierId === chantier.id &&
                      a.soustraitantId === st.id &&
                      a.dateDebut <= dateStr && a.dateFin >= dateStr &&
                      (a.notes || []).some(n => !n.date || n.date === dateStr)
                    );
                    return (
                      <View key={st.id} style={styles.badgeWrapper}>
                        <Pressable
                          style={[styles.stBadge, { backgroundColor: st.couleur }]}
                          onPress={() => openSTNoteModal(chantier.id, dateStr, st.id)}
                        >
                          <Text style={styles.stBadgeText} numberOfLines={1}>
                            {(st.prenom || st.nom).slice(0, 3) + '.'}
                          </Text>
                          {stHasNotes && <View style={styles.noteDot} />}
                        </Pressable>
                        {isAdmin && (
                          <Pressable
                            style={styles.removeBadgeBtn}
                            onPress={() => removeSTFromCell(chantier.id, st.id, dateStr)}
                          >
                            <Text style={styles.removeBadgeBtnText}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  {/* Bandeaux interventions externes (visibles par tous) */}
                  {getInterventionsForCell(chantier.id, day).map(interv => (
                    <Pressable
                      key={interv.id}
                      style={[styles.intervBandeau, { backgroundColor: interv.couleur }]}
                      onPress={() => isAdmin ? openInterventionModal(chantier.id, dateStr, interv.id) : undefined}
                    >
                      <Text style={styles.intervBandeauIcon}>⚡</Text>
                      <Text style={styles.intervBandeauText} numberOfLines={1}>
                        {interv.libelle.length > 5 ? interv.libelle.slice(0, 4) + '…' : interv.libelle}
                      </Text>
                    </Pressable>
                  ))}
                  {/* Bouton + pour admin (ajout/suppression employés + externe) */}
                  {isAdmin && (
                    <Pressable
                      style={styles.addBtn}
                      onPress={() => {
                        setInterventionForm({ libelle: '', description: '', dateDebut: dateStr, dateFin: dateStr, couleur: INTERVENTION_COLORS[0] });
                        setModal({ chantierId: chantier.id, date: dateStr });
                      }}
                    >
                      <Text style={styles.addBtnText}>+</Text>
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {visibleChantiers.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Aucun chantier sur cette semaine</Text>
          </View>
        )}

        {/* Légende : visible uniquement pour l'admin, filtrée sur la semaine visible */}
        {isAdmin && (() => {
          // Calculer les IDs des employés et ST présents dans la semaine affichée
          const weekDayStrings = days.map(d => toYMD(d));
          const weekStart = weekDayStrings[0];
          const weekEnd = weekDayStrings[weekDayStrings.length - 1];
          const weekAffectations = data.affectations.filter(a =>
            a.dateDebut <= weekEnd && a.dateFin >= weekStart
          );
          const empIdsThisWeek = new Set(weekAffectations.filter(a => !a.soustraitantId).map(a => a.employeId));
          const stIdsThisWeek = new Set(weekAffectations.filter(a => a.soustraitantId).map(a => a.soustraitantId!));
          const visibleEmps = data.employes.filter(e => empIdsThisWeek.has(e.id));
          const visibleSTs = (data.sousTraitants || []).filter(s => stIdsThisWeek.has(s.id));
          if (visibleEmps.length === 0 && visibleSTs.length === 0) return null;
          return (
          <View style={styles.legendSection}>
          {/* Légende employés */}
          {visibleEmps.length > 0 && (
            <>
              <Text style={styles.legendTitle}>EMPLOYÉS</Text>
              <View style={styles.legendGrid}>
                {visibleEmps.map(emp => {
                  const empColor = getEmployeColor(emp);
                  const metierLabel = METIER_COLORS[emp.metier]?.label || '';
                  return (
                    <View key={emp.id} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: empColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.legendLabel}>{emp.prenom} {emp.nom}</Text>
                        <Text style={styles.legendSub}>{metierLabel}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
          {/* Légende sous-traitants */}
          {visibleSTs.length > 0 && (
            <>
              <Text style={[styles.legendTitle, { marginTop: 12 }]}>SOUS-TRAITANTS</Text>
              <View style={styles.legendGrid}>
                {visibleSTs.map(st => (
                  <View key={st.id} style={styles.legendItem}>
                    <View style={[styles.legendDotST, { backgroundColor: st.couleur }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.legendLabel}>{st.prenom} {st.nom}</Text>
                      {st.societe ? <Text style={styles.legendSub}>{st.societe}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
          );
        })()}
      </ScrollView>
      )}

      {/* ── Modal Actions chantier (menu rôle-based) ── */}
      <ChantierActionsModal
        visible={actionsChantierId !== null}
        onClose={() => setActionsChantierId(null)}
        chantierId={actionsChantierId}
        role={isAdmin ? 'admin' : (isST ? 'soustraitant' : 'employe')}
        onOpenNotes={(id) => { setNotesPlanningChantierId(id); setShowNotesPlanning(true); }}
        onOpenPlans={(id) => { setPlansPlanningChantierId(id); setShowPlansPlanning(true); }}
        onOpenPhotos={(id) => { setGalerieChantierId(id); setShowGalerieGlobale(true); }}
        onOpenFiche={(id) => {
          const ch = data.chantiers.find(c => c.id === id);
          if (ch) setFicheModal({ chantier: ch });
        }}
        onOpenMateriel={() => router.push('/(tabs)/materiel')}
        onOpenSAV={(id) => router.push({ pathname: '/(tabs)/chantiers', params: { action: 'sav', chantierId: id } } as any)}
        onOpenFinances={isAdmin ? ((id) => setBilanChantierIdPlanning(id)) : undefined}
        onOpenPortailClient={isAdmin ? ((id) => setPortailClientIdPlanning(id)) : undefined}
        onOpenBudget={isAdmin ? ((id) => router.push({ pathname: '/(tabs)/chantiers', params: { action: 'budget', chantierId: id } } as any)) : undefined}
        onOpenAchats={isAdmin ? ((id) => router.push({ pathname: '/(tabs)/chantiers', params: { action: 'achats', chantierId: id } } as any)) : undefined}
        onOpenMarches={isAdmin ? ((id) => setMarchesIdPlanning(id)) : undefined}
        onDelete={isAdmin ? ((id) => { deleteChantier(id); }) : undefined}
      />

      {/* ── Sous-modales ouvertes depuis ChantierActionsModal (unifié avec l'onglet Chantiers) ── */}
      <PortailClient
        visible={!!portailClientIdPlanning}
        onClose={() => setPortailClientIdPlanning(null)}
        chantierId={portailClientIdPlanning || ''}
      />
      <BilanFinancierChantier
        visible={!!bilanChantierIdPlanning}
        onClose={() => setBilanChantierIdPlanning(null)}
        chantierId={bilanChantierIdPlanning || ''}
      />
      <MarchesChantier
        visible={!!marchesIdPlanning}
        onClose={() => setMarchesIdPlanning(null)}
        chantierId={marchesIdPlanning || ''}
      />

      {/* ── Modal Fiche Chantier (lecture seule dans le planning) ── */}
      <Modal
        visible={ficheModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setFicheModal(null)}
      >
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setFicheModal(null)} />
          <Pressable style={styles.ficheModalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>🪪 {ficheModal?.chantier.nom}</Text>
                <Text style={styles.modalSubtitle}>{ficheModal?.chantier.adresse}</Text>
              </View>
              <Pressable onPress={() => setFicheModal(null)} style={styles.modalXBtn}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              {ficheModal?.chantier.fiche && [
                { icon: '🔢', label: 'Code d’accès / Digicode', value: ficheModal.chantier.fiche.codeAcces },
                { icon: '🔑', label: 'Emplacement de la clé', value: ficheModal.chantier.fiche.emplacementCle },
                { icon: '🚨', label: 'Code alarme', value: ficheModal.chantier.fiche.codeAlarme },
                { icon: '📞', label: 'Contacts utiles', value: ficheModal.chantier.fiche.contacts },
                { icon: '📝', label: 'Notes & informations', value: ficheModal.chantier.fiche.notes },
              ].filter(row => row.value?.trim()).map((row, idx) => (
                <View key={idx} style={styles.ficheRow}>
                  <Text style={styles.ficheRowIcon}>{row.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ficheRowLabel}>{row.label}</Text>
                    <Text style={styles.ficheRowValue}>{row.value}</Text>
                  </View>
                </View>
              ))}

              {ficheModal?.chantier.fiche && ficheModal.chantier.fiche.photos.length > 0 && (
                <View style={styles.fichePhotosSection}>
                  <Text style={styles.ficheRowLabel}>📸 Photos & documents</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {ficheModal.chantier.fiche.photos.map((uri, idx) => {
                      const isPdf = uri.startsWith('data:application/pdf');
                      if (isPdf) {
                        return (
                          <Pressable
                            key={idx}
                            style={styles.fichePdfThumb}
                            onPress={() => {
                              if (Platform.OS === 'web') {
                                const w = window.open();
                                if (w) { w.document.write(`<iframe src="${uri}" width="100%" height="100%"></iframe>`); }
                              }
                            }}
                          >
                            <Text style={styles.fichePdfIcon}>📄</Text>
                            <Text style={styles.fichePdfLabel}>PDF</Text>
                          </Pressable>
                        );
                      }
                      return (
                        <Image key={idx} source={{ uri }} style={styles.fichePhotoThumb} resizeMode="cover" />
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {ficheModal?.chantier.fiche?.updatedAt ? (
                <Text style={styles.ficheUpdatedAt}>
                  Mis à jour le {new Date(ficheModal.chantier.fiche.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </Text>
              ) : null}
            </ScrollView>

            <Pressable style={styles.modalCloseBtn} onPress={() => setFicheModal(null)}>
              <Text style={styles.modalCloseBtnText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      {/* ── Modal ajout/suppression employés + sous-traitants (Admin) ── */}
      <ModalAjoutEmployesST
        modal={modal}
        onClose={() => setModal(null)}
        interventionForm={interventionForm}
        setInterventionForm={setInterventionForm}
      />

      {/* ── Modal notes (Admin + Employés) ── */}
      <Modal
        visible={noteModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => closeNoteModal()}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ flex: 0.08 }} />
          <View style={{ flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40, padding: 16 }}>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>
                      {(() => {
                        if (noteModal?.targetEmployeId?.startsWith('st:')) {
                          const stId = noteModal.targetEmployeId.replace('st:', '');
                          const st = data.sousTraitants.find(s => s.id === stId);
                          return st ? `${st.prenom} ${st.nom}${st.societe ? ' — ' + st.societe : ''}` : 'Sous-traitant';
                        }
                        const emp = data.employes.find(e => e.id === noteModal?.targetEmployeId);
                        const chantier = data.chantiers.find(c => c.id === noteModal?.chantierId);
                        return emp ? `${emp.prenom} ${emp.nom}` : (chantier?.nom || 'Note');
                      })()}
                    </Text>
                    {noteModal && (
                      <Text style={styles.modalSubtitle}>
                        {data.chantiers.find(c => c.id === noteModal.chantierId)?.nom} — {noteModal.date}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={() => closeNoteModal()} style={styles.modalXBtn}>
                    <Text style={styles.modalXText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                  {/* Liste des notes existantes */}
                  {noteModal && noteModal.allNotes.length > 0 && !showNoteEditor && (
                    <View style={styles.notesList}>
                      {noteModal.allNotes.map(note => {
                        const canEdit = canEditNote(note, noteModal.date);
                        return (
                          <View key={note.id} style={styles.noteCard}>
                            <View style={styles.noteCardHeader}>
                              <Text style={styles.noteAuthor}>{note.auteurNom}</Text>
                              <Text style={styles.noteDate}>
                                {new Date(note.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                            <Text style={styles.noteCardText}>{note.texte}</Text>
                            {note.photos && note.photos.length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                {note.photos.map((uri, idx) => {
                                  const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                  if (isPdf) {
                                    return (
                                      <Pressable
                                        key={idx}
                                        style={styles.pdfThumb}
                                        onPress={() => {
                                          if (Platform.OS === 'web') {
                                            const win = window.open();
                                            if (win) { win.document.write(`<iframe src="${uri}" style="width:100%;height:100vh;border:none"></iframe>`); }
                                          }
                                        }}
                                      >
                                        <Text style={styles.pdfThumbIcon}>📄</Text>
                                        <Text style={styles.pdfThumbLabel}>PDF</Text>
                                      </Pressable>
                                    );
                                  }
                                  return <Image key={idx} source={{ uri }} style={styles.noteCardPhoto} />;
                                })}
                              </ScrollView>
                            )}
                            {/* Checklist de tâches */}
                            {note.tasks && note.tasks.length > 0 && (
                              <View style={styles.taskList}>
                                <Text style={styles.taskListTitle}>Liste de tâches</Text>
                                {note.tasks.map(task => (
                                  <View key={task.id} style={styles.taskRow}>
                                    <Pressable
                                      style={[styles.taskCheckbox, task.fait && styles.taskCheckboxDone]}
                                      onPress={() => {
                                        const authorName = currentUser?.role === 'admin' ? 'Admin'
                                          : data.employes.find(e => e.id === currentUser?.employeId)?.prenom
                                          || data.sousTraitants.find(s => s.id === currentUser?.soustraitantId)?.prenom
                                          || 'Inconnu';
                                        toggleTask(note.affectationId, note.id, task.id, authorName);
                                        // Mettre à jour l'état local du modal
                                        setNoteModal(prev => prev ? {
                                          ...prev,
                                          allNotes: prev.allNotes.map(n => n.id === note.id ? {
                                            ...n,
                                            tasks: (n.tasks || []).map(t => t.id === task.id ? { ...t, fait: !t.fait } : t)
                                          } : n)
                                        } : null);
                                      }}
                                    >
                                      <Text style={styles.taskCheckboxText}>{task.fait ? '✓' : ''}</Text>
                                    </Pressable>
                                    <View style={{ flex: 1 }}>
                                      <Text style={[styles.taskText, task.fait && styles.taskTextDone]}>{task.texte}</Text>
                                      {task.fait && task.faitPar && (
                                        <Text style={styles.taskDoneBy}>Fait par {task.faitPar}</Text>
                                      )}
                                    </View>
                                    {canEdit && (
                                      <Pressable
                                        onPress={() => {
                                          deleteTask(note.affectationId, note.id, task.id);
                                          setNoteModal(prev => prev ? {
                                            ...prev,
                                            allNotes: prev.allNotes.map(n => n.id === note.id ? {
                                              ...n,
                                              tasks: (n.tasks || []).filter(t => t.id !== task.id)
                                            } : n)
                                          } : null);
                                        }}
                                        style={{ padding: 4 }}
                                      >
                                        <Text style={{ color: '#E74C3C', fontSize: 12 }}>✕</Text>
                                      </Pressable>
                                    )}
                                  </View>
                                ))}
                                {/* Progression */}
                                <View style={styles.taskProgress}>
                                  <View style={[styles.taskProgressBar, {
                                    width: `${note.tasks.length > 0 ? Math.round((note.tasks.filter(t => t.fait).length / note.tasks.length) * 100) : 0}%` as any
                                  }]} />
                                </View>
                                <Text style={styles.taskProgressText}>
                                  {note.tasks.filter(t => t.fait).length}/{note.tasks.length} tâches effectuées
                                </Text>
                              </View>
                            )}
                            {canEdit && (
                              <View style={styles.noteCardActions}>
                                <Pressable style={styles.noteActionBtn} onPress={() => startEditNote(note)}>
                                  <Text style={styles.noteActionBtnText}>✏ Modifier</Text>
                                </Pressable>
                                <Pressable style={[styles.noteActionBtn, styles.noteActionBtnDanger]} onPress={() => handleDeleteNote(note)}>
                                  <Text style={[styles.noteActionBtnText, { color: '#E74C3C' }]}>🗑 Supprimer</Text>
                                </Pressable>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Message si aucune note */}
                  {noteModal && noteModal.allNotes.length === 0 && !showNoteEditor && (
                    <Text style={styles.noNoteText}>Aucune note pour ce jour.</Text>
                  )}

                  {/* Éditeur de note */}
                  {showNoteEditor && (
                    <View style={styles.noteEditor}>
                      <Text style={styles.noteLabel}>
                        {noteModal?.editingNote ? 'Modifier la note' : 'Nouvelle note'}
                      </Text>
                      {/* Modèles de notes rapides */}
                      {!noteModal?.editingNote && !noteText && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 4 }}>
                          {['Finitions à terminer', 'Attente livraison matériel', 'Nettoyage fin de chantier', 'Problème à signaler', 'RAS — Travail en cours'].map(tpl => (
                            <Pressable key={tpl} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E2E6EA' }}
                              onPress={() => setNoteText(tpl)}>
                              <Text style={{ fontSize: 11, color: '#687076' }}>{tpl}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      )}
                      {/* Sélecteur SAV (si tickets existent pour ce chantier) */}
                      {noteModal && (() => {
                        const savTickets = (data.ticketsSAV || []).filter(t => t.chantierId === noteModal.chantierId && t.statut !== 'clos');
                        if (savTickets.length === 0) return null;
                        return (
                          <View style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#687076', marginBottom: 4 }}>🔧 Lier à un SAV :</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                              <Pressable style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E2E6EA' }, !noteSavTicketId && { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' }]}
                                onPress={() => setNoteSavTicketId(null)}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: !noteSavTicketId ? '#fff' : '#687076' }}>Aucun</Text>
                              </Pressable>
                              {savTickets.map(t => (
                                <Pressable key={t.id} style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E2E6EA' }, noteSavTicketId === t.id && { backgroundColor: '#E74C3C', borderColor: '#E74C3C' }]}
                                  onPress={() => { setNoteSavTicketId(t.id); if (!noteText.trim()) setNoteText(`SAV: ${t.objet}`); }}>
                                  <Text style={{ fontSize: 10, fontWeight: '600', color: noteSavTicketId === t.id ? '#fff' : '#687076' }} numberOfLines={1}>🔧 {t.objet}</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        );
                      })()}

                      <View style={styles.noteInputRow}>
                        <TextInput
                          style={styles.noteInput}
                          value={noteText}
                          onChangeText={(text) => {
                            setNoteText(text);
                            const match = text.match(/@(\w*)$/);
                            setMentionQuery(match ? match[1] : null);
                          }}
                          placeholder="Saisir une note... (tapez @ pour mentionner)"
                          placeholderTextColor="#B0BEC5"
                          multiline
                          numberOfLines={4}
                          returnKeyType="done"
                          blurOnSubmit
                        />
                        {/* Suggestions @mentions */}
                        {mentionQuery !== null && (() => {
                          const q = mentionQuery.toLowerCase();
                          const suggestions = data.employes.filter(e =>
                            `${e.prenom} ${e.nom}`.toLowerCase().includes(q) || e.prenom.toLowerCase().startsWith(q)
                          ).slice(0, 5);
                          if (suggestions.length === 0) return null;
                          return (
                            <View style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, maxHeight: 150 }}>
                              {suggestions.map(emp => (
                                <Pressable key={emp.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}
                                  onPress={() => {
                                    const before = noteText.replace(/@\w*$/, '');
                                    setNoteText(`${before}@${emp.prenom} `);
                                    setMentionQuery(null);
                                  }}>
                                  <Text style={{ fontSize: 14, color: '#11181C' }}>
                                    <Text style={{ fontWeight: '700' }}>{emp.prenom}</Text> {emp.nom}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          );
                        })()}
                        <Pressable style={styles.keyboardDismissBtn} onPress={Keyboard.dismiss}>
                          <Text style={styles.keyboardDismissText}>↓</Text>
                        </Pressable>
                      </View>

                      <Text style={[styles.noteLabel, { marginTop: 12 }]}>Photos</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
                        {notePhotos.map((uri, idx) => {
                          const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                          return (
                            <View key={idx} style={styles.photoThumb}>
                              {isPdf ? (
                                <View style={[styles.photoImg, styles.pdfPreview]}>
                                  <Text style={styles.pdfPreviewIcon}>📄</Text>
                                  <Text style={styles.pdfPreviewLabel}>PDF</Text>
                                </View>
                              ) : (
                                <Image source={{ uri }} style={styles.photoImg} />
                              )}
                              <Pressable style={styles.photoRemove} onPress={() => removePhoto(idx)}>
                                <Text style={styles.photoRemoveText}>✕</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                        <Pressable style={styles.addPhotoBtn} onPress={handleAddPhoto}>
                          <Text style={styles.addPhotoBtnText}>+</Text>
                          <Text style={styles.addPhotoBtnLabel}>Photo/PDF</Text>
                        </Pressable>
                        {Platform.OS !== 'web' && (
                          <Pressable style={styles.addPhotoBtn} onPress={handleAddDoc}>
                            <Text style={styles.addPhotoBtnText}>+</Text>
                            <Text style={styles.addPhotoBtnLabel}>PDF</Text>
                          </Pressable>
                        )}
                      </ScrollView>

                      {/* Section checklist */}
                      <Text style={[styles.noteLabel, { marginTop: 12 }]}>📋 Tâches à faire</Text>
                      {/* Tâches dans l'éditeur : editingNote.tasks (note existante) ou pendingTasksList (nouvelle note) */}
                      {(() => {
                        const editorTasks = noteModal?.editingNote ? (noteModal.editingNote.tasks || []) : pendingTasksList;
                        if (editorTasks.length === 0) return null;
                        return (
                          <View style={{ marginBottom: 8 }}>
                            {editorTasks.map(task => (
                              <View key={task.id} style={styles.taskRow}>
                                <View style={[styles.taskCheckbox, task.fait && styles.taskCheckboxDone]}>
                                  <Text style={styles.taskCheckboxText}>{task.fait ? '✓' : ''}</Text>
                                </View>
                                <Text style={[styles.taskText, task.fait && styles.taskTextDone, { flex: 1 }]}>{task.texte}</Text>
                                <Pressable
                                  onPress={() => {
                                    if (noteModal?.editingNote) {
                                      const updatedTasks = (noteModal.editingNote.tasks || []).filter(t => t.id !== task.id);
                                      setNoteModal(prev => prev && prev.editingNote ? {
                                        ...prev,
                                        editingNote: { ...prev.editingNote, tasks: updatedTasks }
                                      } : prev);
                                    } else {
                                      setPendingTasksList(prev => prev.filter(t => t.id !== task.id));
                                    }
                                  }}
                                  style={{ padding: 4 }}
                                >
                                  <Text style={{ color: '#E74C3C', fontSize: 12 }}>✕</Text>
                                </Pressable>
                              </View>
                            ))}
                          </View>
                        );
                      })()}
                      {showTaskInput ? (
                        <View style={styles.taskInputRow}>
                          <TextInput
                            style={styles.taskInput}
                            value={newTaskText}
                            onChangeText={setNewTaskText}
                            placeholder="Décrire la tâche..."
                            placeholderTextColor="#B0BEC5"
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={() => {
                              if (newTaskText.trim()) {
                                const newTask: TaskItem = {
                                  id: `t_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                                  texte: newTaskText.trim(),
                                  fait: false,
                                };
                                if (noteModal?.editingNote) {
                                  // Note existante : sauvegarder immédiatement dans les données
                                  const affId = data.affectations.find(a =>
                                    a.chantierId === noteModal.chantierId &&
                                    a.dateDebut <= noteModal.date && a.dateFin >= noteModal.date &&
                                    a.notes.some(n => n.id === noteModal.editingNote!.id)
                                  )?.id;
                                  if (affId) addTask(affId, noteModal.editingNote.id, newTask);
                                  // Aussi mettre à jour le state local pour l'affichage
                                  setNoteModal(prev => prev && prev.editingNote ? {
                                    ...prev,
                                    editingNote: { ...prev.editingNote, tasks: [...(prev.editingNote.tasks || []), newTask] }
                                  } : prev);
                                } else {
                                  // Nouvelle note : stocker dans pendingTasksList
                                  setPendingTasksList(prev => [...prev, newTask]);
                                }
                                setNewTaskText('');
                                setShowTaskInput(false);
                              }
                            }}
                          />
                          <Pressable style={styles.taskInputCancel} onPress={() => { setShowTaskInput(false); setNewTaskText(''); }}>
                            <Text style={{ color: '#687076' }}>✕</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable style={styles.addTaskBtn} onPress={() => setShowTaskInput(true)}>
                          <Text style={styles.addTaskBtnText}>+ Ajouter une tâche</Text>
                        </Pressable>
                      )}

                      {/* Options admin : visibilité et répétition */}
                      {isAdmin && !noteModal?.editingNote && (
                        <View style={{ marginTop: 12, gap: 10 }}>
                          <Text style={styles.noteLabel}>Visible par</Text>
                          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            {(['tous', 'employes', 'soustraitants'] as const).map(v => (
                              <Pressable
                                key={v}
                                style={[styles.visibBtn, noteVisiblePar === v && noteVisibleIds.length === 0 && styles.visibBtnActive]}
                                onPress={() => { setNoteVisiblePar(v); setNoteVisibleIds([]); }}
                              >
                                <Text style={[styles.visibBtnText, noteVisiblePar === v && noteVisibleIds.length === 0 && styles.visibBtnTextActive]}>
                                  {v === 'tous' ? 'Tous' : v === 'employes' ? 'Employés' : 'Sous-traitants'}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          {/* Sélection spécifique d'acteurs présents sur le chantier */}
                          {(noteVisiblePar === 'employes' || noteVisiblePar === 'soustraitants') && noteModal && (() => {
                            // Récupérer les acteurs présents sur ce chantier ce jour
                            const dateStr = noteModal.date;
                            const chantierId = noteModal.chantierId;
                            const employes = noteVisiblePar === 'employes'
                              ? data.employes.filter(e => data.affectations.some(a =>
                                  a.chantierId === chantierId && a.employeId === e.id &&
                                  a.dateDebut <= dateStr && a.dateFin >= dateStr
                                ))
                              : [];
                            const sts = noteVisiblePar === 'soustraitants'
                              ? (data.sousTraitants || []).filter(s => data.affectations.some(a =>
                                  a.chantierId === chantierId && a.soustraitantId === s.id &&
                                  a.dateDebut <= dateStr && a.dateFin >= dateStr
                                ))
                              : [];
                            const acteurs = [
                              ...employes.map(e => ({ id: e.id, label: `${e.prenom} ${e.nom}`, color: getEmployeColor(e) })),
                              ...sts.map(s => ({ id: `st:${s.id}`, label: `${s.prenom} ${s.nom}${s.societe ? ' ('+s.societe+')' : ''}`, color: s.couleur })),
                            ];
                            if (acteurs.length === 0) return null;
                            return (
                              <View style={{ marginTop: 4 }}>
                                <Text style={[styles.noteLabel, { fontSize: 12, color: '#687076' }]}>
                                  Sélectionner des acteurs spécifiques (optionnel)
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                  {acteurs.map(a => {
                                    const isSelected = noteVisibleIds.includes(a.id);
                                    return (
                                      <Pressable
                                        key={a.id}
                                        style={[styles.visibBtn, { backgroundColor: isSelected ? a.color : '#F5EDE3', borderColor: a.color, borderWidth: 1.5 }]}
                                        onPress={() => {
                                          setNoteVisibleIds(prev =>
                                            prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id]
                                          );
                                        }}
                                      >
                                        <Text style={[styles.visibBtnText, { color: isSelected ? '#fff' : a.color }]}>
                                          {a.label}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              </View>
                            );
                          })()}
                          <Text style={styles.noteLabel}>Répéter sur</Text>
                          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            {[0, 1, 2, 3, 5, 7, 14].map(d => (
                              <Pressable
                                key={d}
                                style={[styles.visibBtn, noteRepeatDays === d && styles.visibBtnActive]}
                                onPress={() => setNoteRepeatDays(d)}
                              >
                                <Text style={[styles.visibBtnText, noteRepeatDays === d && styles.visibBtnTextActive]}>
                                  {d === 0 ? 'Non' : d === 1 ? '+1 j' : `+${d} j`}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      <View style={styles.editorActions}>
                        <Pressable style={styles.cancelBtn} onPress={() => { setShowNoteEditor(false); setNoteText(''); setNotePhotos([]); setShowTaskInput(false); setNewTaskText(''); setNoteRepeatDays(0); setNoteVisiblePar('tous'); }}>
                          <Text style={styles.cancelBtnText}>Annuler</Text>
                        </Pressable>
                        <Pressable style={styles.saveNoteBtn} onPress={saveNote}>
                          <Text style={styles.saveNoteBtnText}>Enregistrer</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </ScrollView>

                {/* Bouton ajouter une note (si pas en mode édition) */}
                {!showNoteEditor && (
                  <Pressable style={styles.addNoteBtn} onPress={startNewNote}>
                    <Text style={styles.addNoteBtnText}>+ Ajouter une note</Text>
                  </Pressable>
                )}

                <Pressable style={styles.modalCloseBtn} onPress={() => closeNoteModal()}>
                  <Text style={styles.modalCloseBtnText}>Fermer</Text>
                </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* ── Modal Intervention externe (admin) ── */}
      <ModalKeyboard
        visible={interventionModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setInterventionModal(null)}
      >
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setInterventionModal(null)} />
          <Pressable style={styles.interventionSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>⚡ {interventionModal?.editId ? 'Modifier' : 'Ajouter'} une intervention</Text>
              <Pressable onPress={() => setInterventionModal(null)} style={styles.modalXBtn}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={styles.intervFormLabel}>Libellé *</Text>
              <TextInput
                style={styles.intervFormInput}
                value={interventionForm.libelle}
                onChangeText={v => setInterventionForm(f => ({ ...f, libelle: v }))}
                placeholder="Ex: Menuiserie Dupont, Livraison matériaux..."
                placeholderTextColor="#B0BEC5"
                autoFocus
              />
              <Text style={[styles.intervFormLabel, { marginTop: 12 }]}>Description (optionnel)</Text>
              <TextInput
                style={[styles.intervFormInput, { minHeight: 60 }]}
                value={interventionForm.description}
                onChangeText={v => setInterventionForm(f => ({ ...f, description: v }))}
                placeholder="Détails, contact, numéro de téléphone..."
                placeholderTextColor="#B0BEC5"
                multiline
              />
              <View style={styles.intervDateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.intervFormLabel}>Du *</Text>
                  <TextInput
                    style={styles.intervFormInput}
                    value={interventionForm.dateDebut}
                    onChangeText={v => setInterventionForm(f => ({ ...f, dateDebut: v }))}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor="#B0BEC5"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.intervFormLabel}>Au *</Text>
                  <TextInput
                    style={styles.intervFormInput}
                    value={interventionForm.dateFin}
                    onChangeText={v => setInterventionForm(f => ({ ...f, dateFin: v }))}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor="#B0BEC5"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              <Text style={[styles.intervFormLabel, { marginTop: 12 }]}>Couleur</Text>
              <View style={styles.intervColorRow}>
                {INTERVENTION_COLORS.map(c => (
                  <Pressable
                    key={c}
                    style={[styles.intervColorSwatch, { backgroundColor: c }, interventionForm.couleur === c && styles.intervColorSwatchActive]}
                    onPress={() => setInterventionForm(f => ({ ...f, couleur: c }))}
                  />
                ))}
              </View>
              {interventionModal?.editId && (
                <Pressable
                  style={styles.intervDeleteBtn}
                  onPress={() => {
                    if (interventionModal.editId) deleteIntervention(interventionModal.editId);
                    setInterventionModal(null);
                  }}
                >
                  <Text style={styles.intervDeleteBtnText}>🗑 Supprimer cette intervention</Text>
                </Pressable>
              )}
              <Pressable style={styles.intervSaveBtn} onPress={handleSaveIntervention}>
                <Text style={styles.intervSaveBtnText}>✓ Enregistrer</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </View>
      </ModalKeyboard>

      {/* ── Modal retard planifié (employé) ── */}
      <ModalRetardPlanifie
        visible={showRetardModal}
        onClose={() => setShowRetardModal(false)}
        retardsPlanifies={(data.retardsPlanifies || []).filter(r => r.employeId === currentUser?.employeId)}
        onSave={(values) => {
          addRetardPlanifie({
            ...values,
            id: `retard_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            employeId: currentUser?.employeId || '',
            createdAt: new Date().toISOString(),
            lu: false,
          });
        }}
        onDelete={deleteRetardPlanifie}
      />

      {/* Galerie photos globale */}
      <GaleriePhotos
        visible={showGalerieGlobale}
        onClose={() => { setShowGalerieGlobale(false); setGalerieChantierId(undefined); }}
        chantierId={galerieChantierId}
        titre="📷 Galerie photos"
      />

      {/* ── Modal Notes Chantier (Planning) ── */}
      <ModalNotesChantier
        visible={showNotesPlanning}
        onClose={() => setShowNotesPlanning(false)}
        chantierNom={chantierNomNotes}
        notes={notesVisibles}
        participants={participantsForNotes}
        isAdmin={isAdmin}
        onPickPhotos={handlePickNotePhotos}
        onAddNote={handleAddNoteChantier}
        onArchiveNote={handleArchiveNoteChantier}
        onDeleteNote={handleDeleteNoteChantier}
      />

      {/* ── Modal Plans Planning ── */}
      <ModalPlansChantier
        visible={showPlansPlanning}
        onClose={() => setShowPlansPlanning(false)}
        chantierNom={chantierNomPlans}
        plans={plansVisibles}
        participants={participantsForPlans}
        isAdmin={isAdmin}
        onPickFile={handlePickPlanFile}
        onAddPlan={handleAddPlan}
        onDeletePlan={handleDeletePlan}
      />

      {/* Modal paramètres compte admin */}
      <ModalKeyboard visible={showPwdModal} transparent animationType="fade" onRequestClose={() => setShowPwdModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 420 }}>
            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 20, textAlign: 'center' }}>⚙️ Paramètres du compte admin</Text>

              {/* Identifiant */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Identifiant de connexion</Text>
              <TextInput
                style={{ backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
                value={adminIdEdit}
                onChangeText={v => { setAdminIdEdit(v); setPwdError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Identifiant admin"
                placeholderTextColor="#687076"
              />

              {/* Employé lié */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Employé associé au compte admin</Text>
              <Text style={{ fontSize: 11, color: '#687076', marginBottom: 8 }}>Les autres utilisateurs verront ce nom et pourront vous envoyer des messages.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: !adminEmployeIdEdit ? '#2C2C2C' : '#F5EDE3' }}
                    onPress={() => setAdminEmployeIdEdit(undefined)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: !adminEmployeIdEdit ? '#fff' : '#687076' }}>Aucun</Text>
                  </Pressable>
                  {data.employes.map(e => (
                    <Pressable
                      key={e.id}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: adminEmployeIdEdit === e.id ? '#2C2C2C' : '#F5EDE3' }}
                      onPress={() => setAdminEmployeIdEdit(e.id)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: adminEmployeIdEdit === e.id ? '#fff' : '#11181C' }}>{e.prenom} {e.nom}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              {/* Magasin préféré */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6, marginTop: 8 }}>Magasin préféré (vérification dispo)</Text>
              <Text style={{ fontSize: 11, color: '#687076', marginBottom: 8 }}>Utilisé pour vérifier la disponibilité des articles chez Leroy Merlin, etc.</Text>
              <TextInput
                style={{ backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
                value={magasinEdit}
                onChangeText={setMagasinEdit}
                placeholder="Ex: Leroy Merlin Ivry-sur-Seine"
                placeholderTextColor="#687076"
              />

              {/* Séparateur */}
              <View style={{ height: 1, backgroundColor: '#E2E6EA', marginVertical: 10 }} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#11181C', marginBottom: 12 }}>Changer le mot de passe (optionnel)</Text>

              <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Mot de passe actuel</Text>
              <TextInput
                style={{ backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
                value={pwdActuel}
                onChangeText={v => { setPwdActuel(v); setPwdError(''); }}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Mot de passe actuel"
                placeholderTextColor="#687076"
              />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Nouveau mot de passe</Text>
              <TextInput
                style={{ backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
                value={pwdNouveau}
                onChangeText={v => { setPwdNouveau(v); setPwdError(''); }}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Nouveau mot de passe"
                placeholderTextColor="#687076"
              />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Confirmer le mot de passe</Text>
              <TextInput
                style={{ backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
                value={pwdConfirm}
                onChangeText={v => { setPwdConfirm(v); setPwdError(''); }}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Confirmer le mot de passe"
                placeholderTextColor="#687076"
              />
              {pwdError !== '' && <Text style={{ color: '#E74C3C', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{pwdError}</Text>}
              {pwdSuccess && <Text style={{ color: '#27AE60', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>Paramètres enregistrés !</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 13, alignItems: 'center' }} onPress={() => setShowPwdModal(false)}>
                  <Text style={{ fontSize: 15, color: '#687076', fontWeight: '600' }}>Annuler</Text>
                </Pressable>
                <Pressable style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 13, alignItems: 'center' }} onPress={handleSaveAdminSettings}>
                  <Text style={{ fontSize: 15, color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>
      {/* ── Modal déplacer un employé ── */}
      <ModalKeyboard visible={moveModal !== null} transparent animationType="fade" onRequestClose={() => setMoveModal(null)}>
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setMoveModal(null)} />
          <View style={[styles.modalSheet, { maxHeight: 520 }]}>
            {moveModal && (() => {
              const emp = data.employes.find(e => e.id === moveModal.employeId);
              const fromChantier = data.chantiers.find(c => c.id === moveModal.chantierId);
              const availableChantiers = data.chantiers.filter(c => c.statut === 'actif' && c.id !== moveModal.chantierId);
              // Générer 14 jours à partir d'aujourd'hui
              const dateChoices: { label: string; value: string }[] = [];
              for (let i = 0; i < 14; i++) {
                const d = new Date(); d.setDate(d.getDate() + i);
                dateChoices.push({
                  value: toYMD(d),
                  label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
                });
              }
              return (
                <ScrollView keyboardShouldPersistTaps="handled">
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C', textAlign: 'center', marginBottom: 4 }}>
                    Déplacer {emp?.prenom} {emp?.nom}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#687076', textAlign: 'center', marginBottom: 16 }}>
                    Depuis : {fromChantier?.nom} — {new Date(moveModal.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>

                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 8 }}>Vers quel chantier ?</Text>
                  <View style={{ gap: 4, marginBottom: 16 }}>
                    {/* Même chantier (changer juste la date) */}
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: moveTargetChantierId === moveModal.chantierId ? '#E8F0FE' : '#F5EDE3', borderWidth: moveTargetChantierId === moveModal.chantierId ? 1.5 : 0, borderColor: '#2C2C2C' }}
                      onPress={() => setMoveTargetChantierId(moveModal.chantierId)}>
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: fromChantier?.couleur, marginRight: 8 }} />
                      <Text style={{ fontSize: 13, color: '#11181C', fontWeight: moveTargetChantierId === moveModal.chantierId ? '700' : '400' }}>{fromChantier?.nom} (même)</Text>
                    </Pressable>
                    {availableChantiers.map(c => (
                      <Pressable
                        key={c.id}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: moveTargetChantierId === c.id ? '#E8F0FE' : '#F5EDE3', borderWidth: moveTargetChantierId === c.id ? 1.5 : 0, borderColor: '#2C2C2C' }}
                        onPress={() => setMoveTargetChantierId(c.id)}>
                        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.couleur, marginRight: 8 }} />
                        <Text style={{ fontSize: 13, color: '#11181C', fontWeight: moveTargetChantierId === c.id ? '700' : '400' }}>{c.nom}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Date de destination</Text>
                  <View style={{ gap: 3, marginBottom: 16 }}>
                    {dateChoices.map(d => (
                      <Pressable key={d.value} style={{ padding: 10, borderRadius: 8, backgroundColor: moveTargetDate === d.value ? '#2C2C2C' : '#F5EDE3' }}
                        onPress={() => setMoveTargetDate(d.value)}>
                        <Text style={{ fontSize: 13, fontWeight: moveTargetDate === d.value ? '700' : '400', color: moveTargetDate === d.value ? '#fff' : '#11181C', textTransform: 'capitalize' }}>{d.label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 13, alignItems: 'center' }} onPress={() => setMoveModal(null)}>
                      <Text style={{ fontSize: 15, color: '#687076', fontWeight: '600' }}>Annuler</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 13, alignItems: 'center', opacity: moveTargetChantierId ? 1 : 0.5 }}
                      onPress={() => {
                        if (!moveModal || !moveTargetChantierId || !moveTargetDate) return;
                        moveEmploye({
                          fromChantierId: moveModal.chantierId,
                          fromDate:       moveModal.date,
                          toChantierId:   moveTargetChantierId,
                          toDate:         moveTargetDate,
                          employeId:      moveModal.employeId,
                        });
                        setMoveModal(null);
                      }}
                      disabled={!moveTargetChantierId}
                    >
                      <Text style={{ fontSize: 15, color: '#fff', fontWeight: '700' }}>Déplacer</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </ModalKeyboard>
      {/* ── Modal ordre affectations multi-chantiers ── */}
      <Modal
        visible={ordreModal !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setOrdreModal(null)}
      >
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setOrdreModal(null)} />
          <Pressable style={[styles.modalSheet, { maxHeight: 400 }]} onPress={() => {}}>
            {ordreModal && (() => {
              const emp = data.employes.find(e => e.id === ordreModal.employeId);
              return (
                <>
                  <Text style={[styles.modalTitle, { marginBottom: 8 }]}>
                    Ordre de passage — {emp?.prenom} {emp?.nom}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#687076', marginBottom: 12 }}>
                    {ordreModal.date} · Appuyez sur ↑ / ↓ pour réordonner
                  </Text>
                  {ordreModal.chantierIds.map((cId, idx) => {
                    const ch = data.chantiers.find(c => c.id === cId);
                    return (
                      <View key={cId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={[styles.ordreBadge, { position: 'relative', marginRight: 10 }]}>
                          <Text style={styles.ordreBadgeText}>{idx + 1}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, color: '#11181C' }} numberOfLines={1}>
                          {ch?.nom || cId}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {idx > 0 && (
                            <Pressable
                              style={{ padding: 6, backgroundColor: '#E8EEF8', borderRadius: 6 }}
                              onPress={() => {
                                const newIds = [...ordreModal.chantierIds];
                                [newIds[idx - 1], newIds[idx]] = [newIds[idx], newIds[idx - 1]];
                                setOrdreModal({ ...ordreModal, chantierIds: newIds });
                              }}
                            >
                              <Text style={{ fontSize: 14 }}>↑</Text>
                            </Pressable>
                          )}
                          {idx < ordreModal.chantierIds.length - 1 && (
                            <Pressable
                              style={{ padding: 6, backgroundColor: '#E8EEF8', borderRadius: 6 }}
                              onPress={() => {
                                const newIds = [...ordreModal.chantierIds];
                                [newIds[idx], newIds[idx + 1]] = [newIds[idx + 1], newIds[idx]];
                                setOrdreModal({ ...ordreModal, chantierIds: newIds });
                              }}
                            >
                              <Text style={{ fontSize: 14 }}>↓</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <Pressable style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => setOrdreModal(null)}>
                      <Text style={{ color: '#687076', fontWeight: '600' }}>Annuler</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                      onPress={() => {
                        updateOrdreAffectation(ordreModal.employeId, ordreModal.date, ordreModal.chantierIds);
                        setOrdreModal(null);
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </View>
      </Modal>

    </>
    )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: '#F5EDE3',
  },
  headerLogoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
  },
  headerSub: {
    fontSize: 12,
    color: '#687076',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  galerieBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galerieBtnText: {
    fontSize: 16,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 22,
    color: '#11181C',
    fontWeight: '300',
  },
  todayBtn: {
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  todayBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  logoutBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 16,
    marginLeft: 4,
  },
  logoutBtnText: {
    fontSize: 16,
    color: '#E74C3C',
  },
  weekInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  weekLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#11181C',
  },
  chantierCount: {
    fontSize: 13,
    color: '#687076',
  },
  gridScroll: {
    flex: 1,
    backgroundColor: '#F5EDE3',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
  },
  nameCell: {
    width: NAME_COL_DEFAULT, // overridé dynamiquement en inline
    minHeight: 50,
    paddingHorizontal: 4,
    paddingVertical: 4,
    paddingLeft: 6,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E6EA',
    position: 'relative',
    overflow: 'hidden',
  },
  headerCell: {
    backgroundColor: '#F5EDE3',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  chantierName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#11181C',
    lineHeight: 14,
  },
  colorBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  dayHeaderCell: {
    width: DAY_COL,
    alignItems: 'center',
    paddingVertical: 6,
    borderRightWidth: 0.5,
    borderRightColor: '#E2E6EA',
  },
  dayHeaderCellToday: {
    backgroundColor: '#EEF2F8',
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#687076',
  },
  dayNameToday: {
    color: '#2C2C2C',
    fontWeight: '700',
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginTop: 2,
  },
  dayNumToday: {
    color: '#2C2C2C',
    fontWeight: '600',
  },
  chantierRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
    minHeight: 70,
  },
  cell: {
    width: DAY_COL, // overridé dynamiquement en inline
    paddingVertical: 3,
    paddingHorizontal: 0,
    gap: 1,
    borderRightWidth: 0.5,
    borderRightColor: '#E2E6EA',
    alignItems: 'stretch',
  },
  cellToday: {
    backgroundColor: '#EEF2F8',
  },
  cellOutOfRange: {
    backgroundColor: '#F5EDE3',
  },
  empBadge: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderRadius: 3,
    alignItems: 'center',
    position: 'relative',
  },
  empBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  noteDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  ordreBadge: {
    position: 'absolute',
    bottom: 1,
    left: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordreBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 10,
  },
  badgeWrapper: {
    position: 'relative',
  },
  removeBadgeBtn: {
    position: 'absolute',
    top: -4,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#fff',
  },
  removeBadgeBtnText: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '900',
    lineHeight: 12,
  },
  addBtn: {
    width: '100%',
    paddingVertical: 3,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 16,
    color: '#687076',
    fontWeight: '400',
  },
  noteBtn: {
    width: '100%',
    paddingVertical: 2,
    alignItems: 'center',
  },
  noteBtnText: {
    fontSize: 12,
    color: '#687076',
  },
  stBadge: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderRadius: 3,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    borderStyle: 'dashed',
  },
  stBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#687076',
    fontSize: 14,
  },
  legendSection: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 24,
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '45%',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#11181C',
  },
  legendSub: {
    fontSize: 10,
    color: '#687076',
    marginTop: 1,
  },
  legendDotST: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  // Fiche chantier dans le planning
  ficheIndicator: {
    fontSize: 10,
    marginTop: 2,
  },
  ficheModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '90%',
  },
  ficheRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    alignItems: 'flex-start',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 12,
  },
  ficheRowIcon: {
    fontSize: 20,
    width: 26,
    textAlign: 'center',
    marginTop: 2,
  },
  ficheRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  ficheRowValue: {
    fontSize: 15,
    color: '#11181C',
    lineHeight: 22,
    fontWeight: '500',
  },
  fichePhotosSection: {
    marginBottom: 16,
  },
  fichePdfThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    borderWidth: 1.5,
    borderColor: '#FFB74D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  fichePdfIcon: {
    fontSize: 28,
  },
  fichePdfLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E65100',
  },
  fichePhotoThumb: {
    width: 120,
    height: 120,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: '#E2E6EA',
  },
  ficheUpdatedAt: {
    fontSize: 11,
    color: '#B0BEC5',
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E6EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#687076',
    marginBottom: 16,
  },
  modalCloseBtn: {
    marginTop: 16,
    backgroundColor: '#2C2C2C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  modalKAV: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalXBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5EDE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalXBtnText: {
    fontSize: 14,
    color: '#687076',
    fontWeight: '700',
  },
  modalXText: {
    fontSize: 14,
    color: '#687076',
    fontWeight: '700',
  },
  // ── Notes ──
  notesList: {
    gap: 12,
    marginBottom: 8,
  },
  noteCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  noteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C2C2C',
  },
  noteDate: {
    fontSize: 11,
    color: '#687076',
  },
  noteCardText: {
    fontSize: 14,
    color: '#11181C',
    lineHeight: 20,
  },
  noteCardPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
  },
  noteCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  noteActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEF2F8',
  },
  noteActionBtnDanger: {
    backgroundColor: '#FEE2E2',
  },
  noteActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  noNoteText: {
    color: '#687076',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  addNoteBtn: {
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#EEF2F8',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2C2C2C',
    borderStyle: 'dashed',
  },
  addNoteBtnText: {
    color: '#2C2C2C',
    fontWeight: '700',
    fontSize: 14,
  },
  // ── Éditeur de note ──
  noteEditor: {
    marginBottom: 8,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 8,
  },
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteInput: {
    flex: 1,
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  keyboardDismissBtn: {
    backgroundColor: '#E2E6EA',
    borderRadius: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  keyboardDismissText: {
    fontSize: 18,
    color: '#11181C',
    fontWeight: '700',
  },
  photosRow: {
    marginTop: 4,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginRight: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  photoImg: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  photoRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E2E6EA',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5EDE3',
    marginRight: 8,
  },
  addPhotoBtnText: {
    fontSize: 24,
    color: '#687076',
    fontWeight: '300',
  },
  addPhotoBtnLabel: {
    fontSize: 10,
    color: '#687076',
    marginTop: 2,
  },
  editorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F5EDE3',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  cancelBtnText: {
    color: '#687076',
    fontWeight: '600',
    fontSize: 15,
  },
  saveNoteBtn: {
    flex: 2,
    backgroundColor: '#2C2C2C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveNoteBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // ── PDF (éléments joints) ──
  pdfThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFCC80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfThumbIcon: {
    fontSize: 28,
  },
  pdfThumbLabel: {
    fontSize: 10,
    color: '#E65100',
    fontWeight: '700',
    marginTop: 2,
  },
  pdfPreview: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFCC80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfPreviewIcon: {
    fontSize: 24,
  },
  pdfPreviewLabel: {
    fontSize: 9,
    color: '#E65100',
    fontWeight: '700',
    marginTop: 1,
  },
  // ── Interventions externes ──
  intervBandeau: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    gap: 2,
    // Fond hachuré simulé par une ombre colorée
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  intervBandeauIcon: {
    fontSize: 9,
    color: '#fff',
  },
  intervBandeauText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  interventionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '85%',
  },
  intervFormLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  intervFormInput: {
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  intervDateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  intervColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  intervColorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  intervColorSwatchActive: {
    borderColor: '#11181C',
    transform: [{ scale: 1.2 }],
  },
  intervSaveBtn: {
    backgroundColor: '#2C2C2C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  intervSaveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  intervDeleteBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  intervDeleteBtnText: {
    color: '#E74C3C',
    fontWeight: '600',
    fontSize: 14,
  },
  intervExistingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ccc',
  },
  intervExistingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  intervExistingDates: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },
  intervExistingDelete: {
    padding: 8,
  },
  // ── Checklist de tâches dans les notes ──
  taskList: {
    marginTop: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  taskListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#B0BEC5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  taskCheckboxDone: {
    backgroundColor: '#27AE60',
    borderColor: '#27AE60',
  },
  taskCheckboxText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  taskText: {
    fontSize: 14,
    color: '#11181C',
    flex: 1,
  },
  taskTextDone: {
    textDecorationLine: 'line-through',
    color: '#B0BEC5',
  },
  taskDoneBy: {
    fontSize: 11,
    color: '#27AE60',
    fontStyle: 'italic',
    marginTop: 2,
  },
  taskProgress: {
    height: 4,
    backgroundColor: '#E2E6EA',
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  taskProgressBar: {
    height: 4,
    backgroundColor: '#27AE60',
    borderRadius: 2,
  },
  taskProgressText: {
    fontSize: 11,
    color: '#687076',
    textAlign: 'right',
    marginTop: 4,
    fontStyle: 'italic',
  },
  addTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#EBF4FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addTaskBtnText: {
    color: '#2C2C2C',
    fontWeight: '600',
    fontSize: 14,
  },
  taskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  taskInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#11181C',
  },
  taskInputCancel: {
    padding: 8,
  },
  // ── Modal calendrier de navigation ──
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  datePickerSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  datePickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
    textAlign: 'center',
    marginBottom: 16,
  },
  datePickerTodayBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EEF2F8',
    alignItems: 'center',
  },
  datePickerTodayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  // ── Toggle vue semaine/mois ──
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#E2E6EA',
    borderRadius: 8,
    padding: 2,
    marginRight: 4,
  },
  viewToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: '#2C2C2C',
  },
  viewToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#687076',
  },
  viewToggleBtnTextActive: {
    color: '#fff',
  },
  // ── Badge matériel non acheté ──
  materielBadge: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF3F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    borderWidth: 1.5,
    borderColor: '#E53E3E',
  },
  materielBadgeIcon: {
    fontSize: 18,
  },
  materielBadgeCount: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#E53E3E',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  materielBadgeCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  // Bouton saisie manuelle pointage
  saisieBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EBF5FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    borderWidth: 1.5,
    borderColor: '#2980B9',
  },
  saisieBtnText: {
    fontSize: 16,
  },
  // Options visibilité / répétition dans l'éditeur de note
  visibBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F4F8',
    borderWidth: 1,
    borderColor: '#CBD5E0',
  },
  visibBtnActive: {
    backgroundColor: '#2980B9',
    borderColor: '#2980B9',
  },
  visibBtnText: {
    fontSize: 12,
    color: '#4A5568',
    fontWeight: '500',
  },
  visibBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  // Bouton notes dans la grille planning
  notePlanningBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  notePlanningIcon: {
    fontSize: 12,
    opacity: 0.5,
  },
  notePlanningIconActive: {
    opacity: 1,
  },
  notePlanningBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E74C3C',
    borderRadius: 8,
    minWidth: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  notePlanningBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  notePlanningCard: {
    backgroundColor: '#FFFDE7',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#F39C12',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1,
  },
  // Chips destinataires
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  chipActive: {
    backgroundColor: '#2C2C2C',
    borderColor: '#2C2C2C',
  },
  chipText: {
    fontSize: 12,
    color: '#4A5568',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
