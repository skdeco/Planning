import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  FlatList, Dimensions, Platform, TextInput, KeyboardAvoidingView, useWindowDimensions,
  TouchableWithoutFeedback, Image, Alert, RefreshControl, Linking,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
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
import { WeekGridView } from '@/components/planning/WeekGridView';
import {
  ModalAjoutEmployesST,
  type InterventionFormValues,
} from '@/components/planning/ModalAjoutEmployesST';
import {
  ModalNotes,
  type NoteModalState,
} from '@/components/planning/ModalNotes';
import {
  METIER_COLORS, METIERS_LIST, EMPLOYE_COLORS, INTERVENTION_COLORS, getEmployeColor,
  type NoteChantier,
  type PlanChantier,
} from '@/app/types';
import { DatePicker } from '@/components/DatePicker';
import { uploadFileToStorage } from '@/lib/supabase';
import { getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';
import type { PickedFile } from '@/lib/share/pickNativeFile';
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

export default function PlanningScreen() {
  const { data, currentUser, isHydrated, addAffectation, addIntervention, updateIntervention, deleteIntervention, logout, addRetardPlanifie, deleteRetardPlanifie, addNoteChantier, archiveNoteChantier, deleteNoteChantier, addPlanChantier, deletePlanChantier, updateAdminPassword, updateAdminIdentifiant, updateAdminEmployeId, updateMagasinPrefere, updateOrdreAffectation, updateChantierOrderPlanning, addAgendaEvent, updateAgendaEvent, deleteAgendaEvent, deleteChantier } = useApp();
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

  const handleNotePickNative = async (file: PickedFile): Promise<string | null> => {
    if (!notesPlanningChantierId) return null;
    const photoId = `native_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return await uploadFileToStorage(file.uri, `chantiers/${notesPlanningChantierId}/notes`, photoId);
  };

  const handleNoteFromInbox = async (item: InboxItem): Promise<string | null> => {
    if (!notesPlanningChantierId) return null;
    const fileURI = getInboxItemPath(item);
    if (!fileURI) return null;
    const photoId = `inbox_${item.id}`;
    return await uploadFileToStorage(fileURI, `chantiers/${notesPlanningChantierId}/notes`, photoId);
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

  const handlePlanPickNative = async (file: PickedFile): Promise<string | null> => {
    if (!plansPlanningChantierId) return null;
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return await uploadFileToStorage(file.uri, `chantiers/${plansPlanningChantierId}/plans`, planId);
  };

  const handlePlanFromInbox = async (item: InboxItem): Promise<string | null> => {
    if (!plansPlanningChantierId) return null;
    const fileURI = getInboxItemPath(item);
    if (!fileURI) return null;
    const planId = `inbox_${item.id}`;
    return await uploadFileToStorage(fileURI, `chantiers/${plansPlanningChantierId}/plans`, planId);
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
    getAllNotesForCell,
  } = usePlanningWeekData(weekOffset);

  // ─── Mutations cellule (hook useCellAffectationManager) ───────────────────
  const { moveEmploye } = useCellAffectationManager();

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
        <WeekGridView
          NAME_COL={NAME_COL}
          dayCol={dayCol}
          weekOffset={weekOffset}
          onOpenChantierActions={(id) => setActionsChantierId(id)}
          onLongPressChantier={showReorderMenu}
          onOpenEmpNote={openNoteModal}
          onOpenSTNote={openSTNoteModal}
          onOpenIntervention={openInterventionModal}
          onOpenAjoutModal={(chantierId, dateStr) => {
            setInterventionForm({ libelle: '', description: '', dateDebut: dateStr, dateFin: dateStr, couleur: INTERVENTION_COLORS[0] });
            setModal({ chantierId, date: dateStr });
          }}
          onOpenMoveModal={(employeId, chantierId, dateStr) => {
            setMoveTargetChantierId(null);
            setMoveTargetDate(dateStr);
            setMoveModal({ employeId, chantierId, date: dateStr });
          }}
          onOpenOrdreModal={(employeId, dateStr, chantierIds) => {
            setOrdreModal({ employeId, date: dateStr, chantierIds });
          }}
        />
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
      <ModalNotes
        noteModal={noteModal}
        setNoteModal={setNoteModal}
      />

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
        onPickNativeFile={handleNotePickNative}
        onPickFromInbox={handleNoteFromInbox}
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
        onPickNativeFile={handlePlanPickNative}
        onPickFromInbox={handlePlanFromInbox}
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
              <Text style={{ fontSize: 11, color: '#687076', marginBottom: 8 }}>Les autres utilisateurs verront ce nom.</Text>
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
