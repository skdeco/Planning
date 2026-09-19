import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, TextInput, Platform, Alert, Image, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FileText, PenLine, Upload, Receipt, Paperclip } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_MARCHE_KEY = 'sk_pending_marche_form';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { toast } from 'sonner-native';
import { useApp } from '@/app/context/AppContext';
import { uploadFileToStorage } from '@/lib/supabase';
import { todayYMD } from '@/lib/date/today';
import { AvancementLotsPanel } from '@/components/ui/AvancementLotsPanel';
import { ImportLotsDevisOverlay } from '@/components/ui/ImportLotsDevisOverlay';
import { SignerDevisOverlay } from '@/components/SignerDevisOverlay';
import { sendPushNotification } from '@/hooks/useNotifications';
import {
  MODES_PAIEMENT,
  type MarcheChantier, type SupplementMarche, type PaiementRecu,
  type ModePaiement, type StatutSupplement, type CommissionApporteur,
} from '@/app/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function fmt(n: number) { return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }

export function MarchesChantier({ visible, onClose, chantierId }: Props) {
  const { data, addMarcheChantier, updateMarcheChantier, deleteMarcheChantier, addSupplementMarche, updateSupplementMarche, deleteSupplementMarche, updateChantier, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const router = useRouter();

  const chantier = data.chantiers.find(c => c.id === chantierId);
  const marches = useMemo(() => (data.marchesChantier || []).filter(m => m.chantierId === chantierId), [data.marchesChantier, chantierId]);
  const supplements = useMemo(() => (data.supplementsMarche || []).filter(s => s.chantierId === chantierId), [data.supplementsMarche, chantierId]);

  // Migration : si le chantier a des lots au niveau racine (legacy) et qu'AUCUN
  // marché/supplément n'a encore de lots, on rattache ces lots au premier marché
  // créé. Au-delà, le chantier.avancementCorps reste lu pour le portail client
  // (refacto séparé), mais la source de vérité côté admin est marche.avancementCorps.
  useEffect(() => {
    if (!visible || !chantier?.avancementCorps?.length) return;
    const aucunLotPorte = marches.every(m => !m.avancementCorps?.length)
      && supplements.every(s => !s.avancementCorps?.length);
    if (!aucunLotPorte) return;
    const premierMarche = marches[0];
    if (!premierMarche) return;
    // Déplace les lots vers le premier marché et vide le champ legacy
    updateMarcheChantier({ ...premierMarche, avancementCorps: chantier.avancementCorps });
    updateChantier({ ...chantier, avancementCorps: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, chantier?.id]);
  const apporteurs = data.apporteurs || [];

  // ── Form marché ──
  const [showMarcheForm, setShowMarcheForm] = useState(false);
  const [editMarche, setEditMarche] = useState<MarcheChantier | null>(null);
  const [marcheForm, setMarcheForm] = useState({ libelle: '', montantHT: '', montantTTC: '', dateDevis: '', dateSignature: '', dateDebutTravaux: '' });
  const [marcheDevisInitial, setMarcheDevisInitial] = useState<{ uri: string; nom: string } | null>(null);
  const [marcheDevisSigne, setMarcheDevisSigne] = useState<{ uri: string; nom: string } | null>(null);
  const [devisAutoExtractLoading, setDevisAutoExtractLoading] = useState(false);
  const [devisAutoExtractMsg, setDevisAutoExtractMsg] = useState<string | null>(null);
  const [suppAutoExtractLoading, setSuppAutoExtractLoading] = useState(false);
  const [suppAutoExtractMsg, setSuppAutoExtractMsg] = useState<string | null>(null);
  // Sélecteur multi-options multiplateforme (remplace Alert.alert à N boutons)
  const [chooser, setChooser] = useState<{ title: string; message?: string; options: { text: string; primary?: boolean; onPress: () => void }[] } | null>(null);

  /** Lit les totaux HT / TTC d'un devis PDF déjà envoyé sur le stockage (URL distante). */
  const lireMontantsDevis = async (uri: string): Promise<{ ht?: number; ttc?: number; lisible: boolean; dateDevis?: string; dateDebutTravaux?: string; dateSignature?: string }> => {
    const { extractTextFromPdfUrl } = await import('@/lib/pdfExtract');
    const texte = await extractTextFromPdfUrl(uri);
    if (!texte) return { lisible: false };
    const { extraireRecapDevis, extraireTotalTTC, extraireDatesDevis } = await import('@/lib/devisParser');
    const recap = extraireRecapDevis(texte);
    const ttc = recap.totalTTC || extraireTotalTTC(texte) || undefined;
    const ht = recap.totalNetHT || recap.totalBrutHT || undefined;
    return { ht, ttc, lisible: true, ...extraireDatesDevis(texte) };
  };
  const fmtEur = (n: number) => `${n.toLocaleString('fr-FR')} €`;

  /**
   * Devis choisi dans le formulaire Marché. Le devis SIGNÉ fait foi : ses montants
   * remplacent ceux du formulaire. Le devis initial ne remplit que des champs vides,
   * et jamais si un devis signé est déjà joint.
   */
  const analyserDevisMarche = async (f: { uri: string; nom: string }, source: 'initial' | 'signe') => {
    setDevisAutoExtractMsg(null);
    setDevisAutoExtractLoading(true);
    try {
      const uploaded = await uploadIfNeeded(f, source === 'signe' ? 'marche/devis-signe' : 'marche/devis');
      if (!uploaded.uri || uploaded.uri.startsWith('file://')) { setDevisAutoExtractMsg("Envoi du fichier impossible — montants à saisir à la main"); return; }
      const fichier = { uri: uploaded.uri, nom: uploaded.nom || f.nom };
      if (source === 'signe') setMarcheDevisSigne(fichier); else setMarcheDevisInitial(fichier);
      const { ht, ttc, lisible, dateDevis, dateDebutTravaux, dateSignature } = await lireMontantsDevis(uploaded.uri);
      // Devis signé : date de signature = celle lue dans le document, sinon le jour de l'import.
      // (Une date écrite à la main n'est pas lisible automatiquement : elle reste modifiable dans le champ.)
      if (source === 'signe') {
        setMarcheForm(prev => ({ ...prev, dateSignature: dateSignature || prev.dateSignature || todayYMD() }));
      }
      if (!lisible) { setDevisAutoExtractMsg(`Devis illisible automatiquement (PDF scanné ?) — montants à saisir à la main${source === 'signe' ? ' · date de signature : aujourd\'hui' : ''}`); return; }
      const datesLues: string[] = [];
      setMarcheForm(prev => {
        const next = { ...prev };
        if (dateDebutTravaux && (source === 'signe' || !prev.dateDebutTravaux)) next.dateDebutTravaux = dateDebutTravaux;
        if (dateDevis && source === 'initial') next.dateDevis = dateDevis;
        if (dateDevis && source === 'signe' && !marcheDevisInitial) next.dateDevis = dateDevis;
        return next;
      });
      if (dateDebutTravaux) datesLues.push(`démarrage ${dateDebutTravaux}`);
      if (source === 'signe') datesLues.push(dateSignature ? `signé le ${dateSignature}` : "signature : date du jour (date manuscrite non lisible)");
      else if (dateDevis) datesLues.push(`devis du ${dateDevis}`);
      if (!ht && !ttc) { setDevisAutoExtractMsg(['HT/TTC non détectés dans le devis', ...datesLues].join(' · ')); return; }
      const signeDejaJoint = source === 'initial' && !!marcheDevisSigne;
      const filled: string[] = [];
      setMarcheForm(prev => {
        const curHT = parseFloat((prev.montantHT || '').replace(',', '.')) || 0;
        const curTTC = parseFloat((prev.montantTTC || '').replace(',', '.')) || 0;
        const next = { ...prev };
        if (ht && (source === 'signe' || (!signeDejaJoint && curHT === 0))) next.montantHT = String(ht);
        if (ttc && (source === 'signe' || (!signeDejaJoint && curTTC === 0))) next.montantTTC = String(ttc);
        return next;
      });
      if (ht) filled.push(`HT ${fmtEur(ht)}`);
      if (ttc) filled.push(`TTC ${fmtEur(ttc)}`);
      setDevisAutoExtractMsg(signeDejaJoint
        ? `Devis initial lu (${filled.join(' · ')}) — les montants du devis signé sont conservés`
        : `${source === 'signe' ? 'Repris du devis signé' : 'Auto-rempli'} : ${[...filled, ...datesLues].join(' · ')}`);
    } catch (e) {
      console.warn('[MarchesChantier] auto-extract devis échoué:', e);
      setDevisAutoExtractMsg('Analyse du devis impossible — montants à saisir à la main');
    } finally {
      setDevisAutoExtractLoading(false);
    }
  };

  /** Même logique pour le devis d'un supplément (remplit les champs vides). */
  const analyserDevisSupp = async (f: { uri: string; nom: string }) => {
    setSuppAutoExtractMsg(null);
    setSuppAutoExtractLoading(true);
    try {
      const uploaded = await uploadIfNeeded(f, 'supplements/devis');
      if (!uploaded.uri || uploaded.uri.startsWith('file://')) return;
      setSuppDevis({ uri: uploaded.uri, nom: uploaded.nom || f.nom });
      const { ht, ttc, lisible } = await lireMontantsDevis(uploaded.uri);
      if (!lisible || (!ht && !ttc)) { setSuppAutoExtractMsg('HT/TTC non détectés — montants à saisir à la main'); return; }
      setSuppForm(prev => {
        const curHT = parseFloat((prev.montantHT || '').replace(',', '.')) || 0;
        const curTTC = parseFloat((prev.montantTTC || '').replace(',', '.')) || 0;
        return { ...prev, montantHT: ht && curHT === 0 ? String(ht) : prev.montantHT, montantTTC: ttc && curTTC === 0 ? String(ttc) : prev.montantTTC };
      });
      setSuppAutoExtractMsg(`Auto-rempli : ${[ht ? `HT ${fmtEur(ht)}` : '', ttc ? `TTC ${fmtEur(ttc)}` : ''].filter(Boolean).join(' · ')}`);
    } catch (e) {
      console.warn('[MarchesChantier] auto-extract supplément échoué:', e);
    } finally {
      setSuppAutoExtractLoading(false);
    }
  };
  // ── Commission apporteur (dans le form marché) ──
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionForm, setCommissionForm] = useState<{
    apporteurId: string;
    modeCommission: 'montant' | 'pourcentage';
    valeur: string;
    baseCalcul: 'HT' | 'TTC';
    statut: 'a_payer' | 'paye';
    datePaiement: string;
    note: string;
  }>({
    apporteurId: '', modeCommission: 'pourcentage', valeur: '', baseCalcul: 'HT', statut: 'a_payer', datePaiement: '', note: '',
  });

  // ── Form supplément ──
  const [showSuppForm, setShowSuppForm] = useState(false);
  const [editSupp, setEditSupp] = useState<SupplementMarche | null>(null);
  const [suppForm, setSuppForm] = useState({ libelle: '', description: '', montantHT: '', montantTTC: '', statut: 'en_attente' as StatutSupplement, dateProposition: '', dateAccord: '' });
  const [suppDevis, setSuppDevis] = useState<{ uri: string; nom: string } | null>(null);
  const [suppFacture, setSuppFacture] = useState<{ uri: string; nom: string } | null>(null);

  // ── Form paiement (acompte) ──
  const [showPaiementForm, setShowPaiementForm] = useState(false);
  const [paiementTarget, setPaiementTarget] = useState<{ type: 'marche' | 'supplement'; id: string } | null>(null);
  const [paiementForm, setPaiementForm] = useState({ date: todayYMD(), montant: '', mode: 'virement' as ModePaiement, reference: '', note: '' });
  const [paiementFacture, setPaiementFacture] = useState<{ uri: string; nom: string } | null>(null);
  const [paiementCommissionFacture, setPaiementCommissionFacture] = useState<{ uri: string; nom: string } | null>(null);
  const [paiementCommissionPaye, setPaiementCommissionPaye] = useState(false);

  // ── Signature client ──

  // ── Restauration du formulaire après ajout d'un apporteur ──
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_MARCHE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        // Vérifier : même chantier ET moins de 10 minutes
        if (saved.chantierId !== chantierId) return;
        if (Date.now() - saved.timestamp > 10 * 60 * 1000) {
          await AsyncStorage.removeItem(PENDING_MARCHE_KEY);
          return;
        }
        // Restaurer
        setMarcheForm(saved.marcheForm || { libelle: '', montantHT: '', montantTTC: '', dateDevis: '', dateSignature: '', dateDebutTravaux: '' });
        setCommissionEnabled(!!saved.commissionEnabled);
        // Auto-sélectionner le dernier apporteur créé (si nouvel apporteur ajouté depuis le save)
        const restoredCommission = saved.commissionForm || { apporteurId: '', modeCommission: 'pourcentage', valeur: '', baseCalcul: 'HT', statut: 'a_payer', datePaiement: '', note: '' };
        if (!restoredCommission.apporteurId && apporteurs.length > 0) {
          // Prendre le plus récent (dernier dans la liste)
          const latest = apporteurs[apporteurs.length - 1];
          restoredCommission.apporteurId = latest.id;
        }
        setCommissionForm(restoredCommission);
        // Si c'était une édition, restaurer editMarche
        if (saved.editMarcheId) {
          const m = (data.marchesChantier || []).find(x => x.id === saved.editMarcheId);
          if (m) setEditMarche(m);
        }
        // Ouvrir le formulaire automatiquement
        setShowMarcheForm(true);
        // Nettoyer
        await AsyncStorage.removeItem(PENDING_MARCHE_KEY);
      } catch {}
    })();
  }, [visible, chantierId]);

  // ── Détail marché ──
  const [openMarcheId, setOpenMarcheId] = useState<string | null>(null);
  const [openSuppId, setOpenSuppId] = useState<string | null>(null);

  // ── Import lots depuis devis (overlay inline pour éviter bug iOS Modal-on-Modal) ──
  // Cible : un marché ou un supplément spécifique (les lots sont attachés
  // à un parent unique, plus au chantier).
  const [importLotsTarget, setImportLotsTarget] = useState<
    | { type: 'marche'; id: string; devisUri?: string; devisNom?: string }
    | { type: 'supplement'; id: string; devisUri?: string; devisNom?: string }
    | null
  >(null);

  /**
   * Quand un nouveau snapshot est créé (figer pour facturation), notifie le
   * client lié au chantier via Expo push. Silencieux si pas de client lié
   * ou pas de push token (apporteur jamais connecté).
   */
  const notifyClientSnapshot = (oldSnaps: import('@/app/types').SnapshotAvancement[] | undefined, newSnaps: import('@/app/types').SnapshotAvancement[], libelleParent: string) => {
    const oldCount = oldSnaps?.length || 0;
    if (newSnaps.length <= oldCount) return; // pas un nouveau snapshot
    const dernier = newSnaps[newSnaps.length - 1];
    const clientId = chantier?.clientApporteurId;
    if (!clientId) return;
    const client = apporteurs.find(a => a.id === clientId);
    if (!client?.pushToken) return;
    const montantNouveau = (dernier.lots || []).reduce((s, l) => s + l.montantFactureNouveau, 0);
    sendPushNotification(
      [client.pushToken],
      `Nouvelle situation figée — ${chantier?.nom || ''}`.trim(),
      `${dernier.intitule || 'Situation'} sur ${libelleParent} : ${fmt(montantNouveau)} € HT à facturer.`,
      { type: 'snapshot', chantierId, snapshotId: dernier.id }
    );
  };

  // ── Signer devis (apposer signature/date/mention sur PDF original) ──
  const [signerTarget, setSignerTarget] = useState<
    | { type: 'marche'; id: string; devisUri: string; devisNom?: string }
    | { type: 'supplement'; id: string; devisUri: string; devisNom?: string }
    | null
  >(null);

  const pickFile = async (label: string): Promise<{ uri: string; nom: string } | null> => {
    // 1 seul code path web/iOS/Android via pickNativeFile (cohérence C1a/C1b/C1c).
    // acceptCamera: true permet à l'utilisateur de photographier un devis sur place.
    const files = await pickNativeFile({
      acceptImages: true,
      acceptPdf: true,
      acceptCamera: true,
      multiple: false,
      compressImages: true,
    });
    if (!files || files.length === 0) return null;
    const f = files[0];
    return { uri: f.uri, nom: f.filename || `${label}_${Date.now()}` };
  };

  const uploadIfNeeded = async (file: { uri: string; nom: string } | null, folder: string): Promise<{ uri?: string; nom?: string }> => {
    if (!file) return {};
    const fileId = genId('doc');
    const url = await uploadFileToStorage(file.uri, `chantiers/${chantierId}/${folder}`, fileId);
    return { uri: url || file.uri, nom: file.nom };
  };

  // ── Marché ──
  // Reset complet + ouverture form en mode création (extrait pour réutilisation
  // depuis l'Alert de prévention doublons).
  const proceedNewMarche = () => {
    setEditMarche(null);
    setMarcheForm({ libelle: 'Marché initial', montantHT: '', montantTTC: '', dateDevis: todayYMD(), dateSignature: '', dateDebutTravaux: '' });
    setMarcheDevisInitial(null);
    setMarcheDevisSigne(null);
    setDevisAutoExtractMsg(null);
    setDevisAutoExtractLoading(false);
    setCommissionEnabled(false);
    setCommissionForm({ apporteurId: '', modeCommission: 'pourcentage', valeur: '', baseCalcul: 'HT', statut: 'a_payer', datePaiement: '', note: '' });
    setShowMarcheForm(true);
  };

  // Prévention UX : si des marchés existent déjà, proposer de les éditer
  // pour éviter le doublon accidentel (BUG-MARCHE-DOUBLON).
  const openNewMarche = () => {
    if (marches.length === 0) {
      proceedNewMarche();
      return;
    }
    // Sélecteur intégré (Alert.alert à plusieurs boutons n'existe pas sur le web → « rien ne se passe »)
    setChooser({
      title: `${marches.length} marché${marches.length > 1 ? 's' : ''} existant${marches.length > 1 ? 's' : ''} pour ce chantier`,
      message: "Pour ajouter un devis signé à un marché existant, modifiez-le plutôt que d'en créer un nouveau.",
      options: [
        ...marches.slice(-5).map(m => ({ text: `Modifier « ${m.libelle} »`, onPress: () => openEditMarche(m) })),
        { text: '+ Créer un nouveau marché', primary: true, onPress: proceedNewMarche },
      ],
    });
  };
  const openEditMarche = (m: MarcheChantier) => {
    setEditMarche(m);
    setMarcheForm({
      libelle: m.libelle,
      montantHT: String(m.montantHT),
      montantTTC: String(m.montantTTC),
      dateDevis: m.dateDevis || '',
      dateSignature: m.dateSignature || '',
      dateDebutTravaux: m.dateDebutTravaux || '',
    });
    setMarcheDevisInitial(m.devisInitialUri ? { uri: m.devisInitialUri, nom: m.devisInitialNom || 'Devis' } : null);
    setMarcheDevisSigne(m.devisSigneUri ? { uri: m.devisSigneUri, nom: m.devisSigneNom || 'Devis signé' } : null);
    if (m.commission) {
      setCommissionEnabled(true);
      setCommissionForm({
        apporteurId: m.commission.apporteurId,
        modeCommission: m.commission.modeCommission,
        valeur: String(m.commission.valeur),
        baseCalcul: m.commission.baseCalcul || 'HT',
        statut: m.commission.statut,
        datePaiement: m.commission.datePaiement || '',
        note: m.commission.note || '',
      });
    } else {
      setCommissionEnabled(false);
      setCommissionForm({ apporteurId: '', modeCommission: 'pourcentage', valeur: '', baseCalcul: 'HT', statut: 'a_payer', datePaiement: '', note: '' });
    }
    setShowMarcheForm(true);
  };
  const handleSaveMarche = async () => {
    if (!marcheForm.libelle.trim()) return;
    const ht = parseFloat(marcheForm.montantHT.replace(',', '.')) || 0;
    const ttc = parseFloat(marcheForm.montantTTC.replace(',', '.')) || ht * 1.2;
    const devisI = await uploadIfNeeded(marcheDevisInitial, 'marche/devis');
    const devisS = await uploadIfNeeded(marcheDevisSigne, 'marche/devis-signe');
    const now = new Date().toISOString();
    // Commission activée mais incomplète : on BLOQUE l'enregistrement avec un
    // message clair (V11 fix : avant, la commission était perdue en silence).
    if (commissionEnabled && (!commissionForm.apporteurId || !commissionForm.valeur.trim())) {
      const msg = !commissionForm.apporteurId
        ? "Commission activée : sélectionne l'apporteur / architecte bénéficiaire."
        : "Commission activée : saisis le pourcentage ou le montant de la commission (le chiffre grisé n'est qu'un exemple).";
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Commission incomplète', msg);
      return;
    }
    // Construire la commission si activée et valide
    let commission: CommissionApporteur | undefined;
    if (commissionEnabled && commissionForm.apporteurId && commissionForm.valeur.trim()) {
      const valeurNum = parseFloat(commissionForm.valeur.replace(',', '.')) || 0;
      commission = {
        apporteurId: commissionForm.apporteurId,
        modeCommission: commissionForm.modeCommission,
        valeur: valeurNum,
        baseCalcul: commissionForm.modeCommission === 'pourcentage' ? commissionForm.baseCalcul : undefined,
        statut: commissionForm.statut,
        datePaiement: commissionForm.statut === 'paye' ? (commissionForm.datePaiement || todayYMD()) : undefined,
        note: commissionForm.note.trim() || undefined,
      };
    }
    const m: MarcheChantier = {
      id: editMarche?.id || genId('mar'),
      chantierId,
      libelle: marcheForm.libelle.trim(),
      montantHT: ht,
      montantTTC: ttc,
      devisInitialUri: devisI.uri || editMarche?.devisInitialUri,
      devisInitialNom: devisI.nom || editMarche?.devisInitialNom,
      devisSigneUri: devisS.uri || editMarche?.devisSigneUri,
      devisSigneNom: devisS.nom || editMarche?.devisSigneNom,
      dateDevis: marcheForm.dateDevis || undefined,
      dateSignature: marcheForm.dateSignature || undefined,
      dateDebutTravaux: marcheForm.dateDebutTravaux || undefined,
      paiements: editMarche?.paiements || [],
      // V11 fix : la modification effaçait les lots d'avancement, les snapshots
      // et la signature client (champs absents du formulaire) — on les préserve.
      avancementCorps: editMarche?.avancementCorps,
      snapshots: editMarche?.snapshots,
      signatureClientUri: editMarche?.signatureClientUri,
      signatureClientDate: editMarche?.signatureClientDate,
      commission,
      createdAt: editMarche?.createdAt || now,
      updatedAt: now,
    };
    if (editMarche) updateMarcheChantier(m); else addMarcheChantier(m);
    // Si le chantier n'a pas encore de date de début, on reprend celle du devis (jamais d'écrasement).
    if (m.dateDebutTravaux && chantier && !chantier.dateDebut) updateChantier({ ...chantier, dateDebut: m.dateDebutTravaux });
    setShowMarcheForm(false);
  };

  // Helper : calcul du montant d'une commission
  const getCommissionAmount = (m: MarcheChantier): number => {
    if (!m.commission) return 0;
    if (m.commission.modeCommission === 'montant') return m.commission.valeur;
    const base = m.commission.baseCalcul === 'TTC' ? m.montantTTC : m.montantHT;
    return base * (m.commission.valeur / 100);
  };
  const handleDeleteMarche = (m: MarcheChantier) => {
    const doDel = () => deleteMarcheChantier(m.id);
    if (Platform.OS === 'web') { if (window.confirm(`Supprimer "${m.libelle}" ?`)) doDel(); }
    else Alert.alert('Supprimer', `Supprimer "${m.libelle}" ?`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDel }]);
  };

  // ── Supplément ──
  const proceedNewSupp = () => {
    setEditSupp(null);
    setSuppForm({ libelle: '', description: '', montantHT: '', montantTTC: '', statut: 'en_attente', dateProposition: todayYMD(), dateAccord: '' });
    setSuppDevis(null);
    setSuppFacture(null);
    setSuppAutoExtractMsg(null);
    setShowSuppForm(true);
  };

  // Prévention UX : si des suppléments existent déjà, proposer de les éditer
  // pour éviter le doublon accidentel (BUG-MARCHE-DOUBLON).
  const openNewSupp = () => {
    if (supplements.length === 0) {
      proceedNewSupp();
      return;
    }
    setChooser({
      title: `${supplements.length} supplément${supplements.length > 1 ? 's' : ''} existant${supplements.length > 1 ? 's' : ''}`,
      message: 'Modifiez un supplément existant, ou créez-en un nouveau.',
      options: [
        ...supplements.slice(-5).map(s => ({ text: `Modifier « ${s.libelle} »`, onPress: () => openEditSupp(s) })),
        { text: '+ Créer un nouveau supplément', primary: true, onPress: proceedNewSupp },
      ],
    });
  };
  const openEditSupp = (s: SupplementMarche) => {
    setEditSupp(s);
    setSuppForm({
      libelle: s.libelle, description: s.description || '',
      montantHT: String(s.montantHT), montantTTC: String(s.montantTTC),
      statut: s.statut, dateProposition: s.dateProposition || '', dateAccord: s.dateAccord || '',
    });
    setSuppDevis(s.devisUri ? { uri: s.devisUri, nom: s.devisNom || 'Devis' } : null);
    setSuppFacture(s.factureUri ? { uri: s.factureUri, nom: s.factureNom || 'Facture' } : null);
    setShowSuppForm(true);
  };
  const handleSaveSupp = async () => {
    if (!suppForm.libelle.trim()) return;
    const ht = parseFloat(suppForm.montantHT.replace(',', '.')) || 0;
    const ttc = parseFloat(suppForm.montantTTC.replace(',', '.')) || ht * 1.2;
    const devis = await uploadIfNeeded(suppDevis, 'supplements/devis');
    const facture = await uploadIfNeeded(suppFacture, 'supplements/factures');
    const now = new Date().toISOString();
    const s: SupplementMarche = {
      id: editSupp?.id || genId('sup'),
      chantierId,
      libelle: suppForm.libelle.trim(),
      description: suppForm.description.trim() || undefined,
      montantHT: ht,
      montantTTC: ttc,
      statut: suppForm.statut,
      dateProposition: suppForm.dateProposition || undefined,
      dateAccord: suppForm.statut === 'accepte' ? (suppForm.dateAccord || todayYMD()) : undefined,
      devisUri: devis.uri || editSupp?.devisUri,
      devisNom: devis.nom || editSupp?.devisNom,
      factureUri: facture.uri || editSupp?.factureUri,
      factureNom: facture.nom || editSupp?.factureNom,
      paiements: editSupp?.paiements || [],
      createdAt: editSupp?.createdAt || now,
      updatedAt: now,
    };
    if (editSupp) updateSupplementMarche(s); else addSupplementMarche(s);
    setShowSuppForm(false);
  };
  const handleDeleteSupp = (s: SupplementMarche) => {
    const doDel = () => deleteSupplementMarche(s.id);
    if (Platform.OS === 'web') { if (window.confirm(`Supprimer "${s.libelle}" ?`)) doDel(); }
    else Alert.alert('Supprimer', `Supprimer "${s.libelle}" ?`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDel }]);
  };

  // ── Paiements ──
  const openPaiementForm = (type: 'marche' | 'supplement', id: string) => {
    setPaiementTarget({ type, id });
    setPaiementForm({ date: todayYMD(), montant: '', mode: 'virement', reference: '', note: '' });
    setPaiementFacture(null);
    setPaiementCommissionFacture(null);
    setPaiementCommissionPaye(false);
    setShowPaiementForm(true);
  };

  // Calcule la commission due sur un acompte donné d'un marché
  const computeCommissionForAcompte = (m: MarcheChantier | undefined, acompteMontant: number): number => {
    if (!m || !m.commission) return 0;
    if (m.commission.modeCommission === 'pourcentage') {
      return acompteMontant * (m.commission.valeur / 100);
    }
    // 'montant' : pro-rata sur la base TTC
    if (m.montantTTC > 0) return (acompteMontant / m.montantTTC) * m.commission.valeur;
    return 0;
  };

  const handleSavePaiement = async () => {
    if (!paiementTarget || !paiementForm.montant.trim()) return;
    const facture = await uploadIfNeeded(paiementFacture, 'paiements');
    const commissionFacture = await uploadIfNeeded(paiementCommissionFacture, 'paiements/commissions');
    const montant = parseFloat(paiementForm.montant.replace(',', '.')) || 0;

    // Si le marché parent a une commission, calculer le montant dû et stocker
    let commissionMontant: number | undefined;
    let commissionPaye: boolean | undefined;
    let commissionDatePaiement: string | undefined;
    if (paiementTarget.type === 'marche') {
      const m = marches.find(x => x.id === paiementTarget.id);
      if (m?.commission) {
        commissionMontant = computeCommissionForAcompte(m, montant);
        commissionPaye = paiementCommissionPaye;
        commissionDatePaiement = paiementCommissionPaye ? todayYMD() : undefined;
      }
    }

    const p: PaiementRecu = {
      id: genId('pay'),
      date: paiementForm.date,
      montant,
      mode: paiementForm.mode,
      reference: paiementForm.reference.trim() || undefined,
      note: paiementForm.note.trim() || undefined,
      factureUri: facture.uri,
      factureNom: facture.nom,
      commissionFactureUri: commissionFacture.uri,
      commissionFactureNom: commissionFacture.nom,
      commissionMontant,
      commissionPaye,
      commissionDatePaiement,
    };
    if (paiementTarget.type === 'marche') {
      const m = marches.find(x => x.id === paiementTarget.id);
      if (m) updateMarcheChantier({ ...m, paiements: [...m.paiements, p], updatedAt: new Date().toISOString() });
    } else {
      const s = supplements.find(x => x.id === paiementTarget.id);
      if (s) updateSupplementMarche({ ...s, paiements: [...s.paiements, p], updatedAt: new Date().toISOString() });
    }
    setShowPaiementForm(false);
  };

  // Toggle statut commission (payée / à payer) sur un paiement existant
  const toggleCommissionPayePaiement = (marcheId: string, payId: string) => {
    const m = marches.find(x => x.id === marcheId);
    if (!m) return;
    const newPaiements = m.paiements.map(p => p.id === payId
      ? { ...p, commissionPaye: !p.commissionPaye, commissionDatePaiement: !p.commissionPaye ? todayYMD() : undefined }
      : p
    );
    updateMarcheChantier({ ...m, paiements: newPaiements, updatedAt: new Date().toISOString() });
  };
  const handleDeletePaiement = (type: 'marche' | 'supplement', parentId: string, payId: string) => {
    const doDel = () => {
      if (type === 'marche') {
        const m = marches.find(x => x.id === parentId);
        if (m) updateMarcheChantier({ ...m, paiements: m.paiements.filter(p => p.id !== payId), updatedAt: new Date().toISOString() });
      } else {
        const s = supplements.find(x => x.id === parentId);
        if (s) updateSupplementMarche({ ...s, paiements: s.paiements.filter(p => p.id !== payId), updatedAt: new Date().toISOString() });
      }
    };
    if (Platform.OS === 'web') { if (window.confirm('Supprimer ce paiement ?')) doDel(); }
    else Alert.alert('Supprimer', 'Supprimer ce paiement ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDel }]);
  };

  const openDoc = (uri?: string) => {
    if (!uri) return;
    if (Platform.OS === 'web') {
      // URL HTTP (Supabase) : ouvre direct dans un nouvel onglet
      if (uri.startsWith('http')) {
        if (typeof window !== 'undefined') window.open(uri, '_blank');
        return;
      }
      // Data URI : encapsule dans une page
      const w = window.open();
      if (w) {
        if (uri.startsWith('data:application/pdf') || uri.endsWith('.pdf')) {
          w.document.write(`<iframe src="${uri}" style="width:100%;height:100vh;border:none"></iframe>`);
        } else {
          w.document.write(`<img src="${uri}" style="max-width:100%;height:auto"/>`);
        }
      }
    } else {
      // Mobile : utilise Linking (import statique)
      if (uri.startsWith('http') || uri.startsWith('data:')) {
        Linking.openURL(uri).catch(() => Alert.alert('Ouvrir', "Impossible d'ouvrir ce fichier."));
      } else {
        Alert.alert('Ouvrir', "Ce fichier ne peut pas être ouvert sur mobile.");
      }
    }
  };

  // ── Totaux ──
  const totalMarchesTTC = marches.reduce((s, m) => s + m.montantTTC, 0);
  const totalSuppAccepteTTC = supplements.filter(s => s.statut === 'accepte').reduce((s, x) => s + x.montantTTC, 0);
  const totalRecu = marches.reduce((s, m) => s + m.paiements.reduce((a, p) => a + p.montant, 0), 0)
    + supplements.reduce((s, sup) => s + sup.paiements.reduce((a, p) => a + p.montant, 0), 0);
  const totalDu = totalMarchesTTC + totalSuppAccepteTTC;
  const reste = totalDu - totalRecu;

  return (
    <ModalKeyboard visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ height: '10%' }} onPress={onClose} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '90%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EDE2D6' }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#2B1D14' }}>Marchés</Text>
              <Text style={{ fontSize: 12, color: '#6E5F54' }}>{chantier?.nom}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1E7DC', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6E5F54', fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Récap */}
            <View style={{ flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#FAF5EF' }}>
              <View style={{ flex: 1, backgroundColor: '#F2E4E1', borderRadius: 8, padding: 10 }}>
                <Text style={{ fontSize: 10, color: '#6E5F54', fontWeight: '600' }}>TOTAL DÛ TTC</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#5C1F2E' }}>{fmt(totalDu)} €</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#D4EDDA', borderRadius: 8, padding: 10 }}>
                <Text style={{ fontSize: 10, color: '#155724', fontWeight: '600' }}>REÇU</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#155724' }}>{fmt(totalRecu)} €</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: reste > 0 ? '#FEF2F2' : reste === 0 ? '#D4EDDA' : '#F2E4E1', borderRadius: 8, padding: 10 }}>
                <Text style={{ fontSize: 10, color: '#6E5F54', fontWeight: '600' }}>{reste < 0 ? 'TROP-PERÇU' : 'RESTE'}</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: reste > 0 ? '#DC2626' : reste === 0 ? '#155724' : '#5C1F2E' }}>{reste === 0 ? 'Soldé ✓' : `${fmt(Math.abs(reste))} €`}</Text>
              </View>
            </View>

            {/* ── MARCHÉS ── */}
            <View style={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#5C1F2E' }}>Marchés ({marches.length})</Text>
              <Pressable style={{ backgroundColor: '#5C1F2E', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={openNewMarche}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>+ Marché</Text>
              </Pressable>
            </View>
            {marches.length === 0 && (
              <Text style={{ fontSize: 12, color: '#9A8C80', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>Aucun marché</Text>
            )}
            {marches.map(m => {
              const totalRecuM = m.paiements.reduce((s, p) => s + p.montant, 0);
              const resteM = m.montantTTC - totalRecuM;
              const isOpen = openMarcheId === m.id;
              return (
                <View key={m.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EDE2D6' }}>
                  <Pressable onPress={() => setOpenMarcheId(isOpen ? null : m.id)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2B1D14' }}>{m.libelle}</Text>
                          {m.devisInitialUri && !m.devisSigneUri && (
                            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 }}>!</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: '#6E5F54', marginTop: 2 }}>{fmt(m.montantHT)} € HT · {fmt(m.montantTTC)} € TTC</Text>
                        <Text style={{ fontSize: 11, color: resteM > 0 ? '#DC2626' : '#27AE60', fontWeight: '600', marginTop: 2 }}>
                          Reçu : {fmt(totalRecuM)} € · Reste : {fmt(resteM)} €
                        </Text>
                        {m.dateSignature && <Text style={{ fontSize: 10, color: '#27AE60', marginTop: 2 }}>Signé le {m.dateSignature}</Text>}
                        {m.dateDebutTravaux && <Text style={{ fontSize: 10, color: '#6E5F54', marginTop: 2 }}>Démarrage des travaux : {m.dateDebutTravaux}</Text>}
                        {m.commission && (() => {
                          const app = apporteurs.find(a => a.id === m.commission!.apporteurId);
                          const montantC = getCommissionAmount(m);
                          const suffixe = m.commission!.modeCommission === 'pourcentage'
                            ? ` (${m.commission!.valeur}% ${m.commission!.baseCalcul || 'HT'})`
                            : '';
                          return (
                            <View style={{ backgroundColor: '#F2E4E1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6, borderLeftWidth: 3, borderLeftColor: '#5C1F2E', alignSelf: 'flex-start' }}>
                              <Text style={{ fontSize: 10, color: '#5C1F2E', fontWeight: '700' }}>{app ? `${app.prenom} ${app.nom}` : 'Apporteur'} — {fmt(montantC)} €{suffixe} — {m.commission!.statut === 'paye' ? 'Payé' : 'À payer'}
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                      <Text style={{ fontSize: 14, color: '#6E5F54' }}>{isOpen ? '▾' : '▸'}</Text>
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1E7DC' }}>
                      {/* Documents */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        {m.devisInitialUri ? (
                          <View style={{ flex: 1, backgroundColor: '#F2E4E1', borderRadius: 6, position: 'relative' }}>
                            <Pressable style={{ padding: 8, alignItems: 'center' }} onPress={() => openDoc(m.devisInitialUri)}>
                              <FileText size={17} color="#5C1F2E" strokeWidth={2} />
                              <Text style={{ fontSize: 9, color: '#5C1F2E', fontWeight: '600' }} numberOfLines={1}>Devis initial</Text>
                            </Pressable>
                            <Pressable
                              style={{ position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#D94F4F', alignItems: 'center', justifyContent: 'center' }}
                              onPress={() => {
                                // Suppression du devis = on remet aussi HT/TTC à 0
                                // (cohérence avec l'auto-extraction au chargement).
                                const doDelete = () => updateMarcheChantier({
                                  ...m,
                                  devisInitialUri: undefined,
                                  devisInitialNom: undefined,
                                  montantHT: 0,
                                  montantTTC: 0,
                                });
                                const msg = 'Supprimer le devis initial ? Les montants HT/TTC seront aussi remis à zéro.';
                                if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm(msg)) doDelete(); }
                                else Alert.alert('Supprimer', msg, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]);
                              }}>
                              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>✕</Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {m.devisSigneUri ? (
                          <View style={{ flex: 1, backgroundColor: '#D4EDDA', borderRadius: 6, position: 'relative' }}>
                            <Pressable style={{ padding: 8, alignItems: 'center' }} onPress={() => openDoc(m.devisSigneUri)}>
                              <PenLine size={17} color="#155724" strokeWidth={2} />
                              <Text style={{ fontSize: 9, color: '#155724', fontWeight: '600' }} numberOfLines={1}>Devis signé</Text>
                            </Pressable>
                            <Pressable
                              style={{ position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#D94F4F', alignItems: 'center', justifyContent: 'center' }}
                              onPress={() => {
                                const doDelete = () => updateMarcheChantier({ ...m, devisSigneUri: undefined, devisSigneNom: undefined });
                                if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm('Supprimer le devis signé ?')) doDelete(); }
                                else Alert.alert('Supprimer', 'Supprimer le devis signé ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]);
                              }}>
                              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>✕</Text>
                            </Pressable>
                          </View>
                        ) : m.devisInitialUri ? (
                          <>
                            {/* V10 — Signer le devis dans l'app (apposer signature/date/mention sur PDF) */}
                            <Pressable
                              style={{ flex: 1, backgroundColor: '#5C1F2E', borderRadius: 6, padding: 8, alignItems: 'center' }}
                              onPress={() => setSignerTarget({ type: 'marche', id: m.id, devisUri: m.devisInitialUri!, devisNom: m.devisInitialNom })}
                            >
                              <PenLine size={17} color="#FAF5EF" strokeWidth={2} />
                              <Text style={{ fontSize: 9, color: '#FAF5EF', fontWeight: '700' }} numberOfLines={1}>Signer ici</Text>
                            </Pressable>
                            {/* Toujours laisser la possibilité d'uploader un devis signé externe (client chez lui) */}
                            <Pressable
                              style={{ flex: 1, backgroundColor: 'transparent', borderRadius: 6, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#DC2626', borderStyle: 'dashed' }}
                              onPress={async () => {
                                const f = await pickFile('devis-signe');
                                if (!f) return;
                                const uploaded = await uploadIfNeeded(f, 'marche/devis-signe');
                                if (!uploaded.uri) return;
                                // Le devis signé fait foi : on relit ses montants et on met le marché à jour.
                                let maj: Partial<MarcheChantier> = {};
                                try {
                                  const lu = await lireMontantsDevis(uploaded.uri);
                                  if (lu.ht) maj.montantHT = lu.ht;
                                  if (lu.ttc) maj.montantTTC = lu.ttc;
                                  if (lu.dateDebutTravaux) maj.dateDebutTravaux = lu.dateDebutTravaux;
                                  if (lu.dateSignature) maj.dateSignature = lu.dateSignature;
                                } catch {}
                                // Date de signature : lue dans le document, sinon conservée, sinon jour de l'import.
                                if (!maj.dateSignature) maj.dateSignature = m.dateSignature || todayYMD();
                                updateMarcheChantier({ ...m, ...maj, devisSigneUri: uploaded.uri, devisSigneNom: uploaded.nom });
                                if (maj.montantHT || maj.montantTTC) toast.success(`Montants repris du devis signé : ${[maj.montantHT ? `HT ${fmtEur(maj.montantHT)}` : '', maj.montantTTC ? `TTC ${fmtEur(maj.montantTTC)}` : ''].filter(Boolean).join(' · ')}`);
                                else toast('Devis signé ajouté — montants non détectés, inchangés');
                              }}
                            >
                              <Upload size={17} color="#DC2626" strokeWidth={2} />
                              <Text style={{ fontSize: 9, color: '#DC2626', fontWeight: '700' }} numberOfLines={1}>Uploader signé</Text>
                            </Pressable>
                          </>
                        ) : null}
                      </View>

                      {/* V10 — Avancement par lot du marché (état de facturation) */}
                      <View style={{ marginBottom: 10 }}>
                        <AvancementLotsPanel
                          lots={m.avancementCorps || []}
                          isAdmin={isAdmin}
                          onChangeLots={(lots) => updateMarcheChantier({ ...m, avancementCorps: lots })}
                          onPressImport={isAdmin ? () => setImportLotsTarget({ type: 'marche', id: m.id, devisUri: m.devisInitialUri, devisNom: m.devisInitialNom }) : undefined}
                          title="Avancement de ce marché"
                          compact
                          snapshots={m.snapshots}
                          onChangeSnapshots={(s) => {
                            notifyClientSnapshot(m.snapshots, s, m.libelle);
                            updateMarcheChantier({ ...m, snapshots: s });
                          }}
                          cocheParId={currentUser?.employeId || currentUser?.apporteurId || currentUser?.soustraitantId || currentUser?.role}
                          cocheParNom={currentUser?.nom || currentUser?.role}
                        />
                      </View>

                      {/* Paiements */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6E5F54' }}>Acomptes ({m.paiements.length})</Text>
                        <Pressable style={{ backgroundColor: '#27AE60', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }} onPress={() => openPaiementForm('marche', m.id)}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>+ Acompte</Text>
                        </Pressable>
                      </View>
                      {m.paiements.map(p => {
                        const modeLabel = MODES_PAIEMENT.find(x => x.value === p.mode)?.label || p.mode;
                        const hasCommission = !!m.commission && p.commissionMontant && p.commissionMontant > 0;
                        return (
                          <View key={p.id} style={{ backgroundColor: '#FAF5EF', borderRadius: 6, padding: 8, marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#27AE60' }}>{fmt(p.montant)} €</Text>
                                <Text style={{ fontSize: 10, color: '#6E5F54' }}>{p.date} · {modeLabel}{p.reference ? ` · ${p.reference}` : ''}</Text>
                                {p.note && <Text style={{ fontSize: 10, color: '#6E5F54', fontStyle: 'italic' }}>{p.note}</Text>}
                              </View>
                              {p.factureUri && (
                                <Pressable onPress={() => openDoc(p.factureUri)} style={{ backgroundColor: '#F2E4E1', borderRadius: 6, padding: 6 }}>
                                  <Text style={{ fontSize: 10, color: '#5C1F2E', fontWeight: '700' }}>Acompte</Text>
                                </Pressable>
                              )}
                              {p.commissionFactureUri && (
                                <Pressable onPress={() => openDoc(p.commissionFactureUri)} style={{ backgroundColor: '#F2E4E1', borderRadius: 6, padding: 6 }}>
                                  <Text style={{ fontSize: 10, color: '#5C1F2E', fontWeight: '700' }}>Commission</Text>
                                </Pressable>
                              )}
                              <Pressable onPress={() => handleDeletePaiement('marche', m.id, p.id)}>
                                <Text style={{ fontSize: 12, color: '#E74C3C' }}>✕</Text>
                              </Pressable>
                            </View>
                            {hasCommission && (
                              <Pressable
                                onPress={() => toggleCommissionPayePaiement(m.id, p.id)}
                                style={{
                                  marginTop: 6,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  backgroundColor: p.commissionPaye ? '#D4EDDA' : '#FFF3CD',
                                  borderRadius: 6,
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderLeftWidth: 3,
                                  borderLeftColor: p.commissionPaye ? '#27AE60' : '#F59E0B',
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '700', color: p.commissionPaye ? '#155724' : '#856404' }}>
                                  {p.commissionPaye ? 'Commission payée' : 'Commission à payer'} — {fmt(p.commissionMontant || 0)} €
                                </Text>
                                <Text style={{ fontSize: 9, color: p.commissionPaye ? '#155724' : '#856404', fontStyle: 'italic' }}>
                                  (tapez pour basculer)
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}

                      {/* Actions marché */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <Pressable style={{ flex: 1, backgroundColor: '#FAF5EF', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => openEditMarche(m)}>
                          <Text style={{ fontSize: 11, color: '#5C1F2E', fontWeight: '600' }}>Modifier</Text>
                        </Pressable>
                        <Pressable style={{ flex: 1, backgroundColor: '#FEF2F2', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => handleDeleteMarche(m)}>
                          <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>Supprimer</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* ── SUPPLÉMENTS ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#5C1F2E' }}>Suppléments ({supplements.length})</Text>
              <Pressable style={{ backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={openNewSupp}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>+ Supplément</Text>
              </Pressable>
            </View>
            {supplements.length === 0 && (
              <Text style={{ fontSize: 12, color: '#9A8C80', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>Aucun supplément</Text>
            )}
            {supplements.map(s => {
              const totalRecuS = s.paiements.reduce((sum, p) => sum + p.montant, 0);
              const resteS = s.montantTTC - totalRecuS;
              const isOpen = openSuppId === s.id;
              const statutColor = s.statut === 'accepte' ? '#27AE60' : s.statut === 'refuse' ? '#E74C3C' : '#F59E0B';
              const statutLabel = s.statut === 'accepte' ? 'Accepté' : s.statut === 'refuse' ? 'Refusé' : 'En attente';
              return (
                <View key={s.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EDE2D6', borderLeftWidth: 4, borderLeftColor: statutColor }}>
                  <Pressable onPress={() => setOpenSuppId(isOpen ? null : s.id)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2B1D14' }}>{s.libelle}</Text>
                          {s.devisUri && !s.devisSigneUri && (
                            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 }}>!</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: '#6E5F54', marginTop: 2 }}>{fmt(s.montantHT)} € HT · {fmt(s.montantTTC)} € TTC</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={{ backgroundColor: statutColor + '22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: statutColor, fontWeight: '700' }}>{statutLabel}</Text>
                          </View>
                          {s.statut === 'accepte' && (
                            <Text style={{ fontSize: 10, color: resteS > 0 ? '#DC2626' : '#27AE60', fontWeight: '600' }}>Reçu : {fmt(totalRecuS)} € · Reste : {fmt(resteS)} €</Text>
                          )}
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, color: '#6E5F54' }}>{isOpen ? '▾' : '▸'}</Text>
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1E7DC' }}>
                      {s.description && (
                        <Text style={{ fontSize: 12, color: '#2B1D14', marginBottom: 8 }}>{s.description}</Text>
                      )}
                      {/* Documents */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        {s.devisUri ? (
                          <Pressable style={{ flex: 1, minWidth: 70, backgroundColor: '#F2E4E1', borderRadius: 6, padding: 8, alignItems: 'center' }} onPress={() => openDoc(s.devisUri)}>
                            <FileText size={17} color="#5C1F2E" strokeWidth={2} />
                            <Text style={{ fontSize: 9, color: '#5C1F2E', fontWeight: '600' }} numberOfLines={1}>Devis</Text>
                          </Pressable>
                        ) : null}
                        {s.devisSigneUri ? (
                          <Pressable style={{ flex: 1, minWidth: 70, backgroundColor: '#D4EDDA', borderRadius: 6, padding: 8, alignItems: 'center' }} onPress={() => openDoc(s.devisSigneUri)}>
                            <PenLine size={17} color="#155724" strokeWidth={2} />
                            <Text style={{ fontSize: 9, color: '#155724', fontWeight: '600' }} numberOfLines={1}>Devis signé</Text>
                          </Pressable>
                        ) : s.devisUri ? (
                          <>
                            <Pressable
                              style={{ flex: 1, minWidth: 70, backgroundColor: '#5C1F2E', borderRadius: 6, padding: 8, alignItems: 'center' }}
                              onPress={() => setSignerTarget({ type: 'supplement', id: s.id, devisUri: s.devisUri!, devisNom: s.devisNom })}
                            >
                              <PenLine size={17} color="#FAF5EF" strokeWidth={2} />
                              <Text style={{ fontSize: 9, color: '#FAF5EF', fontWeight: '700' }} numberOfLines={1}>Signer ici</Text>
                            </Pressable>
                            <Pressable
                              style={{ flex: 1, minWidth: 70, backgroundColor: 'transparent', borderRadius: 6, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#DC2626', borderStyle: 'dashed' }}
                              onPress={async () => {
                                const f = await pickFile('devis-signe');
                                if (!f) return;
                                const uploaded = await uploadIfNeeded(f, 'supplements/devis-signe');
                                if (!uploaded.uri) return;
                                let majS: Partial<SupplementMarche> = {};
                                try {
                                  const { ht, ttc } = await lireMontantsDevis(uploaded.uri);
                                  if (ht) majS.montantHT = ht;
                                  if (ttc) majS.montantTTC = ttc;
                                } catch {}
                                updateSupplementMarche({ ...s, ...majS, devisSigneUri: uploaded.uri, devisSigneNom: uploaded.nom, updatedAt: new Date().toISOString() });
                                if (majS.montantHT || majS.montantTTC) toast.success('Montants repris du devis signé');
                              }}
                            >
                              <Upload size={17} color="#DC2626" strokeWidth={2} />
                              <Text style={{ fontSize: 9, color: '#DC2626', fontWeight: '700' }} numberOfLines={1}>Uploader signé</Text>
                            </Pressable>
                          </>
                        ) : null}
                        {s.factureUri ? (
                          <Pressable style={{ flex: 1, minWidth: 70, backgroundColor: '#FFF3CD', borderRadius: 6, padding: 8, alignItems: 'center' }} onPress={() => openDoc(s.factureUri)}>
                            <Receipt size={17} color="#5C1F2E" strokeWidth={2} />
                            <Text style={{ fontSize: 9, color: '#856404', fontWeight: '600' }} numberOfLines={1}>Facture</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {/* V10 — Avancement par lot du supplément */}
                      {s.statut === 'accepte' && (
                        <View style={{ marginBottom: 10 }}>
                          <AvancementLotsPanel
                            lots={s.avancementCorps || []}
                            isAdmin={isAdmin}
                            onChangeLots={(lots) => updateSupplementMarche({ ...s, avancementCorps: lots, updatedAt: new Date().toISOString() })}
                            onPressImport={isAdmin ? () => setImportLotsTarget({ type: 'supplement', id: s.id, devisUri: s.devisUri, devisNom: s.devisNom }) : undefined}
                            title="Avancement de ce supplément"
                            compact
                            snapshots={s.snapshots}
                            onChangeSnapshots={(snaps) => {
                              notifyClientSnapshot(s.snapshots, snaps, `+ ${s.libelle}`);
                              updateSupplementMarche({ ...s, snapshots: snaps, updatedAt: new Date().toISOString() });
                            }}
                            cocheParId={currentUser?.employeId || currentUser?.apporteurId || currentUser?.soustraitantId || currentUser?.role}
                            cocheParNom={currentUser?.nom || currentUser?.role}
                          />
                        </View>
                      )}

                      {/* Paiements (si accepté) */}
                      {s.statut === 'accepte' && (
                        <>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6E5F54' }}>Règlements ({s.paiements.length})</Text>
                            <Pressable style={{ backgroundColor: '#27AE60', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }} onPress={() => openPaiementForm('supplement', s.id)}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>+ Règlement</Text>
                            </Pressable>
                          </View>
                          {s.paiements.map(p => {
                            const modeLabel = MODES_PAIEMENT.find(x => x.value === p.mode)?.label || p.mode;
                            return (
                              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF5EF', borderRadius: 6, padding: 8, marginBottom: 4, gap: 6 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#27AE60' }}>{fmt(p.montant)} €</Text>
                                  <Text style={{ fontSize: 10, color: '#6E5F54' }}>{p.date} · {modeLabel}{p.reference ? ` · ${p.reference}` : ''}</Text>
                                </View>
                                {p.factureUri && (
                                  <Pressable onPress={() => openDoc(p.factureUri)}>
                                    <Paperclip size={15} color="#5C1F2E" strokeWidth={2} />
                                  </Pressable>
                                )}
                                <Pressable onPress={() => handleDeletePaiement('supplement', s.id, p.id)}>
                                  <Text style={{ fontSize: 12, color: '#E74C3C' }}>✕</Text>
                                </Pressable>
                              </View>
                            );
                          })}
                        </>
                      )}

                      {/* Actions */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <Pressable style={{ flex: 1, backgroundColor: '#FAF5EF', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => openEditSupp(s)}>
                          <Text style={{ fontSize: 11, color: '#5C1F2E', fontWeight: '600' }}>Modifier</Text>
                        </Pressable>
                        <Pressable style={{ flex: 1, backgroundColor: '#FEF2F2', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => handleDeleteSupp(s)}>
                          <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>Supprimer</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            </View>
          </ScrollView>
        </View>

        {/* V10 — Overlay inline d'import des lots (PAS un Modal pour éviter
            le bug iOS Modal-on-Modal qui figeait la fenêtre Marchés).
            Cible un marché ou supplément spécifique. */}
        {importLotsTarget && (() => {
          const target = importLotsTarget.type === 'marche'
            ? marches.find(m => m.id === importLotsTarget.id)
            : supplements.find(s => s.id === importLotsTarget.id);
          if (!target) return null;
          const lotsActuels = target.avancementCorps || [];
          return (
            <ImportLotsDevisOverlay
              visible={!!importLotsTarget}
              onClose={() => setImportLotsTarget(null)}
              lotsActuels={lotsActuels}
              devisUri={importLotsTarget.devisUri}
              devisNom={importLotsTarget.devisNom}
              onImport={(nouveauxLots) => {
                if (importLotsTarget.type === 'marche') {
                  const m = marches.find(x => x.id === importLotsTarget.id);
                  if (m) updateMarcheChantier({ ...m, avancementCorps: [...(m.avancementCorps || []), ...nouveauxLots] });
                } else {
                  const s = supplements.find(x => x.id === importLotsTarget.id);
                  if (s) updateSupplementMarche({ ...s, avancementCorps: [...(s.avancementCorps || []), ...nouveauxLots], updatedAt: new Date().toISOString() });
                }
              }}
            />
          );
        })()}

        {/* V10 — Overlay signature devis (encadré en bas de la dernière page). */}
        {signerTarget && (
          <SignerDevisOverlay
            visible={!!signerTarget}
            onClose={() => setSignerTarget(null)}
            devisUri={signerTarget.devisUri}
            devisNom={signerTarget.devisNom}
            chantierId={chantierId}
            type={signerTarget.type}
            onSigned={(uri, nom) => {
              if (signerTarget.type === 'marche') {
                const m = marches.find(x => x.id === signerTarget.id);
                if (m) updateMarcheChantier({ ...m, devisSigneUri: uri, devisSigneNom: nom });
              } else {
                const s = supplements.find(x => x.id === signerTarget.id);
                if (s) updateSupplementMarche({ ...s, devisSigneUri: uri, devisSigneNom: nom, updatedAt: new Date().toISOString() });
              }
            }}
          />
        )}
      </View>

      {/* ── Modal Form Marché ── */}
      <ModalKeyboard visible={showMarcheForm} animationType="fade" transparent onRequestClose={() => setShowMarcheForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowMarcheForm(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#2B1D14', marginBottom: 12 }}>{editMarche ? 'Modifier le marché' : 'Nouveau marché'}</Text>
              <Text style={lbl}>Libellé *</Text>
              <TextInput style={inp} value={marcheForm.libelle} onChangeText={v => setMarcheForm(f => ({ ...f, libelle: v }))} placeholder="Marché initial" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Montant HT (€)</Text>
                  <TextInput style={inp} value={marcheForm.montantHT} onChangeText={v => setMarcheForm(f => ({ ...f, montantHT: v }))} keyboardType="decimal-pad" placeholder="10000" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Montant TTC (€)</Text>
                  <TextInput style={inp} value={marcheForm.montantTTC} onChangeText={v => setMarcheForm(f => ({ ...f, montantTTC: v }))} keyboardType="decimal-pad" placeholder="12000" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Date devis (YYYY-MM-DD)</Text>
                  <TextInput style={inp} value={marcheForm.dateDevis} onChangeText={v => setMarcheForm(f => ({ ...f, dateDevis: v }))} placeholder="2026-04-09" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Date signature</Text>
                  <TextInput style={inp} value={marcheForm.dateSignature} onChangeText={v => setMarcheForm(f => ({ ...f, dateSignature: v }))} placeholder="2026-04-15" />
                </View>
              </View>
              <Text style={lbl}>Démarrage des travaux (YYYY-MM-DD)</Text>
              <TextInput style={inp} value={marcheForm.dateDebutTravaux} onChangeText={v => setMarcheForm(f => ({ ...f, dateDebutTravaux: v }))} placeholder="2026-05-04" />

              <Text style={lbl}>Devis initial</Text>
              <Pressable style={fileBtn} onPress={async () => {
                const f = await pickFile('devis');
                if (!f) return;
                setMarcheDevisInitial(f);
                await analyserDevisMarche(f, 'initial');
              }}>
                <Text style={{ fontSize: 12, color: '#5C1F2E', fontWeight: '600' }}>{marcheDevisInitial ? `${marcheDevisInitial.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>
              {devisAutoExtractLoading && (
                <Text style={{ fontSize: 11, color: '#6E5F54', fontStyle: 'italic', marginTop: 4 }}>Analyse du devis en cours…
                </Text>
              )}
              {devisAutoExtractMsg && (
                <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600', marginTop: 4 }}>
                  {devisAutoExtractMsg}
                </Text>
              )}

              <Text style={lbl}>Devis signé</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('devis-signe'); if (!f) return; setMarcheDevisSigne(f); await analyserDevisMarche(f, 'signe'); }}>
                <Text style={{ fontSize: 12, color: '#5C1F2E', fontWeight: '600' }}>{marcheDevisSigne ? `${marcheDevisSigne.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>

              {/* ── Commission apporteur ── */}
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#EDE2D6', paddingTop: 12 }}>
                <Pressable
                  onPress={() => setCommissionEnabled(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: commissionEnabled ? '#F2E4E1' : '#F1E7DC', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: commissionEnabled ? '#5C1F2E' : '#EDE2D6' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#5C1F2E' }}>Commission apporteur / architecte
                  </Text>
                  <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: commissionEnabled ? '#5C1F2E' : '#9A8C80', justifyContent: 'center', paddingHorizontal: 2 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: commissionEnabled ? 'flex-end' : 'flex-start' }} />
                  </View>
                </Pressable>

                {commissionEnabled && (
                  <View style={{ marginTop: 10, backgroundColor: '#FFFEFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#EDE2D6' }}>
                    <Text style={lbl}>Apporteur *</Text>
                    {apporteurs.length === 0 ? (
                      <Pressable
                        onPress={async () => {
  // Sauvegarder le formulaire en cours pour le restaurer au retour
  await AsyncStorage.setItem(PENDING_MARCHE_KEY, JSON.stringify({
    chantierId,
    editMarcheId: editMarche?.id || null,
    marcheForm,
    commissionEnabled: true,
    commissionForm,
    timestamp: Date.now(),
  }));
  onClose();
  router.push('/(tabs)/equipe?tab=apporteurs&returnToMarche=1');
}}
                        style={{ backgroundColor: '#F1E7DC', borderWidth: 1, borderColor: '#5C1F2E', borderStyle: 'dashed', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 }}
                      >
                        <Text style={{ fontSize: 12, color: '#5C1F2E', fontWeight: '600' }}>
                          + Ajouter un apporteur (aucun enregistré)
                        </Text>
                      </Pressable>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {apporteurs.map(a => (
                            <Pressable
                              key={a.id}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5,
                                borderColor: commissionForm.apporteurId === a.id ? '#5C1F2E' : '#EDE2D6',
                                backgroundColor: commissionForm.apporteurId === a.id ? '#5C1F2E' : '#F1E7DC',
                              }}
                              onPress={() => setCommissionForm(f => ({ ...f, apporteurId: a.id }))}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: commissionForm.apporteurId === a.id ? '#fff' : '#5C1F2E' }}>
                                {a.prenom} {a.nom}
                              </Text>
                            </Pressable>
                          ))}
                          <Pressable
                            onPress={async () => {
  // Sauvegarder le formulaire en cours pour le restaurer au retour
  await AsyncStorage.setItem(PENDING_MARCHE_KEY, JSON.stringify({
    chantierId,
    editMarcheId: editMarche?.id || null,
    marcheForm,
    commissionEnabled: true,
    commissionForm,
    timestamp: Date.now(),
  }));
  onClose();
  router.push('/(tabs)/equipe?tab=apporteurs&returnToMarche=1');
}}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5C1F2E', backgroundColor: '#F2E4E1' }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#5C1F2E' }}>+ Ajouter</Text>
                          </Pressable>
                        </View>
                      </ScrollView>
                    )}

                    <Text style={lbl}>Mode</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                      {(['montant', 'pourcentage'] as const).map(mode => (
                        <Pressable
                          key={mode}
                          onPress={() => setCommissionForm(f => ({ ...f, modeCommission: mode }))}
                          style={{
                            flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center',
                            backgroundColor: commissionForm.modeCommission === mode ? '#5C1F2E' : '#F1E7DC',
                            borderColor: commissionForm.modeCommission === mode ? '#5C1F2E' : '#EDE2D6',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: commissionForm.modeCommission === mode ? '#fff' : '#6E5F54' }}>
                            {mode === 'montant' ? '€ Montant fixe' : '% Pourcentage'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={lbl}>{commissionForm.modeCommission === 'montant' ? 'Montant (€) *' : 'Pourcentage (%) *'}</Text>
                    <TextInput
                      style={inp}
                      value={commissionForm.valeur}
                      onChangeText={v => setCommissionForm(f => ({ ...f, valeur: v }))}
                      keyboardType="decimal-pad"
                      placeholder={commissionForm.modeCommission === 'montant' ? '500' : '5'}
                    />

                    {commissionForm.modeCommission === 'pourcentage' && (
                      <>
                        <Text style={lbl}>Base de calcul</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                          {(['HT', 'TTC'] as const).map(b => (
                            <Pressable
                              key={b}
                              onPress={() => setCommissionForm(f => ({ ...f, baseCalcul: b }))}
                              style={{
                                flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center',
                                backgroundColor: commissionForm.baseCalcul === b ? '#5C1F2E' : '#F1E7DC',
                                borderColor: commissionForm.baseCalcul === b ? '#5C1F2E' : '#EDE2D6',
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: commissionForm.baseCalcul === b ? '#fff' : '#6E5F54' }}>
                                {b}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    )}

                    <Text style={lbl}>Statut</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                      {(['a_payer', 'paye'] as const).map(st => (
                        <Pressable
                          key={st}
                          onPress={() => setCommissionForm(f => ({ ...f, statut: st }))}
                          style={{
                            flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center',
                            backgroundColor: commissionForm.statut === st ? (st === 'paye' ? '#D4EDDA' : '#FFF3CD') : '#F1E7DC',
                            borderColor: commissionForm.statut === st ? (st === 'paye' ? '#27AE60' : '#F59E0B') : '#EDE2D6',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: commissionForm.statut === st ? (st === 'paye' ? '#155724' : '#856404') : '#6E5F54' }}>
                            {st === 'a_payer' ? 'À payer' : 'Payé'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {commissionForm.statut === 'paye' && (
                      <>
                        <Text style={lbl}>Date de paiement</Text>
                        <TextInput
                          style={inp}
                          value={commissionForm.datePaiement}
                          onChangeText={v => setCommissionForm(f => ({ ...f, datePaiement: v }))}
                          placeholder="YYYY-MM-DD"
                        />
                      </>
                    )}

                    <Text style={lbl}>Note</Text>
                    <TextInput
                      style={inp}
                      value={commissionForm.note}
                      onChangeText={v => setCommissionForm(f => ({ ...f, note: v }))}
                      placeholder="Note optionnelle"
                    />
                  </View>
                )}
              </View>

              <Pressable style={[saveBtn, !marcheForm.libelle.trim() && { opacity: 0.5 }]} onPress={handleSaveMarche} disabled={!marcheForm.libelle.trim()}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editMarche ? 'Modifier' : 'Créer'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>

      {/* ── Modal Form Supplément ── */}
      <ModalKeyboard visible={showSuppForm} animationType="fade" transparent onRequestClose={() => setShowSuppForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowSuppForm(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#2B1D14', marginBottom: 12 }}>{editSupp ? 'Modifier le supplément' : 'Nouveau supplément'}</Text>
              <Text style={lbl}>Libellé *</Text>
              <TextInput style={inp} value={suppForm.libelle} onChangeText={v => setSuppForm(f => ({ ...f, libelle: v }))} placeholder="Ex: Pose carrelage SDB" />
              <Text style={lbl}>Description</Text>
              <TextInput style={[inp, { minHeight: 60 }]} value={suppForm.description} onChangeText={v => setSuppForm(f => ({ ...f, description: v }))} multiline placeholder="Détails du supplément..." />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Montant HT (€)</Text>
                  <TextInput style={inp} value={suppForm.montantHT} onChangeText={v => setSuppForm(f => ({ ...f, montantHT: v }))} keyboardType="decimal-pad" placeholder="500" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Montant TTC (€)</Text>
                  <TextInput style={inp} value={suppForm.montantTTC} onChangeText={v => setSuppForm(f => ({ ...f, montantTTC: v }))} keyboardType="decimal-pad" placeholder="600" />
                </View>
              </View>

              <Text style={lbl}>Statut</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['en_attente', 'accepte', 'refuse'] as StatutSupplement[]).map(st => (
                  <Pressable
                    key={st}
                    style={[
                      { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#EDE2D6', alignItems: 'center', backgroundColor: '#FAF5EF' },
                      suppForm.statut === st && { backgroundColor: st === 'accepte' ? '#D4EDDA' : st === 'refuse' ? '#FEF2F2' : '#FFF3CD', borderColor: st === 'accepte' ? '#27AE60' : st === 'refuse' ? '#E74C3C' : '#F59E0B' },
                    ]}
                    onPress={() => setSuppForm(f => ({ ...f, statut: st }))}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: suppForm.statut === st ? (st === 'accepte' ? '#155724' : st === 'refuse' ? '#DC2626' : '#856404') : '#6E5F54' }}>
                      {st === 'en_attente' ? 'En attente' : st === 'accepte' ? 'Accepté' : 'Refusé'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>Date proposition</Text>
                  <TextInput style={inp} value={suppForm.dateProposition} onChangeText={v => setSuppForm(f => ({ ...f, dateProposition: v }))} placeholder="2026-04-09" />
                </View>
                {suppForm.statut === 'accepte' && (
                  <View style={{ flex: 1 }}>
                    <Text style={lbl}>Date accord</Text>
                    <TextInput style={inp} value={suppForm.dateAccord} onChangeText={v => setSuppForm(f => ({ ...f, dateAccord: v }))} placeholder="2026-04-15" />
                  </View>
                )}
              </View>

              <Text style={lbl}>Devis</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('devis'); if (!f) return; setSuppDevis(f); await analyserDevisSupp(f); }}>
                <Text style={{ fontSize: 12, color: '#5C1F2E', fontWeight: '600' }}>{suppDevis ? `${suppDevis.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>
              {suppAutoExtractLoading && <Text style={{ fontSize: 11, color: '#6E5F54', fontStyle: 'italic', marginTop: 4 }}>Analyse du devis en cours…</Text>}
              {suppAutoExtractMsg && <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600', marginTop: 4 }}>{suppAutoExtractMsg}</Text>}

              <Text style={lbl}>Facture</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('facture'); if (f) setSuppFacture(f); }}>
                <Text style={{ fontSize: 12, color: '#5C1F2E', fontWeight: '600' }}>{suppFacture ? `${suppFacture.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>

              <Pressable style={[saveBtn, !suppForm.libelle.trim() && { opacity: 0.5 }]} onPress={handleSaveSupp} disabled={!suppForm.libelle.trim()}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editSupp ? 'Modifier' : 'Créer'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>

      {/* ── Modal Form Paiement ── */}
      <ModalKeyboard visible={showPaiementForm} animationType="fade" transparent onRequestClose={() => setShowPaiementForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPaiementForm(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#2B1D14', marginBottom: 12 }}>Nouveau paiement</Text>
              <Text style={lbl}>Date</Text>
              <TextInput style={inp} value={paiementForm.date} onChangeText={v => setPaiementForm(f => ({ ...f, date: v }))} placeholder="2026-04-09" />
              <Text style={lbl}>Montant (€) *</Text>
              <TextInput style={inp} value={paiementForm.montant} onChangeText={v => setPaiementForm(f => ({ ...f, montant: v }))} keyboardType="decimal-pad" placeholder="2500" />
              <Text style={lbl}>Mode de paiement</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {MODES_PAIEMENT.map(m => (
                  <Pressable key={m.value} style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#EDE2D6', backgroundColor: '#F1E7DC' }, paiementForm.mode === m.value && { backgroundColor: '#5C1F2E', borderColor: '#5C1F2E' }]} onPress={() => setPaiementForm(f => ({ ...f, mode: m.value }))}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: paiementForm.mode === m.value ? '#fff' : '#6E5F54' }}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={lbl}>Référence (n° chèque, virement...)</Text>
              <TextInput style={inp} value={paiementForm.reference} onChangeText={v => setPaiementForm(f => ({ ...f, reference: v }))} placeholder="Ex: 123456" />
              <Text style={lbl}>Note</Text>
              <TextInput style={inp} value={paiementForm.note} onChangeText={v => setPaiementForm(f => ({ ...f, note: v }))} placeholder="Note libre" />
              <Text style={lbl}>Facture d'acompte</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('facture'); if (f) setPaiementFacture(f); }}>
                <Text style={{ fontSize: 12, color: '#5C1F2E', fontWeight: '600' }}>{paiementFacture ? `${paiementFacture.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>

              {/* Commission due sur cet acompte (si marché parent avec commission) */}
              {paiementTarget?.type === 'marche' && (() => {
                const m = marches.find(x => x.id === paiementTarget.id);
                if (!m?.commission) return null;
                const montantAcompte = parseFloat(paiementForm.montant.replace(',', '.')) || 0;
                const commissionDue = computeCommissionForAcompte(m, montantAcompte);
                const app = apporteurs.find(a => a.id === m.commission!.apporteurId);
                const apporteurNom = app ? `${app.prenom} ${app.nom}` : 'Apporteur';
                return (
                  <View style={{ marginTop: 14, backgroundColor: '#F2E4E1', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#5C1F2E', borderLeftWidth: 4, borderLeftColor: '#5C1F2E' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#5C1F2E' }}>Commission due sur cet acompte : {fmt(commissionDue)} €
                    </Text>
                    <Text style={{ fontSize: 11, color: '#5C1F2E', marginTop: 2 }}>
                      ({apporteurNom}{m.commission.modeCommission === 'pourcentage' ? ` — ${m.commission.valeur}%` : ''})
                    </Text>
                    <Text style={lbl}>Facture commission (optionnel)</Text>
                    <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('facture-commission'); if (f) setPaiementCommissionFacture(f); }}>
                      <Text style={{ fontSize: 12, color: '#5C1F2E', fontWeight: '600' }}>{paiementCommissionFacture ? `${paiementCommissionFacture.nom}` : '+ Choisir un fichier'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPaiementCommissionPaye(v => !v)}
                      style={{
                        marginTop: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: paiementCommissionPaye ? '#D4EDDA' : '#fff',
                        borderRadius: 8,
                        padding: 10,
                        borderWidth: 1,
                        borderColor: paiementCommissionPaye ? '#27AE60' : '#EDE2D6',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: paiementCommissionPaye ? '#155724' : '#6E5F54' }}>
                        {paiementCommissionPaye ? 'Commission payée à l\'apporteur' : 'Commission à payer'}
                      </Text>
                      <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: paiementCommissionPaye ? '#27AE60' : '#9A8C80', justifyContent: 'center', paddingHorizontal: 2 }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: paiementCommissionPaye ? 'flex-end' : 'flex-start' }} />
                      </View>
                    </Pressable>
                  </View>
                );
              })()}

              <Pressable style={[saveBtn, !paiementForm.montant.trim() && { opacity: 0.5 }]} onPress={handleSavePaiement} disabled={!paiementForm.montant.trim()}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Enregistrer</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </ModalKeyboard>
      {/* ── Sélecteur multi-options (fonctionne sur iOS, Android et web) ── */}
      <Modal visible={chooser !== null} transparent animationType="fade" onRequestClose={() => setChooser(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }} onPress={() => setChooser(null)}>
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 24, padding: 20, gap: 8, maxWidth: 440, width: '100%', alignSelf: 'center' }} onPress={() => {}}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#2B1D14' }}>{chooser?.title}</Text>
            {!!chooser?.message && <Text style={{ fontSize: 13, color: '#6E5F54', marginBottom: 6 }}>{chooser.message}</Text>}
            {chooser?.options.map((o, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                onPress={() => { const fn = o.onPress; setChooser(null); fn(); }}
                style={{ minHeight: 46, borderRadius: 999, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: o.primary ? '#5C1F2E' : '#F2E4E1' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: o.primary ? '#fff' : '#5C1F2E' }} numberOfLines={1}>{o.text}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setChooser(null)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#6E5F54' }}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ModalKeyboard>
  );
}

const lbl ={ fontSize: 12, fontWeight: '600' as const, color: '#6E5F54', marginBottom: 4, marginTop: 8 };
const inp = { backgroundColor: '#F1E7DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#EDE2D6', marginBottom: 4, color: '#2B1D14' };
const fileBtn = { backgroundColor: '#F2E4E1', borderWidth: 1, borderColor: '#D0D8E8', borderRadius: 8, padding: 12, alignItems: 'center' as const, marginBottom: 4 };
const saveBtn = { backgroundColor: '#5C1F2E', borderRadius: 10, paddingVertical: 14, alignItems: 'center' as const, marginTop: 16 };
