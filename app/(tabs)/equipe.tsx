import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, Image,
  TextInput, ScrollView, Alert, Platform, Switch,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useConfirm } from '@/hooks/useConfirm';
import {
  METIER_COLORS, HORAIRES_DEFAUT, EMPLOYE_COLORS, ST_COLORS,
  DOC_RH_LABELS, DOC_RH_ORDER, METIER_PERSO_COLORS,
  getMetierColors, getMetiersList, BADGE_TYPES, APPORTEUR_TYPE_LABELS,
  type Employe, type Metier, type HorairesHebdo, type DocumentRHEmploye, type SousTraitant, type MetierPerso,
  type BadgeEmploye, type Apporteur,
  type DevisST, type AcompteST, type DocumentST,
} from '@/app/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadFileToStorage } from '@/lib/supabase';
import { DatePicker } from '@/components/DatePicker';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';
import { openDocPreview } from '@/lib/share/openDocPreview';

// Filtre mime utilisé par tous les InboxPickerButton de cet écran
// (documents RH employés, docs ST, devis, factures).
const inboxMimeFilterImagePdf = (m: string): boolean =>
  m.startsWith('image/') || m === 'application/pdf';

// ─── Documents légaux requis pour un sous-traitant (checklist) ───────────────
const DOCUMENTS_LEGAUX_TYPES: { id: string; label: string }[] = [
  { id: 'kbis', label: 'Kbis (extrait récent < 3 mois)' },
  { id: 'urssaf', label: 'Attestation URSSAF (vigilance)' },
  { id: 'fiscal', label: 'Attestation fiscale' },
  { id: 'decennale', label: 'Assurance décennale' },
  { id: 'rc', label: 'Assurance RC Pro' },
  { id: 'cni', label: 'Carte d\'identité du dirigeant' },
  { id: 'rib', label: 'RIB' },
];

function findDocForType(docs: DocumentST[], typeId: string, typeLabel: string): DocumentST | undefined {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nLabel = norm(typeLabel);
  const nId = norm(typeId);
  return docs.find(d => {
    const nd = norm(d.libelle || '');
    return nd === nLabel || nd.includes(nId) || nLabel.includes(nd);
  });
}

function fmtST(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const JOURS_SEMAINE = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function genId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getAvatarColor(prenom: string): string {
  const colors = ['#2C2C2C', '#9B59B6', '#27AE60', '#E74C3C', '#0088FF', '#FF6B35', '#FFB800'];
  return colors[(prenom?.charCodeAt(0) || 65) % colors.length];
}

function buildIdentifiant(prenom: string, nom: string): string {
  const normalize = (s: string) =>
    s.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '.');
  const p = normalize(prenom);
  const n = normalize(nom);
  if (p && n) return `${p}.${n}`;
  if (p) return p;
  return n;
}

function copyToClipboard(text: string) {
  if (Platform.OS === 'web') {
    navigator.clipboard?.writeText(text).catch(() => {});
  }
}

interface EmployeForm {
  prenom: string;
  nom: string;
  metier: Metier;
  role: 'admin' | 'employe';
  identifiant: string;
  motDePasse: string;
  salaireNet: string;
  modeSalaire: 'mensuel' | 'journalier';
  tarifJournalier: string;
  couleur: string;
  horaires: HorairesHebdo;
  isAcheteur: boolean;
  isRH: boolean;
  isCommercial: boolean;
  doitPointer: boolean;
  telephone: string;
  email: string;
  photoProfil: string;
}

const DEFAULT_FORM: EmployeForm = {
  prenom: '',
  nom: '',
  metier: 'autre',
  role: 'employe',
  identifiant: '',
  motDePasse: '',
  salaireNet: '',
  modeSalaire: 'mensuel',
  tarifJournalier: '',
  couleur: EMPLOYE_COLORS[0],
  horaires: { ...HORAIRES_DEFAUT },
  isAcheteur: false,
  isRH: false,
  isCommercial: false,
  doitPointer: true,
  telephone: '',
  email: '',
  photoProfil: '',
};

export default function EquipeScreen() {
  const { data, currentUser, isHydrated, addEmploye, updateEmploye, deleteEmploye, addSousTraitant, updateSousTraitant, deleteSousTraitant, addDocumentRH, deleteDocumentRH, addMetierPerso, deleteMetierPerso, addBadgeEmploye, addApporteur, updateApporteur, deleteApporteur, addDevis, updateDevis, deleteDevis, addAcompteST, updateAcompteST, deleteAcompteST } = useApp();
  const { t } = useLanguage();
  const router = useRouter();
  const { confirm: confirmDelete, ConfirmModal } = useConfirm();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login');
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';
  const isRH = isAdmin || data.employes.find(e => e.id === currentUser?.employeId)?.isRH;

  const [activeTab, setActiveTab] = useState<'employes' | 'soustraitants' | 'apporteurs'>('employes');

  // Deep-linking : ?tab=apporteurs (depuis le formulaire de commission de marché)
  //              ?tab=soustraitants&stId=... (depuis un ancien lien /sous-traitants)
  const params = useLocalSearchParams<{ tab?: string; returnToMarche?: string; stId?: string; view?: string; newApporteurType?: string; returnToChantier?: string }>();
  useEffect(() => {
    if (params.tab === 'apporteurs' || params.tab === 'soustraitants' || params.tab === 'employes') {
      setActiveTab(params.tab);
    }
  }, [params.tab]);

  // Deep-link : ouvrir directement le formulaire apporteur avec un type présélectionné
  // (utilisé quand on vient du formulaire chantier "+ Ajouter")
  const [apporteurFormAutoOpened, setApporteurFormAutoOpened] = useState(false);
  useEffect(() => {
    if (apporteurFormAutoOpened) return;
    const ty = params.newApporteurType;
    if (params.tab === 'apporteurs' && ty && ['architecte', 'apporteur', 'contractant', 'client'].includes(ty)) {
      setEditApporteurId(null);
      setApporteurForm({
        type: ty as Apporteur['type'],
        prenom: '', nom: '', societe: '', telephone: '', email: '', adresse: '', siret: '', notes: '',
        identifiant: '', motDePasse: '', accesApp: false,
      });
      setShowApporteurMdp(true);
      setShowApporteurForm(true);
      setApporteurFormAutoOpened(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab, params.newApporteurType]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeForm>(DEFAULT_FORM);
  useUnsavedChanges(showForm && (form.prenom.trim().length > 0 || form.nom.trim().length > 0));
  const [filterMetier, setFilterMetier] = useState<Metier | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHoraires, setShowHoraires] = useState(false);
  const [showMdp, setShowMdp] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [historiqueEmployeId, setHistoriqueEmployeId] = useState<string | null>(null);

  // Modal badge employé
  const [badgeEmployeId, setBadgeEmployeId] = useState<string | null>(null);
  const [badgeType, setBadgeType] = useState<string>('ponctualite');
  const [badgeMessage, setBadgeMessage] = useState('');

  // Métiers dynamiques (défaut + perso)
  const metierColors = useMemo(() => getMetierColors(data.metiersPerso), [data.metiersPerso]);
  const metiersList = useMemo(() => getMetiersList(data.metiersPerso), [data.metiersPerso]);

  // Modal nouveau métier
  const [showNewMetier, setShowNewMetier] = useState(false);
  const [newMetierLabel, setNewMetierLabel] = useState('');
  const [newMetierColor, setNewMetierColor] = useState(METIER_PERSO_COLORS[0]);
  const handleAddMetier = () => {
    const label = newMetierLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (metierColors[id]) { Alert.alert('Erreur', 'Ce métier existe déjà.'); return; }
    addMetierPerso({ id, label, color: newMetierColor, textColor: '#fff' });
    setNewMetierLabel('');
    setShowNewMetier(false);
    // Sélectionner le nouveau métier dans le formulaire si ouvert
    if (showForm) setForm(f => ({ ...f, metier: id }));
  };

  // Vue disponibilité
  const [showDispo, setShowDispo] = useState(false);
  const [dispoDate, setDispoDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [dispoFilterMetier, setDispoFilterMetier] = useState<string>('all');
  const disponibilite = useMemo(() => {
    const occupes = new Set(
      data.affectations
        .filter(a => a.dateDebut <= dispoDate && a.dateFin >= dispoDate)
        .map(a => a.employeId)
    );
    const libres = data.employes.filter(e => !occupes.has(e.id) && (dispoFilterMetier === 'all' || e.metier === dispoFilterMetier));
    const occupesList = data.employes.filter(e => occupes.has(e.id) && (dispoFilterMetier === 'all' || e.metier === dispoFilterMetier));
    return { libres, occupes: occupesList };
  }, [data.employes, data.affectations, dispoDate, dispoFilterMetier]);

  // ST form
  const [showSTForm, setShowSTForm] = useState(false);
  const [editSTId, setEditSTId] = useState<string | null>(null);
  const [stForm, setSTForm] = useState({ societe: '', prenom: '', nom: '', telephone: '', email: '', identifiant: '', motDePasse: '', couleur: ST_COLORS[0] });
  const [showSTMdp, setShowSTMdp] = useState(false);

  // ST — modales Finances & Documents légaux (ouvertes en place depuis la carte)
  const [financesSTId, setFinancesSTId] = useState<string | null>(null);
  const [docsSTId, setDocsSTId] = useState<string | null>(null);
  // Redirection ancien lien /(tabs)/sous-traitants?stId=... → ouvre la modale Finances ici
  useEffect(() => {
    if (params.stId && params.tab === 'soustraitants') {
      const exists = data.sousTraitants.find(s => s.id === params.stId);
      if (exists) {
        if (params.view === 'docs') setDocsSTId(params.stId);
        else setFinancesSTId(params.stId);
      }
    }
  }, [params.stId, params.tab, params.view, data.sousTraitants]);
  // Sous-modales partagées (devis / acompte / ajout doc libre)
  const [showDevisForm, setShowDevisForm] = useState(false);
  const [editDevisId, setEditDevisId] = useState<string | null>(null);
  const [devisForm, setDevisForm] = useState({ chantierId: '', objet: '', prixConvenu: '' });
  const [showAcompteForm, setShowAcompteForm] = useState(false);
  const [acompteTargetDevisId, setAcompteTargetDevisId] = useState('');
  const [acompteForm, setAcompteForm] = useState({ date: '', montant: '', commentaire: '' });
  const [showDocLibreModal, setShowDocLibreModal] = useState(false);
  const [docLibelle, setDocLibelle] = useState('');
  const [docFichier, setDocFichier] = useState('');

  // Apporteurs form
  const [showApporteurForm, setShowApporteurForm] = useState(false);
  const [editApporteurId, setEditApporteurId] = useState<string | null>(null);
  const [apporteurForm, setApporteurForm] = useState<Omit<Apporteur, 'id' | 'createdAt' | 'updatedAt'>>({
    type: 'architecte', prenom: '', nom: '', societe: '', telephone: '', email: '', adresse: '', siret: '', notes: '',
    identifiant: '', motDePasse: '', accesApp: false,
  });
  const [showApporteurMdp, setShowApporteurMdp] = useState(false);

  const filteredEmployes = useMemo(() => {
    let list = data.employes;
    if (filterMetier !== 'all') list = list.filter(e => e.metier === filterMetier);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e =>
        `${e.prenom} ${e.nom}`.toLowerCase().includes(q) ||
        e.identifiant.toLowerCase().includes(q) ||
        (e.telephone || '').includes(q)
      );
    }
    return list;
  }, [data.employes, filterMetier, searchQuery]);

  const openNew = () => {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setShowHoraires(false);
    setShowMdp(true); // Mot de passe visible à la création pour que l'admin puisse le noter
    setShowForm(true);
  };

  const openEdit = (emp: Employe) => {
    setEditId(emp.id);
    setForm({
      prenom: emp.prenom,
      nom: emp.nom,
      metier: emp.metier,
      role: emp.role,
      identifiant: emp.identifiant || '',
      motDePasse: emp.motDePasse || '',
      salaireNet: emp.salaireNet != null ? String(emp.salaireNet) : '',
      modeSalaire: emp.modeSalaire || 'mensuel',
      tarifJournalier: emp.tarifJournalier != null ? String(emp.tarifJournalier) : '',
      couleur: emp.couleur || EMPLOYE_COLORS[0],
      horaires: emp.horaires ? { ...emp.horaires } : { ...HORAIRES_DEFAUT },
      isAcheteur: emp.isAcheteur || false,
      isRH: emp.isRH || false,
      isCommercial: emp.isCommercial || false,
      doitPointer: emp.doitPointer !== false,
      telephone: emp.telephone || '',
      email: emp.email || '',
      photoProfil: emp.photoProfil || '',
    });
    setShowHoraires(false);
    setShowMdp(false);
    setShowForm(true);
  };

  const confirmAccreditation = (field: 'isAcheteur' | 'isRH' | 'isCommercial', newValue: boolean, label: string) => {
    if (!newValue) {
      setForm(f => ({ ...f, [field]: false }));
      return;
    }
    const msg = `Accorder l'accréditation "${label}" à cet employé ?`;
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(msg) : true)) setForm(f => ({ ...f, [field]: true }));
    } else {
      Alert.alert('Confirmation', msg, [
        { text: t.common.cancel, style: 'cancel' },
        { text: 'Confirmer', onPress: () => setForm(f => ({ ...f, [field]: true })) },
      ]);
    }
  };

  const handleSave = () => {
    if (!form.prenom.trim() || !form.identifiant.trim() || !form.motDePasse.trim()) return;
    const salaire = form.salaireNet.trim() ? parseFloat(form.salaireNet.replace(',', '.')) : undefined;
    const tarif = form.tarifJournalier.trim() ? parseFloat(form.tarifJournalier.replace(',', '.')) : undefined;
    const employe: Employe = {
      id: editId || genId(),
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      metier: form.metier,
      role: form.role,
      identifiant: form.identifiant.trim().toLowerCase(),
      motDePasse: form.motDePasse,
      couleur: form.couleur || EMPLOYE_COLORS[0],
      salaireNet: form.modeSalaire === 'mensuel' && salaire && !isNaN(salaire) ? salaire : undefined,
      modeSalaire: form.modeSalaire,
      tarifJournalier: form.modeSalaire === 'journalier' && tarif && !isNaN(tarif) ? tarif : undefined,
      horaires: form.horaires,
      isAcheteur: form.isAcheteur,
      isRH: form.isRH,
      isCommercial: form.isCommercial,
      doitPointer: form.doitPointer,
      telephone: form.telephone.trim() || undefined,
      email: form.email.trim() || undefined,
      photoProfil: form.photoProfil || undefined,
    };
    if (editId) {
      updateEmploye(employe);
    } else {
      addEmploye(employe);
    }
    setShowForm(false);
  };

  const handleDelete = (id: string, nom: string) => {
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`${t.common.deleteConfirm} "${nom}" ?`) : true)) deleteEmploye(id);
    } else {
      Alert.alert(t.equipe.deleteEmployee, `${t.common.deleteConfirm} "${nom}" ?`, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: () => deleteEmploye(id) },
      ]);
    }
  };

  const getChantierCount = (empId: string): number => {
    const today = new Date();
    return data.chantiers.filter(c =>
      c.employeIds.includes(empId) && c.statut === 'actif' && new Date(c.dateFin) >= today
    ).length;
  };

  const updateHoraire = (jour: number, field: 'actif' | 'debut' | 'fin', value: boolean | string) => {
    setForm(f => ({
      ...f,
      horaires: {
        ...f.horaires,
        [jour]: { ...f.horaires[jour], [field]: value },
      },
    }));
  };

  const handleCopy = (text: string, field: string) => {
    copyToClipboard(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Documents RH par employé ──
  const DOC_TYPES: { key: DocumentRHEmploye['type']; label: string }[] = [
    { key: 'contrat_travail', label: 'Contrat de travail' },
    { key: 'due', label: 'DUE (Déclaration Unique d’Embauche)' },
    { key: 'cni', label: 'CNI (Carte Nationale d’Identité)' },
    { key: 'carte_vitale', label: 'Carte Vitale' },
    { key: 'justif_domicile', label: 'Justificatif de domicile' },
  ];

  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsEmployeId, setDocsEmployeId] = useState<string | null>(null);

  const openDocsModal = (empId: string) => {
    setDocsEmployeId(empId);
    setShowDocsModal(true);
  };

  const handleUploadDoc = (employeId: string, type: DocumentRHEmploye['type'], label: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Non disponible', 'L’upload de fichiers est disponible depuis le navigateur web.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const docId = `drh_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        // Upload vers Supabase Storage
        const storageUrl = await uploadFileToStorage(base64, `employes/${employeId}/documents`, docId);
        const doc: DocumentRHEmploye = {
          id: docId,
          employeId,
          type,
          libelle: label,
          fichier: storageUrl || base64,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser?.employeId || 'admin',
        };
        addDocumentRH(doc);
      };
      reader.readAsDataURL(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  // Z1 — Inbox flow équivalent de handleUploadDoc (mobile-compat).
  const addFromInboxRH = useCallback(
    async (
      employeId: string,
      type: DocumentRHEmploye['type'],
      label: string,
      item: InboxItem,
    ): Promise<boolean> => {
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const docId = `inbox_${item.id}`;
      const url = await uploadFileToStorage(fileURI, `employes/${employeId}/documents`, docId);
      if (!url) return false;
      addDocumentRH({
        id: docId,
        employeId,
        type,
        libelle: label,
        fichier: url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.employeId || 'admin',
      });
      return true;
    },
    [addDocumentRH, currentUser],
  );

  const handleDeleteDoc = (docId: string, label: string) => {
    const doDelete = () => deleteDocumentRH(docId);
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer le document "${label}" ?\nCette action est irréversible.`) : true)) doDelete();
    } else {
      Alert.alert('Supprimer ?', `Supprimer "${label}" ?`, [
        { text: t.common.cancel, style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ── Sous-traitants ──
  const openNewST = () => {
    setEditSTId(null);
    setSTForm({ societe: '', prenom: '', nom: '', telephone: '', email: '', identifiant: '', motDePasse: '', couleur: ST_COLORS[0] });
    setShowSTMdp(true); // Mot de passe visible à la création
    setShowSTForm(true);
  };

  const openEditST = (st: SousTraitant) => {
    setEditSTId(st.id);
    setSTForm({ societe: st.societe || '', prenom: st.prenom || '', nom: st.nom || '', telephone: st.telephone || '', email: st.email || '', identifiant: st.identifiant || '', motDePasse: st.motDePasse || '', couleur: st.couleur || ST_COLORS[0] });
    setShowSTMdp(false);
    setShowSTForm(true);
  };

  const handleSaveST = () => {
    if (!stForm.identifiant.trim() || !stForm.motDePasse.trim()) return;
    const st = {
      id: editSTId || `st_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      societe: stForm.societe.trim(),
      prenom: stForm.prenom.trim(),
      nom: stForm.nom.trim(),
      adresse: '',
      telephone: stForm.telephone.trim(),
      email: stForm.email.trim(),
      identifiant: stForm.identifiant.trim().toLowerCase(),
      motDePasse: stForm.motDePasse,
      documents: editSTId ? (data.sousTraitants.find(s => s.id === editSTId)?.documents || []) : [],
      couleur: stForm.couleur,
    };
    if (editSTId) updateSousTraitant(st);
    else addSousTraitant(st);
    setShowSTForm(false);
  };

  const handleDeleteST = (id: string, nom: string) => {
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`${t.common.deleteConfirm} "${nom}" ?`) : true)) deleteSousTraitant(id);
    } else {
      Alert.alert(t.common.delete, `${t.common.deleteConfirm} "${nom}" ?`, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: () => deleteSousTraitant(id) },
      ]);
    }
  };

  // ── ST : ouvre les modales Finances / Documents en place ──
  const openFinancesFor = (st: SousTraitant) => setFinancesSTId(st.id);
  const openDocsFor = (st: SousTraitant) => setDocsSTId(st.id);
  const currentFinancesST = financesSTId ? data.sousTraitants.find(s => s.id === financesSTId) || null : null;
  const currentDocsST = docsSTId ? data.sousTraitants.find(s => s.id === docsSTId) || null : null;
  const currentActiveST = currentFinancesST || currentDocsST;

  // ── Documents légaux : upload direct pour un type requis ──
  const handleUploadDocForType = (typeLabel: string) => {
    const st = currentDocsST;
    if (!st || Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${st.id}/documents`, docId);
        const doc: DocumentST = {
          id: docId,
          libelle: typeLabel,
          fichier: storageUrl || base64,
          uploadedAt: new Date().toISOString(),
        };
        updateSousTraitant({ ...st, documents: [...st.documents, doc] });
      };
      reader.readAsDataURL(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  // Z2 — Inbox flow équivalent de handleUploadDocForType (mobile-compat).
  const addFromInboxDocST = useCallback(
    async (typeLabel: string, item: InboxItem): Promise<boolean> => {
      const st = currentDocsST;
      if (!st) return false;
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const docId = `inbox_${item.id}`;
      const url = await uploadFileToStorage(fileURI, `sous-traitants/${st.id}/documents`, docId);
      if (!url) return false;
      const doc: DocumentST = {
        id: docId,
        libelle: typeLabel,
        fichier: url,
        uploadedAt: new Date().toISOString(),
      };
      updateSousTraitant({ ...st, documents: [...st.documents, doc] });
      return true;
    },
    [currentDocsST, updateSousTraitant],
  );

  const handleDeleteDocST = (docId: string) => {
    const st = currentDocsST;
    if (!st) return;
    const doc = st.documents.find(d => d.id === docId);
    const label = doc?.libelle || '';
    const doDelete = () =>
      updateSousTraitant({ ...st, documents: st.documents.filter(d => d.id !== docId) });
    if (Platform.OS === 'web') {
      const msg = label
        ? `Supprimer "${label}" ?\nCette action est irréversible.`
        : 'Supprimer ce document ?\nCette action est irréversible.';
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(msg) : true)) doDelete();
    } else {
      Alert.alert('Supprimer ce document ?', label, [
        { text: t.common.cancel, style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ── Document libre (hors checklist) ──
  const handlePickDocLibre = () => {
    if (Platform.OS !== 'web') return;
    const st = currentDocsST;
    if (!st) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${st.id}/documents`, docId);
        setDocFichier(storageUrl || base64);
      };
      reader.readAsDataURL(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  // Z3 — Inbox flow équivalent de handlePickDocLibre (mobile-compat).
  // Comme l'original, alimente uniquement docFichier ; le save est
  // déclenché ensuite par handleSaveDocLibre quand l'utilisateur valide.
  const addFromInboxDocLibre = useCallback(
    async (item: InboxItem): Promise<boolean> => {
      const st = currentDocsST;
      if (!st) return false;
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const docId = `inbox_${item.id}`;
      const url = await uploadFileToStorage(fileURI, `sous-traitants/${st.id}/documents`, docId);
      if (!url) return false;
      setDocFichier(url);
      return true;
    },
    [currentDocsST],
  );

  const handleSaveDocLibre = () => {
    const st = currentDocsST;
    if (!st || !docLibelle.trim() || !docFichier) return;
    const doc: DocumentST = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      libelle: docLibelle.trim(),
      fichier: docFichier,
      uploadedAt: new Date().toISOString(),
    };
    updateSousTraitant({ ...st, documents: [...st.documents, doc] });
    setDocLibelle(''); setDocFichier(''); setShowDocLibreModal(false);
  };

  // ── Devis ──
  const openNewDevis = () => {
    setEditDevisId(null);
    setDevisForm({ chantierId: data.chantiers[0]?.id || '', objet: '', prixConvenu: '' });
    setShowDevisForm(true);
  };
  const openEditDevis = (d: DevisST) => {
    setEditDevisId(d.id);
    setDevisForm({ chantierId: d.chantierId, objet: d.objet, prixConvenu: String(d.prixConvenu) });
    setShowDevisForm(true);
  };
  const handleSaveDevis = () => {
    const st = currentFinancesST;
    if (!st || !devisForm.chantierId || !devisForm.prixConvenu) return;
    const prix = parseFloat(devisForm.prixConvenu.replace(',', '.'));
    if (isNaN(prix)) return;
    if (editDevisId) {
      const existing = data.devis.find(d => d.id === editDevisId);
      if (!existing) return;
      updateDevis({ ...existing, chantierId: devisForm.chantierId, objet: devisForm.objet, prixConvenu: prix });
    } else {
      addDevis({
        id: `dv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        soustraitantId: st.id,
        chantierId: devisForm.chantierId,
        objet: devisForm.objet || 'Devis',
        prixConvenu: prix,
        createdAt: new Date().toISOString(),
      });
    }
    setShowDevisForm(false);
  };
  const handleDeleteDevis = async (d: DevisST) => {
    if (await confirmDelete(t.sousTraitants?.deleteDevis || 'Supprimer ce devis ?')) deleteDevis(d.id);
  };

  const handleUploadDevisFichier = (devisId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const fileId = `devis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const stId = currentFinancesST?.id || 'general';
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${stId}/devis`, fileId);
        const existing = data.devis.find(d => d.id === devisId);
        if (!existing) return;
        updateDevis({ ...existing, devisFichier: storageUrl || base64 });
      };
      reader.readAsDataURL(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  // Z4 — Inbox flow équivalent de handleUploadDevisFichier (mobile-compat).
  const addFromInboxDevisFichier = useCallback(
    async (devisId: string, item: InboxItem): Promise<boolean> => {
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const fileId = `inbox_${item.id}`;
      const stId = currentFinancesST?.id || 'general';
      const url = await uploadFileToStorage(fileURI, `sous-traitants/${stId}/devis`, fileId);
      if (!url) return false;
      const existing = data.devis.find(d => d.id === devisId);
      if (!existing) return false;
      updateDevis({ ...existing, devisFichier: url });
      return true;
    },
    [currentFinancesST, data.devis, updateDevis],
  );

  const handleUploadDevisSigne = (devisId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const fileId = `signe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const stId = currentFinancesST?.id || 'general';
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${stId}/devis`, fileId);
        const existing = data.devis.find(d => d.id === devisId);
        if (!existing) return;
        updateDevis({ ...existing, devisSigne: storageUrl || base64 });
      };
      reader.readAsDataURL(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  // Z5 — Inbox flow équivalent de handleUploadDevisSigne (mobile-compat).
  const addFromInboxDevisSigne = useCallback(
    async (devisId: string, item: InboxItem): Promise<boolean> => {
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const fileId = `inbox_${item.id}`;
      const stId = currentFinancesST?.id || 'general';
      const url = await uploadFileToStorage(fileURI, `sous-traitants/${stId}/devis`, fileId);
      if (!url) return false;
      const existing = data.devis.find(d => d.id === devisId);
      if (!existing) return false;
      updateDevis({ ...existing, devisSigne: url });
      return true;
    },
    [currentFinancesST, data.devis, updateDevis],
  );

  // ── Acomptes ST ──
  const openNewAcompte = (devisId: string) => {
    setAcompteTargetDevisId(devisId);
    const today = new Date().toISOString().split('T')[0];
    setAcompteForm({ date: today, montant: '', commentaire: '' });
    setShowAcompteForm(true);
  };
  const handleSaveAcompte = () => {
    if (!acompteTargetDevisId || !acompteForm.montant) return;
    const montant = parseFloat(acompteForm.montant.replace(',', '.'));
    if (isNaN(montant)) return;
    addAcompteST({
      id: `ast_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      devisId: acompteTargetDevisId,
      date: acompteForm.date,
      montant,
      commentaire: acompteForm.commentaire,
      createdAt: new Date().toISOString(),
    });
    setShowAcompteForm(false);
  };
  const handleUploadFacture = (acompteId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const fileId = `facture_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const stId = currentFinancesST?.id || 'general';
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${stId}/factures`, fileId);
        const existing = data.acomptesst.find(a => a.id === acompteId);
        if (!existing) return;
        updateAcompteST({ ...existing, facture: storageUrl || base64 });
      };
      reader.readAsDataURL(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  // Z6 — Inbox flow équivalent de handleUploadFacture (mobile-compat).
  const addFromInboxFacture = useCallback(
    async (acompteId: string, item: InboxItem): Promise<boolean> => {
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const fileId = `inbox_${item.id}`;
      const stId = currentFinancesST?.id || 'general';
      const url = await uploadFileToStorage(fileURI, `sous-traitants/${stId}/factures`, fileId);
      if (!url) return false;
      const existing = data.acomptesst.find(a => a.id === acompteId);
      if (!existing) return false;
      updateAcompteST({ ...existing, facture: url });
      return true;
    },
    [currentFinancesST, data.acomptesst, updateAcompteST],
  );

  // ── Apporteurs CRUD ──
  const apporteurs = data.apporteurs || [];
  const marchesWithCommission = (data.marchesChantier || []).filter(m => m.commission);

  const openNewApporteur = (presetType?: Apporteur['type']) => {
    setEditApporteurId(null);
    setApporteurForm({
      type: presetType || 'architecte',
      prenom: '', nom: '', societe: '', telephone: '', email: '', adresse: '', siret: '', notes: '',
      identifiant: '', motDePasse: '', accesApp: false,
    });
    setShowApporteurMdp(true);
    setShowApporteurForm(true);
  };

  const openEditApporteur = (a: Apporteur) => {
    setEditApporteurId(a.id);
    setApporteurForm({
      type: a.type, prenom: a.prenom, nom: a.nom, societe: a.societe || '',
      telephone: a.telephone || '', email: a.email || '', adresse: a.adresse || '',
      siret: a.siret || '', notes: a.notes || '',
      // Le champ motDePasseVisible (côté admin) est la source de vérité affichable
      identifiant: a.identifiant || '', motDePasse: a.motDePasseVisible || a.motDePasse || '', accesApp: a.accesApp || false,
    });
    setShowApporteurMdp(false);
    setShowApporteurForm(true);
  };
  const genererMdpPourForm = async () => {
    const { generatePassword } = await import('@/lib/externAuth');
    const nouveau = generatePassword(10);
    setApporteurForm(f => ({ ...f, motDePasse: nouveau }));
    setShowApporteurMdp(true);
  };

  const handleSaveApporteur = async () => {
    if (!apporteurForm.prenom.trim() || !apporteurForm.nom.trim()) return;
    const now = new Date().toISOString();
    const isCreation = !editApporteurId;
    const existing = editApporteurId ? apporteurs.find(a => a.id === editApporteurId) : undefined;

    // Hash du mot de passe si changé
    const newMdp = (apporteurForm.motDePasse || '').trim();
    const previousVisible = existing?.motDePasseVisible;
    let mdpFields: Partial<Apporteur> = {};
    if (newMdp && newMdp !== previousVisible) {
      const { preparerChangementMotDePasse } = await import('@/lib/externAuth');
      mdpFields = await preparerChangementMotDePasse(newMdp);
    } else if (!newMdp && existing) {
      // L'admin a vidé le champ → on garde l'existant (pas de reset)
      mdpFields = {
        motDePasseHash: existing.motDePasseHash,
        motDePasseSalt: existing.motDePasseSalt,
        motDePasseVisible: existing.motDePasseVisible,
        motDePasse: undefined,
      };
    }

    const cleanForm: Omit<Apporteur, 'id' | 'createdAt' | 'updatedAt'> = {
      ...apporteurForm,
      identifiant: apporteurForm.identifiant?.trim().toLowerCase() || undefined,
      motDePasse: undefined,   // plus de stockage en clair
      ...mdpFields,
      accesApp: !!apporteurForm.accesApp,
    };
    if (editApporteurId && existing) {
      updateApporteur({ ...existing, ...cleanForm, updatedAt: now });
    } else {
      addApporteur({
        id: `app_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        ...cleanForm,
        createdAt: now,
        updatedAt: now,
      });
    }
    setShowApporteurForm(false);
    // Retour automatique au formulaire de marché si on vient de là
    if (isCreation && params.returnToMarche === '1') {
      setTimeout(() => {
        (async () => {
          try {
            const raw = await AsyncStorage.getItem('sk_pending_marche_form');
            if (raw) {
              const saved = JSON.parse(raw);
              if (saved.chantierId) {
                router.push({ pathname: '/(tabs)/chantiers', params: { action: 'marches', chantierId: saved.chantierId } });
              }
            }
          } catch {}
        })();
      }, 200);
    }
    // Retour automatique au formulaire chantier si on vient de là
    if (isCreation && params.returnToChantier === '1') {
      setTimeout(() => {
        router.push('/(tabs)/chantiers');
      }, 200);
    }
  };

  const handleDeleteApporteur = async (a: Apporteur) => {
    if (await confirmDelete(`Supprimer ${a.prenom} ${a.nom} ?`)) deleteApporteur(a.id);
  };

  // Calcul du montant d'une commission (résout % -> €)
  const calcCommissionAmount = (apporteurId: string): { total: number; paye: number; duDu: number } => {
    let total = 0;
    let paye = 0;
    marchesWithCommission.forEach(m => {
      if (!m.commission || m.commission.apporteurId !== apporteurId) return;
      const c = m.commission;
      let montant = 0;
      if (c.modeCommission === 'montant') {
        montant = c.valeur;
      } else {
        const base = c.baseCalcul === 'TTC' ? m.montantTTC : m.montantHT;
        montant = base * (c.valeur / 100);
      }
      total += montant;
      if (c.statut === 'paye') paye += montant;
    });
    return { total, paye, duDu: total - paye };
  };

  const fmtEur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  const renderEmploye = ({ item }: { item: Employe }) => {
    const mc = metierColors[item.metier] || metierColors['autre'];
    const avatarColor = item.couleur || getAvatarColor(item.prenom);
    const count = getChantierCount(item.id);
    const hasSalaire = (isAdmin || isRH) && ((item.salaireNet != null && item.modeSalaire !== 'journalier') || (item.modeSalaire === 'journalier' && item.tarifJournalier != null));
    const salaireText = item.modeSalaire === 'journalier' && item.tarifJournalier != null
      ? `${item.tarifJournalier.toLocaleString('fr-FR')} €/j`
      : item.salaireNet != null ? `${item.salaireNet.toLocaleString('fr-FR')} €/mois` : '';

    return (
      <View style={styles.card}>
        {/* Ligne principale : avatar + infos + tarif */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.avatar, { backgroundColor: avatarColor, overflow: 'hidden' }]}>
            {item.photoProfil ? (
              <Image source={{ uri: item.photoProfil }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={styles.avatarText}>{(item.prenom?.[0] || '?')}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.cardName} numberOfLines={1}>{item.prenom} {(item.nom || '').toUpperCase()}</Text>
              <View style={[styles.metierBadge, { backgroundColor: mc.color + '18' }]}>
                <View style={[styles.metierDot, { backgroundColor: mc.color }]} />
                <Text style={[styles.metierText, { color: mc.color }]}>{mc.label}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              {hasSalaire && <Text style={styles.salaireInfo}>{salaireText}</Text>}
              {count > 0 && <Text style={styles.chantierCount}>· {count} chantier{count > 1 ? 's' : ''}</Text>}
              {item.telephone ? <Text style={styles.contactInfo}>· {item.telephone}</Text> : null}
            </View>
          </View>
        </View>

        {/* Badges accréditations (compact) */}
        {(item.isAcheteur || item.isRH || item.isCommercial || item.doitPointer === false) && (
          <View style={styles.badgesRow}>
            {item.isAcheteur && <View style={styles.badge}><Text style={styles.badgeText}>🛒 Acheteur</Text></View>}
            {item.isRH && <View style={[styles.badge, { backgroundColor: '#D4EDDA' }]}><Text style={[styles.badgeText, { color: '#155724' }]}>👥 RH</Text></View>}
            {item.isCommercial && <View style={[styles.badge, { backgroundColor: '#FFF3CD' }]}><Text style={[styles.badgeText, { color: '#856404' }]}>💼 Commercial</Text></View>}
            {item.doitPointer === false && <View style={[styles.badge, { backgroundColor: '#F8D7DA' }]}><Text style={[styles.badgeText, { color: '#721C24' }]}>⏱ Sans pointage</Text></View>}
          </View>
        )}

        {/* Actions en bas */}
        <View style={styles.cardBottomRow}>
          {(isAdmin || isRH) && (
            <Pressable style={styles.credentialBtn} onPress={() => handleCopy(`Identifiant : ${item.identifiant}, MDP : ${item.motDePasse}`, `all_${item.id}`)}>
              <Text style={styles.credentialBtnText} numberOfLines={1}>
                {copiedField === `all_${item.id}` ? '✓ Copié !' : `📋 ${item.identifiant} · MDP : ${item.motDePasse}`}
              </Text>
            </Pressable>
          )}
          {/* Pense-bêtes (visible admin uniquement) */}
          {isAdmin && (item.penseBetes || []).length > 0 && (
            <View style={{ backgroundColor: '#FFF3CD', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginRight: 4 }}>
              <Text style={{ fontSize: 10, color: '#856404' }} numberOfLines={1}>📌 {(item.penseBetes || []).length} note{(item.penseBetes || []).length > 1 ? 's' : ''}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {isAdmin && (
            <Pressable style={styles.actionBtnRound} onPress={() => setHistoriqueEmployeId(item.id)}>
              <Text style={{ fontSize: 14 }}>🏗</Text>
            </Pressable>
          )}
          {isAdmin && (
            <Pressable style={[styles.actionBtnRound, { backgroundColor: '#FFF8E1' }]} onPress={() => { setBadgeEmployeId(item.id); setBadgeType('ponctualite'); setBadgeMessage(''); }}>
              <Text style={{ fontSize: 14 }}>🏆</Text>
            </Pressable>
          )}
          {(isAdmin || isRH) && (
            <Pressable style={styles.actionBtnRound} onPress={() => openDocsModal(item.id)}>
              <Text style={{ fontSize: 14 }}>📂</Text>
            </Pressable>
          )}
          <Pressable style={styles.actionBtnRound} onPress={() => openEdit(item)}>
            <Text style={{ fontSize: 14 }}>✏️</Text>
          </Pressable>
          <Pressable style={[styles.actionBtnRound, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDelete(item.id, `${item.prenom} ${item.nom}`)}>
            <Text style={{ fontSize: 14 }}>🗑</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderST = ({ item }: { item: SousTraitant }) => {
    const docsFournis = DOCUMENTS_LEGAUX_TYPES.filter(td => findDocForType(item.documents || [], td.id, td.label)).length;
    const docsTotal = DOCUMENTS_LEGAUX_TYPES.length;
    const docsComplet = docsFournis === docsTotal;
    const stMarchesCount = (data.devis || []).filter(d => d.soustraitantId === item.id).length;
    return (
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.avatar, { backgroundColor: item.couleur || '#00BCD4' }]}>
            <Text style={styles.avatarText}>{(item.societe || item.prenom || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.cardName} numberOfLines={1}>{item.societe || `${item.prenom} ${item.nom}`}</Text>
              <View style={[styles.metierBadge, { backgroundColor: '#E0F7FA' }]}>
                <Text style={[styles.metierText, { color: '#006064' }]}>Sous-traitant</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              {item.societe ? <Text style={styles.chantierCount}>{item.prenom} {item.nom}</Text> : null}
              {item.telephone ? <Text style={styles.contactInfo}>· {item.telephone}</Text> : null}
            </View>
          </View>
          <Pressable style={[styles.actionBtnRound, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDeleteST(item.id, item.societe || `${item.prenom} ${item.nom}`)}>
            <Text style={{ fontSize: 14 }}>🗑</Text>
          </Pressable>
        </View>

        {/* Boutons 3-actions (Infos / Finances / Docs) */}
        <View style={stStyles.actionButtonsRow}>
          <Pressable style={[stStyles.actionButton, stStyles.actionButtonEdit]} onPress={() => openEditST(item)}>
            <Text style={stStyles.actionButtonIcon}>✏️</Text>
            <Text style={stStyles.actionButtonLabel}>Infos</Text>
          </Pressable>
          <Pressable style={[stStyles.actionButton, stStyles.actionButtonMoney]} onPress={() => openFinancesFor(item)}>
            <Text style={stStyles.actionButtonIcon}>💰</Text>
            <Text style={stStyles.actionButtonLabel}>Finances</Text>
          </Pressable>
          <Pressable style={[stStyles.actionButton, stStyles.actionButtonDocs, docsComplet && stStyles.actionButtonDocsOk]} onPress={() => openDocsFor(item)}>
            <Text style={stStyles.actionButtonIcon}>📄</Text>
            <Text style={stStyles.actionButtonLabel}>Docs {docsFournis}/{docsTotal}</Text>
          </Pressable>
        </View>

        {(isAdmin || isRH) && (
          <View style={styles.cardBottomRow}>
            <Pressable style={styles.credentialBtn} onPress={() => handleCopy(`Identifiant : ${item.identifiant}, MDP : ${item.motDePasse}`, `stall_${item.id}`)}>
              <Text style={styles.credentialBtnText} numberOfLines={1}>
                {copiedField === `stall_${item.id}` ? '✓ Copié !' : `📋 ${item.identifiant} · MDP : ${item.motDePasse}`}
              </Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 11, color: '#B0BEC5' }}>{stMarchesCount} devis</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenContainer containerClassName="bg-[#F5EDE3]">
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.equipe.title}</Text>
        <Pressable style={styles.addBtn} onPress={activeTab === 'employes' ? openNew : activeTab === 'soustraitants' ? openNewST : () => openNewApporteur()}>
          <Text style={styles.addBtnText}>{t.common.add}</Text>
        </Pressable>
      </View>

      {/* Onglets Employés / Sous-traitants / Apporteurs */}
      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, activeTab === 'employes' && styles.tabBtnActive]} onPress={() => setActiveTab('employes')}>
          <Text style={[styles.tabBtnText, activeTab === 'employes' && styles.tabBtnTextActive]}>
            {t.equipe.employees} ({data.employes.length})
          </Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === 'soustraitants' && styles.tabBtnActive]} onPress={() => setActiveTab('soustraitants')}>
          <Text style={[styles.tabBtnText, activeTab === 'soustraitants' && styles.tabBtnTextActive]}>
            {t.equipe.subcontractors} ({data.sousTraitants.length})
          </Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === 'apporteurs' && styles.tabBtnActive]} onPress={() => setActiveTab('apporteurs')}>
          <Text style={[styles.tabBtnText, activeTab === 'apporteurs' && styles.tabBtnTextActive]}>
            🤝 Apporteurs ({apporteurs.length})
          </Text>
        </Pressable>
      </View>

      {/* Barre de recherche */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'employes' ? 'Rechercher un employé...' : 'Rechercher un sous-traitant...'}
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} style={styles.searchClear}>
            <Text style={{ color: '#999', fontSize: 16 }}>✕</Text>
          </Pressable>
        )}
      </View>

      {activeTab === 'employes' && (
        <>
          {/* Filtre métiers */}
          {/* Bouton disponibilité */}
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EBF5FB', borderRadius: 10, padding: 10, marginBottom: 8, marginHorizontal: 16 }}
            onPress={() => setShowDispo(true)}>
            <Text style={{ fontSize: 16 }}>📅</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2C' }}>Disponibilité — qui est libre ?</Text>
            <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600', marginLeft: 'auto' }}>{disponibilite.libres.length} libre{disponibilite.libres.length > 1 ? 's' : ''}</Text>
          </Pressable>

          {/* Filtre métiers */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
            <Pressable style={[styles.filterChip, filterMetier === 'all' && styles.filterChipActive]} onPress={() => setFilterMetier('all')}>
              <Text style={[styles.filterChipText, filterMetier === 'all' && styles.filterChipTextActive]}>{t.common.all}</Text>
            </Pressable>
            {metiersList.map(m => {
              const mc = metierColors[m] || metierColors['autre'];
              const active = filterMetier === m;
              return (
                <Pressable key={m} style={[styles.filterChip, active && { backgroundColor: mc.color, borderColor: mc.color }]} onPress={() => setFilterMetier(m)}>
                  <View style={[styles.filterDot, { backgroundColor: mc.color }]} />
                  <Text style={[styles.filterChipText, active && { color: '#fff' }]}>{mc.label}</Text>
                </Pressable>
              );
            })}
            {isAdmin && (
              <Pressable style={[styles.filterChip, { borderStyle: 'dashed' }]} onPress={() => setShowNewMetier(true)}>
                <Text style={[styles.filterChipText, { color: '#687076' }]}>+ Métier</Text>
              </Pressable>
            )}
          </ScrollView>
          <FlatList
            data={filteredEmployes}
            keyExtractor={item => item.id}
            renderItem={renderEmploye}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>{t.equipe.noEmployee}</Text></View>}
          />
        </>
      )}

      {activeTab === 'soustraitants' && (
        <FlatList
          data={searchQuery.trim() ? data.sousTraitants.filter(s => {
            const q = searchQuery.toLowerCase().trim();
            return `${s.prenom} ${s.nom}`.toLowerCase().includes(q) || s.societe.toLowerCase().includes(q) || s.telephone.includes(q);
          }) : data.sousTraitants}
          keyExtractor={item => item.id}
          renderItem={renderST}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>{t.equipe.noSubcontractor}</Text></View>}
        />
      )}

      {activeTab === 'apporteurs' && (
        <ScrollView contentContainerStyle={styles.list}>
          {/* Récap commissions en attente */}
          {marchesWithCommission.length > 0 && (
            <View style={styles.commissionRecap}>
              <Text style={styles.commissionRecapTitle}>💼 Commissions en attente</Text>
              {apporteurs
                .map(a => ({ a, calc: calcCommissionAmount(a.id) }))
                .filter(x => x.calc.duDu > 0)
                .map(({ a, calc }) => (
                  <View key={a.id} style={styles.commissionRecapRow}>
                    <Text style={styles.commissionRecapName}>{a.prenom} {a.nom}</Text>
                    <Text style={styles.commissionRecapAmount}>{fmtEur(calc.duDu)}</Text>
                  </View>
                ))}
              {apporteurs.every(a => calcCommissionAmount(a.id).duDu <= 0) && (
                <Text style={styles.commissionRecapEmpty}>Aucune commission en attente ✓</Text>
              )}
            </View>
          )}

          {apporteurs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucun architecte ni apporteur d'affaires</Text>
              <Text style={{ fontSize: 12, color: '#687076', marginTop: 6, textAlign: 'center' }}>
                Ajoutez-en un pour gérer les commissions sur les marchés
              </Text>
            </View>
          ) : (
            apporteurs
              .filter(a => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase().trim();
                return `${a.prenom} ${a.nom}`.toLowerCase().includes(q)
                  || (a.societe || '').toLowerCase().includes(q)
                  || (a.telephone || '').includes(q);
              })
              .map(a => {
                const calc = calcCommissionAmount(a.id);
                return (
                  <Pressable
                    key={a.id}
                    style={[styles.card, { borderLeftWidth: 4, borderLeftColor: APPORTEUR_TYPE_LABELS[a.type]?.couleur || '#C9A96E' }]}
                    onPress={() => openEditApporteur(a)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.avatar, { backgroundColor: APPORTEUR_TYPE_LABELS[a.type]?.couleur || '#C9A96E' }]}>
                        <Text style={styles.avatarText}>
                          {(a.prenom[0] || '?').toUpperCase()}{(a.nom[0] || '').toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.cardName} numberOfLines={1}>{a.prenom} {a.nom}</Text>
                          <View style={[styles.apporteurBadge, { backgroundColor: APPORTEUR_TYPE_LABELS[a.type]?.couleur || '#C9A96E' }]}>
                            <Text style={styles.apporteurBadgeText}>
                              {APPORTEUR_TYPE_LABELS[a.type]?.emoji || '🤝'} {APPORTEUR_TYPE_LABELS[a.type]?.label || a.type}
                            </Text>
                          </View>
                          {a.accesApp && (
                            <View style={{ backgroundColor: '#10B98122', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#10B981' }}>🔑 Accès app</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                          {a.societe ? <Text style={styles.contactInfo}>🏢 {a.societe}</Text> : null}
                          {a.telephone ? <Text style={styles.contactInfo}>· 📞 {a.telephone}</Text> : null}
                          {a.email ? <Text style={styles.contactInfo}>· ✉ {a.email}</Text> : null}
                        </View>
                      </View>
                    </View>
                    {calc.total > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F5EDE3', paddingTop: 8 }}>
                        <Text style={{ fontSize: 11, color: '#687076' }}>Total : {fmtEur(calc.total)}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: calc.duDu > 0 ? '#E74C3C' : '#27AE60' }}>
                          {calc.duDu > 0 ? `À payer : ${fmtEur(calc.duDu)}` : 'Tout payé ✓'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.cardBottomRow}>
                      <View style={{ flex: 1 }} />
                      <Pressable style={styles.actionBtnRound} onPress={() => openEditApporteur(a)}>
                        <Text style={{ fontSize: 14 }}>✏️</Text>
                      </Pressable>
                      <Pressable style={[styles.actionBtnRound, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDeleteApporteur(a)}>
                        <Text style={{ fontSize: 14 }}>🗑</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })
          )}
        </ScrollView>
      )}

      {/* ── Modal Apporteur ── */}
      <ModalKeyboard visible={showApporteurForm} animationType="slide" transparent onRequestClose={() => setShowApporteurForm(false)}>
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setShowApporteurForm(false)} />
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editApporteurId ? 'Modifier l\'apporteur' : 'Nouvel apporteur'}</Text>
              <Pressable onPress={() => setShowApporteurForm(false)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Type *</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {(['architecte', 'apporteur', 'contractant', 'client'] as const).map(ty => {
                  const meta = APPORTEUR_TYPE_LABELS[ty];
                  const active = apporteurForm.type === ty;
                  return (
                    <Pressable
                      key={ty}
                      style={[styles.apporteurChip, active && { borderColor: meta.couleur, backgroundColor: meta.couleur }]}
                      onPress={() => setApporteurForm(f => ({ ...f, type: ty }))}
                    >
                      <Text style={[styles.apporteurChipText, active && { color: '#fff' }]}>
                        {meta.emoji} {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.nameRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>{t.common.firstName} *</Text>
                  <TextInput style={styles.input} value={apporteurForm.prenom} onChangeText={v => setApporteurForm(f => ({ ...f, prenom: v }))} placeholder="Prénom" placeholderTextColor="#B0BEC5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t.equipe.lastName} *</Text>
                  <TextInput style={styles.input} value={apporteurForm.nom} onChangeText={v => setApporteurForm(f => ({ ...f, nom: v }))} placeholder="Nom" placeholderTextColor="#B0BEC5" />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Société</Text>
              <TextInput style={styles.input} value={apporteurForm.societe} onChangeText={v => setApporteurForm(f => ({ ...f, societe: v }))} placeholder="Ex: Cabinet Dupont Architecture" placeholderTextColor="#B0BEC5" />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Téléphone</Text>
              <TextInput style={styles.input} value={apporteurForm.telephone} onChangeText={v => setApporteurForm(f => ({ ...f, telephone: v }))} placeholder="06 12 34 56 78" placeholderTextColor="#B0BEC5" keyboardType="phone-pad" />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Email</Text>
              <TextInput style={styles.input} value={apporteurForm.email} onChangeText={v => setApporteurForm(f => ({ ...f, email: v }))} placeholder="email@exemple.fr" placeholderTextColor="#B0BEC5" keyboardType="email-address" autoCapitalize="none" />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Adresse</Text>
              <TextInput style={styles.input} value={apporteurForm.adresse} onChangeText={v => setApporteurForm(f => ({ ...f, adresse: v }))} placeholder="Adresse complète" placeholderTextColor="#B0BEC5" />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>SIRET</Text>
              <TextInput style={styles.input} value={apporteurForm.siret} onChangeText={v => setApporteurForm(f => ({ ...f, siret: v }))} placeholder="N° SIRET" placeholderTextColor="#B0BEC5" />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Notes</Text>
              <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={apporteurForm.notes} onChangeText={v => setApporteurForm(f => ({ ...f, notes: v }))} placeholder="Notes libres" placeholderTextColor="#B0BEC5" multiline />

              {/* ═══ Accès externe à l'application (optionnel) ═══ */}
              <View style={{ marginTop: 18, padding: 12, backgroundColor: '#FAF7F3', borderRadius: 12, borderWidth: 1, borderColor: '#E8DDD0' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>🔑 Accès à l'application</Text>
                    <Text style={styles.fieldHint}>Permet au contact de se connecter et voir ses chantiers.</Text>
                  </View>
                  <Switch
                    value={!!apporteurForm.accesApp}
                    onValueChange={v => setApporteurForm(f => ({ ...f, accesApp: v }))}
                    trackColor={{ false: '#E2E6EA', true: '#2C2C2C' }}
                    thumbColor="#fff"
                  />
                </View>
                {apporteurForm.accesApp && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Identifiant *</Text>
                    <TextInput
                      style={styles.input}
                      value={apporteurForm.identifiant || ''}
                      onChangeText={v => setApporteurForm(f => ({ ...f, identifiant: v }))}
                      placeholder="Ex: prenom.nom"
                      placeholderTextColor="#B0BEC5"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Mot de passe *</Text>
                    <View style={styles.mdpRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={apporteurForm.motDePasse || ''}
                        onChangeText={v => setApporteurForm(f => ({ ...f, motDePasse: v }))}
                        placeholder="Mot de passe"
                        placeholderTextColor="#B0BEC5"
                        secureTextEntry={!showApporteurMdp}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <Pressable style={styles.mdpToggle} onPress={() => setShowApporteurMdp(v => !v)}>
                        <Text style={styles.mdpToggleText}>{showApporteurMdp ? '🙈' : '👁'}</Text>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Pressable
                        style={{ flex: 1, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#C9A96E', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                        onPress={genererMdpPourForm}
                      >
                        <Text style={{ color: '#8C6D2F', fontWeight: '700', fontSize: 12 }}>🎲 Générer un mot de passe</Text>
                      </Pressable>
                      {apporteurForm.motDePasse && Platform.OS === 'web' && (
                        <Pressable
                          style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }}
                          onPress={() => {
                            try {
                              // @ts-ignore
                              navigator.clipboard?.writeText(apporteurForm.motDePasse || '');
                            } catch {}
                          }}
                        >
                          <Text style={{ color: '#C9A96E', fontWeight: '700', fontSize: 12 }}>📋 Copier</Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={{ fontSize: 10, color: '#8C8077', marginTop: 6, lineHeight: 14 }}>
                      Ce mot de passe est affiché uniquement pour l'admin. Le contact se connectera avec son identifiant + ce mot de passe. Stocké de manière sécurisée (SHA-256 + salt) en plus de la copie visible.
                    </Text>
                  </>
                )}
              </View>

              {/* ═══ Chantiers liés ═══ (visible seulement en édition) */}
              {editApporteurId && (() => {
                const linkedChantiers = data.chantiers.filter(c =>
                  c.architecteId === editApporteurId ||
                  c.apporteurId === editApporteurId ||
                  c.contractantId === editApporteurId ||
                  c.clientApporteurId === editApporteurId
                );
                const currentApporteurType = apporteurForm.type || 'apporteur';
                return (
                  <View style={{ marginTop: 18, padding: 12, backgroundColor: '#FAF7F3', borderRadius: 12, borderWidth: 1, borderColor: '#E8DDD0' }}>
                    <Text style={styles.fieldLabel}>🏗 Chantiers liés ({linkedChantiers.length})</Text>
                    {linkedChantiers.length === 0 ? (
                      <Text style={styles.fieldHint}>Aucun chantier lié à ce contact pour le moment.</Text>
                    ) : (
                      <View style={{ gap: 6, marginTop: 6 }}>
                        {linkedChantiers.map(c => {
                          // Déterminer le(s) rôle(s) pour ce chantier
                          const roles: string[] = [];
                          if (c.architecteId === editApporteurId) roles.push(APPORTEUR_TYPE_LABELS.architecte.emoji + ' Architecte');
                          if (c.apporteurId === editApporteurId) roles.push(APPORTEUR_TYPE_LABELS.apporteur.emoji + ' Apporteur');
                          if (c.contractantId === editApporteurId) roles.push(APPORTEUR_TYPE_LABELS.contractant.emoji + ' Contractant');
                          if (c.clientApporteurId === editApporteurId) roles.push(APPORTEUR_TYPE_LABELS.client.emoji + ' Client');
                          return (
                            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 8, padding: 8, borderLeftWidth: 3, borderLeftColor: c.couleur }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2C' }}>{c.nom}</Text>
                                <Text style={{ fontSize: 11, color: '#687076', marginTop: 2 }}>
                                  {[c.rue, c.ville].filter(Boolean).join(', ') || c.adresse || '—'}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#8C8077', marginTop: 2 }}>{roles.join(' · ')}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                    {/* Bouton Nouveau chantier lié */}
                    <Pressable
                      style={{
                        marginTop: 10,
                        backgroundColor: '#FAF3E6',
                        borderWidth: 1,
                        borderColor: '#C9A96E',
                        borderStyle: 'dashed',
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        setShowApporteurForm(false);
                        router.push({
                          pathname: '/(tabs)/chantiers',
                          params: { action: 'new', apporteurId: editApporteurId, apporteurType: currentApporteurType },
                        });
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#8C6D2F' }}>
                        ➕ Nouveau chantier lié
                      </Text>
                    </Pressable>
                  </View>
                );
              })()}
            </ScrollView>
            <Pressable style={[styles.saveBtn, (!apporteurForm.prenom.trim() || !apporteurForm.nom.trim() || (apporteurForm.accesApp && (!apporteurForm.identifiant?.trim() || !apporteurForm.motDePasse?.trim()))) && styles.saveBtnDisabled]} onPress={handleSaveApporteur} disabled={!apporteurForm.prenom.trim() || !apporteurForm.nom.trim() || (!!apporteurForm.accesApp && (!apporteurForm.identifiant?.trim() || !apporteurForm.motDePasse?.trim()))}>
              <Text style={styles.saveBtnText}>{editApporteurId ? t.common.save : t.common.create}</Text>
            </Pressable>
          </Pressable>
        </View>
      </ModalKeyboard>

      <ConfirmModal />

      {/* ── Modal Employé ── */}
      <ModalKeyboard visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setShowForm(false)} />
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? t.equipe.editEmployee : t.equipe.newEmployee}</Text>
              <Pressable onPress={() => setShowForm(false)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Prénom / Nom */}
              <View style={styles.nameRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>{t.common.firstName} *</Text>
                  <TextInput style={styles.input} value={form.prenom} onChangeText={v => setForm(f => ({
                    ...f, prenom: v,
                    identifiant: editId ? f.identifiant : buildIdentifiant(v, f.nom),
                  }))} placeholder="Ex: Sacha" placeholderTextColor="#B0BEC5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t.equipe.lastName}</Text>
                  <TextInput style={styles.input} value={form.nom} onChangeText={v => setForm(f => ({
                    ...f, nom: v,
                    identifiant: editId ? f.identifiant : buildIdentifiant(f.prenom, v),
                  }))} placeholder="Ex: Martin" placeholderTextColor="#B0BEC5" />
                </View>
              </View>

              {/* Photo de profil */}
              <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: form.couleur || '#2C2C2C', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {form.photoProfil ? (
                    <Image source={{ uri: form.photoProfil }} style={{ width: 56, height: 56 }} />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{(form.prenom?.[0] || '?').toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Pressable
                    style={{ backgroundColor: '#2C2C2C', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                    onPress={() => {
                      if (Platform.OS !== 'web') return;
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: Event) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const uri = ev.target?.result as string;
                          setForm(f => ({ ...f, photoProfil: uri }));
                        };
                        reader.readAsDataURL(file);
                      };
                      input.click(); setTimeout(() => input.remove(), 60000);
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>📷 {form.photoProfil ? 'Changer la photo' : 'Ajouter une photo'}</Text>
                  </Pressable>
                  {form.photoProfil && (
                    <Pressable
                      style={{ backgroundColor: '#FDECEA', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }}
                      onPress={() => setForm(f => ({ ...f, photoProfil: '' }))}
                    >
                      <Text style={{ color: '#E74C3C', fontSize: 11, fontWeight: '600' }}>Supprimer</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Téléphone / Email */}
              <View style={[styles.nameRow, { marginTop: 12 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Téléphone</Text>
                  <TextInput style={styles.input} value={form.telephone} onChangeText={v => setForm(f => ({ ...f, telephone: v }))} placeholder="06 00 00 00 00" placeholderTextColor="#B0BEC5" keyboardType="phone-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput style={styles.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="email@exemple.fr" placeholderTextColor="#B0BEC5" keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>

              {/* Identifiant */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t.equipe.loginId} *</Text>
              <TextInput style={styles.input} value={form.identifiant} onChangeText={v => setForm(f => ({ ...f, identifiant: v }))} placeholder="Ex: sacha.martin" placeholderTextColor="#B0BEC5" autoCapitalize="none" autoCorrect={false} />

              {/* Mot de passe */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t.common.password} *</Text>
              <View style={styles.mdpRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={form.motDePasse} onChangeText={v => setForm(f => ({ ...f, motDePasse: v }))} placeholder="Ex: 1234" placeholderTextColor="#B0BEC5" secureTextEntry={!showMdp} autoCapitalize="none" autoCorrect={false} />
                <Pressable style={styles.mdpToggle} onPress={() => setShowMdp(v => !v)}>
                  <Text style={styles.mdpToggleText}>{showMdp ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>

              {/* Mode salaire */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t.equipe.payMode}</Text>
              <View style={styles.roleRow}>
                {(['mensuel', 'journalier'] as const).map(m => (
                  <Pressable key={m} style={[styles.roleChip, form.modeSalaire === m && styles.roleChipActive]} onPress={() => setForm(f => ({ ...f, modeSalaire: m }))}>
                    <Text style={[styles.roleChipText, form.modeSalaire === m && styles.roleChipTextActive]}>
                      {m === 'mensuel' ? `💶 ${t.equipe.monthly}` : `📅 ${t.equipe.daily}`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {form.modeSalaire === 'mensuel' ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t.equipe.monthlySalary}</Text>
                  <TextInput style={styles.input} value={form.salaireNet} onChangeText={v => setForm(f => ({ ...f, salaireNet: v }))} placeholder="Ex: 1800" placeholderTextColor="#B0BEC5" keyboardType="numeric" />
                  <Text style={styles.fieldHint}>{t.equipe.salaryHint}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t.equipe.dailyRate}</Text>
                  <TextInput style={styles.input} value={form.tarifJournalier} onChangeText={v => setForm(f => ({ ...f, tarifJournalier: v }))} placeholder="Ex: 150" placeholderTextColor="#B0BEC5" keyboardType="numeric" />
                  <Text style={styles.fieldHint}>{t.equipe.dailyRateHint}</Text>
                </>
              )}

              {/* Couleur */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t.equipe.colorInPlanning}</Text>
              <View style={styles.colorRow}>
                {EMPLOYE_COLORS.map(c => (
                  <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, form.couleur === c && styles.colorSwatchActive]} onPress={() => setForm(f => ({ ...f, couleur: c }))} />
                ))}
              </View>

              {/* Métier */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t.equipe.trade}</Text>
              <View style={styles.metierGrid}>
                {metiersList.map(m => {
                  const mc = metierColors[m] || metierColors['autre'];
                  const active = form.metier === m;
                  return (
                    <Pressable key={m} style={[styles.metierOption, active && { borderColor: mc.color, backgroundColor: mc.color + '15' }]} onPress={() => setForm(f => ({ ...f, metier: m }))}>
                      <View style={[styles.metierOptionDot, { backgroundColor: mc.color }]} />
                      <Text style={[styles.metierOptionText, active && { color: mc.color, fontWeight: '700' }]}>{mc.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable style={[styles.metierOption, { borderStyle: 'dashed' }]} onPress={() => setShowNewMetier(true)}>
                  <Text style={[styles.metierOptionText, { color: '#687076' }]}>+ Nouveau métier</Text>
                </Pressable>
              </View>

              {/* Rôle */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t.equipe.role}</Text>
              <View style={styles.roleRow}>
                {(['employe', 'admin'] as const).map(r => (
                  <Pressable key={r} style={[styles.roleChip, form.role === r && styles.roleChipActive]} onPress={() => setForm(f => ({ ...f, role: r }))}>
                    <Text style={[styles.roleChipText, form.role === r && styles.roleChipTextActive]}>{r === 'admin' ? t.equipe.administrator : t.equipe.employeeRole}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Pointage obligatoire */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t.equipe.timesheetRequired}</Text>
                  <Text style={styles.fieldHint}>{t.equipe.timesheetHint}</Text>
                </View>
                <Switch value={form.doitPointer} onValueChange={v => setForm(f => ({ ...f, doitPointer: v }))} trackColor={{ false: '#E2E6EA', true: '#2C2C2C' }} thumbColor="#fff" />
              </View>

              {/* Accréditation Acheteur */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t.equipe.buyerRole}</Text>
                  <Text style={styles.fieldHint}>{t.equipe.buyerHint}</Text>
                </View>
                <Switch value={form.isAcheteur} onValueChange={v => confirmAccreditation('isAcheteur', v, 'Acheteur 🛒')} trackColor={{ false: '#E2E6EA', true: '#2C2C2C' }} thumbColor="#fff" />
              </View>

              {/* Accréditation RH */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t.equipe.hrRole}</Text>
                  <Text style={styles.fieldHint}>{t.equipe.hrHint}</Text>
                </View>
                <Switch value={form.isRH} onValueChange={v => confirmAccreditation('isRH', v, 'Ressources Humaines 👥')} trackColor={{ false: '#E2E6EA', true: '#27AE60' }} thumbColor="#fff" />
              </View>

              {/* Accréditation Commercial */}
              <View style={styles.acheteurRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t.equipe.commercialRole}</Text>
                  <Text style={styles.fieldHint}>{t.equipe.commercialHint}</Text>
                </View>
                <Switch value={form.isCommercial} onValueChange={v => confirmAccreditation('isCommercial', v, 'Commercial 💼')} trackColor={{ false: '#E2E6EA', true: '#F39C12' }} thumbColor="#fff" />
              </View>

              {/* Horaires théoriques */}
              <Pressable style={styles.horairesToggle} onPress={() => setShowHoraires(v => !v)}>
                <Text style={styles.horairesToggleText}>{showHoraires ? '▼' : '▶'} {t.equipe.theoreticalHours}</Text>
                <Text style={styles.horairesToggleHint}>{t.equipe.hoursHint}</Text>
              </Pressable>

              {showHoraires && (
                <View style={styles.horairesGrid}>
                  {[1, 2, 3, 4, 5, 6, 0].map(jour => {
                    const h = form.horaires[jour];
                    return (
                      <View key={jour} style={styles.horaireRow}>
                        <View style={styles.horaireJourWrap}>
                          <Switch value={h.actif} onValueChange={v => updateHoraire(jour, 'actif', v)} trackColor={{ false: '#E2E6EA', true: '#2C2C2C' }} thumbColor="#fff" />
                          <Text style={[styles.horaireJour, !h.actif && styles.horaireJourOff]}>{JOURS_SEMAINE[jour]}</Text>
                        </View>
                        {h.actif ? (
                          <View style={styles.horaireHeures}>
                            <TextInput style={styles.horaireInput} value={h.debut} onChangeText={v => updateHoraire(jour, 'debut', v)} placeholder="08:00" placeholderTextColor="#B0BEC5" keyboardType="numbers-and-punctuation" maxLength={5} />
                            <Text style={styles.horaireArrow}>→</Text>
                            <TextInput style={styles.horaireInput} value={h.fin} onChangeText={v => updateHoraire(jour, 'fin', v)} placeholder="17:00" placeholderTextColor="#B0BEC5" keyboardType="numbers-and-punctuation" maxLength={5} />
                          </View>
                        ) : (
                          <Text style={styles.horaireRepos}>{t.equipe.dayOff}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, (!form.prenom.trim() || !form.identifiant.trim() || !form.motDePasse.trim()) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!form.prenom.trim() || !form.identifiant.trim() || !form.motDePasse.trim()}
            >
              <Text style={styles.saveBtnText}>{editId ? t.common.save : t.equipe.addEmployee}</Text>
            </Pressable>
          </Pressable>
        </View>
      </ModalKeyboard>

      {/* ── Modal Documents RH Employé ── */}
      <Modal visible={showDocsModal} animationType="slide" transparent onRequestClose={() => setShowDocsModal(false)}>
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setShowDocsModal(false)} />
          <Pressable style={[styles.modalSheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {docsEmployeId
                  ? `📂 Documents de ${data.employes.find(e => e.id === docsEmployeId)?.prenom || ''} ${data.employes.find(e => e.id === docsEmployeId)?.nom || ''}`
                  : '📂 Documents RH'
                }
              </Text>
              <Pressable onPress={() => setShowDocsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {DOC_RH_ORDER.map(type => {
                const docs = (data.documentsRH || []).filter(
                  d => d.employeId === docsEmployeId && d.type === type
                );
                return (
                  <View key={type} style={docStyles.typeSection}>
                    <View style={docStyles.typeHeader}>
                      <Text style={docStyles.typeLabel}>{DOC_RH_LABELS[type]}</Text>
                      {(isAdmin || isRH) && (
                        <Pressable
                          style={docStyles.uploadBtn}
                          onPress={() => docsEmployeId && handleUploadDoc(docsEmployeId, type, DOC_RH_LABELS[type])}
                        >
                          <Text style={docStyles.uploadBtnText}>{t.common.add}</Text>
                        </Pressable>
                      )}
                    </View>
                    {(isAdmin || isRH) && docsEmployeId && (
                      <View style={{ marginTop: 4 }}>
                        <InboxPickerButton
                          onPick={(item) => addFromInboxRH(docsEmployeId, type, DOC_RH_LABELS[type], item)}
                          mimeFilter={inboxMimeFilterImagePdf}
                        />
                      </View>
                    )}
                    {docs.length === 0 ? (
                      <Text style={docStyles.emptyDoc}>{t.equipe.noDocument}</Text>
                    ) : (
                      docs.map(doc => (
                        <View key={doc.id} style={docStyles.docRow}>
                          <Pressable
                            style={docStyles.docName}
                            onPress={() => openDocPreview(doc.fichier)}
                          >
                            <Text style={docStyles.docNameText} numberOfLines={1}>
                              📄 {doc.libelle || DOC_RH_LABELS[doc.type]}
                            </Text>
                            <Text style={docStyles.docDate}>
                              {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}
                            </Text>
                          </Pressable>
                          {(isAdmin || isRH) && (
                            <Pressable
                              style={docStyles.docDelete}
                              onPress={() => handleDeleteDoc(doc.id, doc.libelle || DOC_RH_LABELS[doc.type])}
                            >
                              <Text style={docStyles.docDeleteText}>🗑</Text>
                            </Pressable>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </View>
      </Modal>

      {/* ── Modal Sous-traitant ── */}
      <ModalKeyboard visible={showSTForm} animationType="slide" transparent onRequestClose={() => setShowSTForm(false)}>
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setShowSTForm(false)} />
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editSTId ? t.equipe.editSubcontractor : t.equipe.newSubcontractor}</Text>
              <Pressable onPress={() => setShowSTForm(false)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>{t.equipe.company}</Text>
              <TextInput style={styles.input} value={stForm.societe} onChangeText={v => setSTForm(f => ({ ...f, societe: v }))} placeholder="Ex: Plomberie Dupont" placeholderTextColor="#B0BEC5" />

              <View style={[styles.nameRow, { marginTop: 12 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Prénom</Text>
                  <TextInput style={styles.input} value={stForm.prenom} onChangeText={v => setSTForm(f => ({
                    ...f, prenom: v,
                    identifiant: editSTId ? f.identifiant : buildIdentifiant(v, f.nom),
                  }))} placeholder="Jean" placeholderTextColor="#B0BEC5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t.equipe.lastName}</Text>
                  <TextInput style={styles.input} value={stForm.nom} onChangeText={v => setSTForm(f => ({
                    ...f, nom: v,
                    identifiant: editSTId ? f.identifiant : buildIdentifiant(f.prenom, v),
                  }))} placeholder="Dupont" placeholderTextColor="#B0BEC5" />
                </View>
              </View>

              <View style={[styles.nameRow, { marginTop: 12 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Téléphone</Text>
                  <TextInput style={styles.input} value={stForm.telephone} onChangeText={v => setSTForm(f => ({ ...f, telephone: v }))} placeholder="06 00 00 00 00" placeholderTextColor="#B0BEC5" keyboardType="phone-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput style={styles.input} value={stForm.email} onChangeText={v => setSTForm(f => ({ ...f, email: v }))} placeholder="email@exemple.fr" placeholderTextColor="#B0BEC5" keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t.equipe.loginId} *</Text>
              <TextInput style={styles.input} value={stForm.identifiant} onChangeText={v => setSTForm(f => ({ ...f, identifiant: v }))} placeholder="Ex: plomberie.dupont" placeholderTextColor="#B0BEC5" autoCapitalize="none" autoCorrect={false} />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t.common.password} * ({t.equipe.visibleByAdmin})</Text>
              <View style={styles.mdpRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={stForm.motDePasse} onChangeText={v => setSTForm(f => ({ ...f, motDePasse: v }))} placeholder="Ex: st1234" placeholderTextColor="#B0BEC5" secureTextEntry={!showSTMdp} autoCapitalize="none" autoCorrect={false} />
                <Pressable style={styles.mdpToggle} onPress={() => setShowSTMdp(v => !v)}>
                  <Text style={styles.mdpToggleText}>{showSTMdp ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Couleur dans le planning</Text>
              <View style={styles.colorRow}>
                {ST_COLORS.map(c => (
                  <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, stForm.couleur === c && styles.colorSwatchActive]} onPress={() => setSTForm(f => ({ ...f, couleur: c }))} />
                ))}
              </View>
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, (!stForm.identifiant.trim() || !stForm.motDePasse.trim()) && styles.saveBtnDisabled]}
              onPress={handleSaveST}
              disabled={!stForm.identifiant.trim() || !stForm.motDePasse.trim()}
            >
              <Text style={styles.saveBtnText}>{editSTId ? t.common.save : t.equipe.addSubcontractor}</Text>
            </Pressable>
          </Pressable>
        </View>
      </ModalKeyboard>

      {/* ── Modal Finances ST (💰) ── */}
      <ModalKeyboard visible={financesSTId !== null} animationType="slide" transparent onRequestClose={() => setFinancesSTId(null)}>
        <Pressable style={stStyles.overlay} onPress={() => setFinancesSTId(null)}>
          <Pressable style={stStyles.sheet} onPress={() => {}}>
            <View style={stStyles.handle} />
            <View style={stStyles.sheetHeader}>
              <Text style={stStyles.sheetTitle}>
                💰 Finances {currentFinancesST ? `— ${currentFinancesST.prenom} ${currentFinancesST.nom}` : ''}
              </Text>
              <Pressable onPress={() => setFinancesSTId(null)}><Text style={stStyles.closeX}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {currentFinancesST && (() => {
                const stDevis = data.devis.filter(d => d.soustraitantId === currentFinancesST.id);
                return (
                  <>
                    <View style={stStyles.financeHeader}>
                      <Text style={stStyles.financeTitle}>Devis & acomptes</Text>
                      <Pressable style={stStyles.newBtn} onPress={openNewDevis}>
                        <Text style={stStyles.newBtnText}>+ Nouveau devis</Text>
                      </Pressable>
                    </View>
                    {stDevis.length === 0 ? (
                      <View style={stStyles.emptyState}>
                        <Text style={stStyles.emptyText}>Aucun devis</Text>
                        <Text style={stStyles.emptyHint}>Ajoutez un devis pour commencer</Text>
                      </View>
                    ) : (
                      stDevis.map(devis => {
                        const chantier = data.chantiers.find(c => c.id === devis.chantierId);
                        const acomptes = data.acomptesst.filter(a => a.devisId === devis.id);
                        const totalAcomptes = acomptes.reduce((s, a) => s + a.montant, 0);
                        const resteAPayer = devis.prixConvenu - totalAcomptes;
                        return (
                          <View key={devis.id} style={stStyles.marcheCard}>
                            <View style={stStyles.marcheCardHeader}>
                              <View style={{ flex: 1 }}>
                                <Text style={stStyles.marcheChantier}>{chantier?.nom || 'Chantier'}</Text>
                                <Text style={stStyles.devisObjet}>{devis.objet}</Text>
                              </View>
                              <View style={stStyles.cardActions}>
                                <Pressable style={stStyles.actionBtn} onPress={() => openEditDevis(devis)}>
                                  <Text style={stStyles.actionEdit}>✏</Text>
                                </Pressable>
                                <Pressable style={stStyles.actionBtn} onPress={() => handleDeleteDevis(devis)}>
                                  <Text style={stStyles.actionDelete}>🗑</Text>
                                </Pressable>
                              </View>
                            </View>
                            <View style={stStyles.financeRow}>
                              <View style={stStyles.financeCell}>
                                <Text style={stStyles.financeCellLabel}>Prix convenu</Text>
                                <Text style={[stStyles.financeCellValue, { color: '#2C2C2C' }]}>{fmtST(devis.prixConvenu)}</Text>
                              </View>
                              <View style={stStyles.financeCell}>
                                <Text style={stStyles.financeCellLabel}>Acomptes</Text>
                                <Text style={[stStyles.financeCellValue, { color: '#E67E22' }]}>{fmtST(totalAcomptes)}</Text>
                              </View>
                              <View style={stStyles.financeCell}>
                                <Text style={stStyles.financeCellLabel}>Reste</Text>
                                <Text style={[stStyles.financeCellValue, { color: resteAPayer > 0 ? '#E74C3C' : '#27AE60' }]}>{fmtST(resteAPayer)}</Text>
                              </View>
                            </View>
                            <View style={stStyles.devisRow}>
                              {devis.devisFichier ? (
                                <Pressable style={stStyles.devisBtn} onPress={() => openDocPreview(devis.devisFichier!)}>
                                  <Text style={stStyles.devisBtnText}>📄 Devis</Text>
                                </Pressable>
                              ) : (
                                <Pressable style={[stStyles.devisBtn, stStyles.devisBtnUpload]} onPress={() => handleUploadDevisFichier(devis.id)}>
                                  <Text style={stStyles.devisBtnText}>⬆ Charger devis</Text>
                                </Pressable>
                              )}
                              {devis.devisSigne ? (
                                <Pressable style={[stStyles.devisBtn, stStyles.devisBtnSigne]} onPress={() => openDocPreview(devis.devisSigne!)}>
                                  <Text style={stStyles.devisBtnText}>✅ Signé</Text>
                                </Pressable>
                              ) : (
                                <Pressable style={[stStyles.devisBtn, stStyles.devisBtnUpload]} onPress={() => handleUploadDevisSigne(devis.id)}>
                                  <Text style={stStyles.devisBtnText}>⬆ Signé</Text>
                                </Pressable>
                              )}
                            </View>
                            {!devis.devisFichier && (
                              <View style={{ marginTop: 4 }}>
                                <InboxPickerButton
                                  onPick={(item) => addFromInboxDevisFichier(devis.id, item)}
                                  mimeFilter={inboxMimeFilterImagePdf}
                                  label="📥 Importer devis depuis Inbox"
                                />
                              </View>
                            )}
                            {!devis.devisSigne && (
                              <View style={{ marginTop: 4 }}>
                                <InboxPickerButton
                                  onPick={(item) => addFromInboxDevisSigne(devis.id, item)}
                                  mimeFilter={inboxMimeFilterImagePdf}
                                  label="📥 Importer devis signé depuis Inbox"
                                />
                              </View>
                            )}
                            <View style={stStyles.acomptesSection}>
                              <View style={stStyles.acomptesSectionHeader}>
                                <Text style={stStyles.acomptesSectionTitle}>Acomptes</Text>
                                <Pressable style={stStyles.addAcompteBtn} onPress={() => openNewAcompte(devis.id)}>
                                  <Text style={stStyles.addAcompteBtnText}>+ Acompte</Text>
                                </Pressable>
                              </View>
                              {acomptes.length === 0 ? (
                                <Text style={stStyles.emptySmall}>Aucun acompte</Text>
                              ) : (
                                acomptes.map(a => (
                                  <View key={a.id} style={stStyles.acompteRow}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={stStyles.acompteMontant}>{fmtST(a.montant)}</Text>
                                      <Text style={stStyles.acompteDate}>{a.date}{a.commentaire ? ` — ${a.commentaire}` : ''}</Text>
                                      {a.facture ? (
                                        <Pressable onPress={() => openDocPreview(a.facture!)}>
                                          <Text style={stStyles.factureLink}>📄 Facture</Text>
                                        </Pressable>
                                      ) : (
                                        <>
                                          <Pressable onPress={() => handleUploadFacture(a.id)}>
                                            <Text style={stStyles.factureUpload}>⬆ Facture</Text>
                                          </Pressable>
                                          <View style={{ marginTop: 4 }}>
                                            <InboxPickerButton
                                              onPick={(item) => addFromInboxFacture(a.id, item)}
                                              mimeFilter={inboxMimeFilterImagePdf}
                                            />
                                          </View>
                                        </>
                                      )}
                                    </View>
                                    <Pressable onPress={async () => {
                                      if (await confirmDelete(`Supprimer cet acompte de ${a.montant} € ?`)) deleteAcompteST(a.id);
                                    }}>
                                      <Text style={stStyles.actionDelete}>🗑</Text>
                                    </Pressable>
                                  </View>
                                ))
                              )}
                            </View>
                          </View>
                        );
                      })
                    )}
                  </>
                );
              })()}
            </ScrollView>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Modal Documents légaux ST (📄) ── */}
      <ModalKeyboard visible={docsSTId !== null} animationType="slide" transparent onRequestClose={() => setDocsSTId(null)}>
        <Pressable style={stStyles.overlay} onPress={() => setDocsSTId(null)}>
          <Pressable style={stStyles.sheet} onPress={() => {}}>
            <View style={stStyles.handle} />
            <View style={stStyles.sheetHeader}>
              <Text style={stStyles.sheetTitle}>
                📄 Documents légaux {currentDocsST ? `— ${currentDocsST.prenom} ${currentDocsST.nom}` : ''}
              </Text>
              <Pressable onPress={() => setDocsSTId(null)}><Text style={stStyles.closeX}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {currentDocsST && (
                <>
                  <Text style={stStyles.docsHelper}>Documents légaux obligatoires à fournir :</Text>
                  {DOCUMENTS_LEGAUX_TYPES.map(td => {
                    const existing = findDocForType(currentDocsST.documents || [], td.id, td.label);
                    return (
                      <View key={td.id}>
                        <View style={stStyles.docTypeRow}>
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={stStyles.docTypeLabel}>{td.label}</Text>
                            <Text style={[stStyles.docTypeStatus, { color: existing ? '#27AE60' : '#E67E22' }]}>
                              {existing ? `✅ Fourni le ${new Date(existing.uploadedAt).toLocaleDateString('fr-FR')}` : '⚠️ Manquant'}
                            </Text>
                          </View>
                          {existing ? (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <Pressable style={stStyles.docMiniBtn} onPress={() => openDocPreview(existing.fichier)}>
                                <Text style={stStyles.docMiniBtnText}>Voir</Text>
                              </Pressable>
                              <Pressable style={[stStyles.docMiniBtn, stStyles.docMiniBtnDanger]} onPress={() => handleDeleteDocST(existing.id)}>
                                <Text style={[stStyles.docMiniBtnText, { color: '#E74C3C' }]}>Suppr.</Text>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable style={[stStyles.docMiniBtn, stStyles.docMiniBtnUpload]} onPress={() => handleUploadDocForType(td.label)}>
                              <Text style={[stStyles.docMiniBtnText, { color: '#fff' }]}>⬆ Charger</Text>
                            </Pressable>
                          )}
                        </View>
                        {!existing && (
                          <View style={{ marginTop: 4 }}>
                            <InboxPickerButton
                              onPick={(item) => addFromInboxDocST(td.label, item)}
                              mimeFilter={inboxMimeFilterImagePdf}
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                  {(() => {
                    const autres = (currentDocsST.documents || []).filter(d => !DOCUMENTS_LEGAUX_TYPES.some(td => findDocForType([d], td.id, td.label)));
                    if (autres.length === 0) return null;
                    return (
                      <View style={{ marginTop: 14 }}>
                        <Text style={stStyles.docsHelper}>Autres documents :</Text>
                        {autres.map(doc => (
                          <View key={doc.id} style={stStyles.docTypeRow}>
                            <View style={{ flex: 1, marginRight: 10 }}>
                              <Text style={stStyles.docTypeLabel}>{doc.libelle}</Text>
                              <Text style={[stStyles.docTypeStatus, { color: '#27AE60' }]}>
                                ✅ {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <Pressable style={stStyles.docMiniBtn} onPress={() => openDocPreview(doc.fichier)}>
                                <Text style={stStyles.docMiniBtnText}>Voir</Text>
                              </Pressable>
                              <Pressable style={[stStyles.docMiniBtn, stStyles.docMiniBtnDanger]} onPress={() => handleDeleteDocST(doc.id)}>
                                <Text style={[stStyles.docMiniBtnText, { color: '#E74C3C' }]}>Suppr.</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                  <Pressable style={stStyles.addOtherDocBtn} onPress={() => { setDocLibelle(''); setDocFichier(''); setShowDocLibreModal(true); }}>
                    <Text style={stStyles.addOtherDocBtnText}>+ Ajouter un autre document</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Sous-modale : formulaire devis (partagée) ── */}
      <ModalKeyboard visible={showDevisForm} animationType="slide" transparent onRequestClose={() => setShowDevisForm(false)}>
        <Pressable style={stStyles.overlay} onPress={() => setShowDevisForm(false)}>
          <Pressable style={stStyles.sheetSmall} onPress={() => {}}>
            <View style={stStyles.handle} />
            <View style={stStyles.sheetHeader}>
              <Text style={stStyles.sheetTitle}>{editDevisId ? 'Modifier le devis' : 'Nouveau devis'}</Text>
              <Pressable onPress={() => setShowDevisForm(false)}><Text style={stStyles.closeX}>✕</Text></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={stStyles.fieldLabel}>Chantier *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={stStyles.chipRow}>
                  {data.chantiers.map(c => (
                    <Pressable key={c.id} style={[stStyles.chip, devisForm.chantierId === c.id && stStyles.chipActive]} onPress={() => setDevisForm(f => ({ ...f, chantierId: c.id }))}>
                      <Text style={[stStyles.chipText, devisForm.chantierId === c.id && stStyles.chipTextActive]}>{c.nom}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Text style={[stStyles.fieldLabel, { marginTop: 14 }]}>Objet du devis *</Text>
              <TextInput style={stStyles.input} value={devisForm.objet} onChangeText={v => setDevisForm(f => ({ ...f, objet: v }))} placeholder="Ex: Peinture, Suppléments..." placeholderTextColor="#B0BEC5" />
              <Text style={[stStyles.fieldLabel, { marginTop: 14 }]}>Prix convenu (€) *</Text>
              <TextInput style={stStyles.input} value={devisForm.prixConvenu} onChangeText={v => setDevisForm(f => ({ ...f, prixConvenu: v }))} placeholder="Ex: 5000" placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" />
            </ScrollView>
            <Pressable style={[stStyles.saveBtn, (!devisForm.chantierId || !devisForm.prixConvenu) && stStyles.saveBtnDisabled]} onPress={handleSaveDevis} disabled={!devisForm.chantierId || !devisForm.prixConvenu}>
              <Text style={stStyles.saveBtnText}>{editDevisId ? t.common.save : 'Créer le devis'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Sous-modale : nouvel acompte ── */}
      <ModalKeyboard visible={showAcompteForm} animationType="slide" transparent onRequestClose={() => setShowAcompteForm(false)}>
        <Pressable style={stStyles.overlay} onPress={() => setShowAcompteForm(false)}>
          <Pressable style={stStyles.sheetSmall} onPress={() => {}}>
            <View style={stStyles.handle} />
            <View style={stStyles.sheetHeader}>
              <Text style={stStyles.sheetTitle}>Nouvel acompte</Text>
              <Pressable onPress={() => setShowAcompteForm(false)}><Text style={stStyles.closeX}>✕</Text></Pressable>
            </View>
            <DatePicker label="Date" value={acompteForm.date} onChange={v => setAcompteForm(f => ({ ...f, date: v }))} />
            <Text style={[stStyles.fieldLabel, { marginTop: 12 }]}>Montant (€) *</Text>
            <TextInput style={stStyles.input} value={acompteForm.montant} onChangeText={v => setAcompteForm(f => ({ ...f, montant: v }))} placeholder="Ex: 1500" placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" />
            <Text style={[stStyles.fieldLabel, { marginTop: 12 }]}>Commentaire</Text>
            <TextInput style={stStyles.input} value={acompteForm.commentaire} onChangeText={v => setAcompteForm(f => ({ ...f, commentaire: v }))} placeholder="Ex: Acompte démarrage" placeholderTextColor="#B0BEC5" />
            <Pressable style={[stStyles.saveBtn, !acompteForm.montant && stStyles.saveBtnDisabled]} onPress={handleSaveAcompte} disabled={!acompteForm.montant}>
              <Text style={stStyles.saveBtnText}>{t.common.save}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Sous-modale : ajouter un document libre ── */}
      <ModalKeyboard visible={showDocLibreModal} animationType="slide" transparent onRequestClose={() => setShowDocLibreModal(false)}>
        <Pressable style={stStyles.overlay} onPress={() => setShowDocLibreModal(false)}>
          <Pressable style={stStyles.sheetSmall} onPress={() => {}}>
            <View style={stStyles.handle} />
            <View style={stStyles.sheetHeader}>
              <Text style={stStyles.sheetTitle}>Ajouter un document</Text>
              <Pressable onPress={() => setShowDocLibreModal(false)}><Text style={stStyles.closeX}>✕</Text></Pressable>
            </View>
            <Text style={stStyles.fieldLabel}>Libellé *</Text>
            <TextInput style={stStyles.input} value={docLibelle} onChangeText={setDocLibelle} placeholder="Ex: Kbis, Assurance décennale..." placeholderTextColor="#B0BEC5" />
            <Pressable style={stStyles.uploadBtn} onPress={handlePickDocLibre}>
              <Text style={stStyles.uploadBtnText}>{docFichier ? '✅ Fichier sélectionné' : '⬆ Choisir un fichier'}</Text>
            </Pressable>
            <View style={{ marginTop: 4 }}>
              <InboxPickerButton
                onPick={addFromInboxDocLibre}
                mimeFilter={inboxMimeFilterImagePdf}
              />
            </View>
            <Pressable style={[stStyles.saveBtn, (!docLibelle.trim() || !docFichier) && stStyles.saveBtnDisabled]} onPress={handleSaveDocLibre} disabled={!docLibelle.trim() || !docFichier}>
              <Text style={stStyles.saveBtnText}>{t.common.add}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Modal historique chantiers par employé ── */}
      <Modal visible={historiqueEmployeId !== null} transparent animationType="fade" onRequestClose={() => setHistoriqueEmployeId(null)}>
        <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={() => setHistoriqueEmployeId(null)} />
          <Pressable style={[styles.modalSheet, { maxHeight: '80%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏗 Historique chantiers</Text>
              <Pressable onPress={() => setHistoriqueEmployeId(null)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            {historiqueEmployeId && (() => {
              const emp = data.employes.find(e => e.id === historiqueEmployeId);
              if (!emp) return null;

              // Tous les chantiers où l'employé a été affecté
              const chantierIds = [...new Set(
                data.affectations
                  .filter(a => a.employeId === historiqueEmployeId)
                  .map(a => a.chantierId)
              )];

              const chantiersAvecDates = chantierIds.map(cId => {
                const chantier = data.chantiers.find(c => c.id === cId);
                const affectations = data.affectations.filter(a => a.chantierId === cId && a.employeId === historiqueEmployeId);
                const dateDebut = affectations.reduce((min, a) => a.dateDebut < min ? a.dateDebut : min, affectations[0]?.dateDebut || '');
                const dateFin = affectations.reduce((max, a) => a.dateFin > max ? a.dateFin : max, affectations[0]?.dateFin || '');
                // Heures travaillées sur ce chantier
                const pointages = data.pointages.filter(p => p.employeId === historiqueEmployeId && (p as any).chantierId === cId);
                const byDate: Record<string, { debut?: string; fin?: string }> = {};
                pointages.forEach(p => {
                  if (!byDate[p.date]) byDate[p.date] = {};
                  if (p.type === 'debut' && !byDate[p.date].debut) byDate[p.date].debut = p.heure;
                  if (p.type === 'fin') byDate[p.date].fin = p.heure;
                });
                let totalMin = 0;
                Object.values(byDate).forEach(({ debut, fin }) => {
                  if (debut && fin) {
                    const [dh, dm] = debut.split(':').map(Number);
                    const [fh, fm] = fin.split(':').map(Number);
                    const diff = (fh * 60 + fm) - (dh * 60 + dm);
                    if (diff > 0) totalMin += diff;
                  }
                });
                return { chantier, dateDebut, dateFin, nbJours: affectations.length, totalMin };
              }).sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: emp.couleur || '#2C2C2C', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {emp.photoProfil ? (
                        <Image source={{ uri: emp.photoProfil }} style={{ width: 44, height: 44 }} />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{emp.prenom?.[0] || '?'}</Text>
                      )}
                    </View>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C' }}>{emp.prenom} {emp.nom}</Text>
                      <Text style={{ fontSize: 12, color: '#687076' }}>{chantiersAvecDates.length} chantier{chantiersAvecDates.length > 1 ? 's' : ''}</Text>
                    </View>
                  </View>

                  {chantiersAvecDates.map(({ chantier, dateDebut, dateFin, nbJours, totalMin }) => {
                    const isActif = chantier?.statut === 'actif';
                    const totalH = Math.floor(totalMin / 60);
                    const totalM = totalMin % 60;
                    return (
                      <View key={chantier?.id || dateDebut} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: chantier?.couleur || '#9CA3AF' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C', flex: 1 }} numberOfLines={1}>
                            {chantier?.nom || 'Chantier supprimé'}
                          </Text>
                          {isActif && (
                            <View style={{ backgroundColor: '#D4EDDA', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, color: '#155724', fontWeight: '600' }}>Actif</Text>
                            </View>
                          )}
                          {chantier?.statut === 'termine' && (
                            <View style={{ backgroundColor: '#D1ECF1', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, color: '#0C5460', fontWeight: '600' }}>Terminé</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: '#687076', marginTop: 4 }}>
                          Du {new Date(dateDebut + 'T12:00:00').toLocaleDateString('fr-FR')} au {new Date(dateFin + 'T12:00:00').toLocaleDateString('fr-FR')}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                          <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>{nbJours} affectation{nbJours > 1 ? 's' : ''}</Text>
                          {totalMin > 0 && (
                            <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>{totalH}h{String(totalM).padStart(2, '0')} pointées</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}

                  {chantiersAvecDates.length === 0 && (
                    <Text style={{ textAlign: 'center', color: '#687076', marginTop: 20 }}>Aucun chantier dans l'historique</Text>
                  )}
                </ScrollView>
              );
            })()}
          </Pressable>
        </View>
      </Modal>

      {/* ── Modal Badge Employé ── */}
      <Modal visible={badgeEmployeId !== null} transparent animationType="fade" onRequestClose={() => setBadgeEmployeId(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#11181C' }}>Envoyer un badge</Text>
              <Pressable onPress={() => setBadgeEmployeId(null)}><Text style={{ fontSize: 18, color: '#687076' }}>✕</Text></Pressable>
            </View>
            {badgeEmployeId && (() => {
              const emp = data.employes.find(e => e.id === badgeEmployeId);
              if (!emp) return null;
              return (
                <Text style={{ fontSize: 13, color: '#687076', marginBottom: 12 }}>
                  Pour : <Text style={{ fontWeight: '700', color: '#11181C' }}>{emp.prenom} {emp.nom}</Text>
                </Text>
              );
            })()}
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Type de badge</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {Object.entries(BADGE_TYPES).map(([key, { label, emoji }]) => (
                <Pressable key={key}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: badgeType === key ? '#FFB800' : '#E2E6EA', backgroundColor: badgeType === key ? '#FFF8E1' : '#F5EDE3' }}
                  onPress={() => setBadgeType(key)}>
                  <Text style={{ fontSize: 13, fontWeight: badgeType === key ? '700' : '500', color: badgeType === key ? '#856404' : '#687076' }}>{emoji} {label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Message (optionnel)</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 16, backgroundColor: '#F5EDE3' }}
              placeholder="Bravo pour ton travail !"
              placeholderTextColor="#B0BEC5"
              value={badgeMessage}
              onChangeText={setBadgeMessage}
              multiline
              numberOfLines={2}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F5EDE3', alignItems: 'center' }} onPress={() => setBadgeEmployeId(null)}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#687076' }}>{t.common.cancel}</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#FFB800', alignItems: 'center' }}
                onPress={() => {
                  if (!badgeEmployeId) return;
                  const badge: BadgeEmploye = {
                    id: `badge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    employeId: badgeEmployeId,
                    type: badgeType as BadgeEmploye['type'],
                    message: badgeMessage.trim() || undefined,
                    envoyePar: currentUser?.employeId === 'admin' ? 'Admin' : (() => {
                      const emp = data.employes.find(e => e.id === currentUser?.employeId);
                      return emp ? `${emp.prenom} ${emp.nom}` : 'Admin';
                    })(),
                    createdAt: new Date().toISOString(),
                  };
                  addBadgeEmploye(badge);
                  setBadgeEmployeId(null);
                  if (Platform.OS === 'web') {
                    alert('Badge envoy\u00e9 !');
                  } else {
                    Alert.alert('Badge envoy\u00e9 !', `${BADGE_TYPES[badgeType]?.emoji} ${BADGE_TYPES[badgeType]?.label}`);
                  }
                }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#000' }}>Envoyer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Nouveau Métier ── */}
      <Modal visible={showNewMetier} transparent animationType="fade" onRequestClose={() => setShowNewMetier(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#11181C', marginBottom: 16 }}>Nouveau métier</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12 }}
              placeholder="Ex: Staffeur, Serrurier, Façadier..."
              placeholderTextColor="#B0BEC5"
              value={newMetierLabel}
              onChangeText={setNewMetierLabel}
              autoFocus
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 8 }}>Couleur</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {METIER_PERSO_COLORS.map(c => (
                <Pressable key={c}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: newMetierColor === c ? 3 : 0, borderColor: '#11181C' }}
                  onPress={() => setNewMetierColor(c)}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F5EDE3', alignItems: 'center' }} onPress={() => setShowNewMetier(false)}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#687076' }}>{t.common.cancel}</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: newMetierLabel.trim() ? '#2C2C2C' : '#E2E6EA', alignItems: 'center' }}
                onPress={handleAddMetier}
                disabled={!newMetierLabel.trim()}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: newMetierLabel.trim() ? '#fff' : '#B0BEC5' }}>Créer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Disponibilité ── */}
      <Modal visible={showDispo} transparent animationType="slide" onRequestClose={() => setShowDispo(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#11181C' }}>📅 Disponibilité</Text>
              <Pressable onPress={() => setShowDispo(false)}>
                <Text style={{ fontSize: 20, color: '#687076' }}>✕</Text>
              </Pressable>
            </View>

            {/* Sélecteur de date */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Pressable onPress={() => {
                const d = new Date(dispoDate); d.setDate(d.getDate() - 1);
                setDispoDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              }} style={{ padding: 8, backgroundColor: '#F5EDE3', borderRadius: 8 }}>
                <Text style={{ fontSize: 16 }}>◀</Text>
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#11181C' }}>
                  {new Date(dispoDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
              </View>
              <Pressable onPress={() => {
                const d = new Date(dispoDate); d.setDate(d.getDate() + 1);
                setDispoDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              }} style={{ padding: 8, backgroundColor: '#F5EDE3', borderRadius: 8 }}>
                <Text style={{ fontSize: 16 }}>▶</Text>
              </Pressable>
            </View>

            {/* Filtre métier */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
              <Pressable style={[styles.filterChip, dispoFilterMetier === 'all' && styles.filterChipActive]} onPress={() => setDispoFilterMetier('all')}>
                <Text style={[styles.filterChipText, dispoFilterMetier === 'all' && styles.filterChipTextActive]}>{t.common.all}</Text>
              </Pressable>
              {metiersList.map(m => {
                const mc = metierColors[m] || metierColors['autre'];
                return (
                  <Pressable key={m} style={[styles.filterChip, dispoFilterMetier === m && { backgroundColor: mc.color, borderColor: mc.color }]} onPress={() => setDispoFilterMetier(m)}>
                    <View style={[styles.filterDot, { backgroundColor: mc.color }]} />
                    <Text style={[styles.filterChipText, dispoFilterMetier === m && { color: '#fff' }]}>{mc.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView style={{ maxHeight: 400 }}>
              {/* Libres */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#27AE60', marginBottom: 8 }}>
                ✅ Libres ({disponibilite.libres.length})
              </Text>
              {disponibilite.libres.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#687076', marginBottom: 16 }}>Aucun employé libre ce jour.</Text>
              ) : (
                <View style={{ gap: 4, marginBottom: 16 }}>
                  {disponibilite.libres.map(emp => {
                    const mc = metierColors[emp.metier] || metierColors['autre'];
                    return (
                      <View key={emp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#F0FFF4', borderRadius: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mc.color }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', flex: 1 }}>{emp.prenom} {(emp.nom || '').toUpperCase()}</Text>
                        <Text style={{ fontSize: 11, color: mc.color, fontWeight: '600' }}>{mc.label}</Text>
                        {emp.telephone ? <Text style={{ fontSize: 10, color: '#687076' }}>{emp.telephone}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Occupés */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#E74C3C', marginBottom: 8 }}>
                🔴 Occupés ({disponibilite.occupes.length})
              </Text>
              {disponibilite.occupes.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#687076' }}>Aucun employé occupé ce jour.</Text>
              ) : (
                <View style={{ gap: 4 }}>
                  {disponibilite.occupes.map(emp => {
                    const mc = metierColors[emp.metier] || metierColors['autre'];
                    const affectation = data.affectations.find(a => a.employeId === emp.id && a.dateDebut <= dispoDate && a.dateFin >= dispoDate);
                    const chantier = affectation ? data.chantiers.find(c => c.id === affectation.chantierId) : null;
                    return (
                      <View key={emp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#FFF5F5', borderRadius: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mc.color }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C', flex: 1 }}>{emp.prenom} {(emp.nom || '').toUpperCase()}</Text>
                        {chantier && <Text style={{ fontSize: 11, color: chantier.couleur, fontWeight: '600' }}>{chantier.nom}</Text>}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#11181C' },
  addBtn: { backgroundColor: '#2C2C2C', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#F5EDE3' },
  tabBtnActive: { borderColor: '#2C2C2C', backgroundColor: '#2C2C2C' },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: '#687076' },
  tabBtnTextActive: { color: '#fff' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F5EDE3', borderRadius: 10, borderWidth: 1, borderColor: '#E2E6EA' },
  searchInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#11181C' },
  searchClear: { paddingHorizontal: 12, paddingVertical: 10 },
  filterScroll: { height: 44, minHeight: 44, flexShrink: 0, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 6, alignItems: 'center', height: 44 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E2E6EA', backgroundColor: '#fff', gap: 4 },
  filterChipActive: { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: '#687076' },
  filterChipTextActive: { color: '#fff' },
  filterDot: { width: 6, height: 6, borderRadius: 3 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#11181C', flexShrink: 1 },
  metierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  metierDot: { width: 6, height: 6, borderRadius: 3 },
  metierText: { fontSize: 11, fontWeight: '600' },
  chantierCount: { fontSize: 11, color: '#687076' },
  contactInfo: { fontSize: 11, color: '#687076' },
  salaireInfo: { fontSize: 11, color: '#27AE60', fontWeight: '700' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { backgroundColor: '#EEF2F8', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '600', color: '#2C2C2C' },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#F5EDE3', paddingTop: 8 },
  credentialBtn: { backgroundColor: '#F5EDE3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E6EA' },
  credentialBtnText: { fontSize: 11, fontWeight: '600', color: '#2C2C2C' },
  actionBtnRound: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#687076' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '92%' },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E2E6EA', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  modalClose: { fontSize: 18, color: '#687076', padding: 4 },
  nameRow: { flexDirection: 'row' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldHint: { fontSize: 11, color: '#B0BEC5', marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA' },
  mdpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mdpToggle: { backgroundColor: '#F5EDE3', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E6EA' },
  mdpToggleText: { fontSize: 18 },
  metierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metierOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', backgroundColor: '#F5EDE3', gap: 6 },
  metierOptionDot: { width: 8, height: 8, borderRadius: 4 },
  metierOptionText: { fontSize: 13, fontWeight: '500', color: '#687076' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  colorSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: '#11181C', transform: [{ scale: 1.2 }] },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleChip: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#F5EDE3' },
  roleChipActive: { borderColor: '#2C2C2C', backgroundColor: '#2C2C2C' },
  roleChipText: { fontSize: 14, fontWeight: '600', color: '#687076' },
  roleChipTextActive: { color: '#fff' },
  acheteurRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#EEF2F8', borderRadius: 10, borderWidth: 1, borderColor: '#D0D8E8', gap: 12 },
  horairesToggle: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#EEF2F8', borderRadius: 10, borderWidth: 1, borderColor: '#D0D8E8' },
  horairesToggleText: { fontSize: 14, fontWeight: '700', color: '#2C2C2C' },
  horairesToggleHint: { fontSize: 11, color: '#687076', marginTop: 2 },
  horairesGrid: { marginTop: 10, gap: 8 },
  horaireRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  horaireJourWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 72 },
  horaireJour: { fontSize: 13, fontWeight: '700', color: '#11181C', width: 30 },
  horaireJourOff: { color: '#B0BEC5' },
  horaireHeures: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  horaireInput: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', textAlign: 'center' },
  horaireArrow: { fontSize: 14, color: '#687076' },
  horaireRepos: { flex: 1, fontSize: 13, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center' },
  saveBtn: { marginTop: 20, backgroundColor: '#2C2C2C', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#B0BEC5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // Apporteurs
  apporteurBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  apporteurBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 },
  apporteurChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E8DDD0', backgroundColor: '#F5EDE3' },
  apporteurChipActive: { borderColor: '#2C2C2C', backgroundColor: '#2C2C2C' },
  apporteurChipText: { fontSize: 13, fontWeight: '500', color: '#687076' },
  apporteurChipTextActive: { color: '#fff' },
  commissionRecap: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E8DDD0', borderLeftWidth: 4, borderLeftColor: '#C9A96E' },
  commissionRecapTitle: { fontSize: 13, fontWeight: '700', color: '#2C2C2C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
  commissionRecapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F5EDE3' },
  commissionRecapName: { fontSize: 14, color: '#11181C', fontWeight: '500' },
  commissionRecapAmount: { fontSize: 14, fontWeight: '800', color: '#E74C3C' },
  commissionRecapEmpty: { fontSize: 13, color: '#27AE60', fontWeight: '600', paddingVertical: 4 },
});

const docStyles = StyleSheet.create({
  typeSection: { marginBottom: 16, backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12 },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeLabel: { fontSize: 14, fontWeight: '700', color: '#2C2C2C', flex: 1 },
  uploadBtn: { backgroundColor: '#2C2C2C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  uploadBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyDoc: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', paddingLeft: 4 },
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#E2E6EA' },
  docName: { flex: 1 },
  docNameText: { fontSize: 13, fontWeight: '600', color: '#11181C' },
  docDate: { fontSize: 11, color: '#687076', marginTop: 2 },
  docDelete: { padding: 6 },
  docDeleteText: { fontSize: 16 },
});

// ─── Styles Sous-traitants (cartes 3-boutons + modales Finances/Docs) ───────
const stStyles = StyleSheet.create({
  // Boutons 3-actions carte ST
  actionButtonsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: '#E8DDD0' },
  actionButtonEdit: { backgroundColor: '#F5EDE3' },
  actionButtonMoney: { backgroundColor: '#FFF3CD', borderColor: '#C9A96E' },
  actionButtonDocs: { backgroundColor: '#FDE2E2', borderColor: '#E67E22' },
  actionButtonDocsOk: { backgroundColor: '#D4EDDA', borderColor: '#27AE60' },
  actionButtonIcon: { fontSize: 14 },
  actionButtonLabel: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  // Modals communs
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '92%' },
  sheetSmall: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '70%' },
  handle: { width: 40, height: 4, backgroundColor: '#E2E6EA', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#11181C', flex: 1, marginRight: 8 },
  closeX: { fontSize: 18, color: '#687076', padding: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA' },
  // Documents légaux — checklist
  docsHelper: { fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
  docTypeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F5EDE3' },
  docTypeLabel: { fontSize: 14, fontWeight: '600', color: '#11181C' },
  docTypeStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  docMiniBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E8DDD0' },
  docMiniBtnUpload: { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' },
  docMiniBtnDanger: { backgroundColor: '#FDE2E2', borderColor: '#E74C3C' },
  docMiniBtnText: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  addOtherDocBtn: { marginTop: 16, backgroundColor: '#C9A96E', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  addOtherDocBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Finances
  newBtn: { backgroundColor: '#2C2C2C', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  financeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  financeTitle: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#687076', fontWeight: '500' },
  emptyHint: { fontSize: 12, color: '#B0BEC5', marginTop: 4 },
  emptySmall: { fontSize: 13, color: '#B0BEC5', paddingVertical: 8 },
  marcheCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E8DDD0' },
  marcheCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  marcheChantier: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  devisObjet: { fontSize: 13, fontWeight: '600', color: '#2C2C2C', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6 },
  actionEdit: { fontSize: 16, color: '#687076' },
  actionDelete: { fontSize: 16, color: '#E74C3C' },
  financeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  financeCell: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, alignItems: 'center' },
  financeCellLabel: { fontSize: 10, fontWeight: '600', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, textAlign: 'center' },
  financeCellValue: { fontSize: 14, fontWeight: '800' },
  devisRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  devisBtn: { flex: 1, backgroundColor: '#EEF2F8', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  devisBtnSigne: { backgroundColor: '#D4EDDA' },
  devisBtnUpload: { backgroundColor: '#FFF3CD' },
  devisBtnText: { fontSize: 12, fontWeight: '600', color: '#2C2C2C' },
  acomptesSection: { borderTopWidth: 1, borderTopColor: '#F5EDE3', paddingTop: 10 },
  acomptesSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  acomptesSectionTitle: { fontSize: 13, fontWeight: '700', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.3 },
  addAcompteBtn: { backgroundColor: '#EEF2F8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addAcompteBtnText: { fontSize: 12, fontWeight: '600', color: '#2C2C2C' },
  acompteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5EDE3' },
  acompteMontant: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  acompteDate: { fontSize: 12, color: '#687076', marginTop: 2 },
  factureLink: { fontSize: 12, color: '#2C2C2C', fontWeight: '600', marginTop: 4 },
  factureUpload: { fontSize: 12, color: '#E67E22', fontWeight: '600', marginTop: 4 },
  // Chips & buttons
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E6EA', backgroundColor: '#F5EDE3' },
  chipActive: { borderColor: '#2C2C2C', backgroundColor: '#2C2C2C' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#687076' },
  chipTextActive: { color: '#fff' },
  saveBtn: { marginTop: 16, backgroundColor: '#2C2C2C', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#B0BEC5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  uploadBtn: { backgroundColor: '#EEF2F8', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#2C2C2C', borderStyle: 'dashed', marginTop: 10 },
  uploadBtnText: { color: '#2C2C2C', fontWeight: '600', fontSize: 14 },
});
