import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, Image, Platform, Alert, TextInput,
  StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { APPORTEUR_TYPE_LABELS } from '@/app/types';
import type { Chantier } from '@/app/types';
import {
  extraireLotsDuTexte,
  extraireLotsAvecRemise,
  extraireTVAsDuTexte,
  extraireTotalTTC,
  extraireRecapDevis,
  parseSaisieManuelle,
  type LotExtrait,
} from '@/lib/devisParser';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { LivraisonsRdvChantier } from '@/components/LivraisonsRdvChantier';
import { MoodboardChantier } from '@/components/MoodboardChantier';

interface PortailClientProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function fmt(n: number) { return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function isLotEnCours(l: { dateDebutPrevue?: string; dateFinPrevue?: string }): boolean {
  if (!l.dateDebutPrevue || !l.dateFinPrevue) return false;
  const t = todayIso();
  return t >= l.dateDebutPrevue && t <= l.dateFinPrevue;
}

const SAV_STATUT_LABELS: Record<string, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu',
  clos: 'Clos',
};

const SAV_STATUT_COLORS: Record<string, { bg: string; text: string }> = {
  ouvert: { bg: '#FFF3CD', text: '#856404' },
  en_cours: { bg: '#D4EDDA', text: '#155724' },
  resolu: { bg: '#D1ECF1', text: '#0C5460' },
  clos: { bg: '#E2E6EA', text: '#687076' },
};

// Types de lien contact — ordre d'affichage en chips
const LIEN_TYPES: Array<{ key: 'client' | 'architecte' | 'apporteur' | 'contractant'; field: keyof Chantier }> = [
  { key: 'architecte',  field: 'architecteId' },
  { key: 'apporteur',   field: 'apporteurId' },
  { key: 'contractant', field: 'contractantId' },
  { key: 'client',      field: 'clientApporteurId' },
];

export function PortailClient({ visible, onClose, chantierId }: PortailClientProps) {
  const { data, currentUser, updateChantier } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const isExterne = currentUser?.role === 'apporteur';
  const externAp = isExterne ? (data.apporteurs || []).find(a => a.id === currentUser?.apporteurId) : undefined;
  const isClient = externAp?.type === 'client';
  // Le client ne voit JAMAIS les commissions. Les autres externes oui.
  const peutVoirCommissions = isAdmin || (isExterne && !isClient);
  // Le client ne voit le planning que si l'admin l'a activé pour ce chantier
  const chantierForPlanning = data.chantiers.find(c => c.id === chantierId);
  const peutVoirPlanning = isAdmin || !isClient || chantierForPlanning?.afficherPlanningAuClient === true;

  const chantier = chantierForPlanning;
  const apporteurs = data.apporteurs || [];

  // Marquer le chantier comme "vu" par l'externe à l'ouverture
  useEffect(() => {
    if (!visible || !chantier || !isExterne || !externAp) return;
    const vuesById = { ...(chantier.dernieresVuesParApporteur || {}) };
    vuesById[externAp.id] = new Date().toISOString();
    if (chantier.dernieresVuesParApporteur?.[externAp.id] === vuesById[externAp.id]) return;
    updateChantier({ ...chantier, dernieresVuesParApporteur: vuesById });
  }, [visible, chantier?.id, isExterne, externAp?.id]);

  // ── UI state ──
  const [pickerType, setPickerType] = useState<'architecte' | 'apporteur' | 'contractant' | 'client' | null>(null);
  const [showPhotosPicker, setShowPhotosPicker] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [showCorpsForm, setShowCorpsForm] = useState(false);
  const [editCorpsId, setEditCorpsId] = useState<string | null>(null);
  const [corpsForm, setCorpsForm] = useState({
    nom: '',
    montant: '',
    pourcentage: 0,
    commentaire: '',
    photos: [] as string[],
    dateDebutPrevue: '',
    dateFinPrevue: '',
  });
  // ── Commentaires client ──
  const [commentaireLotId, setCommentaireLotId] = useState<string | null>(null);
  const [commentaireTexte, setCommentaireTexte] = useState('');

  const openCommentaireClient = (lotId: string) => {
    setCommentaireLotId(lotId);
    setCommentaireTexte('');
    // Marquer tous les commentaires existants du lot comme "lus" par l'admin
    if (isAdmin && chantier) {
      const lots = chantier.avancementCorps || [];
      const next = lots.map(l => {
        if (l.id !== lotId) return l;
        const updated = (l.commentairesClient || []).map(cc => cc.luParAdmin ? cc : { ...cc, luParAdmin: true });
        return { ...l, commentairesClient: updated };
      });
      updateChantier({ ...chantier, avancementCorps: next });
    }
  };
  const saveCommentaireClient = () => {
    if (!chantier || !commentaireLotId || !commentaireTexte.trim()) return;
    const lots = chantier.avancementCorps || [];
    const auteurType: 'admin' | 'client' | 'architecte' | 'apporteur' | 'contractant' =
      isAdmin ? 'admin' : (externAp?.type || 'client');
    const next = lots.map(l => {
      if (l.id !== commentaireLotId) return l;
      const commentaires = l.commentairesClient || [];
      return {
        ...l,
        commentairesClient: [
          ...commentaires,
          {
            id: genId('cm'),
            auteurId: isAdmin ? 'admin' : (externAp?.id || 'unknown'),
            auteurNom: currentUser?.nom || (externAp ? `${externAp.prenom} ${externAp.nom}` : 'Utilisateur'),
            auteurType,
            texte: commentaireTexte.trim(),
            createdAt: new Date().toISOString(),
            luParAdmin: isAdmin,
            luParExternes: [],
          },
        ],
        updatedAt: new Date().toISOString(),
      };
    });
    updateChantier({ ...chantier, avancementCorps: next, derniereMajContenu: new Date().toISOString() });
    setCommentaireLotId(null);
    setCommentaireTexte('');
  };
  // ── Import depuis devis ──
  const [showImportDevis, setShowImportDevis] = useState(false);
  const [importMode, setImportMode] = useState<'pdf' | 'coller' | 'rapide'>('pdf');
  const [importTexte, setImportTexte] = useState('');
  const [lotsDetectes, setLotsDetectes] = useState<LotExtrait[]>([]);
  const [lotsSelection, setLotsSelection] = useState<Record<number, boolean>>({});
  const [pdfExtractLoading, setPdfExtractLoading] = useState(false);
  // ── Auto-extraction silencieuse à l'ouverture ──
  const [autoExtractLoading, setAutoExtractLoading] = useState(false);
  const [autoExtractToast, setAutoExtractToast] = useState<string | null>(null);
  const autoExtractAttemptedRef = useRef<Set<string>>(new Set());

  // ── Avancement (taches across all notes) ──
  const avancement = useMemo(() => {
    const affectations = data.affectations.filter(a => a.chantierId === chantierId);
    let total = 0;
    let done = 0;
    affectations.forEach(a => {
      (a.notes || []).forEach(n => {
        (n.tasks || []).forEach(t => {
          total++;
          if (t.fait) done++;
        });
      });
    });
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [data.affectations, chantierId]);

  // ── Toutes les photos du chantier ──
  const toutesPhotos = useMemo(() => {
    return (data.photosChantier || [])
      .filter(p => p.chantierId === chantierId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.photosChantier, chantierId]);

  // ── Photos pour portail client ──
  const photosPortail = useMemo(() => {
    const curatedIds = chantier?.photosPortailClient;
    if (curatedIds && curatedIds.length > 0) {
      // Garder uniquement celles qui existent encore
      return toutesPhotos.filter(p => curatedIds.includes(p.id));
    }
    // Défaut : 6 dernières photos
    return toutesPhotos.slice(0, 6);
  }, [toutesPhotos, chantier?.photosPortailClient]);

  // ── Marches ──
  const marches = useMemo(() => (data.marchesChantier || []).filter(m => m.chantierId === chantierId), [data.marchesChantier, chantierId]);
  const supplements = useMemo(() => (data.supplementsMarche || []).filter(s => s.chantierId === chantierId && s.statut === 'accepte'), [data.supplementsMarche, chantierId]);

  // ── Totaux financiers ──
  const financials = useMemo(() => {
    let totalHT = 0;
    let totalTTC = 0;
    let totalPaye = 0;
    marches.forEach(m => {
      totalHT += m.montantHT;
      totalTTC += m.montantTTC;
      (m.paiements || []).forEach(p => { totalPaye += p.montant; });
    });
    supplements.forEach(s => {
      totalHT += s.montantHT;
      totalTTC += s.montantTTC;
      (s.paiements || []).forEach(p => { totalPaye += p.montant; });
    });
    return { totalHT, totalTTC, totalPaye, reste: totalTTC - totalPaye };
  }, [marches, supplements]);

  // ── Tickets SAV ──
  const ticketsSAV = useMemo(() => {
    return (data.ticketsSAV || [])
      .filter(t => t.chantierId === chantierId && t.statut !== 'clos')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.ticketsSAV, chantierId]);

  // ── Timeline (last 10 notes, excluding admin-only) ──
  const timeline = useMemo(() => {
    const affectations = data.affectations.filter(a => a.chantierId === chantierId);
    const allNotes: { date: string; texte: string; createdAt: string }[] = [];
    affectations.forEach(a => {
      (a.notes || []).forEach(n => {
        if (n.visiblePar && n.visiblePar !== 'tous' && n.visiblePar !== 'employes' && n.visiblePar !== 'soustraitants') return;
        if (n.texte && n.texte.trim()) {
          allNotes.push({ date: n.date, texte: n.texte, createdAt: n.createdAt });
        }
      });
    });
    return allNotes
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
  }, [data.affectations, chantierId]);

  // ── Format date ──
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return dateStr; }
  };

  // ── Avancement par corps de métier ──
  const avancementCorps = chantier?.avancementCorps || [];
  const avancementGlobalCorps = useMemo(() => {
    if (avancementCorps.length === 0) return null;
    const avecMontant = avancementCorps.filter(c => c.montant && c.montant > 0);
    if (avecMontant.length === avancementCorps.length && avecMontant.length > 0) {
      const totalMontant = avecMontant.reduce((s, c) => s + (c.montant || 0), 0);
      if (totalMontant > 0) {
        const pondere = avecMontant.reduce((s, c) => s + ((c.montant || 0) * c.pourcentage), 0);
        return Math.round(pondere / totalMontant);
      }
    }
    // moyenne simple
    const moy = avancementCorps.reduce((s, c) => s + c.pourcentage, 0) / avancementCorps.length;
    return Math.round(moy);
  }, [avancementCorps]);

  // ── Point financier de situation ──
  const TVA_RATE_DEFAULT = 0.20;
  const situationsHistorique = useMemo(() => chantier?.situationsHistorique || [], [chantier?.situationsHistorique]);
  const totalPayeSituations = useMemo(
    () => situationsHistorique.filter(s => s.statut === 'payee').reduce((s, x) => s + x.montantSituation, 0),
    [situationsHistorique]
  );
  // Déjà payé initial = tous les acomptes encaissés sur marchés + suppléments (hors situations)
  const dejaPayeAcompte = financials.totalPaye;
  const dejaPayeTotal = dejaPayeAcompte + totalPayeSituations;

  // TVA extraite du devis — sinon fallback 20% uniforme
  const tvaBreakdown = chantier?.devisTVABreakdown || [];
  const totalChantierHT = useMemo(
    () => avancementCorps.reduce((s, c) => s + (c.montant || 0), 0),
    [avancementCorps]
  );
  // Si on a le TTC du devis, on l'utilise directement → sinon on reconstruit
  const totalTVAFromDevis = tvaBreakdown.reduce((s, t) => s + t.montant, 0);
  const totalChantierTTC = chantier?.devisTotalTTC
    ? chantier.devisTotalTTC
    : totalTVAFromDevis > 0
    ? totalChantierHT + totalTVAFromDevis
    : totalChantierHT * (1 + TVA_RATE_DEFAULT);
  // Ratio TVA effectif : appliqué proportionnellement à l'avancement
  const tvaRatioEffectif = totalChantierHT > 0 ? (totalChantierTTC - totalChantierHT) / totalChantierHT : TVA_RATE_DEFAULT;
  const resteAPayerChantier = Math.max(0, totalChantierTTC - dejaPayeTotal);

  const situation = useMemo(() => {
    const lignes = avancementCorps
      .filter(c => c.montant && c.montant > 0)
      .map(c => {
        const ht = (c.montant || 0) * (c.pourcentage / 100);
        return { id: c.id, nom: c.nom, montantLotHT: c.montant || 0, pourcentage: c.pourcentage, montantFactureHT: ht };
      });
    const totalHT = lignes.reduce((s, l) => s + l.montantFactureHT, 0);
    const tva = totalHT * tvaRatioEffectif;
    const totalTTC = totalHT + tva;
    const montantSituation = Math.max(0, totalTTC - dejaPayeTotal);
    const peutFiger = totalTTC > dejaPayeTotal + 0.01;
    return { lignes, totalHT, tva, totalTTC, montantSituation, peutFiger };
  }, [avancementCorps, dejaPayeTotal, tvaRatioEffectif]);

  // ── Contact principal (priorité Client > Architecte > Apporteur > Contractant) ──
  const getApp = (id?: string) => id ? apporteurs.find(a => a.id === id) : undefined;
  const contactPrincipal = useMemo(() => {
    if (!chantier) return null;
    const cl = getApp(chantier.clientApporteurId);
    if (cl) return { type: 'client' as const, apporteur: cl };
    const ar = getApp(chantier.architecteId);
    if (ar) return { type: 'architecte' as const, apporteur: ar };
    const ap = getApp(chantier.apporteurId);
    if (ap) return { type: 'apporteur' as const, apporteur: ap };
    const ct = getApp(chantier.contractantId);
    if (ct) return { type: 'contractant' as const, apporteur: ct };
    return null;
  }, [chantier, apporteurs]);

  // ── Handlers ──
  const handleSelectContact = (type: 'architecte' | 'apporteur' | 'contractant' | 'client', apporteurId: string | null) => {
    if (!chantier) return;
    const updated: Chantier = { ...chantier };
    if (type === 'architecte')  updated.architecteId     = apporteurId || undefined;
    if (type === 'apporteur')   updated.apporteurId      = apporteurId || undefined;
    if (type === 'contractant') updated.contractantId    = apporteurId || undefined;
    if (type === 'client')      updated.clientApporteurId = apporteurId || undefined;
    updateChantier(updated);
    setPickerType(null);
  };

  const openPhotosPicker = () => {
    setSelectedPhotoIds(chantier?.photosPortailClient && chantier.photosPortailClient.length > 0
      ? [...chantier.photosPortailClient]
      : photosPortail.map(p => p.id)
    );
    setShowPhotosPicker(true);
  };
  const togglePhoto = (id: string) => {
    setSelectedPhotoIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const savePhotosSelection = () => {
    if (!chantier) return;
    updateChantier({ ...chantier, photosPortailClient: selectedPhotoIds });
    setShowPhotosPicker(false);
  };

  const openNewCorps = () => {
    setEditCorpsId(null);
    setCorpsForm({ nom: '', montant: '', pourcentage: 0, commentaire: '', photos: [], dateDebutPrevue: '', dateFinPrevue: '' });
    setLotPhotosAvant([]);
    setLotPhotosApres([]);
    setShowCorpsForm(true);
  };
  const openEditCorps = (c: NonNullable<Chantier['avancementCorps']>[number]) => {
    setEditCorpsId(c.id);
    setCorpsForm({
      nom: c.nom,
      montant: c.montant ? String(c.montant) : '',
      pourcentage: c.pourcentage,
      commentaire: c.commentaire || '',
      photos: c.photos || [],
      dateDebutPrevue: c.dateDebutPrevue || '',
      dateFinPrevue: c.dateFinPrevue || '',
    });
    setLotPhotosAvant(c.photosAvant || []);
    setLotPhotosApres(c.photosApres || []);
    setShowCorpsForm(true);
  };
  const saveCorps = () => {
    if (!chantier || !corpsForm.nom.trim()) return;
    const existing = chantier.avancementCorps || [];
    const entry = {
      id: editCorpsId || genId('corps'),
      nom: corpsForm.nom.trim(),
      pourcentage: Math.max(0, Math.min(100, Math.round(corpsForm.pourcentage))),
      montant: corpsForm.montant.trim() ? parseFloat(corpsForm.montant.replace(',', '.')) || undefined : undefined,
      commentaire: corpsForm.commentaire.trim() || undefined,
      photos: corpsForm.photos.length > 0 ? corpsForm.photos : undefined,
      dateDebutPrevue: corpsForm.dateDebutPrevue || undefined,
      dateFinPrevue: corpsForm.dateFinPrevue || undefined,
      photosAvant: lotPhotosAvant.length > 0 ? lotPhotosAvant : undefined,
      photosApres: lotPhotosApres.length > 0 ? lotPhotosApres : undefined,
      updatedAt: new Date().toISOString(),
    };
    const next = editCorpsId
      ? existing.map(c => c.id === editCorpsId ? entry : c)
      : [...existing, entry];
    updateChantier({ ...chantier, avancementCorps: next });
    setShowCorpsForm(false);
  };
  const pickPhotoForLot = async (slot: 'generic' | 'avant' | 'apres' = 'generic') => {
    try {
      const ImagePicker = require('expo-image-picker');
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsMultipleSelection: Platform.OS !== 'ios',
      });
      if (res.canceled) return;
      const uris: string[] = (res.assets || []).map((a: any) => a.uri).filter(Boolean);
      if (uris.length === 0) return;
      if (slot === 'avant') setLotPhotosAvant(prev => [...prev, ...uris]);
      else if (slot === 'apres') setLotPhotosApres(prev => [...prev, ...uris]);
      else setCorpsForm(f => ({ ...f, photos: [...f.photos, ...uris] }));
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir la bibliothèque photos.");
    }
  };
  const removeLotPhoto = (uri: string, slot: 'generic' | 'avant' | 'apres' = 'generic') => {
    if (slot === 'avant') setLotPhotosAvant(prev => prev.filter(p => p !== uri));
    else if (slot === 'apres') setLotPhotosApres(prev => prev.filter(p => p !== uri));
    else setCorpsForm(f => ({ ...f, photos: f.photos.filter(p => p !== uri) }));
  };
  const [lotPhotosAvant, setLotPhotosAvant] = useState<string[]>([]);
  const [lotPhotosApres, setLotPhotosApres] = useState<string[]>([]);
  const deleteCorps = (id: string) => {
    if (!chantier) return;
    const doDel = () => updateChantier({ ...chantier, avancementCorps: (chantier.avancementCorps || []).filter(c => c.id !== id) });
    if (Platform.OS === 'web') { if (window.confirm('Supprimer ce corps de métier ?')) doDel(); }
    else Alert.alert('Supprimer', 'Supprimer ce corps de métier ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDel }]);
  };
  const deleteAllCorps = () => {
    if (!chantier) return;
    const nb = (chantier.avancementCorps || []).length;
    if (nb === 0) return;
    const msg = `Supprimer les ${nb} lots de ce chantier ?\n\nCette action est irréversible. L'historique des points financiers sera conservé.`;
    const doDel = () => updateChantier({ ...chantier, avancementCorps: [] });
    if (Platform.OS === 'web') { if (window.confirm(msg)) doDel(); }
    else Alert.alert('Tout supprimer', msg, [{ text: 'Annuler', style: 'cancel' }, { text: 'Tout supprimer', style: 'destructive', onPress: doDel }]);
  };

  // ── Import lots depuis devis ──
  const openImportDevis = () => {
    setImportMode(premierDevisUri ? 'pdf' : 'coller');
    setImportTexte('');
    setLotsDetectes([]);
    setLotsSelection({});
    setShowImportDevis(true);
  };

  // Extraction automatique depuis le PDF uploadé (via API serveur — web + mobile)
  const extraireAutoDepuisPdf = async () => {
    if (!premierDevisUri) {
      const msg = 'Aucun devis PDF lié à ce chantier. Uploadez-en un dans 💼 Marchés.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Pas de devis', msg);
      return;
    }
    setPdfExtractLoading(true);
    try {
      const { extractTextFromPdfUrl } = await import('@/lib/pdfExtract');
      const texte = await extractTextFromPdfUrl(premierDevisUri);
      if (!texte) {
        window.alert("Impossible d'extraire le texte du PDF. Essayez le mode 'Coller devis'.");
        return;
      }
      setImportTexte(texte);
      const { lots, remiseHT, totalBrutHT } = extraireLotsAvecRemise(texte);
      setLotsDetectes(lots);
      const sel: Record<number, boolean> = {};
      lots.forEach((_, i) => { sel[i] = true; });
      setLotsSelection(sel);
      if (lots.length === 0) {
        window.alert(`Texte extrait (${texte.length} caractères) mais aucun lot détecté. Passez en mode "Coller devis" pour ajuster manuellement.`);
      } else if (remiseHT > 0) {
        const msg = `✓ ${lots.length} lots détectés\n🎯 Remise de ${remiseHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT ventilée au prorata (total brut ${totalBrutHT.toLocaleString('fr-FR')} €)`;
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Extraction', msg);
      }
    } catch (e) {
      window.alert("Erreur lors de l'extraction. Essayez le mode 'Coller devis'.");
    } finally {
      setPdfExtractLoading(false);
    }
  };
  const detecterLots = () => {
    let lots: LotExtrait[];
    let remiseInfo: { remiseHT: number; totalBrutHT: number } | null = null;
    if (importMode === 'coller') {
      const r = extraireLotsAvecRemise(importTexte);
      lots = r.lots;
      if (r.remiseHT > 0) remiseInfo = { remiseHT: r.remiseHT, totalBrutHT: r.totalBrutHT };
    } else {
      lots = parseSaisieManuelle(importTexte);
    }
    setLotsDetectes(lots);
    const sel: Record<number, boolean> = {};
    lots.forEach((_, i) => { sel[i] = true; });
    setLotsSelection(sel);
    if (lots.length === 0) {
      const msg = 'Aucun lot détecté. Vérifiez que le texte contient bien des lignes avec un nom et un montant.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Aucun lot détecté', msg);
    } else if (remiseInfo) {
      const msg = `✓ ${lots.length} lots détectés\n🎯 Remise de ${remiseInfo.remiseHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT ventilée au prorata`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Extraction', msg);
    }
  };
  const importerLots = () => {
    if (!chantier) return;
    const aImporter = lotsDetectes.filter((_, i) => lotsSelection[i]);
    if (aImporter.length === 0) return;
    const existing = chantier.avancementCorps || [];
    const nomsExistants = new Set(existing.map(c => c.nom.toLowerCase().trim()));
    const nouveaux = aImporter
      .filter(l => !nomsExistants.has(l.nom.toLowerCase().trim()))
      .map(l => ({
        id: genId('corps'),
        nom: l.nom,
        montant: l.montantHT,
        pourcentage: 0,
      }));
    if (nouveaux.length === 0) {
      const msg = 'Tous les lots sélectionnés existent déjà dans ce chantier.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Rien à importer', msg);
      return;
    }
    updateChantier({ ...chantier, avancementCorps: [...existing, ...nouveaux] });
    setShowImportDevis(false);
  };
  const toggleLotSel = (i: number) => {
    setLotsSelection(prev => ({ ...prev, [i]: !prev[i] }));
  };

  // Devis initial (premier marché du chantier)
  const premierDevisUri = marches.find(m => m.devisInitialUri)?.devisInitialUri;
  const premierDevisNom = marches.find(m => m.devisInitialUri)?.devisInitialNom;
  const ouvrirDevis = () => {
    if (!premierDevisUri) return;
    if (Platform.OS === 'web') {
      window.open(premierDevisUri, '_blank');
    } else {
      // Mobile : ouvrir avec Linking (navigateur natif ou viewer PDF)
      const { Linking } = require('react-native');
      Linking.openURL(premierDevisUri).catch(() => {
        Alert.alert('Erreur', "Impossible d'ouvrir le devis.");
      });
    }
  };

  // ── Auto-extraction silencieuse des lots depuis le devis PDF (web only) ──
  // Remplit directement chantier.avancementCorps (chaque lot à 0%)
  const runAutoExtract = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!chantier) return;
    if (!premierDevisUri) {
      if (!silent) {
        const msg = 'Aucun devis PDF lié à ce chantier.';
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Info', msg);
      }
      return;
    }
    setAutoExtractLoading(true);
    try {
      const { extractTextFromPdfUrl } = await import('@/lib/pdfExtract');
      const texte = await extractTextFromPdfUrl(premierDevisUri);
      if (!texte) {
        if (!silent && Platform.OS === 'web') window.alert("Impossible d'extraire le texte du PDF. Utilisez le bouton 📋 Extraire les lots du devis.");
        return;
      }
      const { lots, remiseHT } = extraireLotsAvecRemise(texte);
      const tvaBreak = extraireTVAsDuTexte(texte);
      const ttcDevis = extraireTotalTTC(texte);
      const recap = extraireRecapDevis(texte);
      if (lots.length === 0) {
        if (!silent && Platform.OS === 'web') window.alert('Aucun lot détecté dans le devis.');
        return;
      }
      const existing = chantier.avancementCorps || [];
      const nomsExistants = new Set(existing.map(c => c.nom.toLowerCase().trim()));
      const nouveaux = lots
        .filter(l => !nomsExistants.has(l.nom.toLowerCase().trim()))
        .map(l => ({
          id: genId('corps'),
          nom: l.nom,
          montant: l.montantHT,
          pourcentage: 0,
        }));
      if (nouveaux.length === 0 && tvaBreak.length === 0 && !ttcDevis) {
        if (!silent && Platform.OS === 'web') window.alert('Aucun nouveau lot à ajouter (tous déjà présents).');
        return;
      }
      const patch: Partial<Chantier> = { avancementCorps: [...existing, ...nouveaux] };
      if (tvaBreak.length > 0) {
        patch.devisTVABreakdown = tvaBreak;
      } else if (recap.totalTVA && recap.totalTVA > 0 && recap.totalNetHT && recap.totalNetHT > 0) {
        // Aucun split individuel — on stocke 1 ligne agrégée au taux effectif
        const tauxEff = Math.round((recap.totalTVA / recap.totalNetHT) * 1000) / 10; // ex : 9.5
        patch.devisTVABreakdown = [{ taux: tauxEff, montant: recap.totalTVA }];
      }
      // TTC : priorité absolue au TTC lu dans le devis
      const ttcFromRecap = ttcDevis || recap.totalTTC
        || (recap.totalNetHT && recap.totalTVA ? recap.totalNetHT + recap.totalTVA : undefined);
      if (ttcFromRecap && ttcFromRecap > 0) patch.devisTotalTTC = ttcFromRecap;
      updateChantier({ ...chantier, ...patch });
      let toastMsg = `${nouveaux.length} lot(s) importé(s)`;
      if (remiseHT > 0) toastMsg += ` — remise ${remiseHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € ventilée`;
      if (tvaBreak.length > 0) toastMsg += ` — TVA ${tvaBreak.map(t => t.taux + '%').join(' + ')} détectée`;
      setAutoExtractToast(toastMsg);
      setTimeout(() => setAutoExtractToast(null), 6000);
    } catch {
      // Silent fallback — admin peut utiliser le bouton manuel
    } finally {
      setAutoExtractLoading(false);
    }
  };

  // useEffect : auto-extraction à l'ouverture du portail (1x par chantier)
  useEffect(() => {
    if (!visible) return;
    if (Platform.OS !== 'web') return;
    if (!chantier) return;
    if (!premierDevisUri) return;
    if ((chantier.avancementCorps || []).length > 0) return;
    if (autoExtractAttemptedRef.current.has(chantier.id)) return;
    autoExtractAttemptedRef.current.add(chantier.id);
    runAutoExtract({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, premierDevisUri, chantier?.id]);

  // ── Generate HTML report ──
  const handlePartager = async () => {
    if (!chantier) return;

    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const adresseComplete = [chantier.rue, chantier.codePostal, chantier.ville].filter(Boolean).join(', ') || chantier.adresse;

    let photosHtml = '';
    if (photosPortail.length > 0) {
      photosHtml = `<h2 style="color:#C9A96E;border-bottom:2px solid #C9A96E;padding-bottom:6px;">Photos</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px;">
          ${photosPortail.map(p => `<img src="${p.uri}" style="width:100%;height:150px;object-fit:cover;border-radius:8px;" />`).join('')}
        </div>`;
    }

    let marchesHtml = '';
    if (marches.length > 0 || supplements.length > 0) {
      marchesHtml = `<h2 style="color:#C9A96E;border-bottom:2px solid #C9A96E;padding-bottom:6px;">Marches &amp; Supplements</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr style="background:#2C2C2C;color:#fff;">
            <th style="padding:8px;text-align:left;">Libelle</th>
            <th style="padding:8px;text-align:right;">HT</th>
            <th style="padding:8px;text-align:right;">TTC</th>
            <th style="padding:8px;text-align:right;">Paye</th>
          </tr></thead>
          <tbody>
            ${marches.map(m => {
              const paye = (m.paiements || []).reduce((s, p) => s + p.montant, 0);
              return `<tr style="border-bottom:1px solid #E2E6EA;">
                <td style="padding:8px;">${m.libelle}</td>
                <td style="padding:8px;text-align:right;">${fmt(m.montantHT)} EUR</td>
                <td style="padding:8px;text-align:right;">${fmt(m.montantTTC)} EUR</td>
                <td style="padding:8px;text-align:right;color:${paye >= m.montantTTC ? '#27AE60' : '#E74C3C'}">${fmt(paye)} EUR</td>
              </tr>`;
            }).join('')}
            ${supplements.map(s => {
              const paye = (s.paiements || []).reduce((sum, p) => sum + p.montant, 0);
              return `<tr style="border-bottom:1px solid #E2E6EA;background:#FAFAFA;">
                <td style="padding:8px;font-style:italic;">+ ${s.libelle}</td>
                <td style="padding:8px;text-align:right;">${fmt(s.montantHT)} EUR</td>
                <td style="padding:8px;text-align:right;">${fmt(s.montantTTC)} EUR</td>
                <td style="padding:8px;text-align:right;color:${paye >= s.montantTTC ? '#27AE60' : '#E74C3C'}">${fmt(paye)} EUR</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr style="background:#F5EDE3;font-weight:700;">
            <td style="padding:8px;">TOTAL</td>
            <td style="padding:8px;text-align:right;">${fmt(financials.totalHT)} EUR</td>
            <td style="padding:8px;text-align:right;">${fmt(financials.totalTTC)} EUR</td>
            <td style="padding:8px;text-align:right;">${fmt(financials.totalPaye)} EUR</td>
          </tr>
          <tr style="background:#2C2C2C;color:#C9A96E;font-weight:700;">
            <td style="padding:8px;" colspan="3">Reste a payer</td>
            <td style="padding:8px;text-align:right;">${fmt(financials.reste)} EUR</td>
          </tr></tfoot>
        </table>`;
    }

    let savHtml = '';
    if (ticketsSAV.length > 0) {
      savHtml = `<h2 style="color:#C9A96E;border-bottom:2px solid #C9A96E;padding-bottom:6px;">SAV</h2>
        <ul style="margin-bottom:24px;">
          ${ticketsSAV.map(t => `<li style="margin-bottom:8px;">
            <strong>${t.objet}</strong> - <span style="color:${t.statut === 'ouvert' ? '#856404' : '#155724'}">${SAV_STATUT_LABELS[t.statut] || t.statut}</span>
            ${t.description ? `<br/><span style="color:#687076;font-size:13px;">${t.description}</span>` : ''}
          </li>`).join('')}
        </ul>`;
    }

    let timelineHtml = '';
    if (timeline.length > 0) {
      timelineHtml = `<h2 style="color:#C9A96E;border-bottom:2px solid #C9A96E;padding-bottom:6px;">Dernieres activites</h2>
        <div style="margin-bottom:24px;">
          ${timeline.map(n => `<div style="display:flex;gap:12px;margin-bottom:10px;padding:8px 12px;background:#FAFAFA;border-radius:8px;border-left:3px solid #C9A96E;">
            <span style="color:#687076;font-size:12px;white-space:nowrap;">${formatDate(n.date)}</span>
            <span style="font-size:13px;color:#11181C;">${n.texte}</span>
          </div>`).join('')}
        </div>`;
    }

    const pctGlobal = avancementGlobalCorps != null ? avancementGlobalCorps : avancement.pct;
    const pctBar = `<div style="background:#E2E6EA;border-radius:10px;height:20px;overflow:hidden;margin:8px 0 24px;">
      <div style="width:${pctGlobal}%;height:100%;background:linear-gradient(90deg,#C9A96E,#B8923E);border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-size:11px;font-weight:700;">${pctGlobal}%</span>
      </div>
    </div>`;

    let corpsHtml = '';
    if (avancementCorps.length > 0) {
      corpsHtml = `<h2 style="color:#C9A96E;border-bottom:2px solid #C9A96E;padding-bottom:6px;">Avancement par corps de metier</h2>
        <div style="margin-bottom:24px;">
          ${avancementCorps.map(c => `<div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <strong>${c.nom}${c.montant ? ` - ${fmt(c.montant)} EUR` : ''}</strong>
              <span style="color:#C9A96E;font-weight:700;">${c.pourcentage}%</span>
            </div>
            <div style="background:#E2E6EA;border-radius:8px;height:10px;overflow:hidden;">
              <div style="width:${c.pourcentage}%;height:100%;background:#C9A96E;"></div>
            </div>
          </div>`).join('')}
        </div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Rapport - ${chantier.nom}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#11181C; background:#fff; padding:32px; max-width:800px; margin:0 auto; }
        @media print { body { padding:16px; } }
      </style>
    </head><body>
      <div style="background:#2C2C2C;color:#fff;padding:24px 32px;border-radius:12px;margin-bottom:24px;">
        <h1 style="font-size:24px;font-weight:800;margin-bottom:4px;">${chantier.nom}</h1>
        <p style="color:#C9A96E;font-size:14px;">${adresseComplete}</p>
        <p style="color:#999;font-size:12px;margin-top:8px;">Rapport genere le ${today}</p>
      </div>
      <h2 style="color:#C9A96E;border-bottom:2px solid #C9A96E;padding-bottom:6px;">Avancement</h2>
      <p style="font-size:14px;color:#687076;margin-top:8px;">${avancement.done} / ${avancement.total} taches terminees</p>
      ${pctBar}
      ${corpsHtml}
      ${photosHtml}
      ${marchesHtml}
      ${savHtml}
      ${timelineHtml}
      <div style="text-align:center;padding:24px 0;border-top:1px solid #E2E6EA;margin-top:32px;color:#687076;font-size:12px;">
        Rapport genere par <strong>SK DECO Planning</strong>
      </div>
    </body></html>`;

    await openHtmlForPrint(html, `rapport_${chantier.nom.replace(/[^a-zA-Z0-9]/g, '_')}`);
  };

  // ── Imprimer / partager un HTML en PDF ──
  const openHtmlForPrint = async (html: string, _fallbackName: string) => {
    if (Platform.OS === 'web') {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) { document.body.removeChild(iframe); return; }
        doc.open(); doc.write(html); doc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {}
          setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 3000);
        }, 400);
      } catch (e: any) {
        window.alert?.(`Impression indisponible : ${e?.message || 'erreur'}`);
      }
      return;
    }
    // Mobile : génération PDF instable (Modal+Print bug iOS, FileProvider Android).
    // On informe l'utilisateur et il génère le PDF depuis la version web.
    Alert.alert(
      'Génération PDF',
      'Pour générer le PDF du point financier, ouvrez ce chantier depuis la version web (sk-deco-planning.vercel.app). Le snapshot est déjà enregistré dans l\'historique.',
    );
  };

  // ── Construit le HTML d'un point financier de situation depuis un snapshot ──
  const buildSituationHTML = (snap: import('@/app/types').SituationFigee) => {
    if (!chantier) return '';
    const dateFr = new Date(snap.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const adresseComplete = [chantier.rue, chantier.codePostal, chantier.ville].filter(Boolean).join(', ') || chantier.adresse || '';
    const cli = getApp(chantier.clientApporteurId);
    const clientNom = cli ? `${cli.prenom} ${cli.nom}` : (chantier.client || '—');
    const clientSociete = cli?.societe || '';
    const clientEmail = cli?.email || '';
    const clientTel = cli?.telephone || '';

    const lignesHtml = snap.lignes.map(l => `
      <tr style="border-bottom:1px solid #E8DDD0;">
        <td style="padding:10px 8px;">${l.nom}</td>
        <td style="padding:10px 8px;text-align:right;">${fmt(l.montantLotHT)} EUR</td>
        <td style="padding:10px 8px;text-align:right;">${l.pourcentage}%</td>
        <td style="padding:10px 8px;text-align:right;font-weight:700;">${fmt(l.montantFactureHT)} EUR</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Point financier ${snap.numero} — ${chantier.nom}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#2C2C2C; background:#fff; padding:32px; max-width:820px; margin:0 auto; }
        @media print { body { padding:16px; } }
        h1,h2,h3 { font-weight:800; }
        table { width:100%; border-collapse:collapse; }
        thead tr { background:#2C2C2C; color:#C9A96E; }
        thead th { padding:10px 8px; text-align:left; font-size:12px; letter-spacing:0.4px; }
      </style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
        <div>
          <h1 style="font-size:26px;color:#2C2C2C;">SK DECO</h1>
          <p style="color:#8C8077;font-size:12px;margin-top:2px;">Travaux &amp; Decoration</p>
        </div>
        <div style="text-align:right;">
          <h2 style="font-size:18px;color:#C9A96E;">POINT FINANCIER DE SITUATION</h2>
          <p style="font-size:11px;color:#8C8077;margin-top:2px;">Avant émission de facture</p>
          <p style="font-size:12px;color:#687076;margin-top:4px;">N&deg; ${snap.numero}</p>
          <p style="font-size:12px;color:#687076;">Date : ${dateFr}</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
        <div style="background:#F5EDE3;border-radius:10px;padding:14px;">
          <p style="font-size:10px;font-weight:700;color:#8C6D2F;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Chantier</p>
          <p style="font-size:14px;font-weight:700;">${chantier.nom}</p>
          <p style="font-size:12px;color:#687076;margin-top:2px;">${adresseComplete}</p>
        </div>
        <div style="background:#F5EDE3;border-radius:10px;padding:14px;">
          <p style="font-size:10px;font-weight:700;color:#8C6D2F;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Client</p>
          <p style="font-size:14px;font-weight:700;">${clientNom}</p>
          ${clientSociete ? `<p style="font-size:12px;color:#687076;margin-top:2px;">${clientSociete}</p>` : ''}
          ${clientEmail ? `<p style="font-size:12px;color:#687076;">${clientEmail}</p>` : ''}
          ${clientTel ? `<p style="font-size:12px;color:#687076;">${clientTel}</p>` : ''}
        </div>
      </div>

      <h3 style="font-size:14px;color:#2C2C2C;border-bottom:2px solid #C9A96E;padding-bottom:6px;margin-bottom:10px;">Detail des prestations</h3>
      <table style="margin-bottom:16px;">
        <thead>
          <tr>
            <th>Corps de metier</th>
            <th style="text-align:right;">Montant HT</th>
            <th style="text-align:right;">% Avancement</th>
            <th style="text-align:right;">Cumulé HT</th>
          </tr>
        </thead>
        <tbody>${lignesHtml}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
        <table style="width:auto;min-width:340px;">
          <tr><td style="padding:6px 12px;color:#687076;">Cumulé HT</td><td style="padding:6px 12px;text-align:right;font-weight:700;">${fmt(snap.totalHT)} EUR</td></tr>
          <tr><td style="padding:6px 12px;color:#687076;">TVA 20%</td><td style="padding:6px 12px;text-align:right;font-weight:700;">${fmt(snap.tva)} EUR</td></tr>
          <tr style="background:#2C2C2C;color:#C9A96E;"><td style="padding:10px 12px;font-weight:800;">Cumulé TTC</td><td style="padding:10px 12px;text-align:right;font-weight:800;">${fmt(snap.totalTTC)} EUR</td></tr>
          <tr><td style="padding:6px 12px;color:#687076;">Situations déjà payées</td><td style="padding:6px 12px;text-align:right;">− ${fmt(snap.dejaPayeAvant)} EUR</td></tr>
          <tr style="background:#F5EDE3;"><td style="padding:10px 12px;font-weight:800;color:#8C6D2F;">Montant de cette situation</td><td style="padding:10px 12px;text-align:right;font-weight:800;color:#8C6D2F;">${fmt(snap.montantSituation)} EUR</td></tr>
        </table>
      </div>

      <div style="background:#FAF7F3;border-left:3px solid #C9A96E;padding:12px 16px;border-radius:6px;margin-bottom:32px;">
        <p style="font-size:12px;color:#687076;">
          Ce document est un <strong>point financier de situation</strong> figé au ${dateFr}, destiné à servir de base à l'émission d'une facture dans le logiciel de gestion.
          ${snap.numeroFacture ? `<br/>Facture associée : <strong>${snap.numeroFacture}</strong>` : ''}
        </p>
      </div>

      <div style="text-align:center;padding:16px 0;margin-top:16px;color:#8C8077;font-size:11px;">
        SK DECO &middot; Point financier ${snap.numero} figé le ${dateFr}
      </div>
    </body></html>`;
  };

  // ── Figer un nouveau point financier (snapshot immuable dans l'historique) ──
  const handleFigerSituation = async () => {
    if (!chantier) return;
    if (situation.lignes.length === 0) return;

    const year = new Date().getFullYear();
    const existingYear = situationsHistorique.filter(s => s.numero.includes(`PFS-${year}-`));
    const numero = `PFS-${year}-${String(existingYear.length + 1).padStart(3, '0')}`;

    const snap = {
      id: genId('pfs'),
      numero,
      date: new Date().toISOString(),
      lignes: situation.lignes.map(l => ({ ...l })),
      totalHT: situation.totalHT,
      tva: situation.tva,
      totalTTC: situation.totalTTC,
      dejaPayeAvant: dejaPayeTotal,
      montantSituation: situation.montantSituation,
      statut: 'en_attente' as const,
    };

    // 1. Enregistrer d'abord (opération rapide, locale)
    try {
      updateChantier({ ...chantier, situationsHistorique: [...situationsHistorique, snap], derniereMajContenu: new Date().toISOString() });
    } catch (e) {
      const msg = `Erreur enregistrement : ${(e as Error)?.message || 'inconnue'}`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Erreur', msg);
      return;
    }

    // 2. Notifier le client par email (si email renseigné) — silencieux en cas d'échec
    const client = getApp(chantier.clientApporteurId);
    if (client?.email) {
      (async () => {
        try {
          const { envoyerEmail, emailFigerSituation } = await import('@/lib/emailClient');
          const payload = emailFigerSituation({
            chantierNom: chantier.nom,
            clientPrenom: client.prenom,
            numeroSituation: snap.numero,
            montantTTC: snap.montantSituation,
            lien: 'https://sk-deco-planning.vercel.app',
          });
          await envoyerEmail({ to: client.email!, ...payload });
        } catch {}
      })();
    }

    // 3. Générer le PDF dans un second temps — ne doit pas bloquer ni crasher
    setTimeout(() => {
      openHtmlForPrint(buildSituationHTML(snap), `point_financier_${snap.numero}`).catch(() => {
        const msg = `Point financier ${snap.numero} enregistré. Le PDF n'a pas pu être généré — utilisez le bouton 📄 PDF dans l'historique.`;
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Info', msg);
      });
    }, 200);
  };

  const handleReimprimerSituation = async (id: string) => {
    const snap = situationsHistorique.find(s => s.id === id);
    if (!snap) return;
    await openHtmlForPrint(buildSituationHTML(snap), `point_financier_${snap.numero}`);
  };

  const handleToggleSituationPayee = (id: string) => {
    if (!chantier) return;
    const next = situationsHistorique.map(s => {
      if (s.id !== id) return s;
      if (s.statut === 'payee') return { ...s, statut: 'en_attente' as const, paidAt: undefined };
      return { ...s, statut: 'payee' as const, paidAt: new Date().toISOString() };
    });
    updateChantier({ ...chantier, situationsHistorique: next });
  };

  const handleEditNumFacture = (id: string) => {
    if (!chantier) return;
    const snap = situationsHistorique.find(s => s.id === id);
    if (!snap) return;
    const current = snap.numeroFacture || '';
    if (Platform.OS === 'web') {
      const val = window.prompt('N° de facture créée dans votre logiciel (ex : F2026-042)', current);
      if (val === null) return;
      const next = situationsHistorique.map(s => s.id === id ? { ...s, numeroFacture: val.trim() || undefined } : s);
      updateChantier({ ...chantier, situationsHistorique: next });
    } else {
      Alert.prompt?.('N° facture', 'Saisissez le n° de facture associée', (val?: string) => {
        const next = situationsHistorique.map(s => s.id === id ? { ...s, numeroFacture: (val || '').trim() || undefined } : s);
        updateChantier({ ...chantier, situationsHistorique: next });
      }, undefined, current);
    }
  };

  const handleSupprimerSituation = (id: string) => {
    if (!chantier) return;
    const snap = situationsHistorique.find(s => s.id === id);
    if (!snap) return;
    const msg = `Supprimer le point financier ${snap.numero} ?\nCette action est irréversible.`;
    const doDel = () => updateChantier({ ...chantier, situationsHistorique: situationsHistorique.filter(s => s.id !== id) });
    if (Platform.OS === 'web') { if (window.confirm(msg)) doDel(); }
    else Alert.alert('Supprimer', msg, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDel }]);
  };

  if (!chantier) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: '#687076', marginBottom: 16 }}>Chantier introuvable</Text>
            <Pressable onPress={onClose} style={{ backgroundColor: '#2C2C2C', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  const adresseComplete = [chantier.rue, chantier.codePostal, chantier.ville].filter(Boolean).join(', ') || chantier.adresse;
  const screenW = Dimensions.get('window').width;
  const photoSize = (Math.min(screenW, 600) - 48 - 16) / 3;

  // Apporteurs filtrés pour le picker
  const apporteursDuType = pickerType ? apporteurs.filter(a => a.type === pickerType) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{chantier.nom}</Text>
              <Text style={styles.headerAddress}>{adresseComplete}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* ── Contact principal (destinataire) ── */}
            {contactPrincipal && (
              <View style={styles.contactPrincipalCard}>
                <Text style={styles.contactPrincipalLabel}>
                  {APPORTEUR_TYPE_LABELS[contactPrincipal.type].emoji} Destinataire — {APPORTEUR_TYPE_LABELS[contactPrincipal.type].label}
                </Text>
                <Text style={styles.contactPrincipalName}>
                  {contactPrincipal.apporteur.prenom} {contactPrincipal.apporteur.nom}
                </Text>
                {contactPrincipal.apporteur.societe && (
                  <Text style={styles.contactPrincipalMeta}>{contactPrincipal.apporteur.societe}</Text>
                )}
                {(contactPrincipal.apporteur.telephone || contactPrincipal.apporteur.email) && (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                    {contactPrincipal.apporteur.telephone && (
                      <Text style={styles.contactPrincipalMeta}>📞 {contactPrincipal.apporteur.telephone}</Text>
                    )}
                    {contactPrincipal.apporteur.email && (
                      <Text style={styles.contactPrincipalMeta} numberOfLines={1}>✉️ {contactPrincipal.apporteur.email}</Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* ── Chips "Lié à" (admin seulement) ── */}
            {isAdmin && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Lié à</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {LIEN_TYPES.map(({ key, field }) => {
                    const id = chantier[field] as string | undefined;
                    const app = getApp(id);
                    const meta = APPORTEUR_TYPE_LABELS[key];
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setPickerType(key)}
                        style={[styles.lienChip, app && { borderColor: meta.couleur, backgroundColor: meta.couleur + '18' }]}
                      >
                        <Text style={styles.lienChipLabel}>{meta.emoji} {meta.label}</Text>
                        <Text style={[styles.lienChipValue, app && { color: '#2C2C2C', fontWeight: '700' }]} numberOfLines={1}>
                          {app ? `${app.prenom} ${app.nom}` : 'Aucun'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Marchés (déplacé ici, juste sous "Lié à") ── */}
            {(marches.length > 0 || supplements.length > 0) && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Marchés</Text>
                {marches.map(m => {
                  const paye = (m.paiements || []).reduce((s, p) => s + p.montant, 0);
                  const estPaye = paye >= m.montantTTC;
                  return (
                    <View key={m.id} style={styles.marcheRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.marcheLabel}>{m.libelle}</Text>
                        <Text style={styles.marcheMontant}>HT : {fmt(m.montantHT)} €  |  TTC : {fmt(m.montantTTC)} €</Text>
                      </View>
                      <View style={[styles.marcheStatut, { backgroundColor: estPaye ? '#D4EDDA' : '#FFF3CD' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: estPaye ? '#155724' : '#856404' }}>
                          {estPaye ? 'Soldé' : `Reste ${fmt(m.montantTTC - paye)} €`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                {supplements.map(s => {
                  const paye = (s.paiements || []).reduce((sum, p) => sum + p.montant, 0);
                  const estPaye = paye >= s.montantTTC;
                  return (
                    <View key={s.id} style={[styles.marcheRow, { backgroundColor: '#FAFAFA' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.marcheLabel, { fontStyle: 'italic' }]}>+ {s.libelle}</Text>
                        <Text style={styles.marcheMontant}>HT : {fmt(s.montantHT)} €  |  TTC : {fmt(s.montantTTC)} €</Text>
                      </View>
                      <View style={[styles.marcheStatut, { backgroundColor: estPaye ? '#D4EDDA' : '#FFF3CD' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: estPaye ? '#155724' : '#856404' }}>
                          {estPaye ? 'Soldé' : `Reste ${fmt(s.montantTTC - paye)} €`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total TTC</Text>
                  <Text style={styles.totalValue}>{fmt(financials.totalTTC)} €</Text>
                </View>
                <View style={[styles.totalRow, { backgroundColor: '#2C2C2C' }]}>
                  <Text style={[styles.totalLabel, { color: '#C9A96E' }]}>Déjà encaissé</Text>
                  <Text style={[styles.totalValue, { color: '#C9A96E' }]}>{fmt(financials.totalPaye)} €</Text>
                </View>
              </View>
            )}

            {/* ── Suivi financier & Avancement (fusionné) ── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.sectionTitle}>💰 Suivi financier & Avancement</Text>
                {avancementGlobalCorps != null && (
                  <View style={{ backgroundColor: '#C9A96E', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{avancementGlobalCorps}%</Text>
                  </View>
                )}
              </View>
              <Text style={styles.pfsSubtitle}>Lots, avancement, situation financière et historique</Text>

              {/* Résumé financier global — toujours visible */}
              {totalChantierHT > 0 && (
                <View style={styles.pfsResumeBox}>
                  <View style={styles.pfsResumeRow}>
                    <Text style={styles.pfsResumeLabel}>Total lots HT</Text>
                    <Text style={styles.pfsResumeValue}>{fmt(totalChantierHT)} €</Text>
                  </View>
                  {tvaBreakdown.length > 0 ? (
                    tvaBreakdown.map((t, i) => (
                      <View key={i} style={styles.pfsResumeRow}>
                        <Text style={styles.pfsResumeLabel}>+ TVA {t.taux.toString().replace('.', ',')}%</Text>
                        <Text style={styles.pfsResumeValue}>{fmt(t.montant)} €</Text>
                      </View>
                    ))
                  ) : chantier?.devisTotalTTC && totalChantierHT > 0 ? (
                    // Pas de split, mais TTC du devis connu → calcul effectif
                    <View style={styles.pfsResumeRow}>
                      <Text style={styles.pfsResumeLabel}>
                        + TVA (taux effectif {(tvaRatioEffectif * 100).toFixed(1).replace('.', ',')}%)
                      </Text>
                      <Text style={styles.pfsResumeValue}>{fmt(totalChantierTTC - totalChantierHT)} €</Text>
                    </View>
                  ) : (
                    <View style={styles.pfsResumeRow}>
                      <Text style={styles.pfsResumeLabel}>+ TVA 20% (par défaut)</Text>
                      <Text style={styles.pfsResumeValue}>{fmt(totalChantierHT * TVA_RATE_DEFAULT)} €</Text>
                    </View>
                  )}
                  <View style={[styles.pfsResumeRow, { borderTopWidth: 1, borderTopColor: '#E8DDD0', paddingTop: 6, marginTop: 2 }]}>
                    <Text style={[styles.pfsResumeLabel, { fontWeight: '800' }]}>= Total chantier TTC</Text>
                    <Text style={[styles.pfsResumeValue, { fontWeight: '800' }]}>{fmt(totalChantierTTC)} €</Text>
                  </View>
                  {dejaPayeAcompte > 0 && (
                    <View style={[styles.pfsResumeRow, { marginTop: 6 }]}>
                      <Text style={[styles.pfsResumeLabel, { color: '#2E7D32' }]}>− Acompte(s) client</Text>
                      <Text style={[styles.pfsResumeValue, { color: '#2E7D32' }]}>{fmt(dejaPayeAcompte)} €</Text>
                    </View>
                  )}
                  {totalPayeSituations > 0 && (
                    <View style={styles.pfsResumeRow}>
                      <Text style={[styles.pfsResumeLabel, { color: '#2E7D32' }]}>− Situations payées</Text>
                      <Text style={[styles.pfsResumeValue, { color: '#2E7D32' }]}>{fmt(totalPayeSituations)} €</Text>
                    </View>
                  )}
                  <View style={[styles.pfsResumeRow, styles.pfsResumeReste]}>
                    <Text style={[styles.pfsResumeLabel, { color: '#8C6D2F', fontWeight: '800' }]}>Restant à payer TTC</Text>
                    <Text style={[styles.pfsResumeValue, { color: '#8C6D2F', fontWeight: '800' }]}>{fmt(resteAPayerChantier)} €</Text>
                  </View>
                </View>
              )}

              {/* ── Sous-section : Lots et avancement ── */}
              <View style={styles.subSectionHeader}>
                <Text style={styles.subSectionTitle}>🛠 Lots du chantier</Text>
              </View>

              {/* Auto-extraction en cours */}
              {autoExtractLoading && (
                <View style={styles.autoExtractRow}>
                  <ActivityIndicator size="small" color="#C9A96E" />
                  <Text style={styles.autoExtractText}>🤖 Extraction automatique des lots...</Text>
                </View>
              )}
              {/* Toast succès */}
              {autoExtractToast && (
                <View style={styles.autoExtractToast}>
                  <Text style={styles.autoExtractToastText}>{autoExtractToast}</Text>
                </View>
              )}

              {avancementCorps.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 }}>
                  Aucun corps de métier ajouté
                </Text>
              ) : (
                <>
                  {avancementCorps.map(c => (
                    <View key={c.id} style={[{ marginBottom: 10 }, isLotEnCours(c) && styles.lotEnCoursCard]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Pressable
                          onPress={isAdmin ? () => openEditCorps(c) : undefined}
                          style={{ flex: 1 }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2C' }}>
                              {c.nom}{c.montant ? ` — ${fmt(c.montant)} € HT` : ''}
                            </Text>
                            {isLotEnCours(c) && (
                              <View style={styles.lotBadgeEnCours}>
                                <Text style={styles.lotBadgeEnCoursText}>🔨 En cours</Text>
                              </View>
                            )}
                          </View>
                          {(c.dateDebutPrevue || c.dateFinPrevue) && (
                            <Text style={{ fontSize: 10, color: '#8C8077', marginTop: 2 }}>
                              📅 {c.dateDebutPrevue || '?'} → {c.dateFinPrevue || '?'}
                            </Text>
                          )}
                        </Pressable>
                        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#C9A96E' }}>{c.pourcentage}%</Text>
                          {c.montant && c.pourcentage > 0 && (
                            <Text style={{ fontSize: 10, color: '#8C6D2F', fontWeight: '700', marginTop: 1 }}>
                              = {fmt((c.montant || 0) * (c.pourcentage / 100))} €
                            </Text>
                          )}
                        </View>
                        {isAdmin && (
                          <Pressable onPress={() => deleteCorps(c.id)} style={{ marginLeft: 8 }}>
                            <Text style={{ fontSize: 14, color: '#E74C3C' }}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                      <View style={styles.corpsBarBg}>
                        <View style={[styles.corpsBarFill, { width: `${c.pourcentage}%` }]} />
                      </View>
                      {c.commentaire && (
                        <View style={styles.lotCommentaireBox}>
                          <Text style={styles.lotCommentaireText}>💬 {c.commentaire}</Text>
                        </View>
                      )}
                      {c.photos && c.photos.length > 0 && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {c.photos.map((p, idx) => (
                            <Image key={idx} source={{ uri: p }} style={{ width: 56, height: 56, borderRadius: 6 }} resizeMode="cover" />
                          ))}
                        </View>
                      )}
                      {/* Photos avant / après */}
                      {(c.photosAvant && c.photosAvant.length > 0) || (c.photosApres && c.photosApres.length > 0) ? (
                        <View style={{ marginTop: 8 }}>
                          {c.photosAvant && c.photosAvant.length > 0 && (
                            <View style={{ marginBottom: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#8C8077', marginBottom: 4 }}>📸 AVANT</Text>
                              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                                {c.photosAvant.map((p, i) => (
                                  <Image key={i} source={{ uri: p }} style={{ width: 72, height: 72, borderRadius: 6, borderWidth: 2, borderColor: '#8C8077' }} />
                                ))}
                              </View>
                            </View>
                          )}
                          {c.photosApres && c.photosApres.length > 0 && (
                            <View>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#2E7D32', marginBottom: 4 }}>✨ APRÈS</Text>
                              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                                {c.photosApres.map((p, i) => (
                                  <Image key={i} source={{ uri: p }} style={{ width: 72, height: 72, borderRadius: 6, borderWidth: 2, borderColor: '#2E7D32' }} />
                                ))}
                              </View>
                            </View>
                          )}
                        </View>
                      ) : null}
                      {/* Commentaires client/externes */}
                      {c.commentairesClient && c.commentairesClient.length > 0 && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                          {c.commentairesClient.map(cc => {
                            const isMine = cc.auteurType === (isExterne ? externAp?.type : 'admin');
                            const unreadByAdmin = isAdmin && cc.auteurType !== 'admin' && !cc.luParAdmin;
                            return (
                              <View key={cc.id} style={{
                                padding: 8, borderRadius: 8,
                                backgroundColor: isMine ? '#E8DDD0' : '#F1F8F2',
                                borderLeftWidth: 3,
                                borderLeftColor: unreadByAdmin ? '#E74C3C' : (isMine ? '#8C8077' : '#2E7D32'),
                              }}>
                                <Text style={{ fontSize: 10, color: '#8C8077', fontWeight: '700' }}>
                                  {cc.auteurNom} ({cc.auteurType}) · {new Date(cc.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  {unreadByAdmin ? '  🔴 Non lu' : ''}
                                </Text>
                                <Text style={{ fontSize: 12, color: '#2C2C2C', marginTop: 3 }}>{cc.texte}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                      {/* Bouton "ajouter commentaire" pour externes et admin */}
                      {(isExterne || isAdmin) && (
                        <Pressable
                          onPress={() => openCommentaireClient(c.id)}
                          style={{ marginTop: 6, paddingVertical: 6, alignItems: 'center', backgroundColor: '#FAF7F3', borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9A96E' }}
                        >
                          <Text style={{ fontSize: 11, color: '#8C6D2F', fontWeight: '700' }}>💬 Ajouter un commentaire</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {/* Totaux lots */}
                  <View style={styles.totalLotsRow}>
                    <Text style={styles.totalLotsLabel}>Total lots HT</Text>
                    <Text style={styles.totalLotsValue}>{fmt(totalChantierHT)} €</Text>
                  </View>
                  {situation.totalHT > 0 && (
                    <View style={[styles.totalLotsRow, { marginTop: 6, backgroundColor: '#F5EDE3' }]}>
                      <Text style={[styles.totalLotsLabel, { color: '#8C6D2F' }]}>Cumulé selon avancement</Text>
                      <Text style={[styles.totalLotsValue, { color: '#8C6D2F' }]}>{fmt(situation.totalHT)} € HT</Text>
                    </View>
                  )}
                  {isAdmin && (
                    <Pressable style={styles.deleteAllLotsBtn} onPress={deleteAllCorps}>
                      <Text style={styles.deleteAllLotsBtnText}>🗑 Supprimer tous les lots</Text>
                    </Pressable>
                  )}
                </>
              )}
              {isAdmin && (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable style={[styles.addCorpsBtn, { flex: 1, marginTop: 0 }]} onPress={openNewCorps}>
                      <Text style={styles.addCorpsBtnText}>+ Ajouter un corps de métier</Text>
                    </Pressable>
                    {premierDevisUri && (
                      <Pressable
                        style={[styles.reanalyserBtn, autoExtractLoading && { opacity: 0.5 }]}
                        onPress={() => runAutoExtract({ silent: false })}
                        disabled={autoExtractLoading}
                      >
                        <Text style={styles.reanalyserBtnText}>🔄 Re-analyser le devis</Text>
                      </Pressable>
                    )}
                  </View>
                  <Pressable style={styles.importDevisBtn} onPress={openImportDevis}>
                    <Text style={styles.importDevisBtnText}>📋 Extraire les lots du devis</Text>
                  </Pressable>
                  {premierDevisUri ? (
                    <>
                      <View style={styles.devisLinkRow}>
                        <Text style={styles.devisLinkText} numberOfLines={1}>
                          📄 Devis : {premierDevisNom || 'devis'}
                        </Text>
                        <Pressable onPress={ouvrirDevis}>
                          <Text style={styles.devisLinkAction}>Ouvrir</Text>
                        </Pressable>
                      </View>
                      {/* Aperçu PDF inline (web uniquement) pour copier-coller les lots */}
                      {Platform.OS === 'web' && (
                        <View style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E8DDD0', height: 500 }}>
                          {/* @ts-ignore — web iframe */}
                          <iframe src={premierDevisUri} style={{ width: '100%', height: '100%', border: 'none' }} title="Devis" />
                        </View>
                      )}
                      {Platform.OS !== 'web' && (
                        <Text style={{ fontSize: 11, color: '#8C8077', fontStyle: 'italic', marginTop: 6 }}>
                          Ouvrez le devis sur la version web pour voir l'aperçu et copier-coller les lots.
                        </Text>
                      )}
                    </>
                  ) : (
                    <View style={{ backgroundColor: '#FFF8E1', borderRadius: 10, padding: 12, marginTop: 6 }}>
                      <Text style={{ fontSize: 11, color: '#8C6D2F' }}>
                        💡 Aucun devis lié à ce chantier. Uploadez-en un dans 💼 Marchés pour voir l'aperçu ici et extraire automatiquement les lots.
                      </Text>
                    </View>
                  )}
                </>
              )}

            {/* ── Point financier de situation (dans le même card) ── */}
            {(situation.lignes.length > 0 || situationsHistorique.length > 0) && (
              <>
                <View style={styles.subSectionHeader}>
                  <Text style={styles.subSectionTitle}>📸 Point financier de situation</Text>
                </View>
                <Text style={styles.pfsSubtitle}>Avant émission de facture</Text>

                {/* Calcul TVA / TTC de la situation (basé sur cumulé HT vu dans la liste lots) */}
                {situation.lignes.length > 0 && (
                  <>
                    <View style={styles.situationTotals}>
                      <View style={styles.situationTotalRow}>
                        <Text style={styles.situationTotalLabel}>Cumulé HT</Text>
                        <Text style={styles.situationTotalValue}>{fmt(situation.totalHT)} €</Text>
                      </View>
                      <View style={styles.situationTotalRow}>
                        <Text style={styles.situationTotalLabel}>TVA (ratio devis {(tvaRatioEffectif * 100).toFixed(1)}%)</Text>
                        <Text style={styles.situationTotalValue}>{fmt(situation.tva)} €</Text>
                      </View>
                      <View style={[styles.situationTotalRow, styles.situationTotalTTC]}>
                        <Text style={[styles.situationTotalLabel, { color: '#C9A96E' }]}>Cumulé TTC</Text>
                        <Text style={[styles.situationTotalValue, { color: '#C9A96E' }]}>{fmt(situation.totalTTC)} €</Text>
                      </View>
                      {dejaPayeAcompte > 0 && (
                        <View style={styles.situationTotalRow}>
                          <Text style={styles.situationTotalLabel}>− Acompte(s) client</Text>
                          <Text style={styles.situationTotalValue}>{fmt(dejaPayeAcompte)} €</Text>
                        </View>
                      )}
                      {totalPayeSituations > 0 && (
                        <View style={styles.situationTotalRow}>
                          <Text style={styles.situationTotalLabel}>− Situations déjà payées</Text>
                          <Text style={styles.situationTotalValue}>{fmt(totalPayeSituations)} €</Text>
                        </View>
                      )}
                      <View style={[styles.situationTotalRow, { backgroundColor: '#F5EDE3', borderRadius: 8 }]}>
                        <Text style={[styles.situationTotalLabel, { color: '#8C6D2F', fontWeight: '800' }]}>Montant de cette situation</Text>
                        <Text style={[styles.situationTotalValue, { color: '#8C6D2F', fontWeight: '800' }]}>
                          {fmt(situation.montantSituation)} €
                        </Text>
                      </View>
                    </View>

                    {isAdmin && (
                      <>
                        {!situation.peutFiger && (
                          <View style={styles.pfsBlockedBox}>
                            <Text style={styles.pfsBlockedText}>
                              ⚠️ L'avancement cumulé ({fmt(situation.totalTTC)} € TTC) ne dépasse pas encore le(s) acompte(s) encaissé(s) ({fmt(dejaPayeTotal)} € TTC).{"\n"}Déconseillé de faire une demande au client pour l'instant — vous pouvez tout de même figer ce point si besoin.
                            </Text>
                          </View>
                        )}
                        <Pressable style={styles.factureBtn} onPress={handleFigerSituation}>
                          <Text style={styles.factureBtnText}>📸 Figer ce point financier + PDF</Text>
                        </Pressable>
                      </>
                    )}
                  </>
                )}

                {/* Historique des points financiers figés */}
                {situationsHistorique.length > 0 && (
                  <>
                    <Text style={[styles.pfsSectionLabel, { marginTop: 16 }]}>📚 Historique ({situationsHistorique.length})</Text>
                    {[...situationsHistorique].sort((a, b) => b.date.localeCompare(a.date)).map(s => {
                      const dateFr = new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const isPayee = s.statut === 'payee';
                      return (
                        <View key={s.id} style={[styles.pfsHistItem, isPayee && styles.pfsHistItemPayee]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.pfsHistNumero}>{s.numero}</Text>
                              <Text style={styles.pfsHistDate}>{dateFr}</Text>
                            </View>
                            <View style={[styles.pfsBadge, isPayee ? styles.pfsBadgePayee : styles.pfsBadgeAttente]}>
                              <Text style={[styles.pfsBadgeText, isPayee ? { color: '#155724' } : { color: '#856404' }]}>
                                {isPayee ? '✓ Payée' : '⏳ En attente'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.pfsHistRow}>
                            <Text style={styles.pfsHistLabel}>Montant :</Text>
                            <Text style={styles.pfsHistMontant}>{fmt(s.montantSituation)} € TTC</Text>
                          </View>
                          <View style={styles.pfsHistRow}>
                            <Text style={styles.pfsHistLabel}>Cumulé :</Text>
                            <Text style={styles.pfsHistSub}>{fmt(s.totalTTC)} € TTC</Text>
                          </View>
                          {s.numeroFacture && (
                            <View style={styles.pfsHistRow}>
                              <Text style={styles.pfsHistLabel}>N° facture :</Text>
                              <Text style={styles.pfsHistSub}>{s.numeroFacture}</Text>
                            </View>
                          )}
                          {isPayee && s.paidAt && (
                            <View style={styles.pfsHistRow}>
                              <Text style={styles.pfsHistLabel}>Payée le :</Text>
                              <Text style={styles.pfsHistSub}>{new Date(s.paidAt).toLocaleDateString('fr-FR')}</Text>
                            </View>
                          )}
                          <View style={styles.pfsHistActions}>
                            <Pressable style={styles.pfsActionBtn} onPress={() => handleReimprimerSituation(s.id)}>
                              <Text style={styles.pfsActionBtnText}>📄 PDF</Text>
                            </Pressable>
                            {isAdmin && (
                              <>
                                <Pressable style={styles.pfsActionBtn} onPress={() => handleEditNumFacture(s.id)}>
                                  <Text style={styles.pfsActionBtnText}>🧾 N° facture</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.pfsActionBtn, isPayee ? styles.pfsActionBtnUndo : styles.pfsActionBtnPay]}
                                  onPress={() => handleToggleSituationPayee(s.id)}
                                >
                                  <Text style={[styles.pfsActionBtnText, { color: '#fff' }]}>
                                    {isPayee ? '↩ Non payée' : '✓ Marquer payée'}
                                  </Text>
                                </Pressable>
                                <Pressable style={[styles.pfsActionBtn, styles.pfsActionBtnDel]} onPress={() => handleSupprimerSituation(s.id)}>
                                  <Text style={[styles.pfsActionBtnText, { color: '#fff' }]}>🗑</Text>
                                </Pressable>
                              </>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}
            </View>

            {/* ── Livraisons & RDV de chantier ── */}
            <LivraisonsRdvChantier
              chantierId={chantierId}
              isAdmin={isAdmin}
              externRole={isExterne ? externAp?.type : undefined}
              createdByNom={currentUser?.nom}
            />

            {/* ── Moodboard inspirations ── */}
            <MoodboardChantier
              chantier={chantier}
              isAdmin={isAdmin}
              externAp={isExterne && externAp ? { id: externAp.id, prenom: externAp.prenom, nom: externAp.nom, type: externAp.type } : undefined}
            />

            {/* ── Photos portail client ── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={styles.sectionTitle}>Photos</Text>
                {isAdmin && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {toutesPhotos.length > 0 && (
                      <Pressable style={styles.gererPhotosBtn} onPress={openPhotosPicker}>
                        <Text style={styles.gererPhotosBtnText}>📸 Sélectionner</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              {isAdmin && toutesPhotos.length === 0 ? (
                <View style={{ backgroundColor: '#F5EDE3', borderRadius: 10, padding: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#8C8077', textAlign: 'center', marginBottom: 8 }}>
                    Aucune photo dans la galerie de ce chantier.{'\n'}Ajoutez des photos depuis l'onglet 📸 Photos du chantier.
                  </Text>
                  <Pressable
                    style={{ backgroundColor: '#2C2C2C', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}
                    onPress={() => {
                      onClose();
                      // Laisser le temps au modal de se fermer puis naviguer
                      setTimeout(() => {
                        // On peut pas router ici directement sans passer par le parent
                      }, 150);
                    }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Fermer</Text>
                  </Pressable>
                </View>
              ) : photosPortail.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 }}>
                  Aucune photo sélectionnée pour le portail. Cliquez sur "Sélectionner" pour en choisir.
                </Text>
              ) : (
                <View style={styles.photosGrid}>
                  {photosPortail.map((p, i) => (
                    <Image key={p.id || i} source={{ uri: p.uri }} style={[styles.photo, { width: photoSize, height: photoSize }]} resizeMode="cover" />
                  ))}
                </View>
              )}
            </View>

            {/* ── SAV ── */}
            {ticketsSAV.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>SAV</Text>
                {ticketsSAV.map(t => {
                  const sc = SAV_STATUT_COLORS[t.statut] || SAV_STATUT_COLORS.ouvert;
                  return (
                    <View key={t.id} style={styles.savRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.savObjet}>{t.objet}</Text>
                        {t.description ? <Text style={styles.savDesc}>{t.description}</Text> : null}
                      </View>
                      <View style={[styles.savBadge, { backgroundColor: sc.bg }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: sc.text }}>{SAV_STATUT_LABELS[t.statut] || t.statut}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Timeline ── */}
            {timeline.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Dernieres activites</Text>
                {timeline.map((n, i) => (
                  <View key={i} style={styles.timelineRow}>
                    <View style={styles.timelineDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineDate}>{formatDate(n.date)}</Text>
                      <Text style={styles.timelineText}>{n.texte}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Boutons ── */}
            <View style={styles.buttonsRow}>
              <Pressable style={styles.partagerBtn} onPress={handlePartager}>
                <Text style={styles.partagerBtnText}>📄 Partager le rapport</Text>
              </Pressable>
              <Pressable style={styles.fermerBtn} onPress={onClose}>
                <Text style={styles.fermerBtnText}>Fermer</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* ── Modal Picker Contact ── */}
      <Modal visible={pickerType !== null} animationType="fade" transparent onRequestClose={() => setPickerType(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginBottom: 12 }}>
              {pickerType && `${APPORTEUR_TYPE_LABELS[pickerType].emoji} Sélectionner ${APPORTEUR_TYPE_LABELS[pickerType].label}`}
            </Text>
            <ScrollView>
              <Pressable
                onPress={() => pickerType && handleSelectContact(pickerType, null)}
                style={styles.pickerRow}
              >
                <Text style={{ fontSize: 14, color: '#687076', fontStyle: 'italic' }}>— Aucun —</Text>
              </Pressable>
              {apporteursDuType.length === 0 && (
                <Text style={{ fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>
                  Aucun contact de ce type enregistré
                </Text>
              )}
              {apporteursDuType.map(a => (
                <Pressable
                  key={a.id}
                  onPress={() => pickerType && handleSelectContact(pickerType, a.id)}
                  style={styles.pickerRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C' }}>{a.prenom} {a.nom}</Text>
                    {a.societe && <Text style={{ fontSize: 11, color: '#687076' }}>{a.societe}</Text>}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setPickerType(null)} style={{ marginTop: 12, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Modal Photos Picker ── */}
      <Modal visible={showPhotosPicker} animationType="slide" transparent onRequestClose={() => setShowPhotosPicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', flex: 1 }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8DDD0' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C' }}>Photos affichées dans le portail</Text>
              <Text style={{ fontSize: 12, color: '#687076', marginTop: 2 }}>
                {selectedPhotoIds.length} / {toutesPhotos.length} sélectionnée(s)
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12 }}>
              <View style={styles.photosGrid}>
                {toutesPhotos.map(p => {
                  const selected = selectedPhotoIds.includes(p.id);
                  return (
                    <Pressable key={p.id} onPress={() => togglePhoto(p.id)} style={{ position: 'relative' }}>
                      <Image source={{ uri: p.uri }} style={[styles.photo, { width: photoSize, height: photoSize, borderWidth: 3, borderColor: selected ? '#C9A96E' : 'transparent' }]} resizeMode="cover" />
                      <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: selected ? '#C9A96E' : 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                        {selected && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✓</Text>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {toutesPhotos.length === 0 && (
                <Text style={{ fontSize: 13, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 }}>
                  Aucune photo dans la galerie du chantier
                </Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#E8DDD0' }}>
              <Pressable onPress={() => setShowPhotosPicker(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={savePhotosSelection} style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Form Corps de métier ── */}
      <Modal visible={showCorpsForm} animationType="fade" transparent onRequestClose={() => setShowCorpsForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <ScrollView
            style={{ maxHeight: '90%' }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginBottom: 12 }}>
              {editCorpsId
                ? `Avancement${corpsForm.nom ? ` — ${corpsForm.nom}` : ''}`
                : 'Ajouter un corps de métier'}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4 }}>Nom *</Text>
            <TextInput
              style={styles.corpsInp}
              value={corpsForm.nom}
              onChangeText={v => setCorpsForm(f => ({ ...f, nom: v }))}
              placeholder="Ex: Électricité, Plomberie..."
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4, marginTop: 10 }}>Montant (€) — optionnel</Text>
            <TextInput
              style={styles.corpsInp}
              value={corpsForm.montant}
              onChangeText={v => setCorpsForm(f => ({ ...f, montant: v }))}
              keyboardType="decimal-pad"
              placeholder="5000"
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4, marginTop: 10 }}>
              Avancement : {corpsForm.pourcentage}%
            </Text>
            {/* 10-step button selector */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                <Pressable
                  key={v}
                  onPress={() => setCorpsForm(f => ({ ...f, pourcentage: v }))}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                    backgroundColor: corpsForm.pourcentage === v ? '#C9A96E' : '#F5EDE3',
                    borderWidth: 1, borderColor: corpsForm.pourcentage === v ? '#C9A96E' : '#E8DDD0',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: corpsForm.pourcentage === v ? '#fff' : '#687076' }}>
                    {v}%
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.corpsBarBg}>
              <View style={[styles.corpsBarFill, { width: `${corpsForm.pourcentage}%` }]} />
            </View>

            {/* Planning prévu (visible par externes) */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 16, marginBottom: 6 }}>📅 Planning prévu</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#687076', marginBottom: 4 }}>Début</Text>
                <DatePickerField
                  value={corpsForm.dateDebutPrevue}
                  onChange={v => setCorpsForm(f => ({ ...f, dateDebutPrevue: v }))}
                  placeholder="Choisir une date"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#687076', marginBottom: 4 }}>Fin</Text>
                <DatePickerField
                  value={corpsForm.dateFinPrevue}
                  onChange={v => setCorpsForm(f => ({ ...f, dateFinPrevue: v }))}
                  placeholder="Choisir une date"
                  minDate={corpsForm.dateDebutPrevue || undefined}
                />
              </View>
            </View>
            <Text style={{ fontSize: 11, color: '#8C8077', marginTop: 10, fontStyle: 'italic' }}>
              Le statut "En cours" est automatique : actif si la date d'aujourd'hui est entre le début et la fin prévus.
            </Text>

            {/* Commentaire admin (visible par externes) */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 16, marginBottom: 6 }}>💬 Commentaire (visible par le client / apporteur)</Text>
            <TextInput
              style={[styles.corpsInp, { minHeight: 70, textAlignVertical: 'top' }]}
              value={corpsForm.commentaire}
              onChangeText={v => setCorpsForm(f => ({ ...f, commentaire: v }))}
              placeholder="Ex : Attente livraison du parquet, chantier reprendra lundi..."
              multiline
            />

            {/* Photos */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 16, marginBottom: 6 }}>📷 Photos attachées ({corpsForm.photos.length})</Text>
            {corpsForm.photos.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {corpsForm.photos.map(uri => (
                  <View key={uri} style={{ position: 'relative' }}>
                    <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8 }} resizeMode="cover" />
                    <Pressable
                      onPress={() => removeLotPhoto(uri)}
                      style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Pressable
              onPress={() => pickPhotoForLot('generic')}
              style={{ backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9A96E' }}
            >
              <Text style={{ color: '#8C6D2F', fontWeight: '700', fontSize: 12 }}>+ Ajouter une photo</Text>
            </Pressable>

            {/* Photos avant / après */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C', marginTop: 16, marginBottom: 6 }}>📸 Comparatif Avant / Après</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: '#FAF7F3', borderRadius: 10, padding: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#8C8077', marginBottom: 6 }}>AVANT ({lotPhotosAvant.length})</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {lotPhotosAvant.map(uri => (
                    <View key={uri} style={{ position: 'relative' }}>
                      <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 6 }} />
                      <Pressable onPress={() => removeLotPhoto(uri, 'avant')} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => pickPhotoForLot('avant')} style={{ backgroundColor: '#fff', borderRadius: 8, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#8C8077' }}>
                  <Text style={{ fontSize: 11, color: '#8C8077', fontWeight: '700' }}>+ Avant</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, backgroundColor: '#F1F8F2', borderRadius: 10, padding: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#2E7D32', marginBottom: 6 }}>APRÈS ({lotPhotosApres.length})</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {lotPhotosApres.map(uri => (
                    <View key={uri} style={{ position: 'relative' }}>
                      <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 6 }} />
                      <Pressable onPress={() => removeLotPhoto(uri, 'apres')} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => pickPhotoForLot('apres')} style={{ backgroundColor: '#fff', borderRadius: 8, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#2E7D32' }}>
                  <Text style={{ fontSize: 11, color: '#2E7D32', fontWeight: '700' }}>+ Après</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable onPress={() => setShowCorpsForm(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={saveCorps}
                disabled={!corpsForm.nom.trim()}
                style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: corpsForm.nom.trim() ? 1 : 0.5 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{editCorpsId ? 'Modifier' : 'Ajouter'}</Text>
              </Pressable>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal commentaire client ── */}
      <Modal visible={!!commentaireLotId} animationType="fade" transparent onRequestClose={() => setCommentaireLotId(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C', marginBottom: 4 }}>💬 Nouveau commentaire</Text>
            <Text style={{ fontSize: 12, color: '#8C8077', marginBottom: 12 }}>
              Visible par l'admin et les autres intervenants de ce chantier.
            </Text>
            <TextInput
              style={{
                backgroundColor: '#FAF7F3', borderRadius: 10, borderWidth: 1.5, borderColor: '#E8DDD0',
                paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: '#2C2C2C',
                minHeight: 120, textAlignVertical: 'top',
              }}
              value={commentaireTexte}
              onChangeText={setCommentaireTexte}
              placeholder="Votre message..."
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable onPress={() => setCommentaireLotId(null)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={saveCommentaireClient} disabled={!commentaireTexte.trim()} style={{ flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: !commentaireTexte.trim() ? 0.5 : 1 }}>
                <Text style={{ color: '#C9A96E', fontWeight: '800' }}>Envoyer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Import lots depuis devis ── */}
      <Modal visible={showImportDevis} animationType="slide" transparent onRequestClose={() => setShowImportDevis(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', flex: 1 }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8DDD0', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C' }}>📋 Importer les lots du devis</Text>
                <Text style={{ fontSize: 12, color: '#687076', marginTop: 2 }}>
                  Détection automatique des corps de métier et montants
                </Text>
              </View>
              <Pressable onPress={() => setShowImportDevis(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, color: '#2C2C2C', fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>

            {/* Sélecteur de mode */}
            <View style={{ flexDirection: 'row', padding: 12, gap: 6 }}>
              {premierDevisUri && (
                <Pressable
                  onPress={() => { setImportMode('pdf'); setLotsDetectes([]); }}
                  style={[styles.importTab, importMode === 'pdf' && styles.importTabActive]}
                >
                  <Text style={[styles.importTabText, importMode === 'pdf' && styles.importTabTextActive]}>
                    🤖 PDF auto
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => { setImportMode('coller'); setLotsDetectes([]); }}
                style={[styles.importTab, importMode === 'coller' && styles.importTabActive]}
              >
                <Text style={[styles.importTabText, importMode === 'coller' && styles.importTabTextActive]}>
                  Coller
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setImportMode('rapide'); setLotsDetectes([]); }}
                style={[styles.importTab, importMode === 'rapide' && styles.importTabActive]}
              >
                <Text style={[styles.importTabText, importMode === 'rapide' && styles.importTabTextActive]}>
                  Saisie rapide
                </Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: '#687076', marginBottom: 8 }}>
                {importMode === 'pdf'
                  ? '🤖 Extraction automatique depuis le PDF déjà uploadé dans Marchés. Cliquez sur le bouton ci-dessous.'
                  : importMode === 'coller'
                  ? 'Copiez-collez le texte du devis PDF ici. L\'app détectera automatiquement les lots et leurs montants HT.'
                  : 'Un lot par ligne. Ex :\nÉlectricité 5000\nPlomberie 8000\nPeinture, 3200'}
              </Text>
              {importMode === 'pdf' ? (
                <View>
                  <Pressable
                    onPress={extraireAutoDepuisPdf}
                    disabled={pdfExtractLoading}
                    style={{ backgroundColor: '#2C2C2C', borderRadius: 10, padding: 14, alignItems: 'center', opacity: pdfExtractLoading ? 0.5 : 1 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                      {pdfExtractLoading ? '⏳ Analyse en cours...' : '🤖 Analyser le devis PDF'}
                    </Text>
                  </Pressable>
                  {importTexte && (
                    <View style={{ marginTop: 12, backgroundColor: '#F5EDE3', borderRadius: 10, padding: 10, maxHeight: 150 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#8C8077', marginBottom: 4 }}>TEXTE EXTRAIT ({importTexte.length} caractères)</Text>
                      <ScrollView><Text style={{ fontSize: 11, color: '#1A1A1A' }} numberOfLines={10}>{importTexte.slice(0, 500)}...</Text></ScrollView>
                    </View>
                  )}
                </View>
              ) : (
                <TextInput
                  style={styles.importTextarea}
                  value={importTexte}
                  onChangeText={setImportTexte}
                  multiline
                  numberOfLines={10}
                  placeholder={importMode === 'coller'
                    ? 'Lot 1 - Électricité .... 5 000,00 €\nLot 2 - Plomberie ...... 8 000,00 €\n...'
                    : 'Électricité 5000\nPlomberie 8000'}
                  placeholderTextColor="#B0BEC5"
                  textAlignVertical="top"
                />
              )}
              {importMode !== 'pdf' && (
                <Pressable
                  onPress={detecterLots}
                  disabled={!importTexte.trim()}
                  style={[styles.detecterBtn, !importTexte.trim() && { opacity: 0.5 }]}
                >
                  <Text style={styles.detecterBtnText}>🔍 Détecter les lots</Text>
                </Pressable>
              )}

              {/* Résultats */}
              {lotsDetectes.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#2C2C2C', marginBottom: 8 }}>
                    {lotsDetectes.length} lot(s) détecté(s)
                  </Text>
                  {lotsDetectes.map((lot, i) => {
                    const checked = !!lotsSelection[i];
                    return (
                      <Pressable key={i} onPress={() => toggleLotSel(i)} style={styles.lotRow}>
                        <View style={[styles.lotCheckbox, checked && styles.lotCheckboxChecked]}>
                          {checked && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✓</Text>}
                        </View>
                        <Text style={styles.lotNom} numberOfLines={1}>{lot.nom}</Text>
                        <Text style={styles.lotMontant}>{fmt(lot.montantHT)} €</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#E8DDD0' }}>
              <Pressable onPress={() => setShowImportDevis(false)} style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#2C2C2C', fontWeight: '700' }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={importerLots}
                disabled={lotsDetectes.length === 0 || Object.values(lotsSelection).every(v => !v)}
                style={{
                  flex: 1,
                  backgroundColor: '#2C2C2C',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: (lotsDetectes.length === 0 || Object.values(lotsSelection).every(v => !v)) ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  ✓ Importer {Object.values(lotsSelection).filter(Boolean).length} lot(s)
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: '#2C2C2C',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  headerAddress: {
    fontSize: 13,
    color: '#C9A96E',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  contactPrincipalCard: {
    backgroundColor: '#FAF3E6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#C9A96E',
  },
  contactPrincipalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C6D2F',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  contactPrincipalName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2C2C2C',
  },
  contactPrincipalMeta: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },
  lienChip: {
    flexDirection: 'column',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8DDD0',
    backgroundColor: '#FAF7F3',
    minWidth: 140,
    flexGrow: 1,
  },
  lienChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8C8077',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  lienChipValue: {
    fontSize: 13,
    color: '#687076',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2C2C2C',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 13,
    color: '#687076',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 16,
    backgroundColor: '#E2E6EA',
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#C9A96E',
    borderRadius: 8,
  },
  progressPct: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C9A96E',
    textAlign: 'right',
    marginTop: 4,
  },
  corpsBarBg: {
    height: 10,
    backgroundColor: '#E8DDD0',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 6,
  },
  corpsBarFill: {
    height: '100%',
    backgroundColor: '#C9A96E',
    borderRadius: 5,
  },
  addCorpsBtn: {
    backgroundColor: '#FAF3E6',
    borderWidth: 1,
    borderColor: '#C9A96E',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  addCorpsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8C6D2F',
  },
  gererPhotosBtn: {
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  gererPhotosBtnText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photo: {
    borderRadius: 10,
    backgroundColor: '#F5EDE3',
  },
  marcheRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  marcheLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
  },
  marcheMontant: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },
  marcheStatut: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: '#F5EDE3',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C2C2C',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C2C2C',
  },
  savRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  savObjet: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
  },
  savDesc: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },
  savBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C9A96E',
    marginTop: 5,
  },
  timelineDate: {
    fontSize: 11,
    color: '#687076',
    marginBottom: 2,
  },
  timelineText: {
    fontSize: 13,
    color: '#11181C',
    lineHeight: 18,
  },
  buttonsRow: {
    gap: 10,
    marginTop: 8,
  },
  partagerBtn: {
    backgroundColor: '#2C2C2C',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  partagerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  fermerBtn: {
    backgroundColor: '#F5EDE3',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  fermerBtnText: {
    color: '#2C2C2C',
    fontSize: 15,
    fontWeight: '700',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EDE3',
  },
  corpsInp: {
    backgroundColor: '#F5EDE3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E8DDD0',
    color: '#11181C',
  },
  importDevisBtn: {
    backgroundColor: '#2C2C2C',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  importDevisBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C9A96E',
  },
  devisLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF7F3',
    borderWidth: 1,
    borderColor: '#E8DDD0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    gap: 8,
  },
  devisLinkText: {
    flex: 1,
    fontSize: 11,
    color: '#687076',
  },
  devisLinkAction: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C9A96E',
  },
  importTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F5EDE3',
    borderWidth: 1,
    borderColor: '#E8DDD0',
  },
  importTabActive: {
    backgroundColor: '#2C2C2C',
    borderColor: '#2C2C2C',
  },
  importTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
  },
  importTabTextActive: {
    color: '#C9A96E',
  },
  importTextarea: {
    backgroundColor: '#FAF7F3',
    borderWidth: 1,
    borderColor: '#E8DDD0',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#11181C',
    minHeight: 180,
  },
  detecterBtn: {
    backgroundColor: '#C9A96E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  detecterBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  lotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FAF7F3',
    borderWidth: 1,
    borderColor: '#E8DDD0',
    marginBottom: 6,
    gap: 10,
  },
  lotCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#B0BEC5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotCheckboxChecked: {
    backgroundColor: '#C9A96E',
    borderColor: '#C9A96E',
  },
  lotNom: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#2C2C2C',
  },
  lotMontant: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C9A96E',
  },
  // ── Auto-extraction indicators ──
  autoExtractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAF3E6',
    borderWidth: 1,
    borderColor: '#E8DDD0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  autoExtractText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8C6D2F',
  },
  autoExtractToast: {
    backgroundColor: '#DFF5E1',
    borderWidth: 1,
    borderColor: '#A3D9B0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  autoExtractToastText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#155724',
  },
  // ── Re-analyser button ──
  reanalyserBtn: {
    backgroundColor: '#F5EDE3',
    borderWidth: 1,
    borderColor: '#C9A96E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reanalyserBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C6D2F',
  },
  totalLotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAF7F3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E8DDD0',
  },
  totalLotsLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2C2C2C',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  totalLotsValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8C6D2F',
  },
  deleteAllLotsBtn: {
    backgroundColor: '#FBEFEC',
    borderWidth: 1,
    borderColor: '#E74C3C',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteAllLotsBtnText: {
    fontSize: 12,
    color: '#B83A2E',
    fontWeight: '700',
  },
  // ── Point financier de situation ──
  situationTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 4,
    gap: 6,
  },
  situationColHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C9A96E',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  situationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EDE3',
    gap: 6,
  },
  situationCell: {
    fontSize: 12,
    color: '#687076',
  },
  situationTotals: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8DDD0',
    paddingTop: 8,
  },
  situationTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  situationTotalTTC: {
    backgroundColor: '#2C2C2C',
    borderRadius: 8,
    marginVertical: 4,
  },
  situationTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2C2C2C',
  },
  situationTotalValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2C2C2C',
  },
  factureBtn: {
    backgroundColor: '#2C2C2C',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  factureBtnText: {
    color: '#C9A96E',
    fontSize: 13,
    fontWeight: '800',
  },
  // ── Point financier de situation ──
  pfsSubtitle: {
    fontSize: 11,
    color: '#8C8077',
    marginTop: -6,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  pfsResumeBox: {
    backgroundColor: '#FAF7F3',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  pfsResumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  pfsResumeReste: {
    borderTopWidth: 1,
    borderTopColor: '#E8DDD0',
    paddingTop: 8,
    marginTop: 4,
  },
  pfsResumeLabel: {
    fontSize: 13,
    color: '#687076',
    fontWeight: '600',
  },
  pfsResumeValue: {
    fontSize: 14,
    color: '#2C2C2C',
    fontWeight: '700',
  },
  pfsSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2C2C2C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pfsHistItem: {
    backgroundColor: '#FAF7F3',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#C9A96E',
  },
  pfsHistItemPayee: {
    borderLeftColor: '#2E7D32',
    backgroundColor: '#F1F8F2',
  },
  pfsHistNumero: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C2C2C',
  },
  pfsHistDate: {
    fontSize: 11,
    color: '#8C8077',
    marginTop: 2,
  },
  pfsHistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  pfsHistLabel: {
    fontSize: 12,
    color: '#687076',
  },
  pfsHistMontant: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8C6D2F',
  },
  pfsHistSub: {
    fontSize: 12,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  pfsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pfsBadgePayee: {
    backgroundColor: '#D4EDDA',
  },
  pfsBadgeAttente: {
    backgroundColor: '#FFF3CD',
  },
  pfsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pfsHistActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  pfsActionBtn: {
    backgroundColor: '#E8DDD0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pfsActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2C2C2C',
  },
  pfsActionBtnPay: {
    backgroundColor: '#2E7D32',
  },
  pfsActionBtnUndo: {
    backgroundColor: '#8C8077',
  },
  pfsActionBtnDel: {
    backgroundColor: '#B83A2E',
  },
  pfsBlockedBox: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#F5EDE3',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  pfsBlockedText: {
    fontSize: 12,
    color: '#8C6D2F',
    fontWeight: '600',
    lineHeight: 18,
  },
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DDD0',
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2C2C2C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lotEnCoursCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#F5C242',
  },
  lotBadgeEnCours: {
    backgroundColor: '#F5C242',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  lotBadgeEnCoursText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5A4500',
  },
  lotCommentaireBox: {
    backgroundColor: '#F5EDE3',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#C9A96E',
  },
  lotCommentaireText: {
    fontSize: 12,
    color: '#2C2C2C',
    lineHeight: 17,
  },
});
