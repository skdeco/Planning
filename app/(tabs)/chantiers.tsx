import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, ScrollView, Alert, Platform, Image, Linking,
} from 'react-native';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { BilanFinancierChantier } from '@/components/BilanFinancierChantier';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { MarchesChantier } from '@/components/MarchesChantier';
import { LivraisonsRdvChantier } from '@/components/LivraisonsRdvChantier';
import { PortailClient } from '@/components/PortailClient';
import {
  METIER_COLORS, STATUT_LABELS, STATUT_COLORS, CHANTIER_COLORS,
  APPORTEUR_TYPE_LABELS,
  type Chantier, type StatutChantier, type FicheChantier, type NoteChantier, type PlanChantier, type TicketSAV, type PrioriteSAV, type StatutSAV,
  type Apporteur, type Note, type TaskItem,
} from '@/app/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatePicker } from '@/components/DatePicker';
import { uploadFileToStorage } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';
import { NativeFilePickerButton } from '@/components/share/NativeFilePickerButton';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';
import { pickNativeFile, type PickedFile } from '@/lib/share/pickNativeFile';

// Filtre mime utilisé par les pickers Notes Chantier + Plans Chantier (photos + PDF).
const inboxMimeFilterImagePdf = (m: string): boolean =>
  m.startsWith('image/') || m === 'application/pdf';

const STATUTS: StatutChantier[] = ['actif', 'en_attente', 'termine', 'en_pause', 'sav'];

function genId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ── "Y aller" : choix Waze / Google Maps / Apple Plans ─────────────────────
const _openWithWaze = (encoded: string) => {
  Linking.openURL(`waze://?q=${encoded}&navigate=yes`).catch(() => {
    Linking.openURL(`https://waze.com/ul?q=${encoded}&navigate=yes`);
  });
};
const _openWithGoogleMaps = (encoded: string) => {
  if (Platform.OS === 'ios') {
    Linking.openURL(`comgooglemaps://?daddr=${encoded}&directionsmode=driving`).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
    });
  } else {
    Linking.openURL(`google.navigation:q=${encoded}`).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
    });
  }
};
const _openWithApplePlans = (encoded: string) => {
  Linking.openURL(`maps://?daddr=${encoded}`);
};

const openDirectionsHelper = (adresse: string) => {
  if (!adresse) return;
  const encoded = encodeURIComponent(adresse);
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const choix = window.confirm('Ouvrir avec Google Maps ?\n(OK = Google Maps, Annuler = Waze)');
      if (choix) window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
      else window.open(`https://waze.com/ul?q=${encoded}&navigate=yes`, '_blank');
    }
    return;
  }
  const buttons: any[] = [
    { text: 'Waze', onPress: () => _openWithWaze(encoded) },
    { text: 'Google Maps', onPress: () => _openWithGoogleMaps(encoded) },
  ];
  if (Platform.OS === 'ios') {
    buttons.push({ text: 'Apple Plans', onPress: () => _openWithApplePlans(encoded) });
  }
  buttons.push({ text: 'Annuler', style: 'cancel' });
  Alert.alert('Avec quoi ouvrir ?', adresse, buttons, { cancelable: true });
};

const FICHE_VIDE: FicheChantier = {
  codeAcces: '',
  emplacementCle: '',
  codeAlarme: '',
  contacts: '',
  notes: '',
  photos: [],
  updatedAt: '',
};

interface ChantierForm {
  nom: string;
  adresse: string;        // legacy — concaténation auto à la sauvegarde
  rue: string;
  codePostal: string;
  ville: string;
  pays: string;
  dateDebut: string;
  dateFin: string;
  statut: StatutChantier;
  couleur: string;
  employeIds: string[];
  visibleSurPlanning: boolean;
  afficherPlanningAuClient: boolean;
  // Contacts externes
  architecteId: string;
  apporteurId: string;
  contractantId: string;
  clientApporteurId: string;
}

// Clé AsyncStorage pour préserver le formulaire chantier quand on va créer un Apporteur
const PENDING_CHANTIER_FORM_KEY = 'sk_pending_chantier_form';

const DEFAULT_FORM: ChantierForm = {
  nom: '',
  adresse: '',
  rue: '',
  codePostal: '',
  ville: '',
  pays: 'France',
  dateDebut: '',
  dateFin: '',
  statut: 'actif',
  couleur: CHANTIER_COLORS[0],
  employeIds: [],
  visibleSurPlanning: true,
  afficherPlanningAuClient: false,
  architecteId: '',
  apporteurId: '',
  contractantId: '',
  clientApporteurId: '',
};

export default function ChantiersScreen() {
  const { data, currentUser, isHydrated, addChantier, updateChantier, deleteChantier, upsertFicheChantier, addNoteChantier, archiveNoteChantier, deleteNoteChantier, deleteNoteChantierArchivee, addPlanChantier, deletePlanChantier, addDepense, deleteDepense, addTicketSAV, updateTicketSAV, deleteTicketSAV, upsertNote, deleteNote, toggleTask, addTaskPhoto, removeTaskPhoto, updateBudgetChantier, addApporteur } = useApp();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string; chantierId?: string; apporteurId?: string; apporteurType?: string }>();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login');
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';
  const isApporteurUser = currentUser?.role === 'apporteur';
  const [exportingId, setExportingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ChantierForm>(DEFAULT_FORM);

  // ── Création rapide client + espace (depuis le chantier) ──
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClient, setQuickClient] = useState({ prenom: '', nom: '', email: '', telephone: '', societe: '' });
  const [quickClientCreds, setQuickClientCreds] = useState<{ identifiant: string; motDePasse: string } | null>(null);
  const [quickClientSaving, setQuickClientSaving] = useState(false);

  const openQuickClient = () => {
    setQuickClient({ prenom: '', nom: '', email: '', telephone: '', societe: '' });
    setQuickClientCreds(null);
    setShowQuickClient(true);
  };
  const saveQuickClient = async () => {
    const p = quickClient.prenom.trim();
    const n = quickClient.nom.trim();
    if (!p || !n) return;
    setQuickClientSaving(true);
    try {
      const { preparerChangementMotDePasse, generatePassword } = await import('@/lib/externAuth');
      // Identifiant : email (avant @) sinon prenom.nom (tout en minuscules, sans accents)
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.]/g, '');
      const base = quickClient.email.trim()
        ? normalize(quickClient.email.split('@')[0])
        : `${normalize(p)}.${normalize(n)}`;
      // Assurer unicité de l'identifiant
      let ident = base;
      let i = 2;
      while (apporteursAll.some(a => (a.identifiant || '').toLowerCase() === ident)) {
        ident = `${base}${i}`;
        i++;
      }
      const mdp = generatePassword(10);
      const mdpFields = await preparerChangementMotDePasse(mdp);
      const now = new Date().toISOString();
      const id = `app_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      addApporteur({
        id,
        type: 'client',
        prenom: p,
        nom: n,
        email: quickClient.email.trim() || undefined,
        telephone: quickClient.telephone.trim() || undefined,
        societe: quickClient.societe.trim() || undefined,
        identifiant: ident,
        accesApp: true,
        ...mdpFields,
        createdAt: now,
        updatedAt: now,
      });
      // Lier au chantier en cours d'édition
      setForm(f => ({ ...f, clientApporteurId: id }));
      setQuickClientCreds({ identifiant: ident, motDePasse: mdp });
    } finally {
      setQuickClientSaving(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [bilanChantierId, setBilanChantierId] = useState<string | null>(null);
  // Protection contre la perte de données si refresh pendant édition
  useUnsavedChanges(showForm && form.nom.trim().length > 0);

  // Fiche chantier unifiée (fiche + modifier)
  const [showFiche, setShowFiche] = useState(false);
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [fiche, setFiche] = useState<FicheChantier>(FICHE_VIDE);
  const [ficheOnglet, setFicheOnglet] = useState<'fiche' | 'achats'>('fiche');
  // Achats chantier
  const [showAchatForm, setShowAchatForm] = useState(false);
  const [showAchatFormFiche, setShowAchatFormFiche] = useState(false);
  const [achatFichierUri, setAchatFichierUri] = useState<string | null>(null);
  const [achatForm, setAchatForm] = useState({ libelle: '', montantHT: '', montantTTC: '', date: '', fournisseur: '', fichier: '', note: '' });
  // Menu actions chantier
  const [actionChantier, setActionChantier] = useState<Chantier | null>(null);
  // Modal Achats séparé
  const [achatsChantierId, setAchatsChantierId] = useState<string | null>(null);
  // Modal Photos séparé
  const [showGalerie, setShowGalerie] = useState<string | null>(null);
  const [viewPhotoUri, setViewPhotoUri] = useState<string | null>(null);
  const [marchesChantierId, setMarchesChantierId] = useState<string | null>(null);
  const [savChantierId, setSavChantierId] = useState<string | null>(null);
  const [portailClientId, setPortailClientId] = useState<string | null>(null);
  const [suiviChantierId, setSuiviChantierId] = useState<string | null>(null);
  const [suiviFilterEmp, setSuiviFilterEmp] = useState<string>('all');
  const [suiviFilterSemaine, setSuiviFilterSemaine] = useState<'tout' | 'semaine' | 'mois'>('semaine');
  const [suiviShowForm, setSuiviShowForm] = useState(false);
  const [suiviNoteText, setSuiviNoteText] = useState('');
  const [suiviNoteEmpId, setSuiviNoteEmpId] = useState('');
  // Brouillon enrichi du form Suivi (photos/tasks/savTicketId/visiblePar).
  // Reset à chaque toggle "+ Note" et après chaque save réussi.
  // DETTE-NOTE-EDITOR-001 : duplique partiellement useNotesModalLogic.
  const [suiviDraft, setSuiviDraft] = useState<{ tasks: TaskItem[]; photos: string[]; savTicketId: string | null; visiblePar: 'tous' | 'employes' | 'soustraitants' }>({ tasks: [], photos: [], savTicketId: null, visiblePar: 'tous' });
  const [suiviShowTaskInput, setSuiviShowTaskInput] = useState(false);
  const [suiviNewTaskText, setSuiviNewTaskText] = useState('');
  const [suiviEditingNote, setSuiviEditingNote] = useState<{ affId: string; note: Note } | null>(null);
  const [vueChantiersTab, setVueChantiersTab] = useState<'chantiers' | 'sav'>('chantiers');
  // Filtre par type de contact (architecte / apporteur / contractant / client)
  const [filterContactType, setFilterContactType] = useState<'all' | 'architecte' | 'apporteur' | 'contractant' | 'client'>('all');
  const [filterContactId, setFilterContactId] = useState<string>('all'); // 'all' ou id d'un apporteur
  const [showSavForm, setShowSavForm] = useState(false);
  const [editSavId, setEditSavId] = useState<string | null>(null);
  const [savForm, setSavForm] = useState({ objet: '', description: '', priorite: 'normale' as PrioriteSAV, assigneA: '' });
  const [savPhotos, setSavPhotos] = useState<string[]>([]);
  const [savFichiers, setSavFichiers] = useState<{ uri: string; nom: string }[]>([]);

  const openFicheUnifiee = (chantier: Chantier) => {
    setFicheId(chantier.id);
    setFiche(chantier.fiche ? { ...chantier.fiche } : { ...FICHE_VIDE });
    setEditId(chantier.id);
    setForm({
      nom: chantier.nom,
      adresse: chantier.adresse || '',
      rue: chantier.rue || '',
      codePostal: chantier.codePostal || '',
      ville: chantier.ville || '',
      pays: chantier.pays || 'France',
      dateDebut: chantier.dateDebut,
      dateFin: chantier.dateFin,
      statut: chantier.statut,
      couleur: chantier.couleur,
      employeIds: [...chantier.employeIds],
      visibleSurPlanning: chantier.visibleSurPlanning,
      afficherPlanningAuClient: chantier.afficherPlanningAuClient === true,
      architecteId: chantier.architecteId || '',
      apporteurId: chantier.apporteurId || '',
      contractantId: chantier.contractantId || '',
      clientApporteurId: chantier.clientApporteurId || '',
    });
    setFicheOnglet('fiche');
    setShowFiche(true);
  };

  // Auto-ouverture d'un modal via query params (depuis planning)
  useEffect(() => {
    if (!params.action) return;
    // Action "new" : créer un chantier avec contact prérempli (depuis fiche apporteur)
    if (params.action === 'new' && params.apporteurId) {
      const type = params.apporteurType as string;
      const field: keyof ChantierForm | null =
        type === 'architecte'  ? 'architecteId'      :
        type === 'apporteur'   ? 'apporteurId'       :
        type === 'contractant' ? 'contractantId'     :
        type === 'client'      ? 'clientApporteurId' : null;
      if (field) {
        setEditId(null);
        setForm({ ...DEFAULT_FORM, [field]: String(params.apporteurId) });
        setShowForm(true);
      }
      return;
    }
    if (!params.chantierId) return;
    const id = String(params.chantierId);
    const ch = data.chantiers.find(c => c.id === id);
    if (!ch) return;
    if (params.action === 'achats') setAchatsChantierId(id);
    else if (params.action === 'sav') setSavChantierId(id);
    else if (params.action === 'marches') setMarchesChantierId(id);
    else if (params.action === 'budget') openFicheUnifiee(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.action, params.chantierId, params.apporteurId, params.apporteurType]);

  // Restauration du formulaire chantier après création d'un apporteur
  // Utilise useFocusEffect pour se déclencher à chaque retour sur l'écran
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(PENDING_CHANTIER_FORM_KEY);
          if (!raw) return;
          const saved = JSON.parse(raw);
          if (saved && saved.form) {
            setEditId(saved.editId || null);
            setForm(saved.form);
            setShowForm(true);
            await AsyncStorage.removeItem(PENDING_CHANTIER_FORM_KEY);
          }
        } catch {}
      })();
    }, [])
  );

  // Helper : sauvegarder le formulaire + rediriger vers Équipe pour créer un apporteur
  const goCreateApporteur = async (type: 'architecte' | 'apporteur' | 'contractant' | 'client') => {
    try {
      await AsyncStorage.setItem(PENDING_CHANTIER_FORM_KEY, JSON.stringify({
        editId,
        form,
        timestamp: Date.now(),
      }));
    } catch {}
    setShowForm(false);
    router.push({ pathname: '/(tabs)/equipe', params: { tab: 'apporteurs', newApporteurType: type, returnToChantier: '1' } });
  };

  // Plans chantier
  const [showPlans, setShowPlans] = useState(false);
  const [plansChantierId, setPlansChantierId] = useState<string | null>(null);
  const [newPlanNom, setNewPlanNom] = useState('');
  const [newPlanFichier, setNewPlanFichier] = useState<string | null>(null);
  const [newPlanVisiblePar, setNewPlanVisiblePar] = useState<'tous' | 'employes' | 'soustraitants' | 'specifique'>('tous');
  const [newPlanVisibleIds, setNewPlanVisibleIds] = useState<string[]>([]);

  const openPlans = (chantier: Chantier) => {
    setPlansChantierId(chantier.id);
    setNewPlanNom('');
    setNewPlanFichier(null);
    setNewPlanVisiblePar('tous');
    setNewPlanVisibleIds([]);
    setShowPlans(true);
  };

  const handlePlanChantierPickNative = async (file: PickedFile): Promise<string | null> => {
    if (!plansChantierId) return null;
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return await uploadFileToStorage(file.uri, `chantiers/${plansChantierId}/plans`, planId);
  };

  const handlePlanChantierFromInbox = async (item: InboxItem): Promise<string | null> => {
    if (!plansChantierId) return null;
    const fileURI = getInboxItemPath(item);
    if (!fileURI) return null;
    const planId = `inbox_${item.id}`;
    return await uploadFileToStorage(fileURI, `chantiers/${plansChantierId}/plans`, planId);
  };

  const handleAddPlan = () => {
    if (!newPlanNom.trim() || !newPlanFichier || !plansChantierId) return;
    const plan: PlanChantier = {
      id: `pl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      nom: newPlanNom.trim(),
      fichier: newPlanFichier,
      visiblePar: newPlanVisiblePar,
      visibleIds: newPlanVisiblePar === 'specifique' ? newPlanVisibleIds : undefined,
      uploadedAt: new Date().toISOString(),
    };
    addPlanChantier(plansChantierId, plan);
    setNewPlanNom('');
    setNewPlanFichier(null);
    setNewPlanVisiblePar('tous');
    setNewPlanVisibleIds([]);
  };

  const getPlansVisibles = (chantierId: string) => {
    const chantier = data.chantiers.find(c => c.id === chantierId);
    const plans = chantier?.fiche?.plans || [];
    if (isAdmin) return plans;
    const userId = currentUser?.employeId || currentUser?.soustraitantId || '';
    // L'utilisateur doit être affecté au chantier pour voir les plans
    const isAffected = data.affectations.some(a => a.chantierId === chantierId && (a.employeId === userId || a.soustraitantId === userId));
    if (!isAffected) return [];
    const isST = !!currentUser?.soustraitantId;
    return plans.filter(p => {
      if (p.visiblePar === 'tous') return true;
      if (p.visiblePar === 'employes' && !isST) return true;
      if (p.visiblePar === 'soustraitants' && isST) return true;
      if (p.visiblePar === 'specifique') return (p.visibleIds || []).includes(userId);
      return false;
    });
  };

  // Notes chantier
  const [showNotes, setShowNotes] = useState(false);
  const [notesChantierId, setNotesChantierId] = useState<string | null>(null);
  const [newNoteTexte, setNewNoteTexte] = useState('');
  const [noteDestinataires, setNoteDestinataires] = useState<'tous' | string[]>('tous');
  const [showDestPicker, setShowDestPicker] = useState(false);
  const [notesOnglet, setNotesOnglet] = useState<'actives' | 'historique'>('actives');
  const [notePhotos, setNotePhotos] = useState<string[]>([]);

  const openNotes = (chantier: Chantier) => {
    setNotesChantierId(chantier.id);
    setNewNoteTexte('');
    setNoteDestinataires('tous');
    setNotesOnglet('actives');
    setNotePhotos([]);
    setShowNotes(true);
  };

  const handleNoteChantierPickNative = async (file: PickedFile): Promise<string | null> => {
    if (!notesChantierId) return null;
    const photoId = `native_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return await uploadFileToStorage(file.uri, `chantiers/${notesChantierId}/notes`, photoId);
  };

  const handleNoteChantierFromInbox = async (item: InboxItem): Promise<string | null> => {
    if (!notesChantierId) return null;
    const fileURI = getInboxItemPath(item);
    if (!fileURI) return null;
    const photoId = `inbox_${item.id}`;
    return await uploadFileToStorage(fileURI, `chantiers/${notesChantierId}/notes`, photoId);
  };

  const handleAddNote = () => {
    const hasPhotos = notePhotos.length > 0;
    if (!hasPhotos && !newNoteTexte.trim()) return;
    if (!notesChantierId) return;
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    const nom = currentUser?.role === 'admin' ? 'Admin' : (data.employes.find(e => e.id === userId)?.prenom || data.sousTraitants?.find(s => s.id === userId)?.nom || 'Inconnu');
    addNoteChantier({
      id: `nc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      chantierId: notesChantierId,
      auteurId: userId,
      auteurNom: nom,
      texte: newNoteTexte.trim(),
      createdAt: new Date().toISOString(),
      destinataires: isAdmin ? noteDestinataires : 'tous',
      archivedBy: [],
      photos: hasPhotos ? notePhotos : undefined,
      // pieceJointe* legacy non écrit pour les nouvelles notes (rendu lit toujours pieceJointe pour rétrocompat).
    });
    setNewNoteTexte('');
    setNoteDestinataires('tous');
    setNotePhotos([]);
  };

  const handleArchiveNote = (noteId: string) => {
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    archiveNoteChantier(noteId, userId);
  };

  const handleDeleteNote = (noteId: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm && window.confirm(t.chantiers.deleteConfirm)) deleteNoteChantier(noteId);
    } else {
      Alert.alert(t.common.delete, t.chantiers.deleteConfirm, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: () => deleteNoteChantier(noteId) },
      ]);
    }
  };

  // Calcul des notes actives pour un chantier (non archivées par l'utilisateur courant)
  const getNotesActives = (chantierId: string) => {
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || '');
    return (data.notesChantier || []).filter(n => {
      if (n.chantierId !== chantierId) return false;
      if (n.archivedBy.includes(userId)) return false;
      // Vérifier si l'utilisateur est destinataire
      if (n.destinataires === 'tous') return true;
      if (isAdmin) return true;
      return (n.destinataires as string[]).includes(userId);
    });
  };

  const getNotesArchivees = (chantierId: string) => {
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || '');
    return (data.notesChantier || []).filter(n =>
      n.chantierId === chantierId && n.archivedBy.includes(userId)
    );
  };

  const getNotesSupprimees = (chantierId: string) => {
    return (data.notesChantierSupprimees || []).filter(n => n.chantierId === chantierId);
  };

  const openNew = () => {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  };

  const openEdit = (chantier: Chantier) => {
    setEditId(chantier.id);
    setForm({
      nom: chantier.nom,
      adresse: chantier.adresse || '',
      rue: chantier.rue || '',
      codePostal: chantier.codePostal || '',
      ville: chantier.ville || '',
      pays: chantier.pays || 'France',
      dateDebut: chantier.dateDebut,
      dateFin: chantier.dateFin,
      statut: chantier.statut,
      couleur: chantier.couleur,
      employeIds: [...chantier.employeIds],
      visibleSurPlanning: chantier.visibleSurPlanning,
      afficherPlanningAuClient: chantier.afficherPlanningAuClient === true,
      architecteId: chantier.architecteId || '',
      apporteurId: chantier.apporteurId || '',
      contractantId: chantier.contractantId || '',
      clientApporteurId: chantier.clientApporteurId || '',
    });
    setShowForm(true);
  };

  const openFiche = (chantier: Chantier) => {
    setFicheId(chantier.id);
    setFiche(chantier.fiche ? { ...chantier.fiche } : { ...FICHE_VIDE });
    setShowFiche(true);
  };

  // Géocodage automatique de l'adresse → coordonnées GPS
  const geocodeAddress = async (adresse: string): Promise<{ latitude: number; longitude: number } | null> => {
    if (!adresse.trim()) return null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}&limit=1`, {
        headers: { 'User-Agent': 'SKDecoPlanning/1.0' },
      });
      const data = await res.json();
      if (data && data[0]) return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
    } catch {}
    return null;
  };

  const normalizeAddr = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const handleSave = async () => {
    if (!form.nom.trim()) return;

    // Construit l'adresse complète depuis les champs structurés si remplis,
    // sinon conserve l'adresse legacy saisie directement.
    const rue = form.rue.trim();
    const cp = form.codePostal.trim();
    const ville = form.ville.trim();
    const pays = form.pays.trim();
    const adresseStructuree = [rue, [cp, ville].filter(Boolean).join(' '), pays]
      .filter(Boolean)
      .join(', ')
      .trim();
    const adresseComplete = adresseStructuree || form.adresse.trim();

    // Duplicate address detection (only when creating)
    if (!editId && adresseComplete) {
      const normNew = normalizeAddr(adresseComplete);
      const dup = data.chantiers.find(c => c.adresse && normalizeAddr(c.adresse) === normNew);
      if (dup) {
        const msg = `Un chantier à la même adresse existe déjà : ${dup.nom}. Créer quand même ?`;
        if (Platform.OS === 'web') {
          if (!window.confirm(msg)) return;
        } else {
          const confirmed = await new Promise<boolean>(resolve =>
            Alert.alert('Doublon détecté', msg, [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Créer', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) })
          );
          if (!confirmed) return;
        }
      }
    }

    const existing = editId ? data.chantiers.find(c => c.id === editId) : null;
    // Géocoder l'adresse si elle a changé
    let coords = existing ? { latitude: existing.latitude, longitude: existing.longitude } : null;
    if (adresseComplete && (!existing || adresseComplete !== existing.adresse)) {
      coords = await geocodeAddress(adresseComplete);
    }
    if (editId) {
      updateChantier({
        id: editId,
        nom: form.nom.trim(),
        adresse: adresseComplete,
        rue: rue || undefined,
        codePostal: cp || undefined,
        ville: ville || undefined,
        pays: pays || undefined,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
        statut: form.statut,
        couleur: form.couleur,
        employeIds: form.employeIds,
        visibleSurPlanning: form.visibleSurPlanning,
        afficherPlanningAuClient: form.afficherPlanningAuClient,
        fiche: existing?.fiche,
        // Legacy client text conservé si existant
        client: existing?.client,
        architecteId: form.architecteId || undefined,
        apporteurId: form.apporteurId || undefined,
        contractantId: form.contractantId || undefined,
        clientApporteurId: form.clientApporteurId || undefined,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      });
    } else {
      addChantier({
        id: genId(),
        nom: form.nom.trim(),
        adresse: adresseComplete,
        rue: rue || undefined,
        codePostal: cp || undefined,
        ville: ville || undefined,
        pays: pays || undefined,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
        statut: form.statut,
        couleur: form.couleur,
        employeIds: form.employeIds,
        visibleSurPlanning: form.visibleSurPlanning,
        afficherPlanningAuClient: form.afficherPlanningAuClient,
        architecteId: form.architecteId || undefined,
        apporteurId: form.apporteurId || undefined,
        contractantId: form.contractantId || undefined,
        clientApporteurId: form.clientApporteurId || undefined,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      });
    }
    setShowForm(false);
  };

  const handleSaveFiche = () => {
    if (!ficheId) return;
    upsertFicheChantier(ficheId, {
      ...fiche,
      updatedAt: new Date().toISOString(),
    });
    setShowFiche(false);
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportChantier = async (chantier: Chantier) => {
    setExportingId(chantier.id);
    const slug = chantier.nom.replace(/[^a-z0-9]/gi, '_');
    const dateStr = new Date().toISOString().slice(0, 10);

    // ── Données liées au chantier ──────────────────────────────────────────
    const affectations = data.affectations.filter(a => a.chantierId === chantier.id);
    const employeIds = new Set(affectations.map(a => a.employeId));

    // Pointages : tous les pointages des employés affectés sur la période du chantier
    const pointages = data.pointages.filter(p =>
      employeIds.has(p.employeId) &&
      p.date >= chantier.dateDebut && p.date <= chantier.dateFin
    );
    const notes = (data.notesChantier || []).filter(n => n.chantierId === chantier.id);
    const photos = (data.photosChantier || []).filter(p => p.chantierId === chantier.id);
    const docs = (data.docsSuiviChantier || []).filter(d => d.chantierId === chantier.id);
    const depenses = (data.depensesChantier || []).filter(d => d.chantierId === chantier.id);
    const supplements = (data.supplementsChantier || []).filter(s => s.chantierId === chantier.id);
    const interventions = (data.interventions || []).filter(i => i.chantierId === chantier.id);
    const plans: any[] = data.plansChantier?.[chantier.id] || [];
    const listesMateriaux = (data.listesMateriaux || []).filter(l => l.chantierId === chantier.id);

    const empName = (id: string) => {
      const e = data.employes.find(x => x.id === id);
      return e ? `${e.prenom} ${e.nom}` : id;
    };

    // ── 1. FICHIER EXCEL ───────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // Onglet Chantier
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      Nom: chantier.nom,
      Adresse: chantier.adresse || '',
      Statut: STATUT_LABELS[chantier.statut],
      'Date début': chantier.dateDebut,
      'Date fin': chantier.dateFin,
    }]), 'Chantier');

    // Onglet Affectations
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      affectations.length ? affectations.map(a => ({
        Employé: empName(a.employeId),
        'Date début': a.dateDebut,
        'Date fin': a.dateFin,
      })) : [{ info: 'Aucune affectation' }]
    ), 'Affectations');

    // Onglet Pointages
    const pointageRows: any[] = [];
    // Grouper par employé + date pour avoir arrivée / départ sur la même ligne
    const ptMap = new Map<string, { debut?: string; fin?: string; adresse?: string }>();
    for (const p of pointages) {
      const key = `${p.employeId}_${p.date}`;
      if (!ptMap.has(key)) ptMap.set(key, {});
      const row = ptMap.get(key)!;
      if (p.type === 'debut') row.debut = p.heure;
      else row.fin = p.heure;
      if (p.adresse) row.adresse = p.adresse;
    }
    for (const [key, val] of ptMap.entries()) {
      const [empId, date] = key.split('_');
      pointageRows.push({
        Employé: empName(empId),
        Date: date,
        Arrivée: val.debut || '',
        Départ: val.fin || '',
        Adresse: val.adresse || '',
      });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      pointageRows.length ? pointageRows : [{ info: 'Aucun pointage' }]
    ), 'Pointages');

    // Onglet Dépenses
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      depenses.length ? depenses.map(d => ({
        Date: d.date,
        Libellé: d.libelle,
        Catégorie: d.categorie || '',
        'Montant (€)': d.montant,
        'Saisi par': d.createdBy || '',
      })) : [{ info: 'Aucune dépense' }]
    ), 'Dépenses');

    // Onglet Suppléments
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      supplements.length ? supplements.map(s => ({
        Date: s.date,
        Libellé: s.libelle,
        Quantité: s.quantite ?? '',
        Unité: s.unite || '',
        'Prix unitaire (€)': s.prixUnitaire ?? '',
        'Total (€)': s.montantTotal ?? '',
        Note: s.note || '',
      })) : [{ info: 'Aucun supplément' }]
    ), 'Suppléments');

    // Onglet Interventions externes
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      interventions.length ? interventions.map(i => ({
        Libellé: i.libelle,
        Description: i.description || '',
        'Date début': i.dateDebut,
        'Date fin': i.dateFin,
      })) : [{ info: 'Aucune intervention' }]
    ), 'Interventions');

    // Onglet Notes chantier
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      notes.length ? notes.map(n => ({
        Date: n.createdAt?.slice(0, 10) || '',
        Texte: n.texte || '',
        Auteur: n.auteurNom || n.auteurId || '',
        Destinataires: Array.isArray(n.destinataires) ? n.destinataires.join(', ') : (n.destinataires || 'tous'),
      })) : [{ info: 'Aucune note' }]
    ), 'Notes');

    // Onglet Listes matériau
    const matRows: any[] = [];
    for (const liste of listesMateriaux) {
      for (const item of liste.items) {
        matRows.push({
          Employé: empName(liste.employeId),
          Article: item.texte,
          Quantité: item.quantite || '',
          Commentaire: item.commentaire || '',
          Acheté: item.achete ? 'Oui' : 'Non',
          'Acheté par': item.achetePar || '',
        });
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      matRows.length ? matRows : [{ info: 'Aucun matériau' }]
    ), 'Matériaux');

    // Onglet Plans & Documents (liste)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      plans.length ? plans.map((p: any) => ({
        Nom: p.nom || '',
        Date: p.date || '',
        'Ajouté par': p.addedBy || '',
        'Visible pour': p.visiblePour || 'tous',
      })) : [{ info: 'Aucun plan' }]
    ), 'Plans');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      docs.length ? docs.map(d => ({
        Type: d.type,
        Libellé: d.libelle,
        'Uploadé le': d.uploadedAt?.slice(0, 10) || '',
        'Uploadé par': d.uploadedBy || '',
        Commentaire: d.commentaire || '',
      })) : [{ info: 'Aucun document' }]
    ), 'Documents');

    // Télécharger l'Excel
    const xlsxBlob = new Blob(
      [XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
    triggerDownload(xlsxBlob, `${slug}_${dateStr}_données.xlsx`);

    // ── 2. ZIP MÉDIAS ──────────────────────────────────────────────────────
    const zip = new JSZip();
    let hasMedia = false;

    const addFileToZip = async (folder: string, filename: string, uri: string) => {
      try {
        if (!uri) return;
        if (uri.startsWith('data:')) {
          const base64 = uri.split(',')[1];
          if (base64) { zip.folder(folder)!.file(filename, base64, { base64: true }); hasMedia = true; }
        } else if (uri.startsWith('http')) {
          const res = await fetch(uri);
          if (res.ok) { zip.folder(folder)!.file(filename, await res.blob()); hasMedia = true; }
        }
      } catch {}
    };

    const ext = (uri: string, fallback = 'jpg') => {
      if (uri.startsWith('data:')) {
        const m = uri.match(/data:[^/]+\/([^;]+)/);
        return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : fallback;
      }
      return uri.split('.').pop()?.split('?')[0] || fallback;
    };

    // Photos chantier
    for (const p of photos) {
      if (p.uri) {
        const nom = `${p.date}_${p.employeId.slice(-4)}_${p.id.slice(-6)}.${ext(p.uri)}`;
        await addFileToZip('photos', nom, p.uri);
      }
    }

    // Plans
    for (const p of plans) {
      if (p.uri) {
        const nom = `${(p.nom || p.id).replace(/[^a-z0-9]/gi, '_')}.${ext(p.uri, 'pdf')}`;
        await addFileToZip('plans', nom, p.uri);
      }
    }

    // Documents de suivi
    for (const d of docs) {
      if (d.fichier) {
        const nom = `${d.type}_${(d.libelle || d.id).replace(/[^a-z0-9]/gi, '_')}.${ext(d.fichier, 'pdf')}`;
        await addFileToZip('documents', nom, d.fichier);
      }
      for (const photoUri of d.photos || []) {
        await addFileToZip('documents/photos', `${d.id}_${Date.now()}.${ext(photoUri)}`, photoUri);
      }
    }

    // Dépenses (photos / scans)
    for (const d of depenses) {
      if (d.fichier) {
        const nom = `${d.date}_${(d.libelle || d.id).replace(/[^a-z0-9]/gi, '_')}.${ext(d.fichier, 'pdf')}`;
        await addFileToZip('depenses', nom, d.fichier);
      }
    }

    if (hasMedia) {
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      triggerDownload(zipBlob, `${slug}_${dateStr}_médias.zip`);
    }

    setExportingId(null);
  };

  const handleClotureChantier = (chantier: Chantier) => {
    const msg = `Clôturer le chantier "${chantier.nom}" ?\n\nCela va :\n1. Exporter un fichier Excel (données)\n2. Exporter un ZIP (photos, plans, documents)\n3. Marquer le chantier comme terminé et le retirer du planning`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) {
        handleExportChantier(chantier).then(() => {
          updateChantier({ ...chantier, statut: 'termine', visibleSurPlanning: false });
        });
      }
    } else {
      Alert.alert('Clôturer le chantier', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Clôturer + Exporter', style: 'destructive', onPress: () => {
          handleExportChantier(chantier).then(() => {
            updateChantier({ ...chantier, statut: 'termine', visibleSurPlanning: false });
          });
        }},
      ]);
    }
  };

  const handleDelete = (id: string, nom: string) => {
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`${t.chantiers.deleteConfirm} "${nom}" ?`) : true)) deleteChantier(id);
    } else {
      Alert.alert(t.chantiers.delete, `${t.chantiers.deleteConfirm} "${nom}" ?`, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: () => deleteChantier(id) },
      ]);
    }
  };

  const toggleEmploye = (id: string) => {
    setForm(f => ({
      ...f,
      employeIds: f.employeIds.includes(id)
        ? f.employeIds.filter(e => e !== id)
        : [...f.employeIds, id],
    }));
  };

  // Zone 2 — Photo cachette clé (single, remplace fiche.photoEmplacementCle).
  const handleClePickNative = async (file: PickedFile): Promise<boolean> => {
    const fid = ficheId || 'new';
    const photoId = `cle_${fid}_${Date.now()}`;
    const url = await uploadFileToStorage(file.uri, `chantiers/${fid}/cle`, photoId);
    if (!url) {
      if (Platform.OS !== 'web') Alert.alert('Erreur', "Impossible d'uploader la photo");
      return false;
    }
    setFiche(f => ({ ...f, photoEmplacementCle: url }));
    return true;
  };

  // Zone 2 — Photo cachette clé via Inbox (Share Extension iOS).
  const handleClePickFromInbox = async (item: InboxItem): Promise<boolean> => {
    const fid = ficheId || 'new';
    const fileURI = getInboxItemPath(item);
    if (!fileURI) return false;
    const photoId = `cle_inbox_${item.id}`;
    const url = await uploadFileToStorage(fileURI, `chantiers/${fid}/cle`, photoId);
    if (!url) {
      if (Platform.OS !== 'web') Alert.alert('Erreur', "Impossible d'uploader la photo");
      return false;
    }
    setFiche(f => ({ ...f, photoEmplacementCle: url }));
    return true;
  };

  // Zone 1 — Photo Fiche Chantier (multi photos + PDF, push dans fiche.photos[]).
  // Path Storage 'chantiers/fiche/photos' — chantierId non utilisé (création en cours possible).
  const handleFichePickNative = async (file: PickedFile): Promise<boolean> => {
    const photoId = `fiche_photo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const storageUrl = await uploadFileToStorage(file.uri, 'chantiers/fiche/photos', photoId);
    if (!storageUrl) {
      if (Platform.OS !== 'web') Alert.alert('Erreur', "Erreur lors de l'upload de la photo. Veuillez réessayer.");
      return false;
    }
    setFiche(f => ({ ...f, photos: [...f.photos, storageUrl] }));
    return true;
  };

  // Zone 1 — Photos Fiche Chantier via Inbox iOS (Share Extension).
  const handleFichePickFromInbox = async (item: InboxItem): Promise<boolean> => {
    const fileURI = getInboxItemPath(item);
    if (!fileURI) return false;
    const photoId = `fiche_inbox_${item.id}`;
    const storageUrl = await uploadFileToStorage(fileURI, 'chantiers/fiche/photos', photoId);
    if (!storageUrl) {
      if (Platform.OS !== 'web') Alert.alert('Erreur', "Impossible d'uploader le fichier");
      return false;
    }
    setFiche(f => ({ ...f, photos: [...f.photos, storageUrl] }));
    return true;
  };

  const removePhoto = (idx: number) => {
    setFiche(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
  };

  // Récupération d'un apporteur par id (utilitaire)
  const apporteursAll = data.apporteurs || [];
  const getApporteurById = (id?: string): Apporteur | undefined => id ? apporteursAll.find(a => a.id === id) : undefined;

  // Liste filtrée des chantiers selon le filtre contact
  const chantiersFiltered = useMemo(() => {
    let list = data.chantiers;
    // Apporteur : ne voit que ses chantiers liés
    if (isApporteurUser && currentUser?.apporteurId) {
      const myId = currentUser.apporteurId;
      list = list.filter(c =>
        c.architecteId === myId ||
        c.apporteurId === myId ||
        c.contractantId === myId ||
        c.clientApporteurId === myId
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c =>
        c.nom.toLowerCase().includes(q) ||
        (c.adresse || '').toLowerCase().includes(q) ||
        (c.ville || '').toLowerCase().includes(q)
      );
    }
    if (filterContactType !== 'all') {
      const field: keyof Chantier =
        filterContactType === 'architecte'  ? 'architecteId' :
        filterContactType === 'apporteur'   ? 'apporteurId' :
        filterContactType === 'contractant' ? 'contractantId' :
                                               'clientApporteurId';
      if (filterContactId === 'all') {
        // Tous les chantiers liés à un contact de ce type (peu importe lequel)
        list = list.filter(c => !!(c as any)[field]);
      } else {
        list = list.filter(c => (c as any)[field] === filterContactId);
      }
    }
    return list;
  }, [data.chantiers, searchQuery, filterContactType, filterContactId, isApporteurUser, currentUser?.apporteurId]);

  const renderChantier = ({ item }: { item: Chantier }) => {
    const statut = STATUT_COLORS[item.statut];
    const assignedEmps = data.employes.filter(e => item.employeIds.includes(e.id));
    const notesActives = getNotesActives(item.id);
    const nbAchats = (data.depenses || data.depensesChantier || []).filter(d => d.chantierId === item.id).length;
    const nbPlans = item.fiche?.plans?.length ?? 0;
    const nbPhotos = (data.photosChantier || []).filter(p => p.chantierId === item.id).length;
    // Contacts liés (4 types)
    const archContact    = getApporteurById(item.architecteId);
    const apContact      = getApporteurById(item.apporteurId);
    const contractContact = getApporteurById(item.contractantId);
    const clientContact  = getApporteurById(item.clientApporteurId);
    const hasAnyContact = !!(archContact || apContact || contractContact || clientContact);

    return (
      <Pressable
        style={[styles.card, { borderLeftColor: item.couleur }]}
        onPress={() => { if (!isApporteurUser) setActionChantier(item); }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName}>{item.nom}</Text>
            <View style={[styles.statutBadge, { backgroundColor: statut.bg }]}>
              <Text style={[styles.statutText, { color: statut.text }]}>
                {STATUT_LABELS[item.statut]}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>📍 {[item.rue, item.ville].filter(Boolean).join(', ') || item.adresse || '—'}</Text>
          <Text style={styles.cardMetaText}>🕐 {item.dateDebut} → {item.dateFin}</Text>
        </View>

        {/* Badges contacts liés */}
        {hasAnyContact && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {archContact && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: APPORTEUR_TYPE_LABELS.architecte.couleur + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10 }}>{APPORTEUR_TYPE_LABELS.architecte.emoji}</Text>
                <Text style={{ fontSize: 10, color: APPORTEUR_TYPE_LABELS.architecte.couleur, fontWeight: '700' }} numberOfLines={1}>
                  {archContact.prenom} {archContact.nom}
                </Text>
              </View>
            )}
            {apContact && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: APPORTEUR_TYPE_LABELS.apporteur.couleur + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10 }}>{APPORTEUR_TYPE_LABELS.apporteur.emoji}</Text>
                <Text style={{ fontSize: 10, color: APPORTEUR_TYPE_LABELS.apporteur.couleur, fontWeight: '700' }} numberOfLines={1}>
                  {apContact.prenom} {apContact.nom}
                </Text>
              </View>
            )}
            {contractContact && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: APPORTEUR_TYPE_LABELS.contractant.couleur + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10 }}>{APPORTEUR_TYPE_LABELS.contractant.emoji}</Text>
                <Text style={{ fontSize: 10, color: APPORTEUR_TYPE_LABELS.contractant.couleur, fontWeight: '700' }} numberOfLines={1}>
                  {contractContact.prenom} {contractContact.nom}
                </Text>
              </View>
            )}
            {clientContact && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: APPORTEUR_TYPE_LABELS.client.couleur + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10 }}>{APPORTEUR_TYPE_LABELS.client.emoji}</Text>
                <Text style={{ fontSize: 10, color: APPORTEUR_TYPE_LABELS.client.couleur, fontWeight: '700' }} numberOfLines={1}>
                  {clientContact.prenom} {clientContact.nom}
                </Text>
              </View>
            )}
          </View>
        )}

        {assignedEmps.length > 0 && (
          <View style={styles.empTags}>
            {assignedEmps.map(emp => {
              const mc = METIER_COLORS[emp.metier];
              return (
                <View key={emp.id} style={[styles.empTag, { backgroundColor: mc.color }]}>
                  <Text style={[styles.empTagText, { color: mc.textColor }]}>{emp.prenom}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Indicateurs rapides */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          {notesActives.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 12 }}>📝</Text>
              <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>{notesActives.length}</Text>
            </View>
          )}
          {nbPlans > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 12 }}>📐</Text>
              <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>{nbPlans}</Text>
            </View>
          )}
          {nbPhotos > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 12 }}>📸</Text>
              <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>{nbPhotos}</Text>
            </View>
          )}
          {nbAchats > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 12 }}>🛒</Text>
              <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>{nbAchats}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer containerClassName="bg-[#F5EDE3]">
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.chantiers.title}</Text>
        {isAdmin && (
          <Pressable style={styles.newBtn} onPress={openNew}>
            <Text style={styles.newBtnText}>{t.common.new}</Text>
          </Pressable>
        )}
      </View>

      {/* Onglets Chantiers / SAV */}
      {isAdmin && (data.ticketsSAV || []).length > 0 && (
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 }}>
          <Pressable style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#F5EDE3' }, vueChantiersTab === 'chantiers' && { borderColor: '#2C2C2C', backgroundColor: '#2C2C2C' }]}
            onPress={() => setVueChantiersTab('chantiers')}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: vueChantiersTab === 'chantiers' ? '#fff' : '#687076' }}>🏗 Chantiers</Text>
          </Pressable>
          <Pressable style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#F5EDE3' }, vueChantiersTab === 'sav' && { borderColor: '#E74C3C', backgroundColor: '#E74C3C' }]}
            onPress={() => setVueChantiersTab('sav')}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: vueChantiersTab === 'sav' ? '#fff' : '#687076' }}>
              🔧 SAV ({(data.ticketsSAV || []).filter(t => t.statut !== 'clos').length})
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Vue SAV globale ── */}
      {vueChantiersTab === 'sav' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {(() => {
            const allTickets = (data.ticketsSAV || []).sort((a, b) => {
              const statutOrdre: Record<string, number> = { ouvert: 0, en_cours: 1, resolu: 2, clos: 3 };
              return (statutOrdre[a.statut] || 0) - (statutOrdre[b.statut] || 0) || b.createdAt.localeCompare(a.createdAt);
            });
            const prioColors: Record<string, string> = { basse: '#27AE60', normale: '#2C2C2C', haute: '#F59E0B', urgente: '#E74C3C' };
            const statutLabels: Record<string, { label: string; bg: string; text: string }> = {
              ouvert: { label: '🔴 Ouvert', bg: '#FEF2F2', text: '#DC2626' },
              en_cours: { label: '🟡 En cours', bg: '#FFF3CD', text: '#856404' },
              resolu: { label: '🟢 Résolu', bg: '#D4EDDA', text: '#155724' },
              clos: { label: '⚪ Clos', bg: '#F5EDE3', text: '#687076' },
            };

            if (allTickets.length === 0) return (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>🔧</Text>
                <Text style={{ fontSize: 15, color: '#687076' }}>Aucun ticket SAV</Text>
              </View>
            );

            // Stats
            const ouverts = allTickets.filter(t => t.statut === 'ouvert').length;
            const enCours = allTickets.filter(t => t.statut === 'en_cours').length;
            const resolus = allTickets.filter(t => t.statut === 'resolu').length;

            return (
              <>
                {/* Résumé */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  <View style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#DC2626' }}>{ouverts}</Text>
                    <Text style={{ fontSize: 10, color: '#DC2626', fontWeight: '600' }}>Ouverts</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#FFF3CD', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#856404' }}>{enCours}</Text>
                    <Text style={{ fontSize: 10, color: '#856404', fontWeight: '600' }}>En cours</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#D4EDDA', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#155724' }}>{resolus}</Text>
                    <Text style={{ fontSize: 10, color: '#155724', fontWeight: '600' }}>Résolus</Text>
                  </View>
                </View>

                {/* Liste */}
                {allTickets.map(t => {
                  const ch = data.chantiers.find(c => c.id === t.chantierId);
                  const st = statutLabels[t.statut] || statutLabels.ouvert;
                  const assigneEmp = t.assigneA ? data.employes.find(e => e.id === t.assigneA) : null;
                  return (
                    <Pressable key={t.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E6EA', borderLeftWidth: 4, borderLeftColor: prioColors[t.priorite] || '#2C2C2C' }}
                      onPress={() => { setSavChantierId(t.chantierId); }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C' }}>{t.objet}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <View style={{ backgroundColor: ch?.couleur || '#2C2C2C', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{ch?.nom || '?'}</Text>
                            </View>
                            <View style={{ backgroundColor: st.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: st.text }}>{st.label}</Text>
                            </View>
                            <Text style={{ fontSize: 9, color: '#B0BEC5' }}>Prio: {t.priorite}</Text>
                          </View>
                        </View>
                      </View>
                      {t.description && <Text style={{ fontSize: 11, color: '#687076', marginTop: 4 }} numberOfLines={2}>{t.description}</Text>}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 10, color: '#B0BEC5' }}>📅 {t.dateOuverture}</Text>
                        {assigneEmp && <Text style={{ fontSize: 10, color: '#2C2C2C' }}>👷 {assigneEmp.prenom} {assigneEmp.nom}</Text>}
                        {t.resoluPar && <Text style={{ fontSize: 10, color: '#27AE60' }}>✓ {t.resoluPar}</Text>}
                        {t.photos && t.photos.length > 0 && <Text style={{ fontSize: 10, color: '#687076' }}>📷 {t.photos.length}</Text>}
                      </View>
                    </Pressable>
                  );
                })}
              </>
            );
          })()}
        </ScrollView>
      )}

      {/* ── Vue Chantiers classique ── */}
      {(vueChantiersTab === 'chantiers' || (data.ticketsSAV || []).length === 0) && (
      <>
      {/* Barre de recherche */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un chantier..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} style={styles.searchClear}>
            <Text style={{ color: '#999', fontSize: 16 }}>&#10005;</Text>
          </Pressable>
        )}
      </View>

      {/* Filtre par type de contact */}
      {isAdmin && (
        <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Pressable
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: filterContactType === 'all' ? '#2C2C2C' : '#E8DDD0', backgroundColor: filterContactType === 'all' ? '#2C2C2C' : '#F5EDE3' }}
              onPress={() => { setFilterContactType('all'); setFilterContactId('all'); }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: filterContactType === 'all' ? '#fff' : '#687076' }}>Tous les chantiers</Text>
            </Pressable>
            {(['architecte', 'apporteur', 'contractant', 'client'] as const).map(ty => {
              const meta = APPORTEUR_TYPE_LABELS[ty];
              const active = filterContactType === ty;
              return (
                <Pressable
                  key={ty}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: active ? meta.couleur : '#E8DDD0', backgroundColor: active ? meta.couleur : '#F5EDE3' }}
                  onPress={() => { setFilterContactType(ty); setFilterContactId('all'); }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : '#687076' }}>
                    {meta.emoji} Par {meta.label.toLowerCase()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Sous-sélecteur : liste des contacts de ce type */}
          {filterContactType !== 'all' && (() => {
            const listOfThisType = apporteursAll.filter(a => a.type === filterContactType);
            if (listOfThisType.length === 0) {
              return (
                <Text style={{ fontSize: 11, color: '#8C8077', marginTop: 8, fontStyle: 'italic' }}>
                  Aucun {APPORTEUR_TYPE_LABELS[filterContactType].label.toLowerCase()} enregistré.
                </Text>
              );
            }
            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                <Pressable
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: filterContactId === 'all' ? '#2C2C2C' : '#E8DDD0', backgroundColor: filterContactId === 'all' ? '#E8DDD0' : '#fff' }}
                  onPress={() => setFilterContactId('all')}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#2C2C2C' }}>Tous</Text>
                </Pressable>
                {listOfThisType.map(a => (
                  <Pressable
                    key={a.id}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: filterContactId === a.id ? '#2C2C2C' : '#E8DDD0', backgroundColor: filterContactId === a.id ? '#2C2C2C' : '#fff' }}
                    onPress={() => setFilterContactId(a.id)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: filterContactId === a.id ? '#fff' : '#2C2C2C' }}>
                      {a.prenom} {a.nom}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            );
          })()}
        </View>
      )}

      <FlatList
        data={chantiersFiltered}
        keyExtractor={item => item.id}
        renderItem={renderChantier}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t.chantiers.noChantiers}</Text>
            {isAdmin && <Text style={styles.emptyHint}>{t.chantiers.noChantierHint}</Text>}
          </View>
        }
      />
      </>
      )}

      {/* ── Modal menu actions chantier ── */}
      <Modal visible={actionChantier !== null} transparent animationType="fade" onRequestClose={() => setActionChantier(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setActionChantier(null)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 20, paddingHorizontal: 16 }}>
            {actionChantier && (() => {
              const ch = actionChantier;
              const statut = STATUT_COLORS[ch.statut];
              const notesCount = getNotesActives(ch.id).length;
              const plansCount = ch.fiche?.plans?.length ?? 0;
              const photosCount = (data.photosChantier || []).filter(p => p.chantierId === ch.id).length;
              const achatsCount = (data.depenses || data.depensesChantier || []).filter(d => d.chantierId === ch.id).length;
              const marchesCount = ((data.marchesChantier || []).filter(m => m.chantierId === ch.id).length)
                + ((data.supplementsMarche || []).filter(s => s.chantierId === ch.id).length);

              const notesPlanningCount = data.affectations.filter(a => a.chantierId === ch.id && (a.notes || []).length > 0).reduce((s, a) => s + a.notes.length, 0);

              const actions = [
                { icon: '🪪', label: 'Fiche', badge: 0, onPress: () => { const c = ch; setActionChantier(null); setTimeout(() => { openFicheUnifiee(c); }, 100); } },
                { icon: '📐', label: 'Plans', badge: plansCount, onPress: () => { const c = ch; setActionChantier(null); setTimeout(() => openPlans(c), 100); } },
                { icon: '📝', label: 'Notes', badge: notesCount, onPress: () => { const c = ch; setActionChantier(null); setTimeout(() => openNotes(c), 100); } },
                { icon: '📋', label: 'Suivi', badge: notesPlanningCount, onPress: () => { const id = ch.id; setActionChantier(null); setTimeout(() => setSuiviChantierId(id), 100); } },
                { icon: '📸', label: 'Photos', badge: photosCount, onPress: () => { const id = ch.id; setActionChantier(null); setTimeout(() => setShowGalerie(id), 100); } },
                { icon: '📍', label: 'Y aller', badge: 0, onPress: () => { const adr = ch.adresse; setActionChantier(null); setTimeout(() => openDirectionsHelper(adr), 100); } },
                ...(isAdmin ? [{ icon: '💼', label: 'Marchés', badge: marchesCount, onPress: () => { const id = ch.id; setActionChantier(null); setTimeout(() => setMarchesChantierId(id), 100); } }] : []),
                ...(isAdmin ? [{ icon: '🔧', label: 'SAV', badge: ((data.ticketsSAV || []).filter(t => t.chantierId === ch.id && t.statut !== 'clos').length), onPress: () => { const id = ch.id; setActionChantier(null); setTimeout(() => setSavChantierId(id), 100); } }] : []),
                ...(isAdmin ? [{ icon: '🛒', label: 'Achats', badge: achatsCount, onPress: () => { const id = ch.id; setActionChantier(null); setTimeout(() => setAchatsChantierId(id), 100); } }] : []),
                ...(isAdmin ? [{ icon: '💰', label: 'Finances', badge: 0, onPress: () => { const id = ch.id; setActionChantier(null); setTimeout(() => setBilanChantierId(id), 100); } }] : []),
                ...(isAdmin ? [{ icon: '👤', label: 'Portail client', badge: 0, onPress: () => { const id = ch.id; setActionChantier(null); setTimeout(() => setPortailClientId(id), 100); } }] : []),
                ...(isAdmin && ch.statut !== 'termine' ? [{ icon: '✅', label: 'Clôturer', badge: 0, onPress: () => { const c = ch; setActionChantier(null); setTimeout(() => handleClotureChantier(c), 100); } }] : []),
                ...(isAdmin ? [{ icon: '🗑', label: 'Supprimer', badge: 0, danger: true, onPress: () => { const id = ch.id; const nom = ch.nom; setActionChantier(null); setTimeout(() => handleDelete(id, nom), 100); } }] : []),
              ];

              return (
                <>
                  {/* En-tête chantier */}
                  <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 40, height: 4, backgroundColor: '#E2E6EA', borderRadius: 2, marginBottom: 12 }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: ch.couleur }} />
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#11181C' }}>{ch.nom}</Text>
                    </View>
                    <View style={[styles.statutBadge, { backgroundColor: statut.bg, marginTop: 6 }]}>
                      <Text style={[styles.statutText, { color: statut.text }]}>{STATUT_LABELS[ch.statut]}</Text>
                    </View>
                  </View>

                  {/* Grille d'actions */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
                    {actions.map((a, i) => (
                      <Pressable
                        key={i}
                        style={{ width: 80, height: 80, borderRadius: 16, backgroundColor: (a as any).danger ? '#FEF2F2' : '#F5EDE3', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                        onPress={a.onPress}
                      >
                        <Text style={{ fontSize: 28 }}>{a.icon}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: (a as any).danger ? '#E74C3C' : '#11181C', marginTop: 4 }}>{a.label}</Text>
                        {a.badge > 0 && (
                          <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: '#2C2C2C', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{a.badge}</Text>
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>

                  {/* Changement rapide de statut */}
                  {isAdmin && (
                    <View style={{ marginTop: 16 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#687076', textAlign: 'center', marginBottom: 6 }}>Changer le statut :</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, justifyContent: 'center', paddingHorizontal: 8 }}>
                        {STATUTS.map(s => {
                          const st = STATUT_COLORS[s];
                          const active = ch.statut === s;
                          return (
                            <Pressable key={s} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: active ? st.bg : '#F5EDE3', borderWidth: 1.5, borderColor: active ? st.text : '#E2E6EA' }}
                              onPress={() => { updateChantier({ ...ch, statut: s }); setActionChantier(null); }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: active ? st.text : '#687076' }}>{STATUT_LABELS[s]}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* ── Modal formulaire chantier (admin) ── */}
      <ModalKeyboard visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowForm(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? t.chantiers.edit : t.chantiers.add}</Text>
              <Pressable onPress={() => setShowForm(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }} keyboardShouldPersistTaps="handled">
              <FormField label={t.common.siteName}>
                <TextInput
                  style={styles.input}
                  value={form.nom}
                  onChangeText={v => setForm(f => ({ ...f, nom: v }))}
                  placeholder="Ex: Villa Dupont"
                  placeholderTextColor="#B0BEC5"
                  returnKeyType="next"
                />
              </FormField>

              <FormField label="Rue">
                <TextInput
                  style={styles.input}
                  value={form.rue}
                  onChangeText={v => setForm(f => ({ ...f, rue: v }))}
                  placeholder="Ex: 45 avenue Foch"
                  placeholderTextColor="#B0BEC5"
                  returnKeyType="next"
                />
              </FormField>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ width: 110 }}>
                  <FormField label="Code Postal">
                    <TextInput
                      style={styles.input}
                      value={form.codePostal}
                      onChangeText={v => setForm(f => ({ ...f, codePostal: v }))}
                      placeholder="75016"
                      placeholderTextColor="#B0BEC5"
                      keyboardType="number-pad"
                      returnKeyType="next"
                    />
                  </FormField>
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Ville">
                    <TextInput
                      style={styles.input}
                      value={form.ville}
                      onChangeText={v => setForm(f => ({ ...f, ville: v }))}
                      placeholder="Paris"
                      placeholderTextColor="#B0BEC5"
                      returnKeyType="next"
                    />
                  </FormField>
                </View>
              </View>

              <FormField label="Pays">
                <TextInput
                  style={styles.input}
                  value={form.pays}
                  onChangeText={v => setForm(f => ({ ...f, pays: v }))}
                  placeholder="France"
                  placeholderTextColor="#B0BEC5"
                  returnKeyType="next"
                />
              </FormField>

              {/* Ancienne adresse libre (fallback) : affichée uniquement si l'ancien chantier
                  n'a QUE le champ legacy (rue/ville non renseignés) pour éviter la perte de données. */}
              {!!form.adresse && !form.rue && !form.ville && (
                <FormField label="Adresse (ancienne saisie)">
                  <TextInput
                    style={styles.input}
                    value={form.adresse}
                    onChangeText={v => setForm(f => ({ ...f, adresse: v }))}
                    placeholder="Ex: 12 rue des Lilas, Paris"
                    placeholderTextColor="#B0BEC5"
                    returnKeyType="next"
                  />
                </FormField>
              )}

              <View style={styles.dateRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <DatePicker
                    label={t.common.startDate}
                    value={form.dateDebut}
                    onChange={v => setForm(f => ({ ...f, dateDebut: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <DatePicker
                    label={t.common.endDate}
                    value={form.dateFin}
                    onChange={v => setForm(f => ({ ...f, dateFin: v }))}
                    minDate={form.dateDebut || undefined}
                  />
                </View>
              </View>

              <FormField label={t.common.status}>
                <View style={styles.chipRow}>
                  {STATUTS.map(s => (
                    <Pressable
                      key={s}
                      style={[styles.chip, form.statut === s && styles.chipActive]}
                      onPress={() => setForm(f => ({ ...f, statut: s }))}
                    >
                      <Text style={[styles.chipText, form.statut === s && styles.chipTextActive]}>
                        {STATUT_LABELS[s]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </FormField>

              <FormField label={t.common.color}>
                <View style={styles.colorRow}>
                  {CHANTIER_COLORS.map(c => (
                    <Pressable
                      key={c}
                      style={[styles.colorSwatch, { backgroundColor: c }, form.couleur === c && styles.colorSwatchActive]}
                      onPress={() => setForm(f => ({ ...f, couleur: c }))}
                    />
                  ))}
                </View>
              </FormField>

              <FormField label={t.common.assignedEmployees}>
                {data.employes.map(emp => {
                  const mc = METIER_COLORS[emp.metier];
                  const selected = form.employeIds.includes(emp.id);
                  return (
                    <Pressable
                      key={emp.id}
                      style={[styles.empRow, selected && styles.empRowSelected]}
                      onPress={() => toggleEmploye(emp.id)}
                    >
                      <View style={[styles.empAvatar, { backgroundColor: mc.color }]}>
                        <Text style={[styles.empAvatarText, { color: mc.textColor }]}>{emp.prenom?.[0] || '?'}</Text>
                      </View>
                      <Text style={styles.empRowName}>{emp.prenom} {emp.nom}</Text>
                      <Text style={styles.empRowMetier}>{mc.label}</Text>
                      {selected && <Text style={styles.empCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </FormField>

              {/* ═══ Section Contacts (4 types) ═══ */}
              <View style={{ marginTop: 8, padding: 12, backgroundColor: '#FAF7F3', borderRadius: 12, borderWidth: 1, borderColor: '#E8DDD0' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C', marginBottom: 10 }}>🤝 Contacts</Text>

                {(['architecte', 'apporteur', 'contractant', 'client'] as const).map((ty) => {
                  const meta = APPORTEUR_TYPE_LABELS[ty];
                  const field: keyof ChantierForm =
                    ty === 'architecte'  ? 'architecteId' :
                    ty === 'apporteur'   ? 'apporteurId' :
                    ty === 'contractant' ? 'contractantId' :
                                            'clientApporteurId';
                  const selectedId = form[field] as string;
                  const listOfThisType = apporteursAll.filter(a => a.type === ty);
                  return (
                    <View key={ty} style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: meta.couleur, marginBottom: 6 }}>
                        {meta.emoji} {meta.label}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        <Pressable
                          onPress={() => setForm(f => ({ ...f, [field]: '' }))}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: !selectedId ? '#2C2C2C' : '#E8DDD0', backgroundColor: !selectedId ? '#E8DDD0' : '#fff' }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#2C2C2C' }}>Aucun</Text>
                        </Pressable>
                        {listOfThisType.map(a => {
                          const active = selectedId === a.id;
                          return (
                            <Pressable
                              key={a.id}
                              onPress={() => setForm(f => ({ ...f, [field]: a.id }))}
                              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: active ? meta.couleur : '#E8DDD0', backgroundColor: active ? meta.couleur : '#fff' }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : '#2C2C2C' }}>
                                {a.prenom} {a.nom}{a.societe ? ` · ${a.societe}` : ''}
                              </Text>
                            </Pressable>
                          );
                        })}
                        <Pressable
                          onPress={() => goCreateApporteur(ty)}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: meta.couleur, backgroundColor: '#fff' }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: meta.couleur }}>+ Ajouter</Text>
                        </Pressable>
                      </ScrollView>
                      {ty === 'client' && !selectedId && (
                        <Pressable
                          onPress={openQuickClient}
                          style={{ marginTop: 8, backgroundColor: meta.couleur, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                            ⚡ Créer un client + espace client immédiat
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>

              <FormField label={t.common.visibleOnPlanning}>
                <Pressable
                  style={[styles.toggleBtn, form.visibleSurPlanning && styles.toggleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, visibleSurPlanning: !f.visibleSurPlanning }))}
                >
                  <Text style={[styles.toggleBtnText, form.visibleSurPlanning && styles.toggleBtnTextActive]}>
                    {form.visibleSurPlanning ? t.common.yes : t.common.no}
                  </Text>
                </Pressable>
              </FormField>

              <FormField label="📅 Afficher le planning au client">
                <Pressable
                  style={[styles.toggleBtn, form.afficherPlanningAuClient && styles.toggleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, afficherPlanningAuClient: !f.afficherPlanningAuClient }))}
                >
                  <Text style={[styles.toggleBtnText, form.afficherPlanningAuClient && styles.toggleBtnTextActive]}>
                    {form.afficherPlanningAuClient ? 'Oui — le client voit le planning' : 'Non — masqué au client'}
                  </Text>
                </Pressable>
                <Text style={{ fontSize: 10, color: '#8C8077', marginTop: 4, lineHeight: 14 }}>
                  Les architectes et apporteurs voient toujours le planning. Cette option contrôle uniquement ce que voit le client.
                </Text>
              </FormField>
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, !form.nom.trim() && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!form.nom.trim()}
            >
              <Text style={styles.saveBtnText}>{editId ? t.common.save : t.chantiers.add}</Text>
            </Pressable>
          </View>
        </View>
      </ModalKeyboard>

      {/* ── Modal Création rapide client + espace client ── */}
      <ModalKeyboard visible={showQuickClient} animationType="fade" transparent onRequestClose={() => setShowQuickClient(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <ScrollView style={{ maxHeight: '92%' }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
              {!quickClientCreds ? (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginBottom: 6 }}>⚡ Nouveau client</Text>
                  <Text style={{ fontSize: 12, color: '#687076', marginBottom: 14 }}>
                    Créez un client et son accès en une étape. Un identifiant + mot de passe sont générés automatiquement.
                  </Text>

                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginBottom: 4 }}>Prénom *</Text>
                  <TextInput
                    style={styles.input}
                    value={quickClient.prenom}
                    onChangeText={v => setQuickClient(f => ({ ...f, prenom: v }))}
                    placeholder="Jean"
                    autoCapitalize="words"
                  />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 10, marginBottom: 4 }}>Nom *</Text>
                  <TextInput
                    style={styles.input}
                    value={quickClient.nom}
                    onChangeText={v => setQuickClient(f => ({ ...f, nom: v }))}
                    placeholder="Dupont"
                    autoCapitalize="words"
                  />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 10, marginBottom: 4 }}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={quickClient.email}
                    onChangeText={v => setQuickClient(f => ({ ...f, email: v }))}
                    placeholder="jean.dupont@mail.fr"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 10, marginBottom: 4 }}>Téléphone</Text>
                  <TextInput
                    style={styles.input}
                    value={quickClient.telephone}
                    onChangeText={v => setQuickClient(f => ({ ...f, telephone: v }))}
                    placeholder="06 12 34 56 78"
                    keyboardType="phone-pad"
                  />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 10, marginBottom: 4 }}>Société (optionnel)</Text>
                  <TextInput
                    style={styles.input}
                    value={quickClient.societe}
                    onChangeText={v => setQuickClient(f => ({ ...f, societe: v }))}
                    placeholder="SAS Exemple"
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                    <Pressable onPress={() => setShowQuickClient(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
                    </Pressable>
                    <Pressable
                      onPress={saveQuickClient}
                      disabled={!quickClient.prenom.trim() || !quickClient.nom.trim() || quickClientSaving}
                      style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: (!quickClient.prenom.trim() || !quickClient.nom.trim() || quickClientSaving) ? 0.5 : 1 }}
                    >
                      <Text style={{ color: '#C9A96E', fontWeight: '800' }}>{quickClientSaving ? 'Création…' : 'Créer le client'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#2E7D32', marginBottom: 6 }}>✓ Client créé</Text>
                  <Text style={{ fontSize: 12, color: '#687076', marginBottom: 14 }}>
                    Le client a été créé et rattaché à ce chantier. Transmettez-lui les identifiants ci-dessous.
                  </Text>
                  <View style={{ backgroundColor: '#FAF7F3', borderRadius: 10, padding: 14, borderLeftWidth: 4, borderLeftColor: '#C9A96E' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#8C6D2F', textTransform: 'uppercase' }}>Identifiant</Text>
                    <Text selectable style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginTop: 4, marginBottom: 10 }}>
                      {quickClientCreds.identifiant}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#8C6D2F', textTransform: 'uppercase' }}>Mot de passe</Text>
                    <Text selectable style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginTop: 4 }}>
                      {quickClientCreds.motDePasse}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#8C8077', marginTop: 10, fontStyle: 'italic' }}>
                      Ces identifiants restent disponibles dans la fiche client (Équipe → Apporteurs).
                    </Text>
                  </View>
                  {Platform.OS === 'web' && (
                    <Pressable
                      onPress={() => {
                        try {
                          const txt = `Espace client SK DECO\nLien : https://sk-deco-planning.vercel.app\nIdentifiant : ${quickClientCreds.identifiant}\nMot de passe : ${quickClientCreds.motDePasse}`;
                          // @ts-ignore
                          navigator.clipboard?.writeText(txt);
                        } catch {}
                      }}
                      style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 }}
                    >
                      <Text style={{ color: '#C9A96E', fontWeight: '800' }}>📋 Copier (lien + identifiants)</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setShowQuickClient(false)}
                    style={{ backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 }}
                  >
                    <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Fermer</Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </ModalKeyboard>

      {/* ── Modal Fiche Chantier Unifié (Fiche + Modifier) ── */}
      <ModalKeyboard visible={showFiche} animationType="slide" transparent onRequestClose={() => setShowFiche(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 0.05 }} onPress={() => setShowFiche(false)} />
          <View style={styles.modalSheetFiche}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🪪 {t.chantiers.ficheChantier}</Text>
                <Text style={styles.modalSubtitle}>
                  {data.chantiers.find(c => c.id === ficheId)?.nom ?? ''}
                </Text>
              </View>
              <Pressable onPress={() => setShowFiche(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            {/* Titre */}

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              {ficheOnglet === 'fiche' && (
                <>
              {/* ═══ FICHE CHANTIER REFONDÉE ═══ */}

              {/* Adresse */}
              <View style={styles.ficheSection}>
                <Text style={styles.ficheSectionIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheSectionLabel}>Adresse</Text>
                  {isAdmin ? (
                    <TextInput style={styles.ficheInput} value={form.adresse} onChangeText={v => setForm(f => ({ ...f, adresse: v }))} placeholder="Rue" />
                  ) : (
                    <Text style={{ fontSize: 14, color: '#11181C' }}>{form.adresse || '—'}</Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <View style={{ width: 80 }}>
                      {isAdmin ? (
                        <TextInput style={styles.ficheInput} value={(() => { const c = data.chantiers.find(c2 => c2.id === ficheId); return c?.codePostal || ''; })()} onChangeText={v => { if (!ficheId) return; const c = data.chantiers.find(c2 => c2.id === ficheId); if (c) updateChantier({ ...c, codePostal: v }); }} placeholder="CP" keyboardType="number-pad" />
                      ) : (
                        <Text style={{ fontSize: 14, color: '#11181C' }}>{data.chantiers.find(c => c.id === ficheId)?.codePostal || '—'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      {isAdmin ? (
                        <TextInput style={styles.ficheInput} value={(() => { const c = data.chantiers.find(c2 => c2.id === ficheId); return c?.ville || ''; })()} onChangeText={v => { if (!ficheId) return; const c = data.chantiers.find(c2 => c2.id === ficheId); if (c) updateChantier({ ...c, ville: v }); }} placeholder="Ville" />
                      ) : (
                        <Text style={{ fontSize: 14, color: '#11181C' }}>{data.chantiers.find(c => c.id === ficheId)?.ville || '—'}</Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>

              {/* Code accès */}
              <View style={styles.ficheSection}>
                <Text style={styles.ficheSectionIcon}>🔢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheSectionLabel}>{t.common.accessCode}</Text>
                  <TextInput
                    style={styles.ficheInput}
                    value={fiche.codeAcces}
                    onChangeText={v => setFiche(f => ({ ...f, codeAcces: v }))}
                    placeholder="Ex: 1234A"
                    placeholderTextColor="#B0BEC5"
                    editable={isAdmin}
                  />
                </View>
              </View>

              {/* Emplacement clé */}
              <View style={styles.ficheSection}>
                <Text style={styles.ficheSectionIcon}>🔑</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheSectionLabel}>{t.common.keyLocation}</Text>
                  <TextInput
                    style={styles.ficheInput}
                    value={fiche.emplacementCle}
                    onChangeText={v => setFiche(f => ({ ...f, emplacementCle: v }))}
                    placeholder="Ex: Boîte à clé sous le compteur, code 5678"
                    placeholderTextColor="#B0BEC5"
                    multiline
                    editable={isAdmin}
                  />
                  {/* Photo cachette clé */}
                  {fiche.photoEmplacementCle && (
                    <View style={{ marginTop: 8, position: 'relative', alignSelf: 'flex-start' }}>
                      <Pressable
                        onPress={() => openDocPreview(fiche.photoEmplacementCle!)}
                        accessibilityRole="button"
                        accessibilityLabel="Ouvrir la photo cachette"
                      >
                        <View style={{ width: 100, height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F5EDE3' }}>
                          <Image source={{ uri: fiche.photoEmplacementCle }} style={{ width: 100, height: 100 }} resizeMode="cover" />
                        </View>
                      </Pressable>
                      {isAdmin && (
                        <Pressable
                          style={styles.photoRemove}
                          onPress={() => {
                            const doDelete = () => setFiche(f => ({ ...f, photoEmplacementCle: '' }));
                            if (Platform.OS === 'web') {
                              if (typeof window !== 'undefined' && window.confirm && window.confirm('Supprimer la photo cachette ?')) doDelete();
                            } else {
                              Alert.alert('Supprimer la photo ?', 'La photo cachette sera retirée de la fiche.', [
                                { text: 'Annuler', style: 'cancel' },
                                { text: 'Supprimer', style: 'destructive', onPress: doDelete },
                              ]);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Supprimer la photo cachette"
                        >
                          <Text style={styles.photoRemoveText}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                  {isAdmin && (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      <NativeFilePickerButton
                        onPick={handleClePickNative}
                        acceptImages
                        acceptCamera
                        acceptPdf={false}
                        multiple={false}
                        compressImages
                        label={fiche.photoEmplacementCle ? '📷 Changer la photo' : '📷 Ajouter photo cachette'}
                      />
                      <InboxPickerButton
                        onPick={handleClePickFromInbox}
                        mimeFilter={(m) => m.startsWith('image/')}
                      />
                    </View>
                  )}
                </View>
              </View>

              {/* Code alarme */}
              <View style={styles.ficheSection}>
                <Text style={styles.ficheSectionIcon}>🚨</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheSectionLabel}>{t.common.alarmCode}</Text>
                  <TextInput
                    style={styles.ficheInput}
                    value={fiche.codeAlarme}
                    onChangeText={v => setFiche(f => ({ ...f, codeAlarme: v }))}
                    placeholder="Ex: 9876 — désactiver en 30 sec"
                    placeholderTextColor="#B0BEC5"
                    editable={isAdmin}
                  />
                </View>
              </View>

              {/* Contacts */}
              <View style={styles.ficheSection}>
                <Text style={styles.ficheSectionIcon}>📞</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheSectionLabel}>{t.common.usefulContacts}</Text>
                  <TextInput
                    style={[styles.ficheInput, { minHeight: 72, textAlignVertical: 'top' }]}
                    value={fiche.contacts}
                    onChangeText={v => setFiche(f => ({ ...f, contacts: v }))}
                    placeholder="Ex: Gardien : M. Dupont — 06 12 34 56 78&#10;Propriétaire : Mme Martin — 06 98 76 54 32"
                    placeholderTextColor="#B0BEC5"
                    multiline
                    editable={isAdmin}
                  />
                </View>
              </View>

              {/* Notes libres */}
              <View style={styles.ficheSection}>
                <Text style={styles.ficheSectionIcon}>📝</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheSectionLabel}>{t.common.notesInfo}</Text>
                  <TextInput
                    style={[styles.ficheInput, { minHeight: 100, textAlignVertical: 'top' }]}
                    value={fiche.notes}
                    onChangeText={v => setFiche(f => ({ ...f, notes: v }))}
                    placeholder="Ex: Ascenseur en panne, utiliser l'escalier B. Parking réservé devant l'entrée."
                    placeholderTextColor="#B0BEC5"
                    multiline
                    editable={isAdmin}
                  />
                </View>
              </View>

              {/* Photos / Plans / PDF */}
              <View style={styles.ficheSectionPhotos}>
                <Text style={styles.ficheSectionLabel}>{t.common.photosPlans}</Text>
                <View style={styles.photosGrid}>
                  {fiche.photos.map((uri, idx) => {
                    const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                    return (
                      <View key={idx} style={styles.photoWrap}>
                        {isPdf ? (
                          <Pressable
                            style={styles.pdfThumb}
                            onPress={() => openDocPreview(uri)}
                            accessibilityRole="button"
                            accessibilityLabel="Ouvrir le PDF"
                          >
                            <Text style={styles.pdfThumbIcon}>📄</Text>
                            <Text style={styles.pdfThumbText}>PDF</Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => openDocPreview(uri)}
                            accessibilityRole="button"
                            accessibilityLabel="Ouvrir la photo"
                          >
                            <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                          </Pressable>
                        )}
                        {isAdmin && (
                          <Pressable
                            style={styles.photoRemove}
                            onPress={() => {
                              const doDelete = () => removePhoto(idx);
                              if (Platform.OS === 'web') {
                                if (typeof window !== 'undefined' && window.confirm && window.confirm('Supprimer ce fichier ?')) doDelete();
                              } else {
                                Alert.alert('Supprimer le fichier ?', 'Cette action est irréversible.', [
                                  { text: 'Annuler', style: 'cancel' },
                                  { text: 'Supprimer', style: 'destructive', onPress: doDelete },
                                ]);
                              }
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Supprimer le fichier"
                          >
                            <Text style={styles.photoRemoveText}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  {isAdmin && (
                    <NativeFilePickerButton
                      onPick={handleFichePickNative}
                      acceptImages
                      acceptCamera
                      acceptPdf
                      multiple
                      compressImages
                      buttonStyle={styles.photoAdd}
                      label={`+ ${t.common.add}`}
                    />
                  )}
                </View>
                {isAdmin && (
                  <View style={{ marginTop: 8 }}>
                    <InboxPickerButton
                      onPick={handleFichePickFromInbox}
                      mimeFilter={inboxMimeFilterImagePdf}
                    />
                  </View>
                )}
              </View>

              {/* ═══ CONFIGURATION CHANTIER (admin) ═══ */}
              {isAdmin && (
                <>
                  {/* Dates */}
                  <View style={{ marginTop: 12 }}>
                    <View style={styles.dateRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <DatePicker label="Date de début" value={form.dateDebut} onChange={v => setForm(f => ({ ...f, dateDebut: v }))} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <DatePicker label="Date de fin" value={form.dateFin} onChange={v => setForm(f => ({ ...f, dateFin: v }))} minDate={form.dateDebut || undefined} />
                      </View>
                    </View>
                  </View>

                  {/* Statut */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.ficheSectionLabel}>Statut</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
                      {STATUTS.map(s => (
                        <Pressable key={s} style={[styles.chip, form.statut === s && styles.chipActive]} onPress={() => setForm(f => ({ ...f, statut: s }))}>
                          <Text style={[styles.chipText, form.statut === s && styles.chipTextActive]}>{STATUT_LABELS[s]}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Couleur — avec indication si déjà prise */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.ficheSectionLabel}>Couleur associée</Text>
                    <View style={styles.colorRow}>
                      {CHANTIER_COLORS.map(c => {
                        const usedBy = data.chantiers.find(ch => ch.couleur === c && ch.id !== ficheId && ch.statut !== 'termine');
                        return (
                          <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, form.couleur === c && styles.colorSwatchActive, usedBy && form.couleur !== c && { opacity: 0.3 }]} onPress={() => setForm(f => ({ ...f, couleur: c }))}>
                            {usedBy && form.couleur !== c && <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>✕</Text>}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Visible sur le planning */}
                  <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.ficheSectionLabel}>Visible sur le planning</Text>
                    <Pressable style={[styles.toggleBtn, form.visibleSurPlanning && styles.toggleBtnActive]} onPress={() => setForm(f => ({ ...f, visibleSurPlanning: !f.visibleSurPlanning }))}>
                      <Text style={[styles.toggleBtnText, form.visibleSurPlanning && styles.toggleBtnTextActive]}>{form.visibleSurPlanning ? 'Oui' : 'Non'}</Text>
                    </Pressable>
                  </View>

                  {/* Employés et sous-traitants affiliés (via le planning) */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.ficheSectionLabel}>Équipe affiliée au chantier</Text>
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {(() => {
                        // Employés ayant une affectation sur ce chantier
                        const empIds = [...new Set(data.affectations.filter(a => a.chantierId === ficheId && !a.soustraitantId).map(a => a.employeId))];
                        const stIds = [...new Set(data.affectations.filter(a => a.chantierId === ficheId && a.soustraitantId).map(a => a.soustraitantId!))];
                        const emps = empIds.map(id => data.employes.find(e => e.id === id)).filter(Boolean) as typeof data.employes;
                        const sts = stIds.map(id => data.sousTraitants.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
                        if (emps.length === 0 && sts.length === 0) return <Text style={{ fontSize: 12, color: '#687076', fontStyle: 'italic' }}>Aucun employé affecté via le planning</Text>;
                        return (
                          <>
                            {emps.map(emp => {
                              const mc = METIER_COLORS[emp.metier];
                              return (
                                <View key={emp.id} style={[styles.empRow, styles.empRowSelected]}>
                                  <View style={[styles.empAvatar, { backgroundColor: mc.color }]}>
                                    <Text style={[styles.empAvatarText, { color: mc.textColor }]}>{emp.prenom?.[0] || '?'}</Text>
                                  </View>
                                  <Text style={styles.empRowName}>{emp.prenom} {emp.nom}</Text>
                                  <Text style={styles.empRowMetier}>{mc.label}</Text>
                                </View>
                              );
                            })}
                            {sts.map(st => (
                              <View key={st.id} style={[styles.empRow, { backgroundColor: '#E0F7FA' }]}>
                                <View style={[styles.empAvatar, { backgroundColor: st.couleur || '#00BCD4' }]}>
                                  <Text style={styles.empAvatarText}>{(st.prenom || st.societe || 'S')[0]}</Text>
                                </View>
                                <Text style={styles.empRowName}>{st.societe || `${st.prenom} ${st.nom}`}</Text>
                                <Text style={styles.empRowMetier}>Sous-traitant</Text>
                              </View>
                            ))}
                          </>
                        );
                      })()}
                    </View>
                  </View>
                </>
              )}

              {fiche.updatedAt ? (
                <Text style={styles.ficheUpdated}>
                  Dernière mise à jour : {new Date(fiche.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
                </>
              )}

              {/* Achats déplacés dans modal séparé via menu d'actions */}
              {false && ficheId && (() => {
                const achats = (data.depenses || data.depensesChantier || []).filter(d => d.chantierId === ficheId);
                const totalAchats = achats.reduce((s, d) => s + (d.montant || 0), 0);
                const todayStr2 = new Date().toISOString().slice(0, 10);

                return (
                  <>
                    {/* Total */}
                    <View style={{ backgroundColor: '#EEF2F8', borderRadius: 14, padding: 14, marginBottom: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: '#2C2C2C' }}>{totalAchats.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</Text>
                      <Text style={{ fontSize: 12, color: '#687076' }}>Total achats ({achats.length} dépense{achats.length > 1 ? 's' : ''})</Text>
                    </View>

                    {/* Bouton ajouter */}
                    <Pressable
                      style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12 }}
                      onPress={() => { setAchatForm({ libelle: '', montantHT: '', montantTTC: '', date: todayStr2, fournisseur: '', fichier: '', note: '' }); setShowAchatFormFiche(v => !v); }}
                    >
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{showAchatFormFiche ? '✕ Annuler' : '+ Ajouter un achat'}</Text>
                    </Pressable>

                    {/* Formulaire inline ajout achat */}
                    {showAchatFormFiche && (
                      <View style={{ backgroundColor: '#EBF0FF', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#D0D8E8' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C', marginBottom: 8 }}>🧾 Nouvel achat</Text>
                        <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                          value={achatForm.libelle} onChangeText={v => setAchatForm(f => ({ ...f, libelle: v }))} placeholder="Libellé *" />
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TextInput style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                            value={achatForm.montantHT} onChangeText={v => setAchatForm(f => ({ ...f, montantHT: v }))} placeholder="HT (€)" keyboardType="decimal-pad" />
                          <TextInput style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                            value={achatForm.montantTTC} onChangeText={v => setAchatForm(f => ({ ...f, montantTTC: v }))} placeholder="TTC (€)" keyboardType="decimal-pad" />
                        </View>
                        <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                          value={achatForm.fournisseur} onChangeText={v => setAchatForm(f => ({ ...f, fournisseur: v }))} placeholder="Fournisseur" />
                        <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                          value={achatForm.note} onChangeText={v => setAchatForm(f => ({ ...f, note: v }))} placeholder="Note (optionnel)" />
                        {/* Scan / photo document */}
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                          <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                            onPress={async () => {
                              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
                              if (!result.canceled && result.assets[0]) {
                                const compressed = await compressImage(result.assets[0].uri);
                                const url = await uploadFileToStorage(compressed, `chantiers/${ficheId}/achats`, `achat_${Date.now()}`);
                                if (url) setAchatFichierUri(url);
                              }
                            }}>
                            <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📷 Photo</Text>
                          </Pressable>
                          <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                            onPress={async () => {
                              const { status } = await ImagePicker.requestCameraPermissionsAsync();
                              if (status !== 'granted') { Alert.alert('Permission', 'Accès caméra requis'); return; }
                              const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
                              if (!result.canceled && result.assets[0]) {
                                const compressed = await compressImage(result.assets[0].uri);
                                const url = await uploadFileToStorage(compressed, `chantiers/${ficheId}/achats`, `scan_${Date.now()}`);
                                if (url) setAchatFichierUri(url);
                              }
                            }}>
                            <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📸 Scanner</Text>
                          </Pressable>
                          <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                            onPress={async () => {
                              const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
                              if (!result.canceled && result.assets?.[0]) {
                                const url = await uploadFileToStorage(result.assets[0].uri, `chantiers/${ficheId}/achats`, `doc_${Date.now()}`);
                                if (url) setAchatFichierUri(url);
                              }
                            }}>
                            <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📄 PDF</Text>
                          </Pressable>
                        </View>
                        {achatFichierUri && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600' }}>✓ Document joint</Text>
                            <Pressable onPress={() => setAchatFichierUri(null)}><Text style={{ fontSize: 11, color: '#E74C3C' }}>✕</Text></Pressable>
                          </View>
                        )}
                        <Pressable style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: achatForm.libelle.trim() ? 1 : 0.5 }}
                          disabled={!achatForm.libelle.trim()}
                          onPress={() => {
                            if (!ficheId || !achatForm.libelle.trim()) return;
                            addDepense({
                              id: `dep_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                              chantierId: ficheId,
                              libelle: achatForm.libelle.trim(),
                              montant: parseFloat(achatForm.montantHT.replace(',', '.')) || 0,
                              montantTTC: parseFloat(achatForm.montantTTC.replace(',', '.')) || 0,
                              date: achatForm.date || new Date().toISOString().slice(0, 10),
                              fournisseur: achatForm.fournisseur.trim() || undefined,
                              note: achatForm.note.trim() || undefined,
                              fichier: achatFichierUri || undefined,
                              createdAt: new Date().toISOString(),
                            });
                            setShowAchatFormFiche(false);
                            setAchatFichierUri(null);
                          }}>
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Enregistrer</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Tableau des achats */}
                    {achats.length > 0 && (
                      <View style={{ borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 10, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', backgroundColor: '#2C2C2C', paddingVertical: 8, paddingHorizontal: 6 }}>
                          <Text style={{ flex: 1.5, fontSize: 10, fontWeight: '700', color: '#fff' }}>Libellé</Text>
                          <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: '#fff' }}>Fournisseur</Text>
                          <Text style={{ flex: 0.7, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'right' }}>H.T.</Text>
                          <Text style={{ flex: 0.7, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'right' }}>T.T.C.</Text>
                          <Text style={{ flex: 0.7, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'right' }}>Date</Text>
                          <Text style={{ width: 30, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' }}>📄</Text>
                        </View>
                        {achats.sort((a, b) => b.date.localeCompare(a.date)).map((dep, idx) => (
                          <Pressable
                            key={dep.id}
                            style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 6, backgroundColor: idx % 2 === 0 ? '#fff' : '#F8F9FA', borderTopWidth: 1, borderTopColor: '#E2E6EA', alignItems: 'center' }}
                            onLongPress={() => {
                              if (Platform.OS === 'web') {
                                if (window.confirm(`Supprimer "${dep.libelle}" (${dep.montant} €) ?`)) deleteDepense(dep.id);
                              } else {
                                Alert.alert('Supprimer', `Supprimer "${dep.libelle}" ?`, [
                                  { text: 'Annuler', style: 'cancel' },
                                  { text: 'Supprimer', style: 'destructive', onPress: () => deleteDepense(dep.id) },
                                ]);
                              }
                            }}
                          >
                            <Text style={{ flex: 1.5, fontSize: 11, color: '#11181C' }} numberOfLines={1}>{dep.libelle}</Text>
                            <Text style={{ flex: 1, fontSize: 10, color: '#687076' }} numberOfLines={1}>{dep.fournisseur || '—'}</Text>
                            <Text style={{ flex: 0.7, fontSize: 11, fontWeight: '600', color: '#11181C', textAlign: 'right' }}>{dep.montant.toLocaleString('fr-FR')} €</Text>
                            <Text style={{ flex: 0.7, fontSize: 11, fontWeight: '700', color: '#E74C3C', textAlign: 'right' }}>{(dep.montantTTC || dep.montant).toLocaleString('fr-FR')} €</Text>
                            <Text style={{ flex: 0.7, fontSize: 9, color: '#687076', textAlign: 'right' }}>{dep.date.split('-').reverse().join('/')}</Text>
                            <View style={{ width: 30, alignItems: 'center' }}>
                              {dep.fichier ? (
                                <Pressable onPress={() => {
                                  if (Platform.OS === 'web') {
                                    const w = window.open();
                                    if (w) {
                                      if (dep.fichier!.startsWith('data:application/pdf') || dep.fichier!.includes('pdf')) {
                                        w.document.write(`<iframe src="${dep.fichier}" width="100%" height="100%" style="border:none;"></iframe>`);
                                      } else {
                                        w.document.write(`<img src="${dep.fichier}" style="max-width:100%;"/>`);
                                      }
                                    }
                                  }
                                }}>
                                  <Text style={{ fontSize: 16 }}>📄</Text>
                                </Pressable>
                              ) : (
                                <Text style={{ fontSize: 10, color: '#B0BEC5' }}>—</Text>
                              )}
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {achats.length === 0 && (
                      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                        <Text style={{ fontSize: 32, marginBottom: 8 }}>🧾</Text>
                        <Text style={{ fontSize: 14, color: '#687076' }}>Aucun achat enregistré</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 10, color: '#B0BEC5', textAlign: 'center', marginTop: 12 }}>Appui long sur une ligne pour supprimer</Text>
                  </>
                );
              })()}
            </ScrollView>


            {/* Budget prévisionnel */}
            {isAdmin && ficheOnglet === 'fiche' && ficheId && (
              <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 14 }}>💰</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A' }}>Budget prévisionnel</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={{ flex: 1, backgroundColor: '#FBF8F4', borderWidth: 1, borderColor: '#E8DDD0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1A1A1A' }}
                    placeholder="Ex: 25000"
                    placeholderTextColor="#B0A89E"
                    keyboardType="numeric"
                    value={data.budgetsChantier?.[ficheId]?.toString() || ''}
                    onChangeText={v => {
                      const num = parseFloat(v.replace(',', '.'));
                      updateBudgetChantier(ficheId, isNaN(num) ? undefined : num);
                    }}
                  />
                  <Text style={{ fontSize: 14, color: '#8C8077', fontWeight: '600' }}>€ TTC</Text>
                </View>
                {data.budgetsChantier?.[ficheId] != null && (() => {
                  const budget = data.budgetsChantier![ficheId];
                  const depenses = (data.depensesChantier || []).filter(d => d.chantierId === ficheId).reduce((s, d) => s + (d.montant || 0), 0);
                  const pct = budget > 0 ? Math.round((depenses / budget) * 100) : 0;
                  const color = pct < 70 ? '#10B981' : pct < 90 ? '#E5A840' : '#D94F4F';
                  return (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: '#8C8077' }}>Dépensé : {depenses.toLocaleString('fr-FR')} €</Text>
                        <Text style={{ fontSize: 11, color, fontWeight: '700' }}>{pct}%</Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: '#E8DDD0', borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: 6, backgroundColor: color, borderRadius: 3, width: `${Math.min(100, pct)}%` }} />
                      </View>
                      {pct >= 90 && <Text style={{ fontSize: 10, color: '#D94F4F', marginTop: 4, fontWeight: '600' }}>⚠️ Budget presque épuisé !</Text>}
                    </View>
                  );
                })()}
              </View>
            )}

            {isAdmin && ficheOnglet === 'fiche' && (
              <Pressable style={styles.saveBtn} onPress={handleSaveFiche}>
                <Text style={styles.saveBtnText}>Enregistrer</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ModalKeyboard>

      {/* ── Modal Notes Chantier (enrichi) ── */}
      <ModalKeyboard visible={showNotes} animationType="slide" transparent onRequestClose={() => setShowNotes(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 0.05 }} onPress={() => setShowNotes(false)} />
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{t.chantiers.notesTitle}</Text>
                <Text style={styles.modalSubtitle}>{data.chantiers.find(c => c.id === notesChantierId)?.nom ?? ''}</Text>
              </View>
              <Pressable onPress={() => setShowNotes(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            {/* Onglets actives / historique */}
            <View style={styles.noteTabRow}>
              <Pressable
                style={[styles.noteTab, notesOnglet === 'actives' && styles.noteTabActive]}
                onPress={() => setNotesOnglet('actives')}
              >
                <Text style={[styles.noteTabText, notesOnglet === 'actives' && styles.noteTabTextActive]}>
                  {t.chantiers.activeNotes} {notesChantierId ? `(${getNotesActives(notesChantierId).length})` : ''}
                </Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  style={[styles.noteTab, notesOnglet === 'historique' && styles.noteTabActive]}
                  onPress={() => setNotesOnglet('historique')}
                >
                  <Text style={[styles.noteTabText, notesOnglet === 'historique' && styles.noteTabTextActive]}>
                    {t.chantiers.historyNotes} {notesChantierId ? `(${getNotesArchivees(notesChantierId).length + getNotesSupprimees(notesChantierId).length})` : ''}
                  </Text>
                </Pressable>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
              {notesOnglet === 'actives' ? (
                <>
                  {/* Liste des notes actives */}
                  {notesChantierId && getNotesActives(notesChantierId).length === 0 && (
                    <Text style={[styles.emptyText, { margin: 16 }]}>{t.chantiers.noActiveNotes}</Text>
                  )}
                  {notesChantierId && getNotesActives(notesChantierId).map(note => (
                    <View key={note.id} style={styles.noteCard}>
                      <View style={styles.noteHeader}>
                        <Text style={styles.noteAuteur}>{note.auteurNom}</Text>
                        <Text style={styles.noteDate}>
                          {new Date(note.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={styles.noteTexte}>{note.texte}</Text>
                      {/* Pièce jointe legacy (lecture seule, plus écrite par les nouvelles notes) */}
                      {note.pieceJointe && (
                        <Pressable
                          style={styles.notePJBtn}
                          onPress={() => openDocPreview(note.pieceJointe)}
                          accessibilityRole="button"
                          accessibilityLabel={`Ouvrir ${note.pieceJointeNom || 'la pièce jointe'}`}
                        >
                          <Text style={styles.notePJIcon}>{note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}</Text>
                          <Text style={styles.notePJText}>{note.pieceJointeNom || (note.pieceJointeType === 'pdf' ? 'PDF' : 'Image')}</Text>
                        </Pressable>
                      )}
                      {/* Photos multiples */}
                      {note.photos && note.photos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 6 }}>
                          {note.photos.map((uri, idx) => {
                            const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                            if (isPdf) {
                              return (
                                <Pressable
                                  key={idx}
                                  style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: '#FFF3CD', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}
                                  onPress={() => openDocPreview(uri)}
                                  accessibilityRole="button"
                                  accessibilityLabel="Ouvrir le PDF"
                                >
                                  <Text style={{ fontSize: 22 }}>📄</Text>
                                </Pressable>
                              );
                            }
                            return (
                              <Pressable
                                key={idx}
                                onPress={() => openDocPreview(uri)}
                                accessibilityRole="button"
                                accessibilityLabel="Ouvrir la photo"
                              >
                                <Image
                                  source={{ uri }}
                                  style={{ width: 60, height: 60, borderRadius: 8, marginRight: 6 }}
                                  resizeMode="cover"
                                />
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      )}
                      {note.destinataires !== 'tous' && isAdmin && (
                        <Text style={styles.noteDest}>
                          👤 Pour : {(note.destinataires as string[]).map(id => {
                            const emp = data.employes.find(e => e.id === id);
                            const st = data.sousTraitants?.find(s => s.id === id);
                            return emp ? emp.prenom : (st ? st.nom : id);
                          }).join(', ')}
                        </Text>
                      )}
                      <View style={styles.noteActions}>
                        <Pressable style={styles.noteArchiveBtn} onPress={() => handleArchiveNote(note.id)}>
                          <Text style={styles.noteArchiveBtnText}>{t.chantiers.archiveNote}</Text>
                        </Pressable>
                        {isAdmin && (
                          <Pressable style={styles.noteDeleteBtn} onPress={() => handleDeleteNote(note.id)}>
                            <Text style={styles.noteDeleteBtnText}>{t.chantiers.deleteNote}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}

                  {/* Formulaire ajout note */}
                  <View style={styles.noteForm}>
                    <Text style={styles.fieldLabel}>{t.planning.notes}</Text>
                    <TextInput
                      style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                      value={newNoteTexte}
                      onChangeText={setNewNoteTexte}
                      placeholder={t.chantiers.addNoteLabel}
                      placeholderTextColor="#B0BEC5"
                      multiline
                    />

                    {/* Preview multi-photos sélectionnées (aligné planning.tsx ModalNotesChantier) */}
                    {notePhotos.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 4 }}>
                        {notePhotos.map((uri, idx) => {
                          const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                          return (
                            <View key={idx} style={{ marginRight: 8, position: 'relative' }}>
                              {isPdf ? (
                                <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: '#FFF3CD', alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 22 }}>📄</Text>
                                </View>
                              ) : (
                                <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 6 }} />
                              )}
                              <Pressable
                                onPress={() => setNotePhotos(prev => prev.filter((_, i) => i !== idx))}
                                style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#E74C3C', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}
                                accessibilityRole="button"
                                accessibilityLabel="Retirer la photo"
                              >
                                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>✕</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </ScrollView>
                    )}

                    {/* Pickers (web input / iOS ActionSheet + Inbox iOS Share Extension) */}
                    <View style={{ marginTop: 8, gap: 4 }}>
                      <NativeFilePickerButton
                        onPick={async (file) => {
                          const url = await handleNoteChantierPickNative(file);
                          if (!url) return false;
                          setNotePhotos(prev => [...prev, url]);
                          return true;
                        }}
                        acceptImages
                        acceptPdf
                        multiple
                      />
                      <InboxPickerButton
                        onPick={async (item) => {
                          const url = await handleNoteChantierFromInbox(item);
                          if (!url) return false;
                          setNotePhotos(prev => [...prev, url]);
                          return true;
                        }}
                        mimeFilter={inboxMimeFilterImagePdf}
                      />
                    </View>

                    {/* Sélection des destinataires (admin seulement) */}
                    {isAdmin && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.fieldLabel}>{t.chantiers.recipients}</Text>
                        <View style={styles.chipRow}>
                          <Pressable
                            style={[styles.chip, noteDestinataires === 'tous' && styles.chipActive]}
                            onPress={() => setNoteDestinataires('tous')}
                          >
                            <Text style={[styles.chipText, noteDestinataires === 'tous' && styles.chipTextActive]}>{t.chantiers.allRecipients}</Text>
                          </Pressable>
                          {data.employes.map(emp => (
                            <Pressable
                              key={emp.id}
                              style={[styles.chip, Array.isArray(noteDestinataires) && noteDestinataires.includes(emp.id) && styles.chipActive]}
                              onPress={() => {
                                setNoteDestinataires(prev => {
                                  if (prev === 'tous') return [emp.id];
                                  const arr = prev as string[];
                                  return arr.includes(emp.id) ? arr.filter(x => x !== emp.id) : [...arr, emp.id];
                                });
                              }}
                            >
                              <Text style={[styles.chipText, Array.isArray(noteDestinataires) && noteDestinataires.includes(emp.id) && styles.chipTextActive]}>
                                {emp.prenom}
                              </Text>
                            </Pressable>
                          ))}
                          {(data.sousTraitants || []).map(st => (
                            <Pressable
                              key={st.id}
                              style={[styles.chip, Array.isArray(noteDestinataires) && noteDestinataires.includes(st.id) && styles.chipActive]}
                              onPress={() => {
                                setNoteDestinataires(prev => {
                                  if (prev === 'tous') return [st.id];
                                  const arr = prev as string[];
                                  return arr.includes(st.id) ? arr.filter(x => x !== st.id) : [...arr, st.id];
                                });
                              }}
                            >
                              <Text style={[styles.chipText, Array.isArray(noteDestinataires) && noteDestinataires.includes(st.id) && styles.chipTextActive]}>
                                {st.nom} (ST)
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}

                    <Pressable
                      style={[styles.saveBtn, { marginTop: 12, opacity: (newNoteTexte.trim() || notePhotos.length > 0) ? 1 : 0.5 }]}
                      onPress={handleAddNote}
                      disabled={!newNoteTexte.trim() && notePhotos.length === 0}
                    >
                      <Text style={styles.saveBtnText}>{t.common.add}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                /* Onglet Historique (admin) */
                <>
                  {/* Notes archivées */}
                  {notesChantierId && getNotesArchivees(notesChantierId).length > 0 && (
                    <>
                      <Text style={styles.noteHistSection}>🗃️ {t.chantiers.archivedNotes}</Text>
                      {getNotesArchivees(notesChantierId).map(note => (
                        <View key={note.id} style={[styles.noteCard, { opacity: 0.85, borderLeftColor: '#B0BEC5' }]}>
                          <View style={styles.noteHeader}>
                            <Text style={styles.noteAuteur}>{note.auteurNom}</Text>
                            <Text style={styles.noteDate}>
                              {new Date(note.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </Text>
                          </View>
                          <Text style={styles.noteTexte}>{note.texte}</Text>
                          {/* Pièce jointe legacy */}
                          {note.pieceJointe && (
                            <Pressable
                              style={styles.notePJBtn}
                              onPress={() => openDocPreview(note.pieceJointe)}
                              accessibilityRole="button"
                              accessibilityLabel={`Ouvrir ${note.pieceJointeNom || 'la pièce jointe'}`}
                            >
                              <Text style={styles.notePJIcon}>{note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}</Text>
                              <Text style={styles.notePJText}>{note.pieceJointeNom || 'Fichier'}</Text>
                            </Pressable>
                          )}
                          {/* Photos multiples */}
                          {note.photos && note.photos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 6 }}>
                              {note.photos.map((uri, idx) => {
                                const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                if (isPdf) {
                                  return (
                                    <Pressable
                                      key={idx}
                                      style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF3CD', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}
                                      onPress={() => openDocPreview(uri)}
                                      accessibilityRole="button"
                                      accessibilityLabel="Ouvrir le PDF"
                                    >
                                      <Text style={{ fontSize: 20 }}>📄</Text>
                                    </Pressable>
                                  );
                                }
                                return (
                                  <Pressable
                                    key={idx}
                                    onPress={() => openDocPreview(uri)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Ouvrir la photo"
                                  >
                                    <Image
                                      source={{ uri }}
                                      style={{ width: 56, height: 56, borderRadius: 8, marginRight: 6 }}
                                      resizeMode="cover"
                                    />
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          )}
                          {/* Bouton suppression admin */}
                          {isAdmin && (
                            <Pressable
                              style={[styles.noteDeleteBtn, { marginTop: 8, alignSelf: 'flex-end' }]}
                              onPress={() => {
                                if (Platform.OS === 'web') {
                                  if (typeof window !== 'undefined' && window.confirm && window.confirm(t.chantiers.deleteConfirm)) {
                                    deleteNoteChantierArchivee(note.id);
                                  }
                                } else {
                                  Alert.alert(t.common.delete, t.chantiers.deleteConfirm, [
                                    { text: t.common.cancel, style: 'cancel' },
                                    { text: t.common.delete, style: 'destructive', onPress: () => deleteNoteChantierArchivee(note.id) },
                                  ]);
                                }
                              }}
                            >
                              <Text style={styles.noteDeleteBtnText}>🗑 {t.common.delete}</Text>
                            </Pressable>
                          )}
                        </View>
                      ))}
                    </>
                  )}
                  {/* Notes supprimées */}
                  {notesChantierId && getNotesSupprimees(notesChantierId).length > 0 && (
                    <>
                      <Text style={[styles.noteHistSection, { color: '#E74C3C' }]}>🗑️ {t.chantiers.deletedNotes}</Text>
                      {getNotesSupprimees(notesChantierId).map(note => (
                        <View key={note.id} style={[styles.noteCard, { opacity: 0.65, borderLeftColor: '#E74C3C' }]}>
                          <View style={styles.noteHeader}>
                            <Text style={styles.noteAuteur}>{note.auteurNom}</Text>
                            <Text style={styles.noteDate}>
                              {t.chantiers.deletedOn} {note.deletedAt ? new Date(note.deletedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}
                            </Text>
                          </View>
                          <Text style={styles.noteTexte}>{note.texte}</Text>
                          {note.pieceJointe && (
                            <Pressable
                              style={styles.notePJBtn}
                              onPress={() => openDocPreview(note.pieceJointe)}
                              accessibilityRole="button"
                              accessibilityLabel={`Ouvrir ${note.pieceJointeNom || 'la pièce jointe'}`}
                            >
                              <Text style={styles.notePJIcon}>{note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}</Text>
                              <Text style={styles.notePJText}>{note.pieceJointeNom || 'Fichier'}</Text>
                            </Pressable>
                          )}
                          {/* Photos multiples */}
                          {note.photos && note.photos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 6 }}>
                              {note.photos.map((uri, idx) => {
                                const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                if (isPdf) {
                                  return (
                                    <Pressable
                                      key={idx}
                                      style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF3CD', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}
                                      onPress={() => openDocPreview(uri)}
                                      accessibilityRole="button"
                                      accessibilityLabel="Ouvrir le PDF"
                                    >
                                      <Text style={{ fontSize: 20 }}>📄</Text>
                                    </Pressable>
                                  );
                                }
                                return (
                                  <Pressable
                                    key={idx}
                                    onPress={() => openDocPreview(uri)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Ouvrir la photo"
                                  >
                                    <Image
                                      source={{ uri }}
                                      style={{ width: 56, height: 56, borderRadius: 8, marginRight: 6 }}
                                      resizeMode="cover"
                                    />
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          )}
                        </View>
                      ))}
                    </>
                  )}
                  {notesChantierId && getNotesArchivees(notesChantierId).length === 0 && getNotesSupprimees(notesChantierId).length === 0 && (
                    <Text style={[styles.emptyText, { margin: 16 }]}>{t.chantiers.noHistory}</Text>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>

      {/* ── Modal Plans Chantier ── */}
      {/* ── Modal Achats séparé ── */}
      <ModalKeyboard visible={achatsChantierId !== null} animationType="slide" transparent onRequestClose={() => setAchatsChantierId(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 0.05 }} onPress={() => setAchatsChantierId(null)} />
          <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🛒 Achats</Text>
                <Text style={styles.modalSubtitle}>{data.chantiers.find(c => c.id === achatsChantierId)?.nom ?? ''}</Text>
              </View>
              <Pressable onPress={() => setAchatsChantierId(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {achatsChantierId && (() => {
                const achats = (data.depenses || data.depensesChantier || []).filter(d => d.chantierId === achatsChantierId);
                const totalHT = achats.reduce((s, d) => s + (d.montant || 0), 0);
                const totalTTC = achats.reduce((s, d) => s + (d.montantTTC || d.montant || 0), 0);
                const todayStr3 = new Date().toISOString().slice(0, 10);

                return (
                  <>
                    {/* Totaux */}
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                      <View style={{ flex: 1, backgroundColor: '#EEF2F8', borderRadius: 14, padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#11181C' }}>{totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</Text>
                        <Text style={{ fontSize: 10, color: '#687076' }}>Total H.T.</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#FDECEA', borderRadius: 14, padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#E74C3C' }}>{totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</Text>
                        <Text style={{ fontSize: 10, color: '#687076' }}>Total T.T.C.</Text>
                      </View>
                    </View>

                    {/* Bouton ajouter */}
                    <Pressable
                      style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12 }}
                      onPress={() => { setAchatForm({ libelle: '', montantHT: '', montantTTC: '', date: todayStr3, fournisseur: '', fichier: '', note: '' }); setShowAchatForm(v => !v); }}
                    >
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{showAchatForm ? '✕ Annuler' : '+ Ajouter un achat'}</Text>
                    </Pressable>

                    {/* Formulaire inline */}
                    {showAchatForm && (
                      <View style={{ backgroundColor: '#EBF0FF', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#D0D8E8' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C', marginBottom: 8 }}>🧾 Nouvel achat</Text>
                        <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                          value={achatForm.libelle} onChangeText={v => setAchatForm(f => ({ ...f, libelle: v }))} placeholder="Libellé *" />
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TextInput style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                            value={achatForm.montantHT} onChangeText={v => setAchatForm(f => ({ ...f, montantHT: v }))} placeholder="HT (€)" keyboardType="decimal-pad" />
                          <TextInput style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                            value={achatForm.montantTTC} onChangeText={v => setAchatForm(f => ({ ...f, montantTTC: v }))} placeholder="TTC (€)" keyboardType="decimal-pad" />
                        </View>
                        <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                          value={achatForm.fournisseur} onChangeText={v => setAchatForm(f => ({ ...f, fournisseur: v }))} placeholder="Fournisseur" />
                        <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, color: '#11181C' }}
                          value={achatForm.note} onChangeText={v => setAchatForm(f => ({ ...f, note: v }))} placeholder="Note (optionnel)" />
                        {/* Scan / photo / PDF */}
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                          <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                            onPress={async () => {
                              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
                              if (!result.canceled && result.assets[0]) {
                                const compressed = await compressImage(result.assets[0].uri);
                                const url = await uploadFileToStorage(compressed, `chantiers/${achatsChantierId}/achats`, `achat_${Date.now()}`);
                                if (url) setAchatFichierUri(url);
                              }
                            }}>
                            <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📷 Photo</Text>
                          </Pressable>
                          <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                            onPress={async () => {
                              const { status } = await ImagePicker.requestCameraPermissionsAsync();
                              if (status !== 'granted') { Alert.alert('Permission', 'Accès caméra requis'); return; }
                              const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
                              if (!result.canceled && result.assets[0]) {
                                const compressed = await compressImage(result.assets[0].uri);
                                const url = await uploadFileToStorage(compressed, `chantiers/${achatsChantierId}/achats`, `scan_${Date.now()}`);
                                if (url) setAchatFichierUri(url);
                              }
                            }}>
                            <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📸 Scanner</Text>
                          </Pressable>
                          <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                            onPress={async () => {
                              const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
                              if (!result.canceled && result.assets?.[0]) {
                                const url = await uploadFileToStorage(result.assets[0].uri, `chantiers/${achatsChantierId}/achats`, `doc_${Date.now()}`);
                                if (url) setAchatFichierUri(url);
                              }
                            }}>
                            <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📄 PDF</Text>
                          </Pressable>
                        </View>
                        {achatFichierUri && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600' }}>✓ Document joint</Text>
                            <Pressable onPress={() => setAchatFichierUri(null)}><Text style={{ fontSize: 11, color: '#E74C3C' }}>✕</Text></Pressable>
                          </View>
                        )}
                        <Pressable style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: achatForm.libelle.trim() && achatForm.montantHT ? 1 : 0.5 }}
                          disabled={!achatForm.libelle.trim() || !achatForm.montantHT}
                          onPress={() => {
                            if (!achatsChantierId || !achatForm.libelle.trim() || !achatForm.montantHT) return;
                            addDepense({
                              id: `dep_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                              chantierId: achatsChantierId,
                              libelle: achatForm.libelle.trim(),
                              montant: parseFloat(achatForm.montantHT.replace(',', '.')) || 0,
                              montantTTC: parseFloat(achatForm.montantTTC.replace(',', '.')) || undefined,
                              date: achatForm.date || new Date().toISOString().slice(0, 10),
                              fournisseur: achatForm.fournisseur.trim() || undefined,
                              note: achatForm.note.trim() || undefined,
                              fichier: achatFichierUri || undefined,
                              createdAt: new Date().toISOString(),
                            });
                            setShowAchatForm(false);
                            setAchatFichierUri(null);
                          }}>
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Enregistrer</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Tableau */}
                    {achats.length > 0 && (
                      <View style={{ borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 10, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', backgroundColor: '#2C2C2C', paddingVertical: 8, paddingHorizontal: 6 }}>
                          <Text style={{ flex: 1.5, fontSize: 10, fontWeight: '700', color: '#fff' }}>Libellé</Text>
                          <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: '#fff' }}>Fournisseur</Text>
                          <Text style={{ flex: 0.7, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'right' }}>H.T.</Text>
                          <Text style={{ flex: 0.7, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'right' }}>T.T.C.</Text>
                          <Text style={{ flex: 0.7, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'right' }}>Date</Text>
                          <Text style={{ width: 30, fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' }}>📄</Text>
                        </View>
                        {achats.sort((a, b) => b.date.localeCompare(a.date)).map((dep, idx) => (
                          <Pressable
                            key={dep.id}
                            style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 6, backgroundColor: idx % 2 === 0 ? '#fff' : '#F8F9FA', borderTopWidth: 1, borderTopColor: '#E2E6EA', alignItems: 'center' }}
                            onLongPress={() => {
                              if (Platform.OS === 'web') {
                                if (window.confirm(`Supprimer "${dep.libelle}" ?`)) deleteDepense(dep.id);
                              } else {
                                Alert.alert('Supprimer', `Supprimer "${dep.libelle}" ?`, [
                                  { text: 'Annuler', style: 'cancel' },
                                  { text: 'Supprimer', style: 'destructive', onPress: () => deleteDepense(dep.id) },
                                ]);
                              }
                            }}
                          >
                            <View style={{ flex: 1.5 }}>
                              <Text style={{ fontSize: 11, color: '#11181C' }} numberOfLines={1}>{dep.libelle}</Text>
                              {dep.note && <Text style={{ fontSize: 9, color: '#687076', fontStyle: 'italic' }} numberOfLines={1}>{dep.note}</Text>}
                            </View>
                            <Text style={{ flex: 1, fontSize: 10, color: '#687076' }} numberOfLines={1}>{dep.fournisseur || '—'}</Text>
                            <Text style={{ flex: 0.7, fontSize: 11, fontWeight: '600', color: '#11181C', textAlign: 'right' }}>{dep.montant.toLocaleString('fr-FR')} €</Text>
                            <Text style={{ flex: 0.7, fontSize: 11, fontWeight: '700', color: '#E74C3C', textAlign: 'right' }}>{(dep.montantTTC || dep.montant).toLocaleString('fr-FR')} €</Text>
                            <Text style={{ flex: 0.7, fontSize: 9, color: '#687076', textAlign: 'right' }}>{dep.date.split('-').reverse().join('/')}</Text>
                            <View style={{ width: 30, alignItems: 'center' }}>
                              {dep.fichier ? (
                                <Pressable onPress={() => {
                                  if (Platform.OS === 'web') {
                                    const w = window.open();
                                    if (w) {
                                      if (dep.fichier!.includes('pdf')) w.document.write(`<iframe src="${dep.fichier}" width="100%" height="100%" style="border:none;"></iframe>`);
                                      else w.document.write(`<img src="${dep.fichier}" style="max-width:100%;"/>`);
                                    }
                                  }
                                }}>
                                  <Text style={{ fontSize: 14 }}>📄</Text>
                                </Pressable>
                              ) : <Text style={{ fontSize: 10, color: '#B0BEC5' }}>—</Text>}
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {achats.length === 0 && (
                      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                        <Text style={{ fontSize: 32, marginBottom: 8 }}>🧾</Text>
                        <Text style={{ fontSize: 14, color: '#687076' }}>Aucun achat enregistré</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 10, color: '#B0BEC5', textAlign: 'center', marginTop: 12 }}>Appui long pour supprimer</Text>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>

      {/* Modal Photos chantier legacy retirée (commit C8.1bis) — la galerie réelle est <GaleriePhotos> rendu plus bas */}

      <ModalKeyboard visible={showPlans} animationType="slide" transparent onRequestClose={() => setShowPlans(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 0.05 }} onPress={() => setShowPlans(false)} />
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{t.chantiers.plansTitle}</Text>
                <Text style={styles.modalSubtitle}>{data.chantiers.find(c => c.id === plansChantierId)?.nom ?? ''}</Text>
              </View>
              <Pressable onPress={() => setShowPlans(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
              {/* Liste des plans */}
              {plansChantierId && getPlansVisibles(plansChantierId).length === 0 && (
                <Text style={[styles.emptyText, { margin: 16 }]}>{t.chantiers.noPlans}</Text>
              )}
              {plansChantierId && getPlansVisibles(plansChantierId).map(plan => (
                <View key={plan.id} style={styles.planCard}>
                  <Pressable
                    style={styles.planCardContent}
                    onPress={() => openDocPreview(plan.fichier)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ouvrir ${plan.nom}`}
                  >
                    <Text style={styles.planIcon}>{(plan.fichier?.toLowerCase().endsWith('.pdf') || plan.fichier?.includes('application/pdf')) ? '📄' : '🖼️'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planNom}>{plan.nom}</Text>
                      <Text style={styles.planMeta}>
                        {new Date(plan.uploadedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {plan.visiblePar !== 'tous' && ` • ${plan.visiblePar === 'employes' ? '👷 Employés' : plan.visiblePar === 'soustraitants' ? '👤 ST' : '👥 Sélection'}`}
                      </Text>
                    </View>
                    <Text style={styles.planViewBtn}>{t.chantiers.viewPlan} →</Text>
                  </Pressable>
                  {isAdmin && (
                    <Pressable
                      style={styles.planDeleteBtn}
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          if (window.confirm(t.chantiers.deletePlan)) deletePlanChantier(plansChantierId!, plan.id);
                        } else {
                          Alert.alert(t.common.delete, t.chantiers.deletePlan, [
                            { text: t.common.cancel, style: 'cancel' },
                            { text: t.common.delete, style: 'destructive', onPress: () => deletePlanChantier(plansChantierId!, plan.id) },
                          ]);
                        }
                      }}
                    >
                      <Text style={styles.planDeleteBtnText}>🗑</Text>
                    </Pressable>
                  )}
                </View>
              ))}

              {/* Formulaire ajout plan (admin) */}
              {isAdmin && (
                <View style={styles.noteForm}>
                  <Text style={styles.fieldLabel}>{t.chantiers.addPlan}</Text>
                  <TextInput
                    style={styles.input}
                    value={newPlanNom}
                    onChangeText={setNewPlanNom}
                    placeholder={t.chantiers.planName}
                    placeholderTextColor="#B0BEC5"
                  />

                  {/* Preview fichier sélectionné */}
                  {newPlanFichier && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <Text style={styles.notePJIcon}>
                        {(newPlanFichier.startsWith('data:application/pdf') || newPlanFichier.toLowerCase().endsWith('.pdf')) ? '📄' : '🖼️'}
                      </Text>
                      <Text style={[styles.notePJText, { flex: 1 }]} numberOfLines={1}>{t.common.fileSelected}</Text>
                      <Pressable onPress={() => setNewPlanFichier(null)}>
                        <Text style={{ color: '#E74C3C', fontWeight: '700' }}>✕</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Pickers (web/iOS native + Inbox iOS Share Extension) */}
                  <View style={{ marginTop: 8, gap: 4 }}>
                    <NativeFilePickerButton
                      onPick={async (file) => {
                        const url = await handlePlanChantierPickNative(file);
                        if (!url) return false;
                        setNewPlanFichier(url);
                        return true;
                      }}
                      acceptImages
                      acceptPdf
                      multiple={false}
                    />
                    <InboxPickerButton
                      onPick={async (item) => {
                        const url = await handlePlanChantierFromInbox(item);
                        if (!url) return false;
                        setNewPlanFichier(url);
                        return true;
                      }}
                      mimeFilter={inboxMimeFilterImagePdf}
                    />
                  </View>

                  {/* Visibilité */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.fieldLabel}>{t.chantiers.planRecipients}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                      {(['tous', 'employes', 'soustraitants', 'specifique'] as const).map(v => (
                        <Pressable
                          key={v}
                          style={[styles.chip, newPlanVisiblePar === v && styles.chipActive]}
                          onPress={() => setNewPlanVisiblePar(v)}
                        >
                          <Text style={[styles.chipText, newPlanVisiblePar === v && styles.chipTextActive]}>
                            {v === 'tous' ? 'Tous' : v === 'employes' ? '👷 Employés' : v === 'soustraitants' ? '👤 Sous-traitants' : '👥 Par personne'}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Sélection spécifique */}
                  {newPlanVisiblePar === 'specifique' && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.fieldLabel}>{t.chantiers.recipients}</Text>
                      <View style={styles.chipRow}>
                        {data.employes.map(emp => (
                          <Pressable
                            key={emp.id}
                            style={[styles.chip, newPlanVisibleIds.includes(emp.id) && styles.chipActive]}
                            onPress={() => setNewPlanVisibleIds(prev => prev.includes(emp.id) ? prev.filter(x => x !== emp.id) : [...prev, emp.id])}
                          >
                            <Text style={[styles.chipText, newPlanVisibleIds.includes(emp.id) && styles.chipTextActive]}>{emp.prenom}</Text>
                          </Pressable>
                        ))}
                        {(data.sousTraitants || []).map(st => (
                          <Pressable
                            key={st.id}
                            style={[styles.chip, newPlanVisibleIds.includes(st.id) && styles.chipActive]}
                            onPress={() => setNewPlanVisibleIds(prev => prev.includes(st.id) ? prev.filter(x => x !== st.id) : [...prev, st.id])}
                          >
                            <Text style={[styles.chipText, newPlanVisibleIds.includes(st.id) && styles.chipTextActive]}>{st.nom} (ST)</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  <Pressable
                    style={[styles.saveBtn, { marginTop: 12, opacity: (newPlanNom.trim() && newPlanFichier) ? 1 : 0.5 }]}
                    onPress={handleAddPlan}
                    disabled={!newPlanNom.trim() || !newPlanFichier}
                  >
                    <Text style={styles.saveBtnText}>{t.common.add}</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>
      {bilanChantierId && (
        <BilanFinancierChantier visible={!!bilanChantierId} onClose={() => setBilanChantierId(null)} chantierId={bilanChantierId} />
      )}
      <GaleriePhotos visible={showGalerie !== null} onClose={() => setShowGalerie(null)} chantierId={showGalerie || undefined} titre={`📷 Galerie — ${data.chantiers.find(c => c.id === showGalerie)?.nom || ''}`} />
      {marchesChantierId && (
        <MarchesChantier visible={!!marchesChantierId} onClose={() => setMarchesChantierId(null)} chantierId={marchesChantierId} />
      )}
      {portailClientId && (
        <PortailClient visible={!!portailClientId} onClose={() => setPortailClientId(null)} chantierId={portailClientId} />
      )}
      {/* ── Modal Suivi Planning (toutes les notes employes) ── */}
      {/* DETTE-NOTE-EDITOR-001 : ce form duplique partiellement le contenu de
          <ModalNotes> (Planning). Extraction <NoteEditor> reportée à une session
          dédiée pour réduire le risque de refacto. Quand on factorise, garder
          les filtres période/employé Suivi (utiles métier) et plugger NoteEditor
          pour le formulaire de création/édition uniquement. */}
      <ModalKeyboard visible={suiviChantierId !== null} animationType="slide" transparent onRequestClose={() => setSuiviChantierId(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 0.05 }} onPress={() => setSuiviChantierId(null)} />
          <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>📋 Suivi & Notes</Text>
                <Text style={styles.modalSubtitle}>{data.chantiers.find(c => c.id === suiviChantierId)?.nom ?? ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {isAdmin && (
                  <Pressable style={{ backgroundColor: '#2C2C2C', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                    onPress={() => {
                      setSuiviShowForm(v => !v);
                      setSuiviNoteText('');
                      setSuiviNoteEmpId('');
                      setSuiviDraft({ tasks: [], photos: [], savTicketId: null, visiblePar: 'tous' });
                      setSuiviShowTaskInput(false);
                      setSuiviNewTaskText('');
                      setSuiviEditingNote(null);
                    }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{suiviShowForm ? '✕' : '+ Note'}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setSuiviChantierId(null)}>
                  <Text style={styles.modalClose}>✕</Text>
                </Pressable>
              </View>
            </View>

            {/* Filtres */}
            <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5EDE3' }}>
              {/* Filtre période */}
              {(['semaine', 'mois', 'tout'] as const).map(p => (
                <Pressable key={p} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: suiviFilterSemaine === p ? '#2C2C2C' : '#F5EDE3' }}
                  onPress={() => setSuiviFilterSemaine(p)}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: suiviFilterSemaine === p ? '#fff' : '#687076' }}>{p === 'semaine' ? '7j' : p === 'mois' ? '30j' : 'Tout'}</Text>
                </Pressable>
              ))}
              <View style={{ width: 1, backgroundColor: '#E2E6EA', marginHorizontal: 2 }} />
              {/* Filtre employé */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                <Pressable style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: suiviFilterEmp === 'all' ? '#2C2C2C' : '#F5EDE3' }}
                  onPress={() => setSuiviFilterEmp('all')}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: suiviFilterEmp === 'all' ? '#fff' : '#687076' }}>Tous</Text>
                </Pressable>
                {suiviChantierId && [...new Set(data.affectations.filter(a => a.chantierId === suiviChantierId).map(a => a.employeId))].map(eid => {
                  const emp = data.employes.find(e => e.id === eid);
                  if (!emp) return null;
                  return (
                    <Pressable key={eid} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: suiviFilterEmp === eid ? '#2C2C2C' : '#F5EDE3' }}
                      onPress={() => setSuiviFilterEmp(suiviFilterEmp === eid ? 'all' : eid)}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: suiviFilterEmp === eid ? '#fff' : '#687076' }}>{emp.prenom}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
              {/* Formulaire ajout note */}
              {suiviShowForm && isAdmin && suiviChantierId && (() => {
                const isEdit = suiviEditingNote !== null;
                const openTickets = (data.ticketsSAV || []).filter(t => t.chantierId === suiviChantierId && t.statut !== 'clos');
                const resetDraft = () => {
                  setSuiviNoteText('');
                  setSuiviNoteEmpId('');
                  setSuiviDraft({ tasks: [], photos: [], savTicketId: null, visiblePar: 'tous' });
                  setSuiviShowTaskInput(false);
                  setSuiviNewTaskText('');
                  setSuiviEditingNote(null);
                  setSuiviShowForm(false);
                };
                return (
                <View style={{ backgroundColor: '#EBF0FF', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#D0D8E8' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2C', marginBottom: 6 }}>{isEdit ? 'Modifier la note' : 'Nouvelle note'}</Text>
                  <Text style={{ fontSize: 11, color: '#687076', marginBottom: 4 }}>Pour :</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 4 }}>
                    {data.employes.map(e => (
                      <Pressable key={e.id} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: suiviNoteEmpId === e.id ? '#2C2C2C' : '#fff', borderWidth: 1, borderColor: suiviNoteEmpId === e.id ? '#2C2C2C' : '#E2E6EA' }}
                        onPress={() => setSuiviNoteEmpId(e.id)}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: suiviNoteEmpId === e.id ? '#fff' : '#687076' }}>{e.prenom}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 8, color: '#11181C', minHeight: 50 }}
                    value={suiviNoteText} onChangeText={setSuiviNoteText} placeholder="Consigne, tâche, remarque..." multiline />

                  {/* ── Photos & PDF ── */}
                  <Text style={{ fontSize: 11, color: '#687076', marginBottom: 4, marginTop: 4 }}>Photos & PDF</Text>
                  {suiviDraft.photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
                      {suiviDraft.photos.map((uri, idx) => {
                        const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                        return (
                          <View key={idx} style={{ width: 56, height: 56 }}>
                            <Pressable
                              onPress={() => {
                                if (isPdf) { openDocPreview(uri); return; }
                                setSuiviChantierId(null);
                                setTimeout(() => setViewPhotoUri(uri), 150);
                              }}
                              style={{ width: '100%', height: '100%' }}
                              accessibilityRole="button"
                              accessibilityLabel={isPdf ? 'Ouvrir le PDF' : 'Ouvrir la photo'}
                            >
                              {isPdf ? (
                                <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 22 }}>📄</Text>
                                </View>
                              ) : (
                                <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 6 }} resizeMode="cover" />
                              )}
                            </Pressable>
                            <Pressable
                              onPress={() => setSuiviDraft(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }))}
                              style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                              accessibilityRole="button"
                              accessibilityLabel="Retirer"
                            >
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✕</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <NativeFilePickerButton
                      acceptImages
                      acceptPdf
                      acceptCamera
                      multiple
                      compressImages
                      onPick={async (file: PickedFile) => {
                        const folder = `chantiers/${suiviChantierId}/notes`;
                        const photoId = `note_photo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                        const url = await uploadFileToStorage(file.uri, folder, photoId);
                        if (!url) return false;
                        setSuiviDraft(prev => ({ ...prev, photos: [...prev.photos, url] }));
                        return true;
                      }}
                    />
                    <InboxPickerButton
                      mimeFilter={(m) => m.startsWith('image/') || m === 'application/pdf'}
                      onPick={async (item) => {
                        const fileURI = getInboxItemPath(item);
                        if (!fileURI) return false;
                        const folder = `chantiers/${suiviChantierId}/notes`;
                        const url = await uploadFileToStorage(fileURI, folder, `inbox_${item.id}`);
                        if (!url) return false;
                        setSuiviDraft(prev => ({ ...prev, photos: [...prev.photos, url] }));
                        return true;
                      }}
                    />
                  </View>

                  {/* ── Tâches ── */}
                  <Text style={{ fontSize: 11, color: '#687076', marginBottom: 4 }}>📋 Tâches</Text>
                  {suiviDraft.tasks.length > 0 && (
                    <View style={{ marginBottom: 6 }}>
                      {suiviDraft.tasks.map(task => {
                        const handleAddTaskPhoto = async () => {
                          const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true, compressImages: true });
                          for (const f of files) {
                            const folder = `chantiers/${suiviChantierId}/notes/tasks`;
                            const photoId = `task_${task.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                            const url = await uploadFileToStorage(f.uri, folder, photoId);
                            if (!url) continue;
                            setSuiviDraft(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === task.id ? { ...t, photos: [...(t.photos || []), url] } : t) }));
                          }
                        };
                        const handleRemoveTaskPhoto = (uri: string) => {
                          Alert.alert('Supprimer la photo', 'Voulez-vous supprimer cette photo de la tâche ?', [
                            { text: 'Annuler', style: 'cancel' },
                            { text: 'Supprimer', style: 'destructive', onPress: () => {
                              setSuiviDraft(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === task.id ? { ...t, photos: (t.photos || []).filter(p => p !== uri) } : t) }));
                            } },
                          ]);
                        };
                        return (
                          <View key={task.id} style={{ marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: task.fait ? '#27AE60' : '#B0BEC5', backgroundColor: task.fait ? '#D4EDDA' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                {task.fait && <Text style={{ color: '#27AE60', fontSize: 10, fontWeight: '700' }}>✓</Text>}
                              </View>
                              <Text style={{ fontSize: 12, color: task.fait ? '#B0BEC5' : '#11181C', textDecorationLine: task.fait ? 'line-through' : 'none', flex: 1 }}>{task.texte}</Text>
                              <Pressable onPress={handleAddTaskPhoto} style={{ paddingHorizontal: 6, paddingVertical: 4 }} accessibilityRole="button" accessibilityLabel="Ajouter photo à la tâche">
                                <Text style={{ fontSize: 14, color: '#2C2C2C' }}>➕</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => setSuiviDraft(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== task.id) }))}
                                style={{ padding: 4 }}
                              >
                                <Text style={{ color: '#E74C3C', fontSize: 12 }}>✕</Text>
                              </Pressable>
                            </View>
                            {task.photos && task.photos.length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4, marginLeft: 24 }} contentContainerStyle={{ gap: 4 }}>
                                {task.photos.map((uri, idx) => {
                                  const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                  return (
                                    <View key={idx} style={{ width: 44, height: 44 }}>
                                      <Pressable
                                        onPress={() => {
                                          if (isPdf) { openDocPreview(uri); return; }
                                          setSuiviChantierId(null);
                                          setTimeout(() => setViewPhotoUri(uri), 150);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={isPdf ? 'Ouvrir le PDF' : 'Ouvrir la photo'}
                                      >
                                        {isPdf ? (
                                          <View style={{ width: 44, height: 44, borderRadius: 4, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 18 }}>📄</Text>
                                          </View>
                                        ) : (
                                          <Image source={{ uri }} style={{ width: 44, height: 44, borderRadius: 4 }} resizeMode="cover" />
                                        )}
                                      </Pressable>
                                      <Pressable
                                        onPress={() => handleRemoveTaskPhoto(uri)}
                                        style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: 7, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Supprimer la photo"
                                      >
                                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>✕</Text>
                                      </Pressable>
                                    </View>
                                  );
                                })}
                              </ScrollView>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {suiviShowTaskInput ? (
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                      <TextInput
                        style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, borderWidth: 1, borderColor: '#E2E6EA', color: '#11181C' }}
                        value={suiviNewTaskText}
                        onChangeText={setSuiviNewTaskText}
                        placeholder="Décrire la tâche..."
                        placeholderTextColor="#B0BEC5"
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          const txt = suiviNewTaskText.trim();
                          if (!txt) return;
                          const newTask: TaskItem = { id: `t_${Date.now()}_${Math.random().toString(36).slice(2)}`, texte: txt, fait: false };
                          setSuiviDraft(prev => ({ ...prev, tasks: [...prev.tasks, newTask] }));
                          setSuiviNewTaskText('');
                          setSuiviShowTaskInput(false);
                        }}
                      />
                      <Pressable onPress={() => { setSuiviShowTaskInput(false); setSuiviNewTaskText(''); }} style={{ paddingHorizontal: 10, justifyContent: 'center' }}>
                        <Text style={{ color: '#687076' }}>✕</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => setSuiviShowTaskInput(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: '#2C2C2C', fontWeight: '600' }}>+ Ajouter une tâche</Text>
                    </Pressable>
                  )}

                  {/* ── Lier à un SAV ── */}
                  {openTickets.length > 0 && (
                    <>
                      <Text style={{ fontSize: 11, color: '#687076', marginBottom: 4 }}>🔧 Lier à un SAV</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 4 }}>
                        <Pressable
                          onPress={() => setSuiviDraft(prev => ({ ...prev, savTicketId: null }))}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: suiviDraft.savTicketId === null ? '#2C2C2C' : '#fff', borderWidth: 1, borderColor: suiviDraft.savTicketId === null ? '#2C2C2C' : '#E2E6EA' }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: suiviDraft.savTicketId === null ? '#fff' : '#687076' }}>Aucun</Text>
                        </Pressable>
                        {openTickets.map(t => (
                          <Pressable
                            key={t.id}
                            onPress={() => setSuiviDraft(prev => ({ ...prev, savTicketId: t.id }))}
                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: suiviDraft.savTicketId === t.id ? '#E74C3C' : '#fff', borderWidth: 1, borderColor: suiviDraft.savTicketId === t.id ? '#E74C3C' : '#E2E6EA' }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: suiviDraft.savTicketId === t.id ? '#fff' : '#687076' }}>{t.objet}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </>
                  )}

                  {/* ── Visible par ── */}
                  <Text style={{ fontSize: 11, color: '#687076', marginBottom: 4 }}>👁 Visible par</Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
                    {(['tous', 'employes', 'soustraitants'] as const).map(v => (
                      <Pressable
                        key={v}
                        onPress={() => setSuiviDraft(prev => ({ ...prev, visiblePar: v }))}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: suiviDraft.visiblePar === v ? '#2C2C2C' : '#fff', borderWidth: 1, borderColor: suiviDraft.visiblePar === v ? '#2C2C2C' : '#E2E6EA' }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: suiviDraft.visiblePar === v ? '#fff' : '#687076' }}>
                          {v === 'tous' ? 'Tous' : v === 'employes' ? 'Employés' : 'Sous-traitants'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {isEdit && (
                      <Pressable style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                        onPress={resetDraft}>
                        <Text style={{ color: '#687076', fontSize: 13, fontWeight: '700' }}>Annuler</Text>
                      </Pressable>
                    )}
                    <Pressable style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: suiviNoteText.trim() && suiviNoteEmpId ? 1 : 0.5 }}
                      disabled={!suiviNoteText.trim() || !suiviNoteEmpId}
                      onPress={() => {
                        const now = new Date().toISOString();
                        const targetDate = isEdit ? (suiviEditingNote!.note.date || now.slice(0, 10)) : now.slice(0, 10);
                        const noteId = isEdit ? suiviEditingNote!.note.id : `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                        const createdAt = isEdit ? (suiviEditingNote!.note.createdAt || now) : now;
                        upsertNote({
                          chantierId: suiviChantierId!,
                          employeId: suiviNoteEmpId,
                          date: targetDate,
                          note: {
                            id: noteId,
                            auteurId: 'admin',
                            auteurNom: currentUser?.nom || 'Admin',
                            date: targetDate,
                            texte: suiviNoteText.trim(),
                            photos: suiviDraft.photos,
                            tasks: suiviDraft.tasks,
                            savTicketId: suiviDraft.savTicketId || undefined,
                            visiblePar: suiviDraft.visiblePar,
                            createdAt,
                            updatedAt: now,
                          },
                        });
                        resetDraft();
                      }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{isEdit ? 'Enregistrer' : 'Ajouter'}</Text>
                    </Pressable>
                  </View>
                </View>
                );
              })()}

              {suiviChantierId && (() => {
                const now = new Date();
                const cutoffDate = suiviFilterSemaine === 'semaine' ? new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
                  : suiviFilterSemaine === 'mois' ? new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
                  : '2000-01-01';

                const affs = data.affectations
                  .filter(a => a.chantierId === suiviChantierId && (a.notes || []).length > 0 && (suiviFilterEmp === 'all' || a.employeId === suiviFilterEmp));

                // Toutes les notes filtrées par date
                const allNotes: { note: any; affId: string; date: string; empId: string; empNom: string }[] = [];
                affs.forEach(a => {
                  const emp = data.employes.find(e => e.id === a.employeId);
                  const st = a.employeId.startsWith('st:') ? data.sousTraitants.find(s => s.id === a.employeId.replace('st:', '')) : null;
                  const nom = emp ? `${emp.prenom} ${emp.nom}` : st ? `${st.prenom} ${st.nom} (ST)` : a.employeId;
                  (a.notes || []).forEach(n => {
                    const d = n.date || a.dateDebut;
                    if (d >= cutoffDate) allNotes.push({ note: n, affId: a.id, date: d, empId: a.employeId, empNom: nom });
                  });
                });
                allNotes.sort((a, b) => b.date.localeCompare(a.date));

                if (allNotes.length === 0) return (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
                    <Text style={{ fontSize: 14, color: '#687076' }}>Aucune note</Text>
                  </View>
                );

                // Grouper par date
                const byDate = new Map<string, typeof allNotes>();
                allNotes.forEach(n => {
                  if (!byDate.has(n.date)) byDate.set(n.date, []);
                  byDate.get(n.date)!.push(n);
                });

                const adminNom = currentUser?.nom || 'Admin';

                return [...byDate.entries()].map(([date, notes]) => (
                  <View key={date} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginBottom: 6, backgroundColor: '#EBF0FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' }}>
                      📅 {new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </Text>
                    {notes.map(({ note: n, affId, empNom, empId, date: noteDate }) => (
                      <View key={n.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: '#E2E6EA', borderLeftWidth: 3, borderLeftColor: n.savTicketId ? '#E74C3C' : '#687076' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <Text style={{ fontSize: 10, color: '#687076', flex: 1 }}>👷 <Text style={{ fontWeight: '700' }}>{empNom}</Text> · par {n.auteurNom}</Text>
                          {isAdmin && (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Pressable onPress={() => {
                                setSuiviEditingNote({ affId, note: n });
                                setSuiviNoteEmpId(empId);
                                setSuiviNoteText(n.texte || '');
                                setSuiviDraft({
                                  photos: n.photos || [],
                                  tasks: n.tasks || [],
                                  savTicketId: n.savTicketId || null,
                                  visiblePar: (typeof n.visiblePar === 'string' && (n.visiblePar === 'tous' || n.visiblePar === 'employes' || n.visiblePar === 'soustraitants')) ? n.visiblePar : 'tous',
                                });
                                setSuiviShowForm(true);
                              }}><Text style={{ fontSize: 11 }}>✏️</Text></Pressable>
                              <Pressable onPress={() => {
                                if (Platform.OS === 'web') { if (window.confirm('Supprimer ?')) deleteNote(affId, n.id); }
                                else Alert.alert('Supprimer', 'Supprimer cette note ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => deleteNote(affId, n.id) }]);
                              }}><Text style={{ fontSize: 11, color: '#E74C3C' }}>🗑</Text></Pressable>
                            </View>
                          )}
                        </View>
                        {n.texte ? <Text style={{ fontSize: 12, color: '#11181C', lineHeight: 17 }}>{n.texte}</Text> : null}
                        {n.tasks && n.tasks.length > 0 && (
                          <View style={{ marginTop: 4, gap: 2 }}>
                            {n.tasks.map((task: any) => (
                              <View key={task.id}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                                  <Pressable onPress={() => toggleTask(affId, n.id, task.id, adminNom)}
                                    style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: task.fait ? '#27AE60' : '#B0BEC5', backgroundColor: task.fait ? '#D4EDDA' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                    {task.fait && <Text style={{ color: '#27AE60', fontSize: 10, fontWeight: '700' }}>✓</Text>}
                                  </Pressable>
                                  <Text style={{ fontSize: 11, color: task.fait ? '#B0BEC5' : '#11181C', textDecorationLine: task.fait ? 'line-through' : 'none', flex: 1 }}>{task.texte}</Text>
                                  {task.fait && task.faitPar && <Text style={{ fontSize: 9, color: '#27AE60', marginRight: 4 }}>{task.faitPar}</Text>}
                                  <Pressable style={{ padding: 2 }} onPress={async () => {
                                    const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true, compressImages: true });
                                    for (const file of files) {
                                      const url = await uploadFileToStorage(file.uri, 'tasks/photos', `task_${task.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
                                      if (url) addTaskPhoto(affId, n.id, task.id, url);
                                    }
                                  }}><Text style={{ fontSize: 12 }}>➕</Text></Pressable>
                                  <InboxPickerButton
                                    label="📥"
                                    buttonStyle={{ padding: 2, paddingHorizontal: 4, backgroundColor: 'transparent', borderWidth: 0 }}
                                    mimeFilter={(m) => m.startsWith('image/') || m === 'application/pdf'}
                                    onPick={async (item) => {
                                      const fileURI = getInboxItemPath(item);
                                      if (!fileURI) return false;
                                      const url = await uploadFileToStorage(fileURI, 'tasks/photos', `task_inbox_${task.id}_${item.id}`);
                                      if (!url) return false;
                                      addTaskPhoto(affId, n.id, task.id, url);
                                      return true;
                                    }}
                                  />
                                </View>
                                {task.photos && task.photos.length > 0 && (
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 22, marginTop: 2, marginBottom: 4 }} contentContainerStyle={{ gap: 3 }}>
                                    {task.photos.map((uri: string, pi: number) => {
                                      const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                      return (
                                        <View key={pi} style={{ marginRight: 3 }}>
                                          <Pressable
                                            onPress={() => {
                                              if (isPdf) { openDocPreview(uri); return; }
                                              setSuiviChantierId(null);
                                              setTimeout(() => setViewPhotoUri(uri), 150);
                                            }}
                                            accessibilityRole="button"
                                            accessibilityLabel={isPdf ? 'Ouvrir le PDF' : 'Ouvrir la photo'}
                                          >
                                            {isPdf ? (
                                              <View style={{ width: 40, height: 40, borderRadius: 4, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontSize: 16 }}>📄</Text>
                                              </View>
                                            ) : (
                                              <Image source={{ uri }} style={{ width: 40, height: 40, borderRadius: 4 }} resizeMode="cover" />
                                            )}
                                          </Pressable>
                                          <Pressable
                                            onPress={() => {
                                              const doDelete = () => removeTaskPhoto(affId, n.id, task.id, uri);
                                              if (Platform.OS === 'web') {
                                                if (typeof window !== 'undefined' && window.confirm && window.confirm('Supprimer cette photo ?')) doDelete();
                                              } else {
                                                Alert.alert('Supprimer la photo ?', 'Cette action est irréversible.', [
                                                  { text: 'Annuler', style: 'cancel' },
                                                  { text: 'Supprimer', style: 'destructive', onPress: doDelete },
                                                ]);
                                              }
                                            }}
                                            style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: 7, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                                            accessibilityRole="button"
                                            accessibilityLabel="Supprimer la photo"
                                          >
                                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>✕</Text>
                                          </Pressable>
                                        </View>
                                      );
                                    })}
                                  </ScrollView>
                                )}
                              </View>
                            ))}
                          </View>
                        )}
                        {n.photos && n.photos.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }} contentContainerStyle={{ gap: 6 }}>
                            {n.photos.map((uri: string, j: number) => {
                              const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                              return (
                                <View key={j} style={{ width: 50, height: 50 }}>
                                  <Pressable
                                    onPress={() => {
                                      if (isPdf) { openDocPreview(uri); return; }
                                      setSuiviChantierId(null);
                                      setTimeout(() => setViewPhotoUri(uri), 150);
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                    accessibilityRole="button"
                                    accessibilityLabel={isPdf ? 'Ouvrir le PDF' : 'Ouvrir la photo'}
                                  >
                                    {isPdf ? (
                                      <View style={{ width: 50, height: 50, borderRadius: 6, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ fontSize: 20 }}>📄</Text>
                                      </View>
                                    ) : (
                                      <Image source={{ uri }} style={{ width: 50, height: 50, borderRadius: 6 }} resizeMode="cover" />
                                    )}
                                  </Pressable>
                                  {isAdmin && (
                                    <Pressable
                                      onPress={() => {
                                        const doDelete = () => {
                                          const now = new Date().toISOString();
                                          upsertNote({
                                            chantierId: suiviChantierId!,
                                            employeId: empId,
                                            date: noteDate,
                                            note: { ...n, photos: (n.photos || []).filter((_: string, k: number) => k !== j), updatedAt: now },
                                          });
                                        };
                                        if (Platform.OS === 'web') {
                                          if (typeof window !== 'undefined' && window.confirm && window.confirm('Supprimer cette photo ?')) doDelete();
                                        } else {
                                          Alert.alert('Supprimer la photo ?', 'Cette action est irréversible.', [
                                            { text: 'Annuler', style: 'cancel' },
                                            { text: 'Supprimer', style: 'destructive', onPress: doDelete },
                                          ]);
                                        }
                                      }}
                                      style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                                      accessibilityRole="button"
                                      accessibilityLabel="Supprimer la photo"
                                    >
                                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✕</Text>
                                    </Pressable>
                                  )}
                                </View>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>
                    ))}
                  </View>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>

      {/* ── Modal SAV ── */}
      <ModalKeyboard visible={savChantierId !== null} animationType="slide" transparent onRequestClose={() => setSavChantierId(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setSavChantierId(null)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E6EA' }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#11181C' }}>🔧 SAV</Text>
                <Text style={{ fontSize: 12, color: '#687076' }}>{data.chantiers.find(c => c.id === savChantierId)?.nom}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={{ backgroundColor: '#2C2C2C', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }} onPress={() => { setEditSavId(null); setSavForm({ objet: '', description: '', priorite: 'normale', assigneA: '' }); setSavPhotos([]); setSavFichiers([]); setShowSavForm(v => !v); }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{showSavForm ? '✕ Annuler' : '+ Ticket'}</Text>
                </Pressable>
                <Pressable style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }} onPress={() => setSavChantierId(null)}>
                  <Text style={{ fontSize: 14, color: '#687076', fontWeight: '700' }}>✕</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
              {savChantierId && (() => {
                const tickets = (data.ticketsSAV || []).filter(t => t.chantierId === savChantierId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                if (tickets.length === 0 && !showSavForm) return <Text style={{ textAlign: 'center', color: '#B0BEC5', paddingVertical: 24, fontSize: 13 }}>Aucun ticket SAV</Text>;
                const prioColors: Record<string, string> = { basse: '#27AE60', normale: '#2C2C2C', haute: '#F59E0B', urgente: '#E74C3C' };
                const statutLabels: Record<string, string> = { ouvert: '🔴 Ouvert', en_cours: '🟡 En cours', resolu: '🟢 Résolu', clos: '⚪ Clos' };
                return tickets.map(t => (
                  <View key={t.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E6EA', borderLeftWidth: 4, borderLeftColor: prioColors[t.priorite] || '#2C2C2C' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C' }}>{t.objet}</Text>
                        <Text style={{ fontSize: 11, color: '#687076', marginTop: 2 }}>{statutLabels[t.statut] || t.statut} · Priorité {t.priorite}</Text>
                        {t.description && <Text style={{ fontSize: 12, color: '#687076', marginTop: 4 }}>{t.description}</Text>}
                        <Text style={{ fontSize: 10, color: '#B0BEC5', marginTop: 4 }}>Ouvert le {t.dateOuverture}</Text>
                      </View>
                    </View>
                    {/* Commentaires */}
                    {(t.commentaires || []).length > 0 && (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F5EDE3' }}>
                        {t.commentaires!.map(c => (
                          <View key={c.id} style={{ marginBottom: 4 }}>
                            <Text style={{ fontSize: 11, color: '#11181C' }}><Text style={{ fontWeight: '700' }}>{c.auteur}</Text> : {c.texte}</Text>
                            <Text style={{ fontSize: 9, color: '#B0BEC5' }}>{new Date(c.date).toLocaleDateString('fr-FR')}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {/* Photos du problème */}
                    {t.photos && t.photos.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 4 }}>
                        {t.photos.map((uri, i) => (
                          <Pressable key={i} onPress={() => setViewPhotoUri(uri)}>
                            <Image source={{ uri }} style={{ width: 60, height: 60, borderRadius: 6 }} resizeMode="cover" />
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                    {/* Assigné à */}
                    {t.assigneA && (
                      <Text style={{ fontSize: 10, color: '#2C2C2C', marginTop: 4 }}>
                        👷 Assigné à : {data.employes.find(e => e.id === t.assigneA)?.prenom || t.assigneA}
                      </Text>
                    )}
                    {/* Infos résolution */}
                    {t.statut === 'resolu' && (
                      <View style={{ marginTop: 6, backgroundColor: '#D4EDDA', borderRadius: 6, padding: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#155724' }}>✓ Résolu{t.resoluPar ? ` par ${t.resoluPar}` : ''}{t.dateResolution ? ` le ${t.dateResolution}` : ''}</Text>
                        {t.photosResolution && t.photosResolution.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }} contentContainerStyle={{ gap: 4 }}>
                            {t.photosResolution.map((uri, i) => (
                              <Pressable key={i} onPress={() => setViewPhotoUri(uri)}>
                                <Image source={{ uri }} style={{ width: 50, height: 50, borderRadius: 4 }} resizeMode="cover" />
                              </Pressable>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    )}
                    {/* Actions */}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                      {t.statut !== 'resolu' && t.statut !== 'clos' && (
                        <Pressable style={{ flex: 1, backgroundColor: '#D4EDDA', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }}
                          onPress={async () => {
                            const userName = currentUser?.nom || (isAdmin ? 'Admin' : 'Employé');
                            // Proposer d'ajouter une photo de résolution
                            const doResolve = async (photos?: string[]) => {
                              updateTicketSAV({ ...t, statut: 'resolu', dateResolution: new Date().toISOString().slice(0, 10), resoluPar: userName, photosResolution: photos || t.photosResolution, updatedAt: new Date().toISOString() });
                            };
                            if (Platform.OS === 'web') { doResolve(); return; }
                            Alert.alert('Résoudre le ticket', 'Ajouter une photo de la résolution ?', [
                              { text: 'Annuler', style: 'cancel' },
                              { text: 'Non, juste résoudre', onPress: () => doResolve() },
                              { text: '📷 Ajouter photo', onPress: async () => {
                                const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, multiple: false, compressImages: true });
                                if (files.length === 0) { doResolve(); return; }
                                const url = await uploadFileToStorage(files[0].uri, `chantiers/${t.chantierId}/sav-resolution`, `res_${t.id}_${Date.now()}`);
                                doResolve(url ? [...(t.photosResolution || []), url] : undefined);
                              }},
                            ]);
                          }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#155724' }}>✓ Résolu</Text>
                        </Pressable>
                      )}
                      {t.statut === 'ouvert' && (
                        <Pressable style={{ flex: 1, backgroundColor: '#FFF3CD', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }}
                          onPress={() => updateTicketSAV({ ...t, statut: 'en_cours', updatedAt: new Date().toISOString() })}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#856404' }}>→ En cours</Text>
                        </Pressable>
                      )}
                      {isAdmin && (
                        <Pressable style={{ flex: 1, backgroundColor: '#EBF0FF', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }}
                          onPress={() => {
                            setEditSavId(t.id);
                            setSavForm({ objet: t.objet, description: t.description || '', priorite: t.priorite, assigneA: t.assigneA || '' });
                            setSavPhotos(t.photos || []);
                            setSavFichiers(t.fichiers || []);
                            setShowSavForm(true);
                          }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#2C2C2C' }}>✏️</Text>
                        </Pressable>
                      )}
                      {isAdmin && (
                        <Pressable style={{ flex: 1, backgroundColor: '#FEF2F2', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }}
                          onPress={() => { if (Platform.OS === 'web') { if (window.confirm('Supprimer ce ticket ?')) deleteTicketSAV(t.id); } else Alert.alert('Supprimer', 'Supprimer ce ticket ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => deleteTicketSAV(t.id) }]); }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#DC2626' }}>🗑</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ));
              })()}

              {/* Formulaire inline nouveau ticket */}
              {showSavForm && (
                <View style={{ backgroundColor: '#EBF0FF', borderRadius: 14, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#D0D8E8' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C', marginBottom: 8 }}>{editSavId ? 'Modifier le ticket' : 'Nouveau ticket'}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4 }}>Objet *</Text>
                  <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 8, color: '#11181C' }}
                    value={savForm.objet} onChangeText={v => setSavForm(f => ({ ...f, objet: v }))} placeholder="Ex: Fuite robinet cuisine" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4 }}>Description</Text>
                  <TextInput style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 8, color: '#11181C', minHeight: 50 }}
                    value={savForm.description} onChangeText={v => setSavForm(f => ({ ...f, description: v }))} placeholder="Détails..." multiline />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4 }}>Priorité</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    {(['basse', 'normale', 'haute', 'urgente'] as PrioriteSAV[]).map(p => (
                      <Pressable key={p} style={[{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#fff' },
                        savForm.priorite === p && { backgroundColor: p === 'urgente' ? '#FEF2F2' : p === 'haute' ? '#FFF3CD' : p === 'basse' ? '#D4EDDA' : '#EBF0FF', borderColor: p === 'urgente' ? '#E74C3C' : p === 'haute' ? '#F59E0B' : p === 'basse' ? '#27AE60' : '#2C2C2C' }]}
                        onPress={() => setSavForm(f => ({ ...f, priorite: p }))}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: savForm.priorite === p ? '#11181C' : '#687076' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {/* Assigner à un employé */}
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4 }}>Assigner à</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 4 }}>
                    <Pressable style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA' }, !savForm.assigneA && { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' }]}
                      onPress={() => setSavForm(f => ({ ...f, assigneA: '' }))}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: !savForm.assigneA ? '#fff' : '#687076' }}>Non assigné</Text>
                    </Pressable>
                    {data.employes.map(e => (
                      <Pressable key={e.id} style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA' }, savForm.assigneA === e.id && { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' }]}
                        onPress={() => setSavForm(f => ({ ...f, assigneA: e.id }))}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: savForm.assigneA === e.id ? '#fff' : '#687076' }}>{e.prenom}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {/* Photos / fichiers */}
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                      onPress={async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
                        if (!result.canceled && result.assets[0]) {
                          const compressed = await compressImage(result.assets[0].uri);
                          const url = await uploadFileToStorage(compressed, `chantiers/${savChantierId}/sav`, `sav_photo_${Date.now()}`);
                          if (url) setSavPhotos(prev => [...prev, url]);
                        }
                      }}>
                      <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📷 Photo ({savPhotos.length})</Text>
                    </Pressable>
                    <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                      onPress={async () => {
                        const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
                        if (!result.canceled && result.assets?.[0]) {
                          const asset = result.assets[0];
                          const url = await uploadFileToStorage(asset.uri, `chantiers/${savChantierId}/sav`, `sav_doc_${Date.now()}`);
                          if (url) setSavFichiers(prev => [...prev, { uri: url, nom: asset.name || 'Document' }]);
                        }
                      }}>
                      <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📄 PDF ({savFichiers.length})</Text>
                    </Pressable>
                    <Pressable style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E6EA' }}
                      onPress={async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== 'granted') { Alert.alert('Permission refusée', 'L\'accès à la caméra est nécessaire pour scanner.'); return; }
                        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
                        if (!result.canceled && result.assets[0]) {
                          const compressed = await compressImage(result.assets[0].uri);
                          const url = await uploadFileToStorage(compressed, `chantiers/${savChantierId}/sav`, `sav_scan_${Date.now()}`);
                          if (url) setSavPhotos(prev => [...prev, url]);
                        }
                      }}>
                      <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>📸 Scanner</Text>
                    </Pressable>
                  </View>
                  <Pressable style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: savForm.objet.trim() ? 1 : 0.5 }}
                    disabled={!savForm.objet.trim()}
                    onPress={() => {
                      if (!savChantierId) return;
                      const now = new Date().toISOString();
                      if (editSavId) {
                        const existing = (data.ticketsSAV || []).find(t => t.id === editSavId);
                        if (existing) {
                          updateTicketSAV({
                            ...existing,
                            objet: savForm.objet.trim(),
                            description: savForm.description.trim() || undefined,
                            priorite: savForm.priorite,
                            assigneA: savForm.assigneA || undefined,
                            photos: savPhotos.length > 0 ? savPhotos : existing.photos,
                            fichiers: savFichiers.length > 0 ? savFichiers : existing.fichiers,
                            updatedAt: now,
                          });
                        }
                      } else {
                        addTicketSAV({
                          id: `sav_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                          chantierId: savChantierId,
                          objet: savForm.objet.trim(),
                          description: savForm.description.trim() || undefined,
                          priorite: savForm.priorite,
                          statut: 'ouvert',
                          dateOuverture: now.slice(0, 10),
                          assigneA: savForm.assigneA || undefined,
                          photos: savPhotos.length > 0 ? savPhotos : undefined,
                          fichiers: savFichiers.length > 0 ? savFichiers : undefined,
                          commentaires: [],
                          createdAt: now,
                          updatedAt: now,
                        });
                      }
                      setShowSavForm(false);
                      setEditSavId(null);
                      setSavPhotos([]);
                    }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{editSavId ? 'Enregistrer' : 'Créer le ticket'}</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>

      {/* Viewer photo plein écran (cachette clé, etc.) */}
      <Modal visible={viewPhotoUri !== null} transparent animationType="fade" onRequestClose={() => setViewPhotoUri(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setViewPhotoUri(null)}>
          {viewPhotoUri && <Image source={{ uri: viewPhotoUri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
          <Pressable style={{ position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setViewPhotoUri(null)}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#11181C',
  },
  searchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F5EDE3', borderRadius: 10, borderWidth: 1, borderColor: '#E2E6EA' },
  searchInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#11181C' },
  searchClear: { paddingHorizontal: 12, paddingVertical: 10 },
  newBtn: {
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
  },
  newBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#11181C',
  },
  statutBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statutText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    padding: 6,
  },
  actionBtnFiche: {
    fontSize: 16,
    opacity: 0.4,
  },
  actionBtnFicheActive: {
    opacity: 1,
  },
  actionBtnEdit: {
    fontSize: 16,
    color: '#687076',
  },
  actionBtnDelete: {
    fontSize: 16,
    color: '#E74C3C',
  },
  cardMeta: {
    gap: 3,
    marginBottom: 8,
  },
  cardMetaText: {
    fontSize: 12,
    color: '#687076',
  },
  empTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  empTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  empTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fichePreviewBtn: {
    marginTop: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#EEF2F8',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  fichePreviewText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#687076',
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 13,
    color: '#B0BEC5',
    marginTop: 6,
  },
  // Modals
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
    maxHeight: '92%',
  },
  modalSheetFiche: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '95%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E6EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#687076',
    marginTop: 2,
  },
  modalClose: {
    fontSize: 18,
    color: '#687076',
    padding: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  dateRow: {
    flexDirection: 'row',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E6EA',
    backgroundColor: '#F5EDE3',
  },
  chipActive: {
    borderColor: '#2C2C2C',
    backgroundColor: '#2C2C2C',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#687076',
  },
  chipTextActive: {
    color: '#fff',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#11181C',
    transform: [{ scale: 1.15 }],
  },
  empRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F5EDE3',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  empRowSelected: {
    borderColor: '#2C2C2C',
    backgroundColor: '#EEF2F8',
  },
  empAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  empAvatarText: {
    fontWeight: '700',
    fontSize: 14,
  },
  empRowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#11181C',
  },
  empRowMetier: {
    fontSize: 12,
    color: '#687076',
    marginRight: 8,
  },
  empCheck: {
    color: '#2C2C2C',
    fontWeight: '700',
    fontSize: 15,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E6EA',
    backgroundColor: '#F5EDE3',
    alignSelf: 'flex-start',
  },
  toggleBtnActive: {
    borderColor: '#2C2C2C',
    backgroundColor: '#EEF2F8',
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#687076',
  },
  toggleBtnTextActive: {
    color: '#2C2C2C',
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: '#2C2C2C',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#B0BEC5',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Fiche chantier
  ficheSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  ficheSectionIcon: {
    fontSize: 22,
    marginTop: 8,
    width: 28,
    textAlign: 'center',
  },
  ficheSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  ficheInput: {
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  ficheSectionPhotos: {
    marginBottom: 16,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  photoWrap: {
    position: 'relative',
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#E2E6EA',
  },
  pdfThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    borderWidth: 1.5,
    borderColor: '#FFB74D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pdfThumbIcon: {
    fontSize: 28,
  },
  pdfThumbText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E65100',
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  photoAdd: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2C2C2C',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F8',
    gap: 4,
  },
  photoAddIcon: {
    fontSize: 24,
    color: '#2C2C2C',
    fontWeight: '700',
  },
  photoAddText: {
    fontSize: 11,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  ficheUpdated: {
    fontSize: 11,
    color: '#B0BEC5',
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  // Notes chantier
  actionBtnNote: {
    fontSize: 16,
    opacity: 0.4,
  },
  actionBtnNoteActive: {
    opacity: 1,
  },
  noteBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E74C3C',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  noteBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  noteCard: {
    backgroundColor: '#FFFBF0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F39C12',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  noteAuteur: {
    fontSize: 13,
    fontWeight: '700',
    color: '#11181C',
  },
  noteDate: {
    fontSize: 11,
    color: '#687076',
  },
  noteTexte: {
    fontSize: 14,
    color: '#11181C',
    lineHeight: 20,
    marginBottom: 8,
  },
  noteDest: {
    fontSize: 12,
    color: '#687076',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  noteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  noteArchiveBtn: {
    backgroundColor: '#2ECC71',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  noteArchiveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  noteDeleteBtn: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  noteDeleteBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  noteForm: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E6EA',
  },
  // Onglets notes
  noteTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
    paddingBottom: 8,
  },
  noteTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F5EDE3',
  },
  noteTabActive: {
    backgroundColor: '#2C2C2C',
  },
  noteTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#687076',
  },
  noteTabTextActive: {
    color: '#fff',
  },
  // Pièce jointe note
  notePJBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2F8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  notePJPickBtn: {
    backgroundColor: '#F5EDE3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  notePJPickText: {
    fontSize: 13,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  notePJIcon: {
    fontSize: 16,
  },
  notePJText: {
    fontSize: 13,
    color: '#2C2C2C',
    fontWeight: '500',
  },
  // Historique notes
  noteHistSection: {
    fontSize: 13,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 8,
  },
  // Plans chantier
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FB',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E6EA',
    overflow: 'hidden',
  },
  planCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  planIcon: {
    fontSize: 24,
  },
  planNom: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 2,
  },
  planMeta: {
    fontSize: 12,
    color: '#687076',
  },
  planViewBtn: {
    fontSize: 13,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  planDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF0F0',
    borderLeftWidth: 1,
    borderLeftColor: '#E2E6EA',
  },
  planDeleteBtnText: {
    fontSize: 16,
  },
});
