import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, Platform, Alert, RefreshControl,
} from 'react-native';
import { useRefresh } from '@/hooks/useRefresh';
import { toast } from 'sonner-native';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { ScreenContainer } from '@/components/screen-container';
import { BackToPlus } from '@/components/ui/BackToPlus';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useRouter } from 'expo-router';
import { useConfirm } from '@/hooks/useConfirm';
import type {
  DemandeConge, ArretMaladie, DemandeAvance, FichePaie,
} from '@/app/types';
import {
  STATUT_DEMANDE_LABELS, STATUT_DEMANDE_COLORS,
} from '@/app/types';
import { DateField } from '@/components/DatePickerModal';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getJoursFeriesFrance } from '@/lib/date/joursFeries';
import { Palmtree, Thermometer, Banknote, FileText, Users } from 'lucide-react-native';
import { EmptyState } from '@/components/ui/EmptyState';

// Filtre mime utilisé par l'InboxPickerButton de cet écran
// (fiches de paie). Aligné avec equipe.tsx + financier-st.tsx + pointage.tsx.
// Note : à consolider en helper partagé fin Tier 1.
const inboxMimeFilterImagePdf = (m: string): boolean =>
  m.startsWith('image/') || m === 'application/pdf';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId() { return `rh_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function now() { return new Date().toISOString(); }
function formatDate(ymd: string) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}
function formatMois(ym: string, moisCourts: readonly string[]) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  return `${moisCourts[parseInt(m, 10) - 1]} ${y}`;
}

// Destinataires comptables (cabinet AVODA) pour la transmission des arrêts de travail.
const COMPTABLE_EMAILS = ['boye@cabinetavoda.com', 'yossi@cabinetavoda.com'];

// Ouvre un mail pour transmettre l'arrêt de travail approuvé au comptable
// (justificatif de l'employé joint). Natif uniquement (expo-mail-composer).
async function envoyerArretAuComptable(
  nomComplet: string,
  dateDebut: string,
  dateFin: string | undefined,
  justificatifUrl: string | undefined,
): Promise<void> {
  if (!requireOptionalNativeModule('ExpoMailComposer')) {
    Alert.alert(
      'Transmission indisponible',
      "L'ouverture du mail nécessite la dernière version de l'app (build natif). L'arrêt est bien approuvé.",
    );
    return;
  }
  try {
    const MailComposer = require('expo-mail-composer') as typeof import('expo-mail-composer');
    if (!(await MailComposer.isAvailableAsync())) {
      Alert.alert('Mail indisponible', "Aucune app Mail n'est configurée sur l'appareil.");
      return;
    }
    let attachmentUri: string | undefined;
    if (justificatifUrl && justificatifUrl.startsWith('http')) {
      const ext = (justificatifUrl.split('?')[0].split('.').pop() || 'pdf').slice(0, 5);
      const dest = `${FileSystem.cacheDirectory}arret_${Date.now()}.${ext}`;
      const dl = await FileSystem.downloadAsync(justificatifUrl, dest);
      attachmentUri = dl.uri;
    }
    const periode = dateFin ? `${formatDate(dateDebut)} au ${formatDate(dateFin)}` : formatDate(dateDebut);
    await MailComposer.composeAsync({
      recipients: COMPTABLE_EMAILS,
      subject: `Arrêt de travail pour ${nomComplet} — ${periode}`,
      body: `Bonjour,\n\nVeuillez trouver ci-joint l'arrêt de travail de ${nomComplet} (${periode}).\n\nCordialement,\nSK DECO`,
      attachments: attachmentUri ? [attachmentUri] : undefined,
    });
  } catch (err) {
    console.error('Mail arrêt maladie échoué', err);
    Alert.alert('Erreur', "Impossible d'ouvrir l'email.");
  }
}

type Tab = 'conges' | 'maladie' | 'avances' | 'paies';

export default function RHScreen() {
  const {
    data, currentUser, isHydrated,
    addDemandeConge, updateDemandeConge, deleteDemandeConge,
    addArretMaladie, updateArretMaladie, deleteArretMaladie,
    addDemandeAvance, updateDemandeAvance, deleteDemandeAvance,
    addFichePaie, deleteFichePaie,
    addAcompte,
  } = useApp();
  const { t } = useLanguage();
  const { refreshing, onRefresh } = useRefresh();

  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';
  const currentEmploye = data.employes.find(e => e.id === currentUser?.employeId);
  const isRH = isAdmin || currentEmploye?.isRH === true;

  const { confirm, ConfirmModal } = useConfirm();
  const [activeTab, setActiveTab] = useState<Tab>('conges');

  // ─── Filtrage selon le rôle ───────────────────────────────────────────────
  const myId = currentUser?.employeId;

  const conges = useMemo(() => {
    const all = data.demandesConge || [];
    if (isRH) return all;
    return all.filter(d => d.employeId === myId);
  }, [data.demandesConge, isRH, myId]);

  const arrets = useMemo(() => {
    const all = data.arretsMaladie || [];
    if (isRH) return all;
    return all.filter(d => d.employeId === myId);
  }, [data.arretsMaladie, isRH, myId]);

  const avances = useMemo(() => {
    const all = data.demandesAvance || [];
    if (isRH) return all;
    return all.filter(d => d.employeId === myId);
  }, [data.demandesAvance, isRH, myId]);

  const paies = useMemo(() => {
    const all = data.fichesPaie || [];
    // Admin/RH voit tout, employé voit seulement les siennes
    const filtered = isRH ? all : all.filter(d => d.employeId === myId);
    // Trier par mois décroissant (plus récent en premier)
    return [...filtered].sort((a, b) => b.mois.localeCompare(a.mois));
  }, [data.fichesPaie, isRH, myId]);

  // Fiches de paie groupées par année
  const paiesParAnnee = useMemo(() => {
    const groups: Record<string, typeof paies> = {};
    paies.forEach(f => {
      const annee = f.mois.substring(0, 4);
      if (!groups[annee]) groups[annee] = [];
      groups[annee].push(f);
    });
    // Trier les années décroissant
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [paies]);

  // ─── Badges de notification ─────────────────────────────────────────────
  const nbEnAttente = useMemo(() => {
    if (!isRH) return 0;
    return (
      conges.filter(d => d.statut === 'en_attente').length +
      arrets.filter(d => d.statut === 'en_attente').length +
      avances.filter(d => d.statut === 'en_attente').length
    );
  }, [isRH, conges, arrets, avances]);

  // Détection des demandes "nouvelles" (créées dans les dernières 24h)
  const cutoff24h = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const isNouveau = (createdAt: string) => createdAt > cutoff24h;

  // Tri : en_attente en premier, puis par date décroissante
  const congesTries = useMemo(() =>
    [...conges].sort((a, b) => {
      if (a.statut === 'en_attente' && b.statut !== 'en_attente') return -1;
      if (b.statut === 'en_attente' && a.statut !== 'en_attente') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    }), [conges]);
  const arretsTries = useMemo(() =>
    [...arrets].sort((a, b) => {
      if (a.statut === 'en_attente' && b.statut !== 'en_attente') return -1;
      if (b.statut === 'en_attente' && a.statut !== 'en_attente') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    }), [arrets]);
  const avancesTries = useMemo(() =>
    [...avances].sort((a, b) => {
      if (a.statut === 'en_attente' && b.statut !== 'en_attente') return -1;
      if (b.statut === 'en_attente' && a.statut !== 'en_attente') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    }), [avances]);

  // ─── Modals ───────────────────────────────────────────────────────────────
  // Congés
  const [showCongeModal, setShowCongeModal] = useState(false);
  const [congeForm, setCongeForm] = useState({ dateDebut: '', dateFin: '', motif: '', employeId: '' });
  const [editConge, setEditConge] = useState<DemandeConge | null>(null);

  // Arrêt maladie
  const [showArretModal, setShowArretModal] = useState(false);
  const [arretForm, setArretForm] = useState({ dateDebut: '', dateFin: '', commentaire: '', justificatif: '', justificatifNom: '', employeId: '' });
  const [editArret, setEditArret] = useState<ArretMaladie | null>(null);

  // Avance
  const [showAvanceModal, setShowAvanceModal] = useState(false);
  const [avanceForm, setAvanceForm] = useState({ montant: '', motif: '', employeId: '' });

  // Fiche de paie - sélecteur mois/année
  const [showPaieModal, setShowPaieModal] = useState(false);
  const [paieEmployeId, setPaieEmployeId] = useState<string>('');
  const [paieMois, setPaieMois] = useState<string>('');
  const [paieAnnee, setPaieAnnee] = useState<string>(new Date().getFullYear().toString());
  const MOIS_LABELS: readonly string[] = t.ui.moisLongs;
  const ANNEES_LABELS = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
  const [editAvance, setEditAvance] = useState<DemandeAvance | null>(null);

  // Réponse RH (admin/RH uniquement)
  const [showReponseModal, setShowReponseModal] = useState(false);
  const [reponseTarget, setReponseTarget] = useState<{ type: 'conge' | 'arret' | 'avance'; id: string } | null>(null);
  const [reponseForm, setReponseForm] = useState({ statut: 'approuve' as 'approuve' | 'refuse', commentaire: '' });

  // ─── Helpers employé ─────────────────────────────────────────────────────
  const getEmployeNom = (id: string) => {
    const e = data.employes.find(x => x.id === id);
    return e ? `${e.prenom} ${e.nom}` : '—';
  };

  // ─── Actions congés ──────────────────────────────────────────────────────
  const handleSaveConge = () => {
    if (!congeForm.dateDebut || !congeForm.dateFin) return;
    // Admin/RH peut créer pour un employé spécifique, sinon pour soi-même
    const employeId = editConge
      ? editConge.employeId
      : (isRH && congeForm.employeId ? congeForm.employeId : (myId || 'admin'));
    if (editConge) {
      updateDemandeConge({ ...editConge, dateDebut: congeForm.dateDebut, dateFin: congeForm.dateFin, motif: congeForm.motif, updatedAt: now() });
    } else {
      addDemandeConge({ id: genId(), employeId, dateDebut: congeForm.dateDebut, dateFin: congeForm.dateFin, motif: congeForm.motif, statut: 'en_attente', createdAt: now(), updatedAt: now() });
    }
    setShowCongeModal(false);
    setEditConge(null);
    setCongeForm({ dateDebut: '', dateFin: '', motif: '', employeId: '' });
    toast.success(editConge ? t.ui.demandeModifiee : t.ui.demandeEnvoyee);
  };

  const handleDeleteConge = (id: string) => {
    const doDelete = () => { deleteDemandeConge(id); toast.success(t.ui.demandeSupprimee); };
    if (Platform.OS === 'web') { if ((typeof window !== 'undefined' && window.confirm ? window.confirm(t.ui.supprimerDemande) : true)) doDelete(); }
    else Alert.alert(t.ui.supprimerDemande, '', [{ text: t.common.cancel, style: 'cancel' }, { text: t.common.delete, style: 'destructive', onPress: doDelete }]);
  };

  // ─── Actions arrêt maladie ───────────────────────────────────────────────
  const handleSaveArret = () => {
    if (!arretForm.dateDebut) return;
    const employeId = editArret
      ? editArret.employeId
      : (isRH && arretForm.employeId ? arretForm.employeId : (myId || 'admin'));
    if (editArret) {
      updateArretMaladie({ ...editArret, dateDebut: arretForm.dateDebut, dateFin: arretForm.dateFin || undefined, justificatif: arretForm.justificatif || undefined, updatedAt: now() });
    } else {
      addArretMaladie({ id: genId(), employeId, dateDebut: arretForm.dateDebut, dateFin: arretForm.dateFin || undefined, justificatif: arretForm.justificatif || undefined, statut: 'en_attente', createdAt: now(), updatedAt: now() });
    }
    setShowArretModal(false);
    setEditArret(null);
    setArretForm({ dateDebut: '', dateFin: '', commentaire: '', justificatif: '', justificatifNom: '', employeId: '' });
    toast.success(editArret ? t.ui.demandeModifiee : t.ui.arretEnregistre);
  };

  // ─── Actions avance ──────────────────────────────────────────────────────
  const handleSaveAvance = () => {
    const montant = parseFloat(avanceForm.montant);
    if (!montant || montant <= 0) return;
    const employeId = isRH && avanceForm.employeId ? avanceForm.employeId : (myId || 'admin');
    if (editAvance) {
      updateDemandeAvance({ ...editAvance, montant, motif: avanceForm.motif, updatedAt: now() });
    } else {
      addDemandeAvance({ id: genId(), employeId, montant, motif: avanceForm.motif, statut: 'en_attente', createdAt: now(), updatedAt: now() });
    }
    setShowAvanceModal(false);
    setEditAvance(null);
    setAvanceForm({ montant: '', motif: '', employeId: '' });
    toast.success(editAvance ? t.ui.demandeModifiee : t.ui.demandeEnvoyee);
  };

  // ─── Réponse RH ──────────────────────────────────────────────────────────
  // Applique une réponse RH (approuve/refuse) — utilisé par la modale ET les boutons 1-tap.
  const appliquerReponse = (
    type: 'conge' | 'arret' | 'avance',
    id: string,
    statut: 'approuve' | 'refuse',
    commentaire: string,
  ) => {
    if (type === 'conge') {
      const d = conges.find(x => x.id === id);
      if (d) updateDemandeConge({ ...d, statut, commentaireRH: commentaire, updatedAt: now() });
    } else if (type === 'arret') {
      const d = arrets.find(x => x.id === id);
      if (d) {
        updateArretMaladie({ ...d, statut, commentaireRH: commentaire, updatedAt: now() });
        // À l'approbation : ouvrir un mail pour transmettre l'arrêt (+ justificatif) au comptable.
        if (statut === 'approuve') {
          const emp = data.employes.find(e => e.id === d.employeId);
          const nomComplet = emp ? `${emp.prenom} ${emp.nom}` : 'Salarié';
          envoyerArretAuComptable(nomComplet, d.dateDebut, d.dateFin, d.justificatif);
        }
      }
    } else if (type === 'avance') {
      const d = avances.find(x => x.id === id);
      // Garde d'idempotence : ne traiter qu'une demande encore en attente (évite la ré-approbation).
      if (d && d.statut === 'en_attente') {
        updateDemandeAvance({ ...d, statut, commentaireRH: commentaire, updatedAt: now() });
        // Si approuvée, enregistrer comme acompte payé (clé avanceId = anti-doublon).
        if (statut === 'approuve') {
          addAcompte({
            id: genId(),
            employeId: d.employeId,
            montant: d.montant,
            date: now().slice(0, 10),
            commentaire: d.motif || 'Acompte approuvé (demande RH)',
            createdAt: now(),
            avanceId: d.id,
          });
        }
      }
    }
    toast.success(statut === 'approuve' ? 'Demande approuvée' : 'Demande refusée');
  };

  const handleSaveReponse = () => {
    if (!reponseTarget) return;
    appliquerReponse(reponseTarget.type, reponseTarget.id, reponseForm.statut, reponseForm.commentaire);
    setShowReponseModal(false);
    setReponseTarget(null);
  };

  // ─── Upload fiche de paie avec sélecteur mois/année ──────────────────────────────────────────────────────────
  const handleUploadPaie = (employeId: string) => {
    // Ouvrir le modal de sélection mois/année
    setPaieEmployeId(employeId);
    setPaieMois('');
    setPaieAnnee(new Date().getFullYear().toString());
    setShowPaieModal(true);
  };

  const handleConfirmPaieUpload = () => {
    if (!paieMois || !paieAnnee || !paieEmployeId) return;
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Importer une fiche de paie',
        "Sur iPhone, partagez le PDF depuis l'app Fichiers → bouton Partager → SK DECO Planning. Le bouton 'Importer depuis Inbox' apparaîtra ensuite ici.",
      );
      return;
    }
    const moisNum = (MOIS_LABELS.indexOf(paieMois) + 1).toString().padStart(2, '0');
    const moisKey = `${paieAnnee}-${moisNum}`;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { document.body.removeChild(input); return; }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const docId = genId();
        const url = await uploadFileToStorage(base64, `employes/${paieEmployeId}/paies`, docId);
        if (!url) {
          Alert.alert('Erreur', "Impossible d'uploader la fiche de paie.");
          return;
        }
        addFichePaie({ id: docId, employeId: paieEmployeId, mois: moisKey, fichier: url, uploadedAt: now() });
        setShowPaieModal(false);
      };
      reader.readAsDataURL(file);
      document.body.removeChild(input);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  // R1 — Inbox flow équivalent de handleConfirmPaieUpload (mobile-compat).
  // Pattern aligné sur addFromInboxRH (equipe.tsx) : upload vers Supabase
  // Storage à `employes/${employeId}/paies/${id}`, l'URL https est stockée
  // dans FichePaie.fichier. Échec strict (pas de fallback data URI).
  const addFromInboxPaie = useCallback(
    async (item: InboxItem): Promise<boolean> => {
      if (!paieEmployeId || !paieMois || !paieAnnee) return false;
      const fileURI = getInboxItemPath(item);
      if (!fileURI) return false;
      const docId = `inbox_${item.id}`;
      const url = await uploadFileToStorage(fileURI, `employes/${paieEmployeId}/paies`, docId);
      if (!url) return false;
      const moisNum = (MOIS_LABELS.indexOf(paieMois) + 1).toString().padStart(2, '0');
      const moisKey = `${paieAnnee}-${moisNum}`;
      addFichePaie({
        id: docId,
        employeId: paieEmployeId,
        mois: moisKey,
        fichier: url,
        uploadedAt: now(),
      });
      setShowPaieModal(false);
      return true;
    },
    [paieEmployeId, paieMois, paieAnnee, addFichePaie],
  );

  // ─── Statut badge ────────────────────────────────────────────────────────────────────
  const StatutBadge = ({ statut }: { statut: string }) => {
    const colors = STATUT_DEMANDE_COLORS[statut as keyof typeof STATUT_DEMANDE_COLORS] || { bg: '#E2E2DF', text: '#141414' };
    const label = STATUT_DEMANDE_LABELS[statut as keyof typeof STATUT_DEMANDE_LABELS] || statut;
    return (
      <View style={[styles.statutBadge, { backgroundColor: colors.bg }]}>
        <Text style={[styles.statutBadgeText, { color: colors.text }]}>{label}</Text>
      </View>
    );
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer containerClassName="bg-[#F4F4F2]" edges={['top', 'left', 'right']}>
      <BackToPlus />
      {/* Header */}
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <Text style={styles.headerTitle}>{t.rh.title}</Text>
        {nbEnAttente > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{nbEnAttente} {t.rh.pending}</Text>
          </View>
        )}
      </View>

      {/* Onglets */}
      <View style={styles.tabs}>
        {([
          { key: 'conges', label: t.rh.leaves, icon: Palmtree, count: isRH ? conges.filter(d => d.statut === 'en_attente').length : 0 },
          { key: 'maladie', label: t.rh.sick, icon: Thermometer, count: isRH ? arrets.filter(d => d.statut === 'en_attente').length : 0 },
          { key: 'avances', label: t.rh.advances, icon: Banknote, count: isRH ? avances.filter(d => d.statut === 'en_attente').length : 0 },
          { key: 'paies', label: t.rh.payslips, icon: FileText, count: 0 },
        ] as const).map(tab => {
          const Icon = tab.icon;
          const actif = activeTab === tab.key;
          return (
          <Pressable
            key={tab.key}
            style={[styles.tab, actif && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Icon size={13} color={actif ? '#141414' : '#6A6A68'} strokeWidth={2} />
              <Text style={[styles.tabText, actif && styles.tabTextActive]}>{tab.label}</Text>
            </View>
            {tab.count > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{tab.count}</Text></View>
            )}
          </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {/* Réglages notifications (RH non-admin ; l'admin les a dans Société) */}
        {!isAdmin && currentEmploye?.isRH && <NotificationSettings />}

        {/* ── Congés ── */}
        {activeTab === 'conges' && (() => {
          // Calcul du solde de congés
          const anneeRef = new Date().getFullYear(); // le solde se calcule sur l'année civile en cours
          const targetId = isRH ? null : myId; // Admin voit tous, employé voit le sien
          // Droit à congés propre à l'employé concerné (défaut 25 si non renseigné).
          const soldeEmp = (targetId || myId) ? data.employes.find(e => e.id === (targetId || myId)) : undefined;
          const JOURS_PAR_AN = soldeEmp?.joursCongesAnnuels ?? 25;
          const feriesRef = getJoursFeriesFrance(anneeRef); // exclus du décompte (comme le salaire)
          const congesApprouves = conges.filter(d => d.statut === 'approuve' && (!targetId || d.employeId === targetId));
          const joursPris = congesApprouves.reduce((total, d) => {
            const debut = new Date(d.dateDebut);
            const fin = new Date(d.dateFin);
            let jours = 0;
            const current = new Date(debut);
            while (current <= fin) {
              const dow = current.getDay();
              const ymd = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
              // Jours ouvrés de l'année de référence, hors week-ends ET jours fériés.
              if (dow !== 0 && dow !== 6 && current.getFullYear() === anneeRef && !feriesRef.has(ymd)) jours++;
              current.setDate(current.getDate() + 1);
            }
            return total + jours;
          }, 0);
          const solde = JOURS_PAR_AN - joursPris;

          return (
          <>
            {/* Solde de congés individuel — l'employé voit SON propre solde (targetId=myId).
                En vue admin/RH (targetId=null), on masque : un solde unique agrégerait à tort
                les jours pris de toute l'équipe. Le détail par employé reste dans la liste. */}
            {targetId && (
              <View style={styles.soldeCard}>
                <View style={styles.soldeRow}>
                  <View style={styles.soldeItem}>
                    <Text style={styles.soldeValue}>{JOURS_PAR_AN}</Text>
                    <Text style={styles.soldeLabel}>{t.rh.accrued}</Text>
                  </View>
                  <View style={styles.soldeSeparator} />
                  <View style={styles.soldeItem}>
                    <Text style={[styles.soldeValue, { color: '#E74C3C' }]}>{joursPris}</Text>
                    <Text style={styles.soldeLabel}>{t.rh.taken}</Text>
                  </View>
                  <View style={styles.soldeSeparator} />
                  <View style={styles.soldeItem}>
                    <Text style={[styles.soldeValue, { color: solde >= 0 ? '#2E7D32' : '#E74C3C' }]}>{solde}</Text>
                    <Text style={styles.soldeLabel}>{t.rh.remaining}</Text>
                  </View>
                </View>
              </View>
            )}

            <Pressable style={styles.addBtn} onPress={() => { setEditConge(null); setCongeForm({ dateDebut: '', dateFin: '', motif: '', employeId: '' }); setShowCongeModal(true); }}>
              <Text style={styles.addBtnText}>+ {t.rh.newLeaveRequest}</Text>
            </Pressable>
            {congesTries.length === 0 && <EmptyState iconComponent={Palmtree} title={t.rh.noLeaves} />}
            {congesTries.map(d => (
              <View key={d.id} style={[styles.card, d.statut === 'en_attente' && styles.cardEnAttente]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(d.employeId)}</Text>}
                    <Text style={styles.cardTitle}>{t.rh.from} {formatDate(d.dateDebut)} {t.rh.to} {formatDate(d.dateFin)}</Text>
                    {d.motif ? <Text style={styles.cardSub}>{t.rh.reason}: {d.motif}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatutBadge statut={d.statut} />
                    {isRH && isNouveau(d.createdAt) && d.statut === 'en_attente' && (
                      <View style={styles.nouveauBadge}><Text style={styles.nouveauBadgeText}>{t.rh.new}</Text></View>
                    )}
                  </View>
                </View>
                {d.commentaireRH ? <Text style={styles.cardComment}>{d.commentaireRH}</Text> : null}
                <View style={styles.cardActions}>
                  {isRH && d.statut === 'en_attente' && (
                    <>
                    <Pressable style={styles.approuveBtn} onPress={() => appliquerReponse('conge', d.id, 'approuve', '')}>
                      <Text style={styles.approuveBtnText}>✓</Text>
                    </Pressable>
                    <Pressable style={styles.repondreBtn} onPress={() => { setReponseTarget({ type: 'conge', id: d.id }); setReponseForm({ statut: 'approuve', commentaire: '' }); setShowReponseModal(true); }}>
                      <Text style={styles.repondreBtnText}>{t.rh.reply}</Text>
                    </Pressable>
                    </>
                  )}
                  {(!isRH || d.statut === 'en_attente') && (
                    <Pressable style={styles.deleteBtn} onPress={() => handleDeleteConge(d.id)}>
                      <Text style={styles.deleteBtnText}>{t.common.delete}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        ); })()}

        {/* ── Arrêt maladie ── */}
        {activeTab === 'maladie' && (
          <>
            {/* Tout employé (y compris RH) peut déclarer un arrêt pour lui-même */}
            <Pressable style={styles.addBtn} onPress={() => { setEditArret(null); setArretForm({ dateDebut: '', dateFin: '', commentaire: '', justificatif: '', justificatifNom: '', employeId: '' }); setShowArretModal(true); }}>
              <Text style={styles.addBtnText}>+ {t.rh.declareSick}</Text>
            </Pressable>
            {arretsTries.length === 0 && <EmptyState iconComponent={Thermometer} title={t.rh.noSick} />}
            {arretsTries.map(d => (
              <View key={d.id} style={[styles.card, d.statut === 'en_attente' && styles.cardEnAttente]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(d.employeId)}</Text>}
                    <Text style={styles.cardTitle}>{t.rh.start}: {formatDate(d.dateDebut)}{d.dateFin ? ` → ${formatDate(d.dateFin)}` : ` (${t.rh.ongoing})`}</Text>
                  {(d as any).justificatif && (
                    <Pressable onPress={() => openDocPreview((d as any).justificatif)}>
                      <Text style={styles.justificatifLink}>{t.rh.viewProof}</Text>
                    </Pressable>
                  )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatutBadge statut={d.statut} />
                    {isRH && isNouveau(d.createdAt) && d.statut === 'en_attente' && (
                      <View style={styles.nouveauBadge}><Text style={styles.nouveauBadgeText}>{t.rh.new}</Text></View>
                    )}
                  </View>
                </View>
                {d.commentaireRH ? <Text style={styles.cardComment}>{d.commentaireRH}</Text> : null}
                <View style={styles.cardActions}>
                  {isRH && d.statut === 'en_attente' && (
                    <>
                    <Pressable style={styles.approuveBtn} onPress={() => appliquerReponse('arret', d.id, 'approuve', '')}>
                      <Text style={styles.approuveBtnText}>✓</Text>
                    </Pressable>
                    <Pressable style={styles.repondreBtn} onPress={() => { setReponseTarget({ type: 'arret', id: d.id }); setReponseForm({ statut: 'approuve', commentaire: '' }); setShowReponseModal(true); }}>
                      <Text style={styles.repondreBtnText}>{t.rh.reply}</Text>
                    </Pressable>
                    </>
                  )}
                  {(!isRH || d.statut === 'en_attente') && (
                    <Pressable style={styles.deleteBtn} onPress={async () => {
                      if (await confirm(t.ui.supprimerArret)) deleteArretMaladie(d.id);
                    }}>
                      <Text style={styles.deleteBtnText}>{t.common.delete}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Avances ── */}
        {activeTab === 'avances' && (
          <>
            {/* Tout employé (y compris RH) peut demander une avance pour lui-même */}
            <Pressable style={styles.addBtn} onPress={() => { setEditAvance(null); setAvanceForm({ montant: '', motif: '', employeId: '' }); setShowAvanceModal(true); }}>
              <Text style={styles.addBtnText}>+ {t.rh.requestAdvance}</Text>
            </Pressable>
            {avancesTries.length === 0 && <EmptyState iconComponent={Banknote} title={t.rh.noAdvances} />}
            {avancesTries.map(d => (
              <View key={d.id} style={[styles.card, d.statut === 'en_attente' && styles.cardEnAttente]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(d.employeId)}</Text>}
                    <Text style={styles.cardTitle}>{d.montant.toFixed(2)} €</Text>
                    {d.motif ? <Text style={styles.cardSub}>{t.rh.reason}: {d.motif}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatutBadge statut={d.statut} />
                    {isRH && isNouveau(d.createdAt) && d.statut === 'en_attente' && (
                      <View style={styles.nouveauBadge}><Text style={styles.nouveauBadgeText}>{t.rh.new}</Text></View>
                    )}
                  </View>
                </View>
                {d.commentaireRH ? <Text style={styles.cardComment}>{d.commentaireRH}</Text> : null}
                <View style={styles.cardActions}>
                  {isRH && d.statut === 'en_attente' && (
                    <>
                    <Pressable style={styles.approuveBtn} onPress={() => appliquerReponse('avance', d.id, 'approuve', '')}>
                      <Text style={styles.approuveBtnText}>✓</Text>
                    </Pressable>
                    <Pressable style={styles.repondreBtn} onPress={() => { setReponseTarget({ type: 'avance', id: d.id }); setReponseForm({ statut: 'approuve', commentaire: '' }); setShowReponseModal(true); }}>
                      <Text style={styles.repondreBtnText}>{t.rh.reply}</Text>
                    </Pressable>
                    </>
                  )}
                  {isRH && (
                    <Pressable
                      style={[styles.deleteBtn, { backgroundColor: '#FDECEA' }]}
                      onPress={() => {
                        const doDelete = () => deleteDemandeAvance(d.id);
                        if (Platform.OS === 'web') {
                          if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer la demande d'avance de ${getEmployeNom(d.employeId)} (${d.montant.toFixed(2)} €) ?\nCette action est irréversible.`) : true)) doDelete();
                        } else {
                          Alert.alert(
                            'Supprimer la demande ?',
                            `Avance de ${d.montant.toFixed(2)} € pour ${getEmployeNom(d.employeId)}\nCette action est irréversible.`,
                            [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]
                          );
                        }
                      }}
                    >
                      <Text style={[styles.deleteBtnText, { color: '#E74C3C' }]}>{t.common.delete}</Text>
                    </Pressable>
                  )}
                  {!isRH && d.statut === 'en_attente' && (
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => {
                        const doDelete = () => deleteDemandeAvance(d.id);
                        if (Platform.OS === 'web') {
                          if ((typeof window !== 'undefined' && window.confirm ? window.confirm('Annuler cette demande d\'avance ?') : true)) doDelete();
                        } else {
                          Alert.alert('Annuler la demande ?', '', [{ text: 'Non', style: 'cancel' }, { text: 'Oui, annuler', style: 'destructive', onPress: doDelete }]);
                        }
                      }}
                    >
                      <Text style={styles.deleteBtnText}>{t.common.cancel}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Fiches de paie ── */}
        {activeTab === 'paies' && (
          <>
            {isRH && (
              <View style={styles.paieUploadSection}>
                <Text style={styles.paieUploadTitle}>{t.rh.uploadPayslip}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paieEmployeScroll}>
                  {data.employes.map(emp => (
                    <Pressable key={emp.id} style={[styles.paieEmployeBtn, { borderColor: emp.couleur || '#141414' }]} onPress={() => handleUploadPaie(emp.id)}>
                      <View style={[styles.paieEmployeAvatar, { backgroundColor: emp.couleur || '#141414' }]}>
                        <Text style={styles.paieEmployeAvatarText}>{emp.prenom?.[0] || '?'}{emp.nom?.[0] || '?'}</Text>
                      </View>
                      <Text style={styles.paieEmployeNom} numberOfLines={1}>{emp.prenom}</Text>
                      <Text style={styles.paieEmployeAction}>+ {t.rh.upload}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {paies.length === 0 && <EmptyState iconComponent={FileText} title={t.rh.noPayslips} />}
            {paiesParAnnee.map(([annee, fichesAnnee]) => (
              <View key={annee}>
                <View style={styles.anneeHeader}>
                  <Text style={styles.anneeTitle}>{annee}</Text>
                  <Text style={styles.anneeSub}>{fichesAnnee.length} fiche{fichesAnnee.length > 1 ? 's' : ''}</Text>
                </View>
                {fichesAnnee.map(f => (
                  <View key={f.id} style={styles.card}>
                    {isRH && <Text style={styles.cardEmploye}>{getEmployeNom(f.employeId)}</Text>}
                    <Text style={styles.cardTitle}>{formatMois(f.mois, t.common.monthsShort)}</Text>
                    <Text style={styles.cardSub}>Déposée le {new Date(f.uploadedAt).toLocaleDateString('fr-FR')}</Text>
                    <View style={styles.cardActions}>
                      {/* Voir le document */}
                      <Pressable style={styles.voirBtn} onPress={() => openDocPreview(f.fichier)}>
                        <Text style={styles.voirBtnText}>{t.common.view}</Text>
                      </Pressable>
                      {/* Télécharger — web uniquement ; sur mobile "Voir" ouvre le PDF avec le partage natif iOS */}
                      {Platform.OS === 'web' && (
                        <Pressable style={[styles.voirBtn, { backgroundColor: '#EBEBE8' }]} onPress={() => {
                          const a = document.createElement('a');
                          a.href = f.fichier;
                          a.download = `fiche-paie-${f.mois}.pdf`;
                          a.click();
                        }}>
                          <Text style={[styles.voirBtnText, { color: '#141414' }]}>{t.common.download}</Text>
                        </Pressable>
                      )}
                      {/* Suppression : admin uniquement (pas RH employé) */}
                      {isAdmin && (
                        <Pressable style={styles.deleteBtn} onPress={() => {
                          const doDelete = () => deleteFichePaie(f.id);
                          if (Platform.OS === 'web') {
                            if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer la fiche de paie de ${getEmployeNom(f.employeId)} pour ${formatMois(f.mois, t.common.monthsShort)} ?\nCette action est irréversible.`) : true)) doDelete();
                          } else {
                            Alert.alert('Supprimer ?', `Fiche de ${getEmployeNom(f.employeId)} — ${formatMois(f.mois, t.common.monthsShort)}`, [
                              { text: 'Annuler', style: 'cancel' },
                              { text: 'Supprimer', style: 'destructive', onPress: doDelete },
                            ]);
                          }
                        }}>
                          <Text style={styles.deleteBtnText}>{t.common.delete}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Modal demande de congés ── */}
      <ModalKeyboard visible={showCongeModal} transparent animationType="slide" onRequestClose={() => setShowCongeModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCongeModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{editConge ? t.rh.editRequest : t.rh.leaveRequest}</Text>
            {isRH && !editConge && (
              <>
                <Text style={styles.fieldLabel}>{t.rh.concernedEmployee}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Pressable
                    style={[styles.empChip, !congeForm.employeId && styles.empChipActive]}
                    onPress={() => setCongeForm(f => ({ ...f, employeId: '' }))}
                  >
                    <Text style={[styles.empChipText, !congeForm.employeId && styles.empChipTextActive]}>{t.rh.myself}</Text>
                  </Pressable>
                  {data.employes.filter(e => e.id !== myId).map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.empChip, congeForm.employeId === emp.id && styles.empChipActive]}
                      onPress={() => setCongeForm(f => ({ ...f, employeId: emp.id }))}
                    >
                      <Text style={[styles.empChipText, congeForm.employeId === emp.id && styles.empChipTextActive]}>{emp.prenom} {emp.nom}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <DateField
              label={`${t.common.startDate} *`}
              value={congeForm.dateDebut}
              onChange={v => setCongeForm(f => ({ ...f, dateDebut: v }))}
              maxDate={congeForm.dateFin || undefined}
            />
            <DateField
              label={`${t.common.endDate} *`}
              value={congeForm.dateFin}
              onChange={v => setCongeForm(f => ({ ...f, dateFin: v }))}
              minDate={congeForm.dateDebut || undefined}
            />
            <Text style={styles.fieldLabel}>{t.rh.reason} ({t.common.optional})</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder={t.rh.reasonPlaceholder} value={congeForm.motif} onChangeText={v => setCongeForm(f => ({ ...f, motif: v }))} multiline />
            <Pressable style={styles.saveBtn} onPress={handleSaveConge}>
              <Text style={styles.saveBtnText}>{t.rh.sendRequest}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Modal arrêt maladie ── */}
      <ModalKeyboard visible={showArretModal} transparent animationType="slide" onRequestClose={() => setShowArretModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowArretModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.rh.declareSick}</Text>
            {isRH && !editArret && (
              <>
                <Text style={styles.fieldLabel}>{t.rh.concernedEmployee}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Pressable
                    style={[styles.empChip, !arretForm.employeId && styles.empChipActive]}
                    onPress={() => setArretForm(f => ({ ...f, employeId: '' }))}
                  >
                    <Text style={[styles.empChipText, !arretForm.employeId && styles.empChipTextActive]}>{t.rh.myself}</Text>
                  </Pressable>
                  {data.employes.filter(e => e.id !== myId).map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.empChip, arretForm.employeId === emp.id && styles.empChipActive]}
                      onPress={() => setArretForm(f => ({ ...f, employeId: emp.id }))}
                    >
                      <Text style={[styles.empChipText, arretForm.employeId === emp.id && styles.empChipTextActive]}>{emp.prenom} {emp.nom}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <DateField
              label={`${t.common.startDate} *`}
              value={arretForm.dateDebut}
              onChange={v => setArretForm(f => ({ ...f, dateDebut: v }))}
              maxDate={arretForm.dateFin || undefined}
            />
            <DateField
              label={t.rh.endDateIfKnown}
              value={arretForm.dateFin}
              onChange={v => setArretForm(f => ({ ...f, dateFin: v }))}
              minDate={arretForm.dateDebut || undefined}
            />
            <Text style={styles.fieldLabel}>{t.rh.proof}</Text>
            <Pressable
              style={styles.uploadArretBtn}
              onPress={async () => {
                if (Platform.OS === 'web') {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'application/pdf,image/*';
                  input.style.display = 'none';
                  document.body.appendChild(input);
                  input.onchange = (e: Event) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) { document.body.removeChild(input); return; }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const uri = ev.target?.result as string;
                      setArretForm(f => ({ ...f, justificatif: uri, justificatifNom: file.name }));
                    };
                    reader.readAsDataURL(file);
                    document.body.removeChild(input);
                  };
                  input.click(); setTimeout(() => input.remove(), 60000);
                } else {
                  // Natif : sélecteur photothèque/caméra/fichiers + upload Storage
                  // (file:// n'est pas synchronisable tel quel entre appareils).
                  const picked = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: false, compressImages: true });
                  if (picked.length > 0) {
                    const doc = picked[0];
                    const docId = `arret_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const url = await uploadFileToStorage(doc.uri, 'arrets-maladie', docId);
                    if (url) {
                      setArretForm(f => ({ ...f, justificatif: url, justificatifNom: doc.filename || 'justificatif' }));
                    }
                  }
                }
              }}
            >
              <Text style={styles.uploadArretBtnText}>
                {arretForm.justificatif ? `✅ ${arretForm.justificatifNom || t.rh.fileLoaded}` : `${t.rh.attachProof}`}
              </Text>
            </Pressable>
            {arretForm.justificatif ? (
              <Pressable onPress={() => setArretForm(f => ({ ...f, justificatif: '', justificatifNom: '' }))}>
                <Text style={styles.removeFileText}>{t.rh.removeFile}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.saveBtn} onPress={handleSaveArret}>
              <Text style={styles.saveBtnText}>{t.rh.declareSickBtn}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Modal demande d'avance ── */}
      <ModalKeyboard visible={showAvanceModal} transparent animationType="slide" onRequestClose={() => setShowAvanceModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowAvanceModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.rh.advanceRequest}</Text>
            {isRH && !editAvance && (
              <>
                <Text style={styles.fieldLabel}>{t.rh.concernedEmployee}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Pressable
                    style={[styles.empChip, !avanceForm.employeId && styles.empChipActive]}
                    onPress={() => setAvanceForm(f => ({ ...f, employeId: '' }))}
                  >
                    <Text style={[styles.empChipText, !avanceForm.employeId && styles.empChipTextActive]}>{t.rh.myself}</Text>
                  </Pressable>
                  {data.employes.filter(e => e.id !== myId).map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.empChip, avanceForm.employeId === emp.id && styles.empChipActive]}
                      onPress={() => setAvanceForm(f => ({ ...f, employeId: emp.id }))}
                    >
                      <Text style={[styles.empChipText, avanceForm.employeId === emp.id && styles.empChipTextActive]}>{emp.prenom} {emp.nom}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={styles.fieldLabel}>{t.rh.amount} *</Text>
            <TextInput style={styles.input} placeholder={t.rh.amountExample} keyboardType="numeric" value={avanceForm.montant} onChangeText={v => setAvanceForm(f => ({ ...f, montant: v }))} />
            <Text style={styles.fieldLabel}>{t.rh.reason} ({t.common.optional})</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder={t.rh.explainNeed} value={avanceForm.motif} onChangeText={v => setAvanceForm(f => ({ ...f, motif: v }))} multiline />
            <Pressable style={styles.saveBtn} onPress={handleSaveAvance}>
              <Text style={styles.saveBtnText}>{t.rh.sendRequest}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Modal sélection mois/année fiche de paie ── */}
      <ModalKeyboard visible={showPaieModal} transparent animationType="slide" onRequestClose={() => setShowPaieModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowPaieModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.rh.uploadPayslip}</Text>
            {paieEmployeId && (
              <Text style={[styles.fieldLabel, { marginBottom: 12, color: '#141414', fontSize: 14 }]}>
                {t.rh.employee}: {getEmployeNom(paieEmployeId)}
              </Text>
            )}
            <Text style={styles.fieldLabel}>{t.rh.year}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {ANNEES_LABELS.map(a => (
                <Pressable
                  key={a}
                  style={[styles.empChip, paieAnnee === a && styles.empChipActive]}
                  onPress={() => setPaieAnnee(a)}
                >
                  <Text style={[styles.empChipText, paieAnnee === a && styles.empChipTextActive]}>{a}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>{t.rh.month}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {MOIS_LABELS.map(m => (
                <Pressable
                  key={m}
                  style={[styles.empChip, paieMois === m && styles.empChipActive]}
                  onPress={() => setPaieMois(m)}
                >
                  <Text style={[styles.empChipText, paieMois === m && styles.empChipTextActive]}>{m.slice(0, 3)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.saveBtn, (!paieMois || !paieAnnee) && { opacity: 0.5 }]}
              onPress={handleConfirmPaieUpload}
              disabled={!paieMois || !paieAnnee}
            >
              <Text style={styles.saveBtnText}>{t.common.chooseFile}</Text>
            </Pressable>
            {paieMois && paieAnnee && (
              <View style={{ marginTop: 4 }}>
                <InboxPickerButton
                  onPick={addFromInboxPaie}
                  mimeFilter={inboxMimeFilterImagePdf}
                />
              </View>
            )}
          </Pressable>
        </Pressable>
      </ModalKeyboard>

      {/* ── Modal réponse RH ── */}
      <ModalKeyboard visible={showReponseModal} transparent animationType="slide" onRequestClose={() => setShowReponseModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowReponseModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.rh.respondToRequest}</Text>
            <View style={styles.statutRow}>
              {(['approuve', 'refuse'] as const).map(s => (
                <Pressable key={s} style={[styles.statutBtn, reponseForm.statut === s && styles.statutBtnActive, { borderColor: s === 'approuve' ? '#2E7D32' : '#E74C3C' }]} onPress={() => setReponseForm(f => ({ ...f, statut: s }))}>
                  <Text style={[styles.statutBtnText, reponseForm.statut === s && { color: s === 'approuve' ? '#2E7D32' : '#E74C3C' }]}>{s === 'approuve' ? '✅ Approuver' : 'Refuser'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>{t.rh.commentOptional}</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder={t.rh.messageToEmployee} value={reponseForm.commentaire} onChangeText={v => setReponseForm(f => ({ ...f, commentaire: v }))} multiline />
            <Pressable style={styles.saveBtn} onPress={handleSaveReponse}>
              <Text style={styles.saveBtnText}>{t.rh.saveResponse}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ModalKeyboard>
      <ConfirmModal />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  headerTitle: { fontFamily: 'Manrope_500Medium', fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: '#141414' },
  headerBadge: { backgroundColor: '#EBEBE8', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  headerBadgeText: { color: '#141414', fontSize: 12.5, fontWeight: '600' },
  soldeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 12, shadowColor: '#141414', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 },
  soldeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  soldeItem: { alignItems: 'center' },
  soldeValue: { fontSize: 28, fontWeight: '800', color: '#141414' },
  soldeLabel: { fontSize: 12, color: '#6A6A68', marginTop: 2, fontWeight: '500' },
  soldeSeparator: { width: 1, height: 40, backgroundColor: '#E2E2DF' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#EBEBE8', borderRadius: 999, padding: 3, gap: 2 },
  tab: { flex: 1, height: 36, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5, borderRadius: 999 },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#141414', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  tabText: { fontSize: 13, color: '#141414', fontWeight: '500', textAlign: 'center' },
  tabTextActive: { color: '#141414', fontWeight: '600' },
  tabBadge: { backgroundColor: '#141414', borderRadius: 999, minWidth: 19, height: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  addBtn: { backgroundColor: '#141414', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  emptyText: { textAlign: 'center', color: '#6A6A68', fontSize: 14, marginTop: 32 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 14, marginBottom: 12, shadowColor: '#141414', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardEmploye: { fontSize: 13, fontWeight: '700', color: '#141414' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#141414', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#6A6A68', marginBottom: 4 },
  cardComment: { fontSize: 13, color: '#2E7D32', fontStyle: 'italic', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  repondreBtn: { backgroundColor: '#EBEBE8', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  repondreBtnText: { color: '#141414', fontWeight: '600', fontSize: 13 },
  approuveBtn: { backgroundColor: '#E8F5E9', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  approuveBtnText: { color: '#2E7D32', fontWeight: '800', fontSize: 15 },
  deleteBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  deleteBtnText: { color: '#E74C3C', fontWeight: '600', fontSize: 13 },
  voirBtn: { backgroundColor: '#EBEBE8', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  voirBtnText: { color: '#141414', fontWeight: '600', fontSize: 13 },
  statutBadge: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  statutBadgeText: { fontSize: 12, fontWeight: '700' },
  // Fiches de paie
  paieUploadSection: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 16 },
  paieUploadTitle: { fontSize: 14, fontWeight: '700', color: '#141414', marginBottom: 12 },
  paieEmployeScroll: { flexDirection: 'row' },
  paieEmployeBtn: { alignItems: 'center', marginRight: 12, padding: 10, borderRadius: 18, borderWidth: 1.5, minWidth: 80 },
  paieEmployeAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  paieEmployeAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  paieEmployeNom: { fontSize: 12, fontWeight: '600', color: '#141414', maxWidth: 70 },
  paieEmployeAction: { fontSize: 12, color: '#6A6A68', marginTop: 2 },
  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  sheetTitle: { fontSize: 20, fontFamily: 'Manrope_500Medium', color: '#141414', marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6A6A68', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#EBEBE8', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#141414', borderWidth: 1, borderColor: '#E2E2DF', marginBottom: 12 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#141414', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  infoText: { fontSize: 13, color: '#6A6A68', fontStyle: 'italic', marginBottom: 12, lineHeight: 18 },
  statutRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statutBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
  statutBtnActive: { backgroundColor: '#F0FFF4' },
  statutBtnText: { fontWeight: '700', fontSize: 14, color: '#6A6A68' },
  // Badges notification
  cardEnAttente: { borderLeftWidth: 3, borderLeftColor: '#E67E22' },
  uploadArretBtn: { backgroundColor: '#EBEBE8', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#141414', borderStyle: 'dashed', alignItems: 'center', marginBottom: 8 },
  uploadArretBtnText: { fontSize: 14, color: '#141414', fontWeight: '600' },
  removeFileText: { fontSize: 12, color: '#E74C3C', textAlign: 'center', marginBottom: 8 },
  justificatifLink: { fontSize: 13, color: '#141414', fontWeight: '600', marginTop: 4 },
  nouveauBadge: { backgroundColor: '#E74C3C', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  nouveauBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  // Fiches de paie par année
  anneeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginTop: 8, marginBottom: 4, borderBottomWidth: 2, borderBottomColor: '#141414' },
  anneeTitle: { fontSize: 16, fontWeight: '800', color: '#141414' },
  anneeSub: { fontSize: 12, color: '#6A6A68', fontStyle: 'italic' },
  // Sélecteur employé / mois / année
  empChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB', marginRight: 8 },
  empChipActive: { backgroundColor: '#141414', borderColor: '#141414' },
  empChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  empChipTextActive: { color: '#fff' },
});
