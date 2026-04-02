import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  FlatList, Dimensions, Platform, TextInput, KeyboardAvoidingView, useWindowDimensions,
  TouchableWithoutFeedback, Keyboard, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  METIER_COLORS, METIERS_LIST, EMPLOYE_COLORS, INTERVENTION_COLORS, getEmployeColor,
  type Employe, type Affectation, type Note, type FicheChantier, type SousTraitant, type Intervention, type TaskItem, type RetardPlanifie,
  type NoteChantier,
  type PlanChantier,
} from '@/app/types';
import { DatePicker } from '@/components/DatePicker';
import { uploadFileToStorage } from '@/lib/supabase';
import { GaleriePhotos } from '@/components/GaleriePhotos';

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
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 18, color: '#1A3A6B', fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#687076', textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginVertical: 1 },
  cellToday: { borderWidth: 1.5, borderColor: '#1A3A6B' },
  cellSel: { backgroundColor: '#1A3A6B' },
  cellText: { fontSize: 13, color: '#11181C', fontWeight: '500' },
  cellTextToday: { color: '#1A3A6B', fontWeight: '700' },
  cellTextSel: { color: '#fff', fontWeight: '700' },
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('@/assets/images/sk_deco_logo.png') as number;

const NAME_COL = 100;
const MIN_DAY_COL = 110;
// DAY_COL statique pour les styles — utilisé comme largeur minimum garantie
const DAY_COL = MIN_DAY_COL;

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
  const { data, currentUser, isHydrated, addAffectation, updateAffectation, removeAffectation, upsertNote, deleteNote, toggleTask, addTask, deleteTask, addIntervention, updateIntervention, deleteIntervention, logout, addPointage, addRetardPlanifie, deleteRetardPlanifie, addNoteChantier, archiveNoteChantier, deleteNoteChantier, addPlanChantier, deletePlanChantier, updateAdminPassword, updateOrdreAffectation } = useApp();
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  // Scroll horizontal si la grille ne tient pas dans la fenêtre
  const GRID_WIDTH = NAME_COL + MIN_DAY_COL * 7; // 100 + 770 = 870px minimum
  const needsHorizontalScroll = GRID_WIDTH > windowWidth;
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'semaine' | 'mois'>('semaine');
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Modal admin : ajout/suppression d'employés dans une cellule
  const [modal, setModal] = useState<{ chantierId: string; date: string } | null>(null);
  // Modal notes : visible par admin et employés
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  // Modal fiche chantier
  const [ficheModal, setFicheModal] = useState<{ chantier: typeof data.chantiers[0] } | null>(null);
  // Modal intervention (admin)
  interface InterventionForm { libelle: string; description: string; dateDebut: string; dateFin: string; couleur: string; }
  const [interventionModal, setInterventionModal] = useState<{ chantierId: string; editId: string | null } | null>(null);
  const [interventionForm, setInterventionForm] = useState<InterventionForm>({ libelle: '', description: '', dateDebut: '', dateFin: '', couleur: INTERVENTION_COLORS[0] });
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
  // Saisie manuelle de pointage (admin/RH)
  const [showSaisiePointage, setShowSaisiePointage] = useState(false);
  const [saisiePointageEmployeId, setSaisiePointageEmployeId] = useState('');
  const [saisiePointageDate, setSaisiePointageDate] = useState('');
  const [saisieArrivee, setSaisieArrivee] = useState('');
  const [saisieDepart, setSaisieDepart] = useState('');
  const [saisieNote, setSaisieNote] = useState('');
  // Affectation par plage de jours (admin)
  const [affectationDateFin, setAffectationDateFin] = useState<string | null>(null);
  // Visibilité de note : sélection spécifique d'acteurs
  const [noteVisibleIds, setNoteVisibleIds] = useState<string[]>([]);
  // Galerie photos globale
  const [showGalerieGlobale, setShowGalerieGlobale] = useState(false);
  // Notes chantier (modal dans planning)
  const [showNotesPlanning, setShowNotesPlanning] = useState(false);
  const [notesPlanningChantierId, setNotesPlanningChantierId] = useState<string | null>(null);
  const [newNotePlanningTexte, setNewNotePlanningTexte] = useState('');
  const [notePlanningDestinataires, setNotePlanningDestinataires] = useState<'tous' | string[]>('tous');
  const [notePlanningPhotos, setNotePlanningPhotos] = useState<string[]>([]);

  const openNotesPlanning = (chantierId: string) => {
    setNotesPlanningChantierId(chantierId);
    setNewNotePlanningTexte('');
    setNotePlanningDestinataires('tous');
    setNotePlanningPhotos([]);
    setShowNotesPlanning(true);
  };

  const handlePickNotePhotosPlanning = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.multiple = true;
      input.onchange = (e: Event) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = () => setNotePlanningPhotos(prev => [...prev, reader.result as string]);
          reader.readAsDataURL(file);
        });
      };
      input.click();
    }
  };

  // Plans chantier (modal dans planning)
  const [showPlansPlanning, setShowPlansPlanning] = useState(false);
  const [plansPlanningChantierId, setPlansPlanningChantierId] = useState<string | null>(null);
  const [newPlanPlanningNom, setNewPlanPlanningNom] = useState('');
  const [newPlanPlanningFichier, setNewPlanPlanningFichier] = useState<string | null>(null);
  const [newPlanPlanningVisiblePar, setNewPlanPlanningVisiblePar] = useState<'tous' | 'employes' | 'soustraitants' | 'specifique'>('tous');
  const [newPlanPlanningVisibleIds, setNewPlanPlanningVisibleIds] = useState<string[]>([]);

  const openPlansPlanning = (chantierId: string) => {
    setPlansPlanningChantierId(chantierId);
    setNewPlanPlanningNom('');
    setNewPlanPlanningFichier(null);
    setNewPlanPlanningVisiblePar('tous');
    setNewPlanPlanningVisibleIds([]);
    setShowPlansPlanning(true);
  };

  const handlePickPlanPlanning = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          // Upload immédiat vers Supabase Storage
          const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const chantierId = plansPlanningChantierId || 'general';
          const storageUrl = await uploadFileToStorage(base64, `chantiers/${chantierId}/plans`, planId);
          setNewPlanPlanningFichier(storageUrl || base64);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  };

  const handleAddPlanPlanning = () => {
    if (!newPlanPlanningNom.trim() || !newPlanPlanningFichier || !plansPlanningChantierId) return;
    const plan: PlanChantier = {
      id: `pl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      nom: newPlanPlanningNom.trim(),
      fichier: newPlanPlanningFichier,
      visiblePar: newPlanPlanningVisiblePar,
      visibleIds: newPlanPlanningVisiblePar === 'specifique' ? newPlanPlanningVisibleIds : undefined,
      uploadedAt: new Date().toISOString(),
    };
    addPlanChantier(plansPlanningChantierId, plan);
    setNewPlanPlanningNom('');
    setNewPlanPlanningFichier(null);
    setNewPlanPlanningVisiblePar('tous');
    setNewPlanPlanningVisibleIds([]);
  };

  const getPlansVisiblesPlanning = (chantierId: string) => {
    const chantier = data.chantiers.find(c => c.id === chantierId);
    const plans = chantier?.fiche?.plans || [];
    if (isAdmin) return plans;
    const userId = currentUser?.employeId || currentUser?.soustraitantId || '';
    const isST = !!currentUser?.soustraitantId;
    return plans.filter(p => {
      if (p.visiblePar === 'tous') return true;
      if (p.visiblePar === 'employes' && !isST) return true;
      if (p.visiblePar === 'soustraitants' && isST) return true;
      if (p.visiblePar === 'specifique') return (p.visibleIds || []).includes(userId);
      return false;
    });
  };

  const getNotesActivesPlanning = (chantierId: string) => {
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || '');
    return (data.notesChantier || []).filter(n => {
      if (n.chantierId !== chantierId) return false;
      if (n.archivedBy.includes(userId)) return false;
      if (n.destinataires === 'tous') return true;
      if (currentUser?.role === 'admin') return true;
      return (n.destinataires as string[]).includes(userId);
    });
  };

  const handleAddNotePlanning = () => {
    // Valider si texte OU photo(s) présents
    const hasPhotos = notePlanningPhotos.length > 0;
    if (!hasPhotos && !newNotePlanningTexte.trim()) return;
    if (!notesPlanningChantierId) return;
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    const nom = currentUser?.role === 'admin' ? 'Admin' : (data.employes.find(e => e.id === userId)?.prenom || (data.sousTraitants || []).find(s => s.id === userId)?.nom || 'Inconnu');
    addNoteChantier({
      id: `nc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      chantierId: notesPlanningChantierId,
      auteurId: userId,
      auteurNom: nom,
      texte: newNotePlanningTexte.trim(),
      createdAt: new Date().toISOString(),
      destinataires: isAdmin ? notePlanningDestinataires : 'tous',
      archivedBy: [],
      photos: notePlanningPhotos.length > 0 ? notePlanningPhotos : undefined,
    });
    setNewNotePlanningTexte('');
    setNotePlanningDestinataires('tous');
    setNotePlanningPhotos([]);
  };

  const handleArchiveNotePlanning = (noteId: string) => {
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    archiveNoteChantier(noteId, userId);
  };

  const handleDeleteNotePlanning = (noteId: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm && window.confirm('Supprimer cette note ?')) deleteNoteChantier(noteId);
    } else {
      Alert.alert('Supprimer', 'Supprimer cette note ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteNoteChantier(noteId) },
      ]);
    }
  };

  // Retard planifié (employé)
  const [showRetardModal, setShowRetardModal] = useState(false);
  const [retardDate, setRetardDate] = useState('');
  const [retardHeure, setRetardHeure] = useState('');
  const [retardMotif, setRetardMotif] = useState('');
  const [editRetardId, setEditRetardId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const isST = currentUser?.role === 'soustraitant';

  // Modal changement mot de passe admin
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdActuel, setPwdActuel] = useState('');
  const [pwdNouveau, setPwdNouveau] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const handleChangePwd = () => {
    const current = data.adminPassword || 'admin';
    if (pwdActuel !== current) { setPwdError('Mot de passe actuel incorrect.'); return; }
    if (pwdNouveau.length < 4) { setPwdError('Le nouveau mot de passe doit faire au moins 4 caractères.'); return; }
    if (pwdNouveau !== pwdConfirm) { setPwdError('Les mots de passe ne correspondent pas.'); return; }
    updateAdminPassword(pwdNouveau);
    setPwdSuccess(true);
    setPwdError('');
    setTimeout(() => { setShowPwdModal(false); setPwdActuel(''); setPwdNouveau(''); setPwdConfirm(''); setPwdSuccess(false); }, 1500);
  };
  // ── Ordre affectations multi-chantiers ────────────────────────────────────
  const [ordreModal, setOrdreModal] = useState<{ employeId: string; date: string; chantierIds: string[] } | null>(null);

  /** Retourne la liste ordonnée de chantierId pour un employé un jour donné */
  const getOrdreChantiers = (employeId: string, date: string): string[] => {
    const key = `${employeId}_${date}`;
    const stored = data.ordreAffectations?.[key];
    // Chantiers réellement affectés ce jour — dédupliqués
    const affectedIds = [...new Set(
      data.affectations
        .filter(a => a.employeId === employeId && a.dateDebut <= date && a.dateFin >= date)
        .map(a => a.chantierId)
    )];
    if (!stored) return affectedIds;
    // Garder uniquement les chantiers encore affectés, dans l'ordre stocké, puis ajouter les nouveaux
    const ordered = stored.filter(id => affectedIds.includes(id));
    const extra = affectedIds.filter(id => !ordered.includes(id));
    return [...ordered, ...extra];
  };

  /** Numéro d'ordre (1-based) d'un chantier pour un employé un jour donné, ou 0 si employé sur 1 seul chantier */
  const getOrdreNum = (employeId: string, chantierId: string, date: string): number => {
    const list = getOrdreChantiers(employeId, date);
    if (list.length < 2) return 0;
    return list.indexOf(chantierId) + 1;
  };

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

  // Calcul des 7 jours de la semaine
  const days = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = addDays(today, mondayOffset + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset]);

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

  // Chantiers visibles sur le planning
  const visibleChantiers = useMemo(() => {
    const sortByOrdre = (arr: typeof data.chantiers) =>
      [...arr].sort((a, b) => (a.ordre ?? 9999) - (b.ordre ?? 9999));
    if (isAdmin) {
      return sortByOrdre(data.chantiers.filter(c => c.visibleSurPlanning));
    }
    if (isST) {
      // Sous-traitant : chantiers où il a au moins une affectation
      const stAffChantierIds = data.affectations
        .filter(a => a.soustraitantId === currentUser?.soustraitantId)
        .map(a => a.chantierId);
      return sortByOrdre(data.chantiers.filter(c => c.visibleSurPlanning && stAffChantierIds.includes(c.id)));
    }
    // Employé : uniquement les chantiers où il est affecté
    return sortByOrdre(data.chantiers.filter(c =>
      c.visibleSurPlanning &&
      data.affectations.some(a =>
        a.chantierId === c.id &&
        a.employeId === currentUser?.employeId
      )
    ));
  }, [data, isAdmin, isST, currentUser]);

  // Employés affectés à un chantier pour un jour donné (excluant les affectations ST)
  const getEmployesForCell = useCallback((chantierId: string, day: Date): Employe[] => {
    const affectations = data.affectations.filter(a =>
      a.chantierId === chantierId &&
      !a.soustraitantId &&   // exclure les affectations sous-traitants
      dateInRange(day, a.dateDebut, a.dateFin)
    );
    if (!isAdmin && !isST) {
      const myAff = affectations.find(a => a.employeId === currentUser?.employeId);
      if (!myAff) return [];
      const emp = data.employes.find(e => e.id === myAff.employeId);
      return emp ? [emp] : [];
    }
    // Dédupliquer : un employé ne doit apparaître qu'une seule fois par case
    const seen = new Set<string>();
    return affectations
      .map(a => data.employes.find(e => e.id === a.employeId))
      .filter((e): e is Employe => !!e && !seen.has(e.id) && (seen.add(e.id), true));
  }, [data, isAdmin, isST, currentUser]);

  /** Interventions externes pour un chantier et un jour donné */
  const getInterventionsForCell = useCallback((chantierId: string, day: Date): Intervention[] => {
    return (data.interventions || []).filter(i =>
      i.chantierId === chantierId && dateInRange(day, i.dateDebut, i.dateFin)
    );
  }, [data]);

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

  /** Sous-traitants placés dans une cellule (via affectations ST) */
  const getSTForCell = useCallback((chantierId: string, day: Date): SousTraitant[] => {
    const stIds = data.affectations
      .filter(a =>
        a.chantierId === chantierId &&
        a.soustraitantId &&
        dateInRange(day, a.dateDebut, a.dateFin)
      )
      .map(a => a.soustraitantId!);
    // Sous-traitant connecté : ne voir que soi-même
    if (isST) {
      return data.sousTraitants.filter(s => stIds.includes(s.id) && s.id === currentUser?.soustraitantId);
    }
    return data.sousTraitants.filter(s => stIds.includes(s.id));
  }, [data, isST, currentUser]);

  /** Récupère toutes les notes d'une cellule (chantier + jour), tous auteurs confondus.
   * IMPORTANT : compare les dates en string (YYYY-MM-DD) pour éviter les bugs de timezone.
   */
  const getAllNotesForCell = useCallback((chantierId: string, dateStr: string) => {
    return data.affectations
      .filter(a =>
        a.chantierId === chantierId &&
        // Comparaison string pour éviter le bug de timezone avec new Date()
        a.dateDebut <= dateStr && a.dateFin >= dateStr
      )
      .flatMap(a => (a.notes || [])
        // Filtrer par date exacte de la note (si le champ date est présent)
        .filter(n => !n.date || n.date === dateStr)
        .map(n => ({
          ...n,
          affectationId: a.id,
          affectationEmployeId: a.employeId,
        }))
      );
  }, [data]);

  /** Vérifie si la cellule a des notes */
  const cellHasNotes = useCallback((chantierId: string, dateStr: string): boolean => {
    return getAllNotesForCell(chantierId, dateStr).length > 0;
  }, [getAllNotesForCell]);

  // Plage de la semaine affichée
  const weekLabel = useMemo(() => {
    const first = days[0];
    const last = days[6];
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()} – ${last.getDate()} ${MOIS[first.getMonth()]}`;
    }
    return `${first.getDate()} ${MOIS[first.getMonth()]} – ${last.getDate()} ${MOIS[last.getMonth()]}`;
  }, [days]);

  // Modal admin : tous les employés disponibles
  const modalEmployes = useMemo(() => {
    if (!modal) return [];
    return data.employes;
  }, [modal, data]);

  // Onglet actif dans le modal d'ajout (employés, sous-traitants ou externe)
  const [modalSection, setModalSection] = useState<'employes' | 'st' | 'externe'>('employes');

  const isEmployeInCell = useCallback((employeId: string): boolean => {
    if (!modal) return false;
    const day = new Date(modal.date);
    return data.affectations.some(a =>
      a.chantierId === modal.chantierId &&
      a.employeId === employeId &&
      !a.soustraitantId &&
      dateInRange(day, a.dateDebut, a.dateFin)
    );
  }, [modal, data]);

  const isSTInCell = useCallback((stId: string): boolean => {
    if (!modal) return false;
    const day = new Date(modal.date);
    return data.affectations.some(a =>
      a.chantierId === modal.chantierId &&
      a.soustraitantId === stId &&
      dateInRange(day, a.dateDebut, a.dateFin)
    );
  }, [modal, data]);

  // Génère toutes les dates entre dateDebut et dateFin en excluant les week-ends
  const buildAffectationsSansWeekend = (
    chantierId: string,
    employeId: string,
    dateDebut: string,
    dateFin: string,
    soustraitantId?: string
  ): Affectation[] => {
    const affs: Affectation[] = [];
    let current = new Date(dateDebut);
    current.setHours(12, 0, 0, 0); // midi pour éviter les problèmes de timezone
    const end = new Date(dateFin);
    end.setHours(12, 0, 0, 0);

    let segStart: string | null = null;
    let segEnd: string | null = null;

    while (current <= end) {
      const dow = current.getDay(); // 0=dim, 6=sam
      const isWeekend = dow === 0 || dow === 6;
      const ymd = toYMD(current);

      if (!isWeekend) {
        if (!segStart) segStart = ymd;
        segEnd = ymd;
      } else {
        // Fin d'un segment : créer l'affectation
        if (segStart && segEnd) {
          const aff: Affectation = {
            id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}_${affs.length}`,
            chantierId,
            employeId,
            dateDebut: segStart,
            dateFin: segEnd,
            notes: [],
          };
          if (soustraitantId) aff.soustraitantId = soustraitantId;
          affs.push(aff);
          segStart = null;
          segEnd = null;
        }
      }
      current.setDate(current.getDate() + 1);
    }
    // Dernier segment
    if (segStart && segEnd) {
      const aff: Affectation = {
        id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}_${affs.length}`,
        chantierId,
        employeId,
        dateDebut: segStart,
        dateFin: segEnd,
        notes: [],
      };
      if (soustraitantId) aff.soustraitantId = soustraitantId;
      affs.push(aff);
    }
    return affs;
  };

  const toggleEmploye = (employeId: string) => {
    if (!modal) return;
    if (isEmployeInCell(employeId)) {
      removeAffectation(modal.chantierId, employeId, modal.date);
    } else {
      const dateFin = affectationDateFin && affectationDateFin >= modal.date
        ? affectationDateFin
        : modal.date;
      // Si plage de plusieurs jours : exclure les week-ends
      if (dateFin !== modal.date) {
        const affs = buildAffectationsSansWeekend(modal.chantierId, employeId, modal.date, dateFin);
        affs.forEach(a => addAffectation(a));
      } else {
        // Jour unique : on l'ajoute tel quel (l'utilisateur l'a choisi manuellement)
        const newAff: Affectation = {
          id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          chantierId: modal.chantierId,
          employeId,
          dateDebut: modal.date,
          dateFin: modal.date,
          notes: [],
        };
        addAffectation(newAff);
      }
    }
  };

  const toggleST = (stId: string) => {
    if (!modal) return;
    if (isSTInCell(stId)) {
      // Supprimer l'affectation ST
      const aff = data.affectations.find(a =>
        a.chantierId === modal.chantierId &&
        a.soustraitantId === stId &&
        dateInRange(new Date(modal.date), a.dateDebut, a.dateFin)
      );
      if (aff) removeAffectation(modal.chantierId, aff.employeId, modal.date);
    } else {
      const stPseudoId = `st:${stId}`;
      const dateFin = affectationDateFin && affectationDateFin >= modal.date
        ? affectationDateFin
        : modal.date;
      // Si plage de plusieurs jours : exclure les week-ends
      if (dateFin !== modal.date) {
        const affs = buildAffectationsSansWeekend(modal.chantierId, stPseudoId, modal.date, dateFin, stId);
        affs.forEach(a => addAffectation(a));
      } else {
        const newAff: Affectation = {
          id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          chantierId: modal.chantierId,
          employeId: stPseudoId,
          soustraitantId: stId,
          dateDebut: modal.date,
          dateFin: modal.date,
          notes: [],
        };
        addAffectation(newAff);
      }
    }
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

  /** Saisie manuelle de pointage par admin ou RH */
  const handleSaisiePointage = () => {
    if (!saisiePointageEmployeId || !saisiePointageDate || !saisieArrivee) return;
    const now = new Date().toISOString();
    const baseId = `manual_${saisiePointageDate}_${saisiePointageEmployeId}_${Date.now()}`;
    addPointage({
      id: `${baseId}_debut`,
      employeId: saisiePointageEmployeId,
      type: 'debut',
      date: saisiePointageDate,
      heure: saisieArrivee,
      timestamp: now,
      note: saisieNote || undefined,
      saisieManuelle: true,
      saisieParId: currentUser?.employeId || 'admin',
      latitude: null, longitude: null, adresse: null,
    });
    if (saisieDepart) {
      addPointage({
        id: `${baseId}_fin`,
        employeId: saisiePointageEmployeId,
        type: 'fin',
        date: saisiePointageDate,
        heure: saisieDepart,
        timestamp: now,
        note: saisieNote || undefined,
        saisieManuelle: true,
        saisieParId: currentUser?.employeId || 'admin',
        latitude: null, longitude: null, adresse: null,
      });
    }
    setShowSaisiePointage(false);
    setSaisieArrivee('');
    setSaisieDepart('');
    setSaisieNote('');
    setSaisiePointageEmployeId('');
    setSaisiePointageDate('');
  };

  /** Sauvegarde un retard planifié */
  const handleSaveRetardPlanifie = () => {
    if (!retardDate || !retardHeure || !retardMotif.trim()) return;
    const now = new Date().toISOString();
    const empId = currentUser?.employeId || '';
    const newRetard: RetardPlanifie = {
      id: `retard_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      employeId: empId,
      date: retardDate,
      heureArrivee: retardHeure,
      motif: retardMotif.trim(),
      createdAt: now,
      lu: false,
    };
    if (editRetardId) {
      deleteRetardPlanifie(editRetardId);
    }
    addRetardPlanifie(newRetard);
    setShowRetardModal(false);
    setRetardDate('');
    setRetardHeure('');
    setRetardMotif('');
    setEditRetardId(null);
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
      input.click();
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
          await uploadAndAdd(asset.uri);
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
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      {/* En-tête */}
      <View style={styles.header}>
        {/* Logo + titre sur une seule ligne */}
        <View style={styles.headerLogoWrap}>
          <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>{t.planning.title}</Text>
          {isAdmin && (
            <Pressable style={{ marginLeft: 4 }} onPress={() => { setPwdActuel(''); setPwdNouveau(''); setPwdConfirm(''); setPwdError(''); setPwdSuccess(false); setShowPwdModal(true); }}>
              <Text style={{ fontSize: 14 }}>🔒</Text>
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
          {/* Badge matériel non acheté — visible acheteurs/admin uniquement */}
          {isAcheteurPlanning && nbArticlesNonAchetes > 0 && (
            <Pressable style={styles.materielBadge} onPress={() => router.push('/(tabs)/materiel' as any)}>
              <Text style={styles.materielBadgeIcon}>🛒</Text>
              <View style={styles.materielBadgeCount}>
                <Text style={styles.materielBadgeCountText}>{nbArticlesNonAchetes}</Text>
              </View>
            </Pressable>
          )}
          {/* Toggle vue semaine / mois */}
          <View style={styles.viewToggle}>
            <Pressable style={[styles.viewToggleBtn, viewMode === 'semaine' && styles.viewToggleBtnActive]} onPress={() => setViewMode('semaine')}>
              <Text style={[styles.viewToggleBtnText, viewMode === 'semaine' && styles.viewToggleBtnTextActive]}>7j</Text>
            </Pressable>
            <Pressable style={[styles.viewToggleBtn, viewMode === 'mois' && styles.viewToggleBtnActive]} onPress={() => setViewMode('mois')}>
              <Text style={[styles.viewToggleBtnText, viewMode === 'mois' && styles.viewToggleBtnTextActive]}>Mois</Text>
            </Pressable>
          </View>
          <Pressable style={styles.navBtn} onPress={() => viewMode === 'semaine' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Pressable style={styles.todayBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.todayBtnText}>Auj.</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => viewMode === 'semaine' ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
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
          {/* Bouton saisie manuelle pointage (admin/RH) + badge retards planifiés */}
          {(isAdmin || (currentEmployePlanning?.isRH === true)) && (() => {
            const nbRetardsPlanifies = (data.retardsPlanifies || []).filter(r => !r.lu).length;
            return (
              <Pressable
                style={[styles.saisieBtn, { position: 'relative' }]}
                onPress={() => setShowSaisiePointage(true)}
              >
                <Text style={styles.saisieBtnText}>✏️</Text>
                {nbRetardsPlanifies > 0 && (
                  <View style={[styles.materielBadgeCount, { position: 'absolute', top: -4, right: -4, width: 16, height: 16, backgroundColor: '#E74C3C' }]}>
                    <Text style={[styles.materielBadgeCountText, { fontSize: 9 }]}>{nbRetardsPlanifies}</Text>
                  </View>
                )}
              </Pressable>
            );
          })()}
          {/* Bouton galerie photos — visible pour tous */}
          <Pressable style={styles.galerieBtn} onPress={() => setShowGalerieGlobale(true)}>
            <Text style={styles.galerieBtnText}>📷</Text>
          </Pressable>
          {/* Bouton export/sauvegarde — admin uniquement */}
          {isAdmin && (
            <Pressable style={styles.galerieBtn} onPress={handleExportData} accessibilityLabel="Exporter les données">
              <Text style={styles.galerieBtnText}>💾</Text>
            </Pressable>
          )}
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>⏻</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.weekInfo}>
        <Text style={styles.weekLabel}>{viewMode === 'semaine' ? weekLabel : monthData.label}</Text>
        <Text style={styles.chantierCount}>{visibleChantiers.length} chantier{visibleChantiers.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Modal calendrier de navigation */}
      <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
        <Pressable style={styles.datePickerOverlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={styles.datePickerSheet} onPress={e => e.stopPropagation()}>
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
        <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
          {/* En-tête jours semaine */}
          <View style={styles.monthHeaderRow}>
            {CAL_JOURS.map(j => (
              <View key={j} style={styles.monthHeaderCell}>
                <Text style={styles.monthHeaderText}>{j}</Text>
              </View>
            ))}
          </View>
          {/* Grille des jours */}
          <View style={styles.monthGrid}>
            {monthData.cells.map((day, idx) => {
              if (!day) return <View key={idx} style={styles.monthCell} />;
              const dateStr = toYMD(day);
              const tod = isToday(day);
              // Chantiers actifs ce jour
              const chantiersActifs = visibleChantiers.filter(c =>
                dateInRange(day, c.dateDebut, c.dateFin) &&
                data.affectations.some(a =>
                  a.chantierId === c.id &&
                  dateInRange(day, a.dateDebut, a.dateFin) &&
                  (!a.soustraitantId) &&
                  (isAdmin || a.employeId === currentUser?.employeId)
                )
              );
              return (
                <Pressable
                  key={idx}
                  style={[styles.monthCell, tod && styles.monthCellToday]}
                  onPress={() => {
                    // Passer en vue semaine sur ce jour
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
                >
                  <Text style={[styles.monthCellNum, tod && styles.monthCellNumToday]}>{day.getDate()}</Text>
                  {chantiersActifs.slice(0, 3).map(c => (
                    <View key={c.id} style={[styles.monthChantierDot, { backgroundColor: c.couleur }]}>
                      <Text style={styles.monthChantierDotText} numberOfLines={1}>{c.nom}</Text>
                    </View>
                  ))}
                  {chantiersActifs.length > 3 && (
                    <Text style={styles.monthMoreText}>+{chantiersActifs.length - 3}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          {/* Légende couleurs chantiers */}
          <View style={styles.monthLegend}>
            {visibleChantiers.map(c => (
              <View key={c.id} style={styles.monthLegendItem}>
                <View style={[styles.monthLegendDot, { backgroundColor: c.couleur }]} />
                <Text style={styles.monthLegendText} numberOfLines={1}>{c.nom}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Grille hebdomadaire */}
      {viewMode === 'semaine' && (
      <ScrollView horizontal={needsHorizontalScroll} showsHorizontalScrollIndicator={needsHorizontalScroll} style={{ flex: 1 }}>
      <ScrollView style={[styles.gridScroll, needsHorizontalScroll && { width: GRID_WIDTH }]} showsVerticalScrollIndicator={false}>
        {/* En-tête des jours */}
        <View style={styles.gridRow}>
          <View style={[styles.nameCell, styles.headerCell]} />
          {days.map((day, i) => {
            const today = isToday(day);
            return (
              <View
                key={i}
                style={[
                  styles.dayHeaderCell,
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
            {/* Colonne nom */}
            <Pressable
              style={styles.nameCell}
              onPress={() => {
                const hasFiche = chantier.fiche && (
                  chantier.fiche.codeAcces || chantier.fiche.emplacementCle ||
                  chantier.fiche.codeAlarme || chantier.fiche.contacts ||
                  chantier.fiche.notes || chantier.fiche.photos.length > 0
                );
                if (hasFiche) setFicheModal({ chantier });
              }}
            >
              <View style={[styles.colorDot, { backgroundColor: chantier.couleur }]} />
              <Text style={styles.chantierName} numberOfLines={3}>{chantier.nom}</Text>
              {chantier.fiche && (
                chantier.fiche.codeAcces || chantier.fiche.emplacementCle ||
                chantier.fiche.codeAlarme || chantier.fiche.contacts ||
                chantier.fiche.notes || chantier.fiche.photos.length > 0
              ) ? (
                <Text style={styles.ficheIndicator}>🪪</Text>
              ) : null}
              <View style={[styles.colorBar, { backgroundColor: chantier.couleur }]} />
              {/* Bouton notes chantier */}
              {(() => {
                const nbNotes = getNotesActivesPlanning(chantier.id).length;
                return (
                  <Pressable
                    style={styles.notePlanningBtn}
                    onPress={() => openNotesPlanning(chantier.id)}
                  >
                    <Text style={[styles.notePlanningIcon, nbNotes > 0 && styles.notePlanningIconActive]}>📝</Text>
                    {nbNotes > 0 && (
                      <View style={styles.notePlanningBadge}>
                        <Text style={styles.notePlanningBadgeText}>{nbNotes}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })()}
              {/* Bouton plans chantier */}
              {(() => {
                const nbPlans = getPlansVisiblesPlanning(chantier.id).length;
                return (
                  <Pressable
                    style={[styles.notePlanningBtn, { bottom: 24 }]}
                    onPress={() => openPlansPlanning(chantier.id)}
                  >
                    <Text style={[styles.notePlanningIcon, nbPlans > 0 && styles.notePlanningIconActive]}>📍</Text>
                    {nbPlans > 0 && (
                      <View style={styles.notePlanningBadge}>
                        <Text style={styles.notePlanningBadgeText}>{nbPlans}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })()}
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
                <View
                  key={i}
                  style={[
                    styles.cell,
                    today && styles.cellToday,
                    !inRange && styles.cellOutOfRange,
                  ]}
                >
                  {/* Badges employés : couleur personnalisée, masqués pour le sous-traitant connecté */}
                  {!isST && employes.map(emp => {
                    const empColor = getEmployeColor(emp);
                    const empHasNotes = data.affectations.some(a =>
                      a.chantierId === chantier.id &&
                      a.employeId === emp.id &&
                      a.dateDebut <= dateStr && a.dateFin >= dateStr &&
                      (a.notes || []).some(n => !n.date || n.date === dateStr)
                    );
                    const ordreNum = getOrdreNum(emp.id, chantier.id, dateStr);
                    return (
                      <View key={emp.id} style={styles.badgeWrapper}>
                        <Pressable
                          style={[styles.empBadge, { backgroundColor: empColor }]}
                          onPress={() => openNoteModal(chantier.id, dateStr, emp.id)}
                          onLongPress={isAdmin ? () => {
                            const ids = getOrdreChantiers(emp.id, dateStr);
                            if (ids.length >= 2) setOrdreModal({ employeId: emp.id, date: dateStr, chantierIds: ids });
                          } : undefined}
                        >
                          <Text style={[styles.empBadgeText, { color: '#fff' }]} numberOfLines={1}>
                            {emp.prenom.length > 4 ? emp.prenom.slice(0, 3) + '.' : emp.prenom}
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
                            onPress={() => removeAffectation(chantier.id, emp.id, dateStr)}
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
                            {st.prenom.length > 4 ? st.prenom.slice(0, 3) + '.' : st.prenom}
                          </Text>
                          {stHasNotes && <View style={styles.noteDot} />}
                        </Pressable>
                        {isAdmin && (
                          <Pressable
                            style={styles.removeBadgeBtn}
                            onPress={() => removeAffectation(chantier.id, `st:${st.id}`, dateStr)}
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
                        setAffectationDateFin(null);
                        setModal({ chantierId: chantier.id, date: dateStr });
                      }}
                    >
                      <Text style={styles.addBtnText}>+</Text>
                    </Pressable>
                  )}
                </View>
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
      </ScrollView>
      )}

      {/* ── Modal Fiche Chantier (lecture seule dans le planning) ── */}
      <Modal
        visible={ficheModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setFicheModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFicheModal(null)}>
          <Pressable style={styles.ficheModalSheet} onPress={e => e.stopPropagation()}>
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
        </Pressable>
      </Modal>

      {/* ── Modal ajout/suppression employés + sous-traitants (Admin) ── */}
      <Modal
        visible={modal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModal(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKAV}
          >
            <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>{data.chantiers.find(c => c.id === modal?.chantierId)?.nom}</Text>
                <Pressable onPress={() => setModal(null)} style={styles.modalXBtn}>
                  <Text style={styles.modalXText}>✕</Text>
                </Pressable>
              </View>
              {modal && (
                <Text style={styles.modalSubtitle}>{modal.date}</Text>
              )}

              {/* Onglets Employés / Sous-traitants / Externe */}
              <View style={styles.modalSectionTabs}>
                <Pressable
                  style={[styles.modalSectionTab, modalSection === 'employes' && styles.modalSectionTabActive]}
                  onPress={() => setModalSection('employes')}
                >
                  <Text style={[styles.modalSectionTabText, modalSection === 'employes' && styles.modalSectionTabTextActive]}>
                    Employés
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSectionTab, modalSection === 'st' && styles.modalSectionTabActive]}
                  onPress={() => setModalSection('st')}
                >
                  <Text style={[styles.modalSectionTabText, modalSection === 'st' && styles.modalSectionTabTextActive]}>
                    Sous-traitants
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSectionTab, modalSection === 'externe' && styles.modalSectionTabActive]}
                  onPress={() => setModalSection('externe')}
                >
                  <Text style={[styles.modalSectionTabText, modalSection === 'externe' && styles.modalSectionTabTextActive]}>
                    ⚡ Externe
                  </Text>
                </Pressable>
              </View>

              {/* Plage de jours pour l'affectation (admin) */}
              {(modalSection === 'employes' || modalSection === 'st') && modal && (
                <View style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
                  <Text style={[styles.noteLabel, { fontSize: 12, color: '#687076', marginBottom: 4 }]}>
                    Plage d'affectation (optionnel)
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 12, color: '#444', minWidth: 30 }}>Du :</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A3A6B' }}>{modal.date}</Text>
                    <Text style={{ fontSize: 12, color: '#444', marginLeft: 8, minWidth: 30 }}>Au :</Text>
                    <DatePicker
                      value={affectationDateFin || modal.date}
                      onChange={v => setAffectationDateFin(v)}
                      minDate={modal.date}
                      placeholder="Fin (optionnel)"
                    />
                    {affectationDateFin && affectationDateFin !== modal.date && (
                      <Pressable
                        onPress={() => setAffectationDateFin(null)}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ color: '#E74C3C', fontSize: 12 }}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                  {affectationDateFin && affectationDateFin > modal.date && (
                    <Text style={{ fontSize: 11, color: '#27AE60', marginTop: 2 }}>
                      Affecté du {modal.date} au {affectationDateFin} (week-ends exclus automatiquement)
                    </Text>
                  )}
                </View>
              )}

              {/* Liste employés */}
              {modalSection === 'employes' && (
                <FlatList
                  data={modalEmployes}
                  extraData={data.affectations}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => {
                    const mc = METIER_COLORS[item.metier];
                    const selected = isEmployeInCell(item.id);
                    return (
                      <Pressable
                        style={[styles.modalEmpRow, selected && styles.modalEmpRowSelected]}
                        onPress={() => toggleEmploye(item.id)}
                      >
                        <View style={[styles.modalAvatar, { backgroundColor: mc.color }]}>
                          <Text style={[styles.modalAvatarText, { color: mc.textColor }]}>
                            {item.prenom[0]}
                          </Text>
                        </View>
                        <View style={styles.modalEmpInfo}>
                          <Text style={styles.modalEmpName}>{item.prenom} {item.nom}</Text>
                          <Text style={styles.modalEmpMetier}>{mc.label}</Text>
                        </View>
                        {selected && <Text style={styles.modalCheck}>✓</Text>}
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <Text style={styles.modalEmpty}>Aucun employé disponible.</Text>
                  }
                  style={{ maxHeight: 280 }}
                />
              )}

              {/* Liste sous-traitants */}
              {modalSection === 'st' && (
                <FlatList
                  data={data.sousTraitants}
                  extraData={data.affectations}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => {
                    const selected = isSTInCell(item.id);
                    return (
                      <Pressable
                        style={[styles.modalEmpRow, selected && styles.modalEmpRowSelected]}
                        onPress={() => toggleST(item.id)}
                      >
                        <View style={[styles.modalAvatar, { backgroundColor: item.couleur }]}>
                          <Text style={[styles.modalAvatarText, { color: '#fff' }]}>
                            {item.prenom[0]}
                          </Text>
                        </View>
                        <View style={styles.modalEmpInfo}>
                          <Text style={styles.modalEmpName}>{item.prenom} {item.nom}</Text>
                          {item.societe ? <Text style={styles.modalEmpMetier}>{item.societe}</Text> : null}
                        </View>
                        {selected && <Text style={styles.modalCheck}>✓</Text>}
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <Text style={styles.modalEmpty}>Aucun sous-traitant. Créez-en dans l'onglet dédié.</Text>
                  }
                  style={{ maxHeight: 280 }}
                />
              )}

              {/* Formulaire intervention externe */}
              {modalSection === 'externe' && modal && (
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
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
                      <DatePicker
                        label="Du *"
                        value={interventionForm.dateDebut}
                        onChange={v => setInterventionForm(f => ({ ...f, dateDebut: v }))}
                      />
                    </View>
                    <View style={{ width: 10 }} />
                    <View style={{ flex: 1 }}>
                      <DatePicker
                        label="Au *"
                        value={interventionForm.dateFin}
                        onChange={v => setInterventionForm(f => ({ ...f, dateFin: v }))}
                        minDate={interventionForm.dateDebut || undefined}
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
                  <Pressable
                    style={styles.intervSaveBtn}
                    onPress={() => {
                      if (!interventionForm.libelle.trim()) return;
                      const now = new Date().toISOString();
                      addIntervention({
                        id: `int_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                        chantierId: modal.chantierId,
                        libelle: interventionForm.libelle.trim(),
                        description: interventionForm.description.trim() || undefined,
                        dateDebut: interventionForm.dateDebut || modal.date,
                        dateFin: interventionForm.dateFin || modal.date,
                        couleur: interventionForm.couleur,
                        createdAt: now,
                      });
                      setInterventionForm({ libelle: '', description: '', dateDebut: modal.date, dateFin: modal.date, couleur: INTERVENTION_COLORS[0] });
                      setModal(null);
                    }}
                  >
                    <Text style={styles.intervSaveBtnText}>✓ Ajouter l'intervention</Text>
                  </Pressable>
                  {/* Liste des interventions existantes sur ce chantier */}
                  {(data.interventions || []).filter(i => i.chantierId === modal.chantierId).length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <Text style={[styles.intervFormLabel, { marginBottom: 8 }]}>Interventions existantes</Text>
                      {(data.interventions || []).filter(i => i.chantierId === modal.chantierId).map(interv => (
                        <View key={interv.id} style={[styles.intervExistingRow, { borderLeftColor: interv.couleur }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.intervExistingLabel}>{interv.libelle}</Text>
                            <Text style={styles.intervExistingDates}>{interv.dateDebut} → {interv.dateFin}</Text>
                          </View>
                          <Pressable onPress={() => deleteIntervention(interv.id)} style={styles.intervExistingDelete}>
                            <Text style={{ color: '#E74C3C', fontSize: 16 }}>🗑</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>
              )}

              <Pressable style={styles.modalCloseBtn} onPress={() => setModal(null)}>
                <Text style={styles.modalCloseBtnText}>Fermer</Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ── Modal notes (Admin + Employés) ── */}
      <Modal
        visible={noteModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => { setNoteModal(null); Keyboard.dismiss(); }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setNoteModal(null); Keyboard.dismiss(); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKAV}
          >
            <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
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
                  <Pressable onPress={() => { setNoteModal(null); Keyboard.dismiss(); }} style={styles.modalXBtn}>
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
                      <View style={styles.noteInputRow}>
                        <TextInput
                          style={styles.noteInput}
                          value={noteText}
                          onChangeText={(text) => {
                            setNoteText(text);
                            // Détecter @mention
                            const match = text.match(/@(\w*)$/);
                            setMentionQuery(match ? match[1] : null);
                          }}
                          placeholder="Saisir une note... (tapez @ pour mentionner)"
                          placeholderTextColor="#B0BEC5"
                          multiline
                          numberOfLines={4}
                          returnKeyType="done"
                          blurOnSubmit
                          autoFocus
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
                                <Pressable key={emp.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F2F4F7' }}
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
                                  // Note existante : ajouter dans editingNote.tasks
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
                                        style={[styles.visibBtn, { backgroundColor: isSelected ? a.color : '#F2F4F7', borderColor: a.color, borderWidth: 1.5 }]}
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

                <Pressable style={styles.modalCloseBtn} onPress={() => { setNoteModal(null); Keyboard.dismiss(); }}>
                  <Text style={styles.modalCloseBtnText}>Fermer</Text>
                </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
      {/* ── Modal Intervention externe (admin) ── */}
      <Modal
        visible={interventionModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setInterventionModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setInterventionModal(null)}>
          <Pressable style={styles.interventionSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>⚡ {interventionModal?.editId ? 'Modifier' : 'Ajouter'} une intervention</Text>
              <Pressable onPress={() => setInterventionModal(null)} style={styles.modalXBtn}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
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
        </Pressable>
      </Modal>

      {/* ── Modal retard planifié (employé) ── */}
      <Modal visible={showRetardModal} transparent animationType="slide" onRequestClose={() => setShowRetardModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRetardModal(false)}>
          <Pressable style={styles.saisieSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.saisieTitle}>⏰ Déclarer un retard à venir</Text>
            <Text style={styles.saisieSubtitle}>Informez votre responsable d'un retard prévu</Text>

            <Text style={styles.saisieLabel}>Date du retard prévu *</Text>
            <DatePicker
              value={retardDate}
              onChange={setRetardDate}
              minDate={toYMD(new Date())}
              placeholder="Sélectionner la date"
            />

            <Text style={[styles.saisieLabel, { marginTop: 12 }]}>Heure d'arrivée prévue *</Text>
            <TextInput
              style={styles.saisieInput}
              value={retardHeure}
              onChangeText={setRetardHeure}
              placeholder="Ex: 10:00"
              placeholderTextColor="#B0BEC5"
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[styles.saisieLabel, { marginTop: 12 }]}>Motif *</Text>
            <TextInput
              style={[styles.saisieInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={retardMotif}
              onChangeText={setRetardMotif}
              placeholder="Ex: Rendez-vous médical, travaux sur la route..."
              placeholderTextColor="#B0BEC5"
              multiline
            />

            {/* Liste des retards planifiés existants */}
            {(() => {
              const empId = currentUser?.employeId || '';
              const retards = (data.retardsPlanifies || []).filter(r => r.employeId === empId);
              if (retards.length === 0) return null;
              return (
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.saisieLabel, { marginBottom: 8 }]}>Retards planifiés</Text>
                  {retards.map(r => (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3CD', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600', color: '#856404', fontSize: 13 }}>{r.date} — {r.heureArrivee}</Text>
                        <Text style={{ color: '#856404', fontSize: 12, marginTop: 2 }}>{r.motif}</Text>
                        {r.lu && <Text style={{ color: '#27AE60', fontSize: 11, marginTop: 2 }}>✓ Lu par l'admin</Text>}
                      </View>
                      <Pressable
                        onPress={() => deleteRetardPlanifie(r.id)}
                        style={{ padding: 6 }}
                      >
                        <Text style={{ color: '#E74C3C', fontSize: 14 }}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              );
            })()}

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <Pressable style={styles.saisieCancel} onPress={() => { setShowRetardModal(false); setRetardDate(''); setRetardHeure(''); setRetardMotif(''); setEditRetardId(null); }}>
                <Text style={styles.saisieCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.saisieConfirm, (!retardDate || !retardHeure || !retardMotif.trim()) && styles.saisieConfirmDisabled]}
                onPress={handleSaveRetardPlanifie}
                disabled={!retardDate || !retardHeure || !retardMotif.trim()}
              >
                <Text style={styles.saisieConfirmText}>Enregistrer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal saisie manuelle de pointage (admin/RH) ── */}
      <Modal visible={showSaisiePointage} transparent animationType="slide" onRequestClose={() => setShowSaisiePointage(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSaisiePointage(false)}>
          <Pressable style={styles.saisieSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.saisieTitle}>✏️ Saisie manuelle de pointage</Text>
            <Text style={styles.saisieSubtitle}>Correction ou saisie oubliée</Text>

            {/* Retards planifiés non lus */}
            {(data.retardsPlanifies || []).filter(r => !r.lu).length > 0 && (
              <View style={{ backgroundColor: '#FFF3CD', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ fontWeight: '700', color: '#856404', fontSize: 13, marginBottom: 6 }}>
                  ⏰ Retards planifiés par les employés
                </Text>
                {(data.retardsPlanifies || []).filter(r => !r.lu).map(r => {
                  const emp = data.employes.find(e => e.id === r.employeId);
                  return (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600', color: '#856404', fontSize: 12 }}>
                          {emp ? `${emp.prenom} ${emp.nom}` : 'Employé'} — {r.date} à {r.heureArrivee}
                        </Text>
                        <Text style={{ color: '#856404', fontSize: 11 }}>{r.motif}</Text>
                      </View>
                      <Pressable
                        style={{ backgroundColor: '#27AE60', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
                        onPress={() => {
                          // Marquer comme lu via deleteRetardPlanifie + addRetardPlanifie
                          deleteRetardPlanifie(r.id);
                          addRetardPlanifie({ ...r, lu: true });
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11 }}>✓ Lu</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={styles.saisieLabel}>Employé</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {data.employes.map(emp => (
                  <Pressable
                    key={emp.id}
                    style={[styles.saisieEmpChip, saisiePointageEmployeId === emp.id && styles.saisieEmpChipActive]}
                    onPress={() => setSaisiePointageEmployeId(emp.id)}
                  >
                    <Text style={[styles.saisieEmpChipText, saisiePointageEmployeId === emp.id && styles.saisieEmpChipTextActive]}>
                      {emp.prenom} {emp.nom}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.saisieLabel}>Date</Text>
            <TextInput
              style={styles.saisieInput}
              value={saisiePointageDate}
              onChangeText={setSaisiePointageDate}
              placeholder="YYYY-MM-DD (ex: 2026-03-25)"
              placeholderTextColor="#B0BEC5"
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.saisieLabel}>Heure arrivée *</Text>
                <TextInput
                  style={styles.saisieInput}
                  value={saisieArrivee}
                  onChangeText={setSaisieArrivee}
                  placeholder="08:00"
                  placeholderTextColor="#B0BEC5"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.saisieLabel}>Heure départ</Text>
                <TextInput
                  style={styles.saisieInput}
                  value={saisieDepart}
                  onChangeText={setSaisieDepart}
                  placeholder="17:00"
                  placeholderTextColor="#B0BEC5"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            <Text style={styles.saisieLabel}>Note / Motif</Text>
            <TextInput
              style={[styles.saisieInput, { minHeight: 60, textAlignVertical: 'top' }]}
              value={saisieNote}
              onChangeText={setSaisieNote}
              placeholder="Ex: Oubli de pointage, retard justifié..."
              placeholderTextColor="#B0BEC5"
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <Pressable style={styles.saisieCancel} onPress={() => setShowSaisiePointage(false)}>
                <Text style={styles.saisieCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.saisieConfirm, (!saisiePointageEmployeId || !saisiePointageDate || !saisieArrivee) && styles.saisieConfirmDisabled]}
                onPress={handleSaisiePointage}
                disabled={!saisiePointageEmployeId || !saisiePointageDate || !saisieArrivee}
              >
                <Text style={styles.saisieConfirmText}>Enregistrer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Galerie photos globale */}
      <GaleriePhotos
        visible={showGalerieGlobale}
        onClose={() => setShowGalerieGlobale(false)}
        titre="📷 Galerie photos"
      />

      {/* ── Modal Notes Chantier (Planning) ── */}
      <Modal visible={showNotesPlanning} animationType="slide" transparent onRequestClose={() => setShowNotesPlanning(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotesPlanning(false)}>
          <Pressable style={[styles.modalSheet, { maxHeight: '80%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                📝 Notes — {notesPlanningChantierId ? (data.chantiers.find(c => c.id === notesPlanningChantierId)?.nom || '') : ''}
              </Text>
              <Pressable onPress={() => setShowNotesPlanning(false)} style={styles.modalXBtn}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {/* Liste des notes actives */}
              {notesPlanningChantierId && getNotesActivesPlanning(notesPlanningChantierId).length === 0 && (
                <Text style={{ textAlign: 'center', color: '#B0BEC5', marginVertical: 20 }}>Aucune note active pour ce chantier.</Text>
              )}
              {notesPlanningChantierId && getNotesActivesPlanning(notesPlanningChantierId).map(note => (
                <View key={note.id} style={styles.notePlanningCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '700', color: '#1A3A6B', fontSize: 13 }}>{note.auteurNom}</Text>
                    <Text style={{ fontSize: 11, color: '#B0BEC5' }}>
                      {new Date(note.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#11181C', marginBottom: 8 }}>{note.texte}</Text>

                  {/* Pièce jointe unique (pieceJointe) */}
                  {note.pieceJointe && (
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F4F7', borderRadius: 8, padding: 8, marginBottom: 8 }}
                      onPress={() => {
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          const w = window.open();
                          if (w) w.document.write(note.pieceJointeType === 'pdf'
                            ? `<iframe src="${note.pieceJointe}" style="width:100%;height:100vh;border:none"></iframe>`
                            : `<img src="${note.pieceJointe}" style="max-width:100%;height:auto">`);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}</Text>
                      <Text style={{ fontSize: 12, color: '#1A3A6B', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {note.pieceJointeNom || (note.pieceJointeType === 'pdf' ? 'PDF' : 'Image')}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#687076' }}>Ouvrir →</Text>
                    </Pressable>
                  )}

                  {/* Photos multiples (photos[]) */}
                  {note.photos && note.photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      {note.photos.map((uri, idx) => {
                        const isPdf = uri.startsWith('data:application/pdf');
                        if (isPdf) {
                          return (
                            <Pressable
                              key={idx}
                              style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: '#FFF3CD', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}
                              onPress={() => {
                                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                  const w = window.open();
                                  if (w) w.document.write(`<iframe src="${uri}" style="width:100%;height:100vh;border:none"></iframe>`);
                                }
                              }}
                            >
                              <Text style={{ fontSize: 22 }}>📄</Text>
                            </Pressable>
                          );
                        }
                        return (
                          <Image
                            key={idx}
                            source={{ uri }}
                            style={{ width: 60, height: 60, borderRadius: 8, marginRight: 6 }}
                            resizeMode="cover"
                          />
                        );
                      })}
                    </ScrollView>
                  )}

                  {note.destinataires !== 'tous' && isAdmin && (
                    <Text style={{ fontSize: 11, color: '#687076', marginBottom: 6 }}>
                      👤 Pour : {(note.destinataires as string[]).map(id => {
                        const emp = data.employes.find(e => e.id === id);
                        const st = (data.sousTraitants || []).find(s => s.id === id);
                        return emp ? emp.prenom : (st ? st.nom : id);
                      }).join(', ')}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      style={{ backgroundColor: '#27AE60', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                      onPress={() => handleArchiveNotePlanning(note.id)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>✓ Archiver</Text>
                    </Pressable>
                    {isAdmin && (
                      <Pressable
                        style={{ backgroundColor: '#E74C3C', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                        onPress={() => handleDeleteNotePlanning(note.id)}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>🗑 Supprimer</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}

              {/* Formulaire ajout note */}
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#E8ECEF', marginTop: 8 }}>
                <Text style={{ fontWeight: '700', color: '#11181C', marginBottom: 8 }}>{t.planning.notes}</Text>
                <TextInput
                  style={[styles.noteInput, { minHeight: 80 }]}
                  value={newNotePlanningTexte}
                  onChangeText={setNewNotePlanningTexte}
                  placeholder="Écrivez votre note ici..."
                  placeholderTextColor="#B0BEC5"
                  multiline
                />

                {/* Sélection des destinataires (admin seulement) */}
                {isAdmin && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontWeight: '600', color: '#687076', fontSize: 13, marginBottom: 6 }}>Destinataires</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Pressable
                        style={[styles.chip, notePlanningDestinataires === 'tous' && styles.chipActive]}
                        onPress={() => setNotePlanningDestinataires('tous')}
                      >
                        <Text style={[styles.chipText, notePlanningDestinataires === 'tous' && styles.chipTextActive]}>Tous</Text>
                      </Pressable>
                      {data.employes.map(emp => (
                        <Pressable
                          key={emp.id}
                          style={[styles.chip, Array.isArray(notePlanningDestinataires) && notePlanningDestinataires.includes(emp.id) && styles.chipActive]}
                          onPress={() => {
                            setNotePlanningDestinataires(prev => {
                              if (prev === 'tous') return [emp.id];
                              const arr = prev as string[];
                              return arr.includes(emp.id) ? arr.filter(x => x !== emp.id) : [...arr, emp.id];
                            });
                          }}
                        >
                          <Text style={[styles.chipText, Array.isArray(notePlanningDestinataires) && notePlanningDestinataires.includes(emp.id) && styles.chipTextActive]}>
                            {emp.prenom}
                          </Text>
                        </Pressable>
                      ))}
                      {(data.sousTraitants || []).map(st => (
                        <Pressable
                          key={st.id}
                          style={[styles.chip, Array.isArray(notePlanningDestinataires) && notePlanningDestinataires.includes(st.id) && styles.chipActive]}
                          onPress={() => {
                            setNotePlanningDestinataires(prev => {
                              if (prev === 'tous') return [st.id];
                              const arr = prev as string[];
                              return arr.includes(st.id) ? arr.filter(x => x !== st.id) : [...arr, st.id];
                            });
                          }}
                        >
                          <Text style={[styles.chipText, Array.isArray(notePlanningDestinataires) && notePlanningDestinataires.includes(st.id) && styles.chipTextActive]}>
                            {st.nom} (ST)
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* Pièces jointes */}
                {notePlanningPhotos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 4 }}>
                    {notePlanningPhotos.map((uri, idx) => (
                      <View key={idx} style={{ width: 64, marginRight: 8, alignItems: 'center' }}>
                        {uri.startsWith('data:image') ? (
                          <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 6 }} />
                        ) : (
                          <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: '#FFF3CD', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 22 }}>📄</Text>
                          </View>
                        )}
                        <Pressable
                          style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#E74C3C', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => setNotePlanningPhotos(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F2F4F7', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#E2E6EA', borderStyle: 'dashed' }}
                  onPress={handlePickNotePhotosPlanning}
                >
                  <Text style={{ fontSize: 16 }}>📎</Text>
                  <Text style={{ fontSize: 13, color: '#1A3A6B', fontWeight: '600' }}>Ajouter photo / PDF</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalCloseBtn, { marginTop: 12, opacity: (newNotePlanningTexte.trim() || notePlanningPhotos.length > 0) ? 1 : 0.5 }]}
                  onPress={handleAddNotePlanning}
                  disabled={!newNotePlanningTexte.trim() && notePlanningPhotos.length === 0}
                >
                  <Text style={styles.modalCloseBtnText}>{t.common.add}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Plans Planning ── */}
      <Modal visible={showPlansPlanning} animationType="slide" transparent onRequestClose={() => setShowPlansPlanning(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPlansPlanning(false)}>
          <Pressable style={[styles.modalSheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>{t.chantiers.plansTitle}</Text>
                <Text style={{ fontSize: 13, color: '#687076' }}>{data.chantiers.find(c => c.id === plansPlanningChantierId)?.nom ?? ''}</Text>
              </View>
              <Pressable style={styles.modalXBtn} onPress={() => setShowPlansPlanning(false)}>
                <Text style={styles.modalXBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {plansPlanningChantierId && getPlansVisiblesPlanning(plansPlanningChantierId).length === 0 && (
                <Text style={{ margin: 16, color: '#687076', fontSize: 14 }}>{t.chantiers.noPlans}</Text>
              )}
              {plansPlanningChantierId && getPlansVisiblesPlanning(plansPlanningChantierId).map(plan => (
                <View key={plan.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FB', borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E2E6EA', overflow: 'hidden' }}>
                  <Pressable
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }}
                    onPress={() => {
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        const isPdf = plan.fichier.startsWith('data:application/pdf');
                        const w = window.open();
                        if (w) w.document.write(isPdf
                          ? `<iframe src="${plan.fichier}" width="100%" height="100%"></iframe>`
                          : `<img src="${plan.fichier}" style="max-width:100%;height:auto">`);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{plan.fichier.startsWith('data:application/pdf') ? '📄' : '🖼️'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C', marginBottom: 2 }}>{plan.nom}</Text>
                      <Text style={{ fontSize: 12, color: '#687076' }}>{new Date(plan.uploadedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: '#1A3A6B', fontWeight: '600' }}>{t.chantiers.viewPlan} →</Text>
                  </Pressable>
                  {isAdmin && (
                    <Pressable
                      style={{ paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF0F0', borderLeftWidth: 1, borderLeftColor: '#E2E6EA' }}
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          if (window.confirm(t.chantiers.deletePlan)) deletePlanChantier(plansPlanningChantierId!, plan.id);
                        } else {
                          Alert.alert(t.common.delete, t.chantiers.deletePlan, [
                            { text: t.common.cancel, style: 'cancel' },
                            { text: t.common.delete, style: 'destructive', onPress: () => deletePlanChantier(plansPlanningChantierId!, plan.id) },
                          ]);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>🗑</Text>
                    </Pressable>
                  )}
                </View>
              ))}

              {isAdmin && (
                <View style={{ padding: 16, backgroundColor: '#F2F4F7', borderRadius: 12, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C', marginBottom: 10 }}>{t.chantiers.addPlan}</Text>
                  <TextInput
                    style={styles.noteInput}
                    value={newPlanPlanningNom}
                    onChangeText={setNewPlanPlanningNom}
                    placeholder={t.chantiers.planName}
                    placeholderTextColor="#B0BEC5"
                  />
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      style={{ backgroundColor: '#E8EEF8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#C5D0E6' }}
                      onPress={handlePickPlanPlanning}
                    >
                      <Text style={{ fontSize: 13, color: '#1A3A6B', fontWeight: '600' }}>📎 {t.chantiers.addPlan}</Text>
                    </Pressable>
                    {newPlanPlanningFichier && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text>{newPlanPlanningFichier.startsWith('data:application/pdf') ? '📄' : '🖼️'}</Text>
                        <Text style={{ flex: 1, fontSize: 12, color: '#687076' }} numberOfLines={1}>{t.common.fileSelected}</Text>
                        <Pressable onPress={() => setNewPlanPlanningFichier(null)}>
                          <Text style={{ color: '#E74C3C', fontWeight: '700' }}>✕</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: '#687076', marginBottom: 6 }}>{t.chantiers.planRecipients}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {(['tous', 'employes', 'soustraitants', 'specifique'] as const).map(v => (
                        <Pressable
                          key={v}
                          style={[styles.chip, newPlanPlanningVisiblePar === v && styles.chipActive]}
                          onPress={() => setNewPlanPlanningVisiblePar(v)}
                        >
                          <Text style={[styles.chipText, newPlanPlanningVisiblePar === v && styles.chipTextActive]}>
                            {v === 'tous' ? t.chantiers.allRecipients : v === 'employes' ? '👷 Employés' : v === 'soustraitants' ? '👤 ST' : '👥 Sélection'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  {newPlanPlanningVisiblePar === 'specifique' && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, color: '#687076', marginBottom: 6 }}>{t.chantiers.recipients}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {data.employes.map(emp => (
                          <Pressable
                            key={emp.id}
                            style={[styles.chip, newPlanPlanningVisibleIds.includes(emp.id) && styles.chipActive]}
                            onPress={() => setNewPlanPlanningVisibleIds(prev => prev.includes(emp.id) ? prev.filter(x => x !== emp.id) : [...prev, emp.id])}
                          >
                            <Text style={[styles.chipText, newPlanPlanningVisibleIds.includes(emp.id) && styles.chipTextActive]}>{emp.prenom}</Text>
                          </Pressable>
                        ))}
                        {(data.sousTraitants || []).map(st => (
                          <Pressable
                            key={st.id}
                            style={[styles.chip, newPlanPlanningVisibleIds.includes(st.id) && styles.chipActive]}
                            onPress={() => setNewPlanPlanningVisibleIds(prev => prev.includes(st.id) ? prev.filter(x => x !== st.id) : [...prev, st.id])}
                          >
                            <Text style={[styles.chipText, newPlanPlanningVisibleIds.includes(st.id) && styles.chipTextActive]}>{st.nom} (ST)</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                  <Pressable
                    style={[styles.modalCloseBtn, { marginTop: 12, opacity: (newPlanPlanningNom.trim() && newPlanPlanningFichier) ? 1 : 0.5 }]}
                    onPress={handleAddPlanPlanning}
                    disabled={!newPlanPlanningNom.trim() || !newPlanPlanningFichier}
                  >
                    <Text style={styles.modalCloseBtnText}>{t.common.add}</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal changement mot de passe admin */}
      <Modal visible={showPwdModal} transparent animationType="fade" onRequestClose={() => setShowPwdModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowPwdModal(false)}>
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 380 }} onPress={e => e.stopPropagation()}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 20, textAlign: 'center' }}>🔒 Changer le mot de passe</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Mot de passe actuel</Text>
            <TextInput
              style={{ backgroundColor: '#F2F4F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
              value={pwdActuel}
              onChangeText={v => { setPwdActuel(v); setPwdError(''); }}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Mot de passe actuel"
              placeholderTextColor="#687076"
            />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Nouveau mot de passe</Text>
            <TextInput
              style={{ backgroundColor: '#F2F4F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
              value={pwdNouveau}
              onChangeText={v => { setPwdNouveau(v); setPwdError(''); }}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Nouveau mot de passe"
              placeholderTextColor="#687076"
            />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 }}>Confirmer le mot de passe</Text>
            <TextInput
              style={{ backgroundColor: '#F2F4F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 14 }}
              value={pwdConfirm}
              onChangeText={v => { setPwdConfirm(v); setPwdError(''); }}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Confirmer le mot de passe"
              placeholderTextColor="#687076"
            />
            {pwdError !== '' && <Text style={{ color: '#E74C3C', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{pwdError}</Text>}
            {pwdSuccess && <Text style={{ color: '#27AE60', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>Mot de passe modifié !</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable style={{ flex: 1, backgroundColor: '#F2F4F7', borderRadius: 10, paddingVertical: 13, alignItems: 'center' }} onPress={() => setShowPwdModal(false)}>
                <Text style={{ fontSize: 15, color: '#687076', fontWeight: '600' }}>Annuler</Text>
              </Pressable>
              <Pressable style={{ flex: 1, backgroundColor: '#1A3A6B', borderRadius: 10, paddingVertical: 13, alignItems: 'center' }} onPress={handleChangePwd}>
                <Text style={{ fontSize: 15, color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* ── Modal ordre affectations multi-chantiers ── */}
      <Modal
        visible={ordreModal !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setOrdreModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setOrdreModal(null)}>
          <Pressable style={[styles.modalSheet, { maxHeight: 400 }]} onPress={e => e.stopPropagation()}>
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
                    <Pressable style={{ flex: 1, backgroundColor: '#F2F4F7', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => setOrdreModal(null)}>
                      <Text style={{ color: '#687076', fontWeight: '600' }}>Annuler</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, backgroundColor: '#1A3A6B', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
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
        </Pressable>
      </Modal>

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
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
  },
  nameCell: {
    width: NAME_COL,
    minHeight: 50,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E6EA',
    position: 'relative',
    overflow: 'hidden',
  },
  headerCell: {
    backgroundColor: '#F2F4F7',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  chantierName: {
    fontSize: 11,
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
    color: '#1A3A6B',
    fontWeight: '700',
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginTop: 2,
  },
  dayNumToday: {
    color: '#1A3A6B',
    fontWeight: '800',
  },
  chantierRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
    minHeight: 70,
  },
  cell: {
    width: DAY_COL,
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#E2E6EA',
    alignItems: 'center',
  },
  cellToday: {
    backgroundColor: '#EEF2F8',
  },
  cellOutOfRange: {
    backgroundColor: '#F2F4F7',
  },
  empBadge: {
    width: DAY_COL - 6,
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRadius: 5,
    alignItems: 'center',
    position: 'relative',
  },
  empBadgeText: {
    fontSize: 10,
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
    top: -5,
    right: -5,
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
    width: DAY_COL - 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 16,
    color: '#687076',
    fontWeight: '400',
  },
  noteBtn: {
    width: DAY_COL - 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  noteBtnText: {
    fontSize: 12,
    color: '#687076',
  },
  stBadge: {
    width: DAY_COL - 6,
    paddingVertical: 3,
    paddingHorizontal: 3,
    // Forme losange-ish via borderRadius asymétrique pour différencier des employés
    borderRadius: 2,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    borderStyle: 'dashed',
    opacity: 0.92,
  },
  stBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  modalSectionTabs: {
    flexDirection: 'row',
    backgroundColor: '#E2E6EA',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  modalSectionTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSectionTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  modalSectionTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#687076',
  },
  modalSectionTabTextActive: {
    color: '#1A3A6B',
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
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
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
    borderRadius: 12,
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
  modalEmpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F2F4F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modalEmpRowSelected: {
    borderColor: '#1A3A6B',
    backgroundColor: '#EEF2F8',
  },
  modalAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modalAvatarText: {
    fontWeight: '700',
    fontSize: 15,
  },
  modalEmpInfo: { flex: 1 },
  modalEmpName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  modalEmpMetier: {
    fontSize: 12,
    color: '#687076',
    marginTop: 1,
  },
  modalCheck: {
    color: '#1A3A6B',
    fontWeight: '700',
    fontSize: 16,
  },
  modalEmpty: {
    color: '#687076',
    textAlign: 'center',
    padding: 20,
    fontSize: 13,
  },
  modalCloseBtn: {
    marginTop: 16,
    backgroundColor: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
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
    borderRadius: 12,
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
    color: '#1A3A6B',
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
    color: '#1A3A6B',
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
    borderColor: '#1A3A6B',
    borderStyle: 'dashed',
  },
  addNoteBtnText: {
    color: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#1A3A6B',
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
    width: DAY_COL - 4,
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
    shadowOffset: { width: 0, height: 1 },
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
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#1A3A6B',
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
    color: '#1A3A6B',
    fontWeight: '600',
    fontSize: 14,
  },
  taskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1A3A6B',
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
    color: '#1A3A6B',
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
    backgroundColor: '#1A3A6B',
  },
  viewToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#687076',
  },
  viewToggleBtnTextActive: {
    color: '#fff',
  },
  // ── Vue mensuelle ──
  monthHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
    paddingVertical: 6,
  },
  monthHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  monthHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
  },
  monthCell: {
    width: '14.28%',
    minHeight: 70,
    padding: 3,
    borderWidth: 0.5,
    borderColor: '#E2E6EA',
    backgroundColor: '#fff',
  },
  monthCellToday: {
    backgroundColor: '#EEF2F8',
    borderColor: '#1A3A6B',
    borderWidth: 1.5,
  },
  monthCellNum: {
    fontSize: 12,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 2,
  },
  monthCellNumToday: {
    color: '#1A3A6B',
    fontWeight: '800',
  },
  monthChantierDot: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginBottom: 1,
  },
  monthChantierDotText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
  },
  monthMoreText: {
    fontSize: 9,
    color: '#687076',
    fontStyle: 'italic',
  },
  monthLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
    marginTop: 8,
    borderRadius: 10,
    margin: 8,
  },
  monthLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: '45%',
  },
  monthLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  monthLegendText: {
    fontSize: 11,
    color: '#11181C',
    fontWeight: '500',
    flex: 1,
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
    fontWeight: '800',
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
  // Modal saisie manuelle
  saisieSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '90%',
  },
  saisieTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 2,
  },
  saisieSubtitle: {
    fontSize: 13,
    color: '#687076',
    marginBottom: 16,
  },
  saisieLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 6,
    marginTop: 4,
  },
  saisieInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1A1A2E',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  saisieEmpChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F4F8',
    borderWidth: 1,
    borderColor: '#CBD5E0',
  },
  saisieEmpChipActive: {
    backgroundColor: '#2980B9',
    borderColor: '#2980B9',
  },
  saisieEmpChipText: {
    fontSize: 13,
    color: '#4A5568',
    fontWeight: '500',
  },
  saisieEmpChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  saisieCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
  },
  saisieCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#687076',
  },
  saisieConfirm: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#2980B9',
    alignItems: 'center',
  },
  saisieConfirmDisabled: {
    backgroundColor: '#B0C4D8',
  },
  saisieConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
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
    backgroundColor: '#1A3A6B',
    borderColor: '#1A3A6B',
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
