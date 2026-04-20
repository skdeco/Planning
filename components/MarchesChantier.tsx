import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, TextInput, Platform, Alert, Image, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_MARCHE_KEY = 'sk_pending_marche_form';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { SignaturePad } from '@/components/SignaturePad';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { useApp } from '@/app/context/AppContext';
import { uploadFileToStorage } from '@/lib/supabase';
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
function todayYMD() { return new Date().toISOString().slice(0, 10); }

export function MarchesChantier({ visible, onClose, chantierId }: Props) {
  const { data, addMarcheChantier, updateMarcheChantier, deleteMarcheChantier, addSupplementMarche, updateSupplementMarche, deleteSupplementMarche } = useApp();
  const router = useRouter();

  const chantier = data.chantiers.find(c => c.id === chantierId);
  const marches = useMemo(() => (data.marchesChantier || []).filter(m => m.chantierId === chantierId), [data.marchesChantier, chantierId]);
  const supplements = useMemo(() => (data.supplementsMarche || []).filter(s => s.chantierId === chantierId), [data.supplementsMarche, chantierId]);
  const apporteurs = data.apporteurs || [];

  // ── Form marché ──
  const [showMarcheForm, setShowMarcheForm] = useState(false);
  const [editMarche, setEditMarche] = useState<MarcheChantier | null>(null);
  const [marcheForm, setMarcheForm] = useState({ libelle: '', montantHT: '', montantTTC: '', dateDevis: '', dateSignature: '' });
  const [marcheDevisInitial, setMarcheDevisInitial] = useState<{ uri: string; nom: string } | null>(null);
  const [marcheDevisSigne, setMarcheDevisSigne] = useState<{ uri: string; nom: string } | null>(null);
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
  const [signatureMarcheId, setSignatureMarcheId] = useState<string | null>(null);

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
        setMarcheForm(saved.marcheForm || { libelle: '', montantHT: '', montantTTC: '', dateDevis: '', dateSignature: '' });
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

  const pickFile = async (label: string): Promise<{ uri: string; nom: string } | null> => {
    if (Platform.OS === 'web') {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.onchange = async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({ uri: reader.result as string, nom: file.name });
          reader.readAsDataURL(file);
        };
        input.click(); setTimeout(() => input.remove(), 60000);
      });
    } else {
      // Mobile : DocumentPicker pour tout type (PDF, images, etc.)
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return null;
      return { uri: result.assets[0].uri, nom: result.assets[0].name || `${label}_${Date.now()}` };
    }
  };

  const uploadIfNeeded = async (file: { uri: string; nom: string } | null, folder: string): Promise<{ uri?: string; nom?: string }> => {
    if (!file) return {};
    const fileId = genId('doc');
    const url = await uploadFileToStorage(file.uri, `chantiers/${chantierId}/${folder}`, fileId);
    return { uri: url || file.uri, nom: file.nom };
  };

  // ── Marché ──
  const openNewMarche = () => {
    setEditMarche(null);
    setMarcheForm({ libelle: 'Marché initial', montantHT: '', montantTTC: '', dateDevis: todayYMD(), dateSignature: '' });
    setMarcheDevisInitial(null);
    setMarcheDevisSigne(null);
    setCommissionEnabled(false);
    setCommissionForm({ apporteurId: '', modeCommission: 'pourcentage', valeur: '', baseCalcul: 'HT', statut: 'a_payer', datePaiement: '', note: '' });
    setShowMarcheForm(true);
  };
  const openEditMarche = (m: MarcheChantier) => {
    setEditMarche(m);
    setMarcheForm({
      libelle: m.libelle,
      montantHT: String(m.montantHT),
      montantTTC: String(m.montantTTC),
      dateDevis: m.dateDevis || '',
      dateSignature: m.dateSignature || '',
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
      paiements: editMarche?.paiements || [],
      commission,
      createdAt: editMarche?.createdAt || now,
      updatedAt: now,
    };
    if (editMarche) updateMarcheChantier(m); else addMarcheChantier(m);
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
  const openNewSupp = () => {
    setEditSupp(null);
    setSuppForm({ libelle: '', description: '', montantHT: '', montantTTC: '', statut: 'en_attente', dateProposition: todayYMD(), dateAccord: '' });
    setSuppDevis(null);
    setSuppFacture(null);
    setShowSuppForm(true);
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E6EA' }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#11181C' }}>💼 Marchés</Text>
              <Text style={{ fontSize: 12, color: '#687076' }}>{chantier?.nom}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#687076', fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>

          {/* Récap */}
          <View style={{ flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#F8F9FA' }}>
            <View style={{ flex: 1, backgroundColor: '#EBF0FF', borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 10, color: '#687076', fontWeight: '600' }}>TOTAL DÛ TTC</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2C2C' }}>{fmt(totalDu)} €</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#D4EDDA', borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 10, color: '#155724', fontWeight: '600' }}>REÇU</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#155724' }}>{fmt(totalRecu)} €</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: reste > 0 ? '#FEF2F2' : reste === 0 ? '#D4EDDA' : '#EBF0FF', borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 10, color: '#687076', fontWeight: '600' }}>{reste < 0 ? 'TROP-PERÇU' : 'RESTE'}</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: reste > 0 ? '#DC2626' : reste === 0 ? '#155724' : '#2C2C2C' }}>{reste === 0 ? 'Soldé ✓' : `${fmt(Math.abs(reste))} €`}</Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
            {/* ── MARCHÉS ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C' }}>📋 Marchés ({marches.length})</Text>
              <Pressable style={{ backgroundColor: '#2C2C2C', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={openNewMarche}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>+ Marché</Text>
              </Pressable>
            </View>
            {marches.length === 0 && (
              <Text style={{ fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>Aucun marché</Text>
            )}
            {marches.map(m => {
              const totalRecuM = m.paiements.reduce((s, p) => s + p.montant, 0);
              const resteM = m.montantTTC - totalRecuM;
              const isOpen = openMarcheId === m.id;
              return (
                <View key={m.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E6EA' }}>
                  <Pressable onPress={() => setOpenMarcheId(isOpen ? null : m.id)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C' }}>{m.libelle}</Text>
                        <Text style={{ fontSize: 11, color: '#687076', marginTop: 2 }}>{fmt(m.montantHT)} € HT · {fmt(m.montantTTC)} € TTC</Text>
                        <Text style={{ fontSize: 11, color: resteM > 0 ? '#DC2626' : '#27AE60', fontWeight: '600', marginTop: 2 }}>
                          Reçu : {fmt(totalRecuM)} € · Reste : {fmt(resteM)} €
                        </Text>
                        {m.dateSignature && <Text style={{ fontSize: 10, color: '#27AE60', marginTop: 2 }}>✓ Signé le {m.dateSignature}</Text>}
                        {m.commission && (() => {
                          const app = apporteurs.find(a => a.id === m.commission!.apporteurId);
                          const montantC = getCommissionAmount(m);
                          const suffixe = m.commission!.modeCommission === 'pourcentage'
                            ? ` (${m.commission!.valeur}% ${m.commission!.baseCalcul || 'HT'})`
                            : '';
                          return (
                            <View style={{ backgroundColor: '#FAF3E6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6, borderLeftWidth: 3, borderLeftColor: '#C9A96E', alignSelf: 'flex-start' }}>
                              <Text style={{ fontSize: 10, color: '#8C6D2F', fontWeight: '700' }}>
                                💼 {app ? `${app.prenom} ${app.nom}` : 'Apporteur'} — {fmt(montantC)} €{suffixe} — {m.commission!.statut === 'paye' ? '✓ Payé' : '⏳ À payer'}
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                      <Text style={{ fontSize: 14, color: '#687076' }}>{isOpen ? '▾' : '▸'}</Text>
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F5EDE3' }}>
                      {/* Documents */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        {m.devisInitialUri ? (
                          <View style={{ flex: 1, backgroundColor: '#EBF0FF', borderRadius: 6, position: 'relative' }}>
                            <Pressable style={{ padding: 8, alignItems: 'center' }} onPress={() => openDoc(m.devisInitialUri)}>
                              <Text style={{ fontSize: 16 }}>📄</Text>
                              <Text style={{ fontSize: 9, color: '#2C2C2C', fontWeight: '600' }} numberOfLines={1}>Devis initial</Text>
                            </Pressable>
                            <Pressable
                              style={{ position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#D94F4F', alignItems: 'center', justifyContent: 'center' }}
                              onPress={() => {
                                const doDelete = () => updateMarcheChantier({ ...m, devisInitialUri: undefined, devisInitialNom: undefined });
                                if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm('Supprimer le devis initial ?')) doDelete(); }
                                else Alert.alert('Supprimer', 'Supprimer le devis initial ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]);
                              }}>
                              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>✕</Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {m.devisSigneUri ? (
                          <View style={{ flex: 1, backgroundColor: '#D4EDDA', borderRadius: 6, position: 'relative' }}>
                            <Pressable style={{ padding: 8, alignItems: 'center' }} onPress={() => openDoc(m.devisSigneUri)}>
                              <Text style={{ fontSize: 16 }}>✍️</Text>
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
                        ) : null}
                      </View>

                      {/* Paiements */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#687076' }}>Acomptes ({m.paiements.length})</Text>
                        <Pressable style={{ backgroundColor: '#27AE60', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }} onPress={() => openPaiementForm('marche', m.id)}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>+ Acompte</Text>
                        </Pressable>
                      </View>
                      {m.paiements.map(p => {
                        const modeLabel = MODES_PAIEMENT.find(x => x.value === p.mode)?.label || p.mode;
                        const hasCommission = !!m.commission && p.commissionMontant && p.commissionMontant > 0;
                        return (
                          <View key={p.id} style={{ backgroundColor: '#F8F9FA', borderRadius: 6, padding: 8, marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#27AE60' }}>{fmt(p.montant)} €</Text>
                                <Text style={{ fontSize: 10, color: '#687076' }}>{p.date} · {modeLabel}{p.reference ? ` · ${p.reference}` : ''}</Text>
                                {p.note && <Text style={{ fontSize: 10, color: '#687076', fontStyle: 'italic' }}>{p.note}</Text>}
                              </View>
                              {p.factureUri && (
                                <Pressable onPress={() => openDoc(p.factureUri)} style={{ backgroundColor: '#EBF0FF', borderRadius: 6, padding: 6 }}>
                                  <Text style={{ fontSize: 10, color: '#1A3A6B', fontWeight: '700' }}>📄 Acompte</Text>
                                </Pressable>
                              )}
                              {p.commissionFactureUri && (
                                <Pressable onPress={() => openDoc(p.commissionFactureUri)} style={{ backgroundColor: '#FAF3E6', borderRadius: 6, padding: 6 }}>
                                  <Text style={{ fontSize: 10, color: '#8C6D2F', fontWeight: '700' }}>💼 Commission</Text>
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
                                  {p.commissionPaye ? '✅ Commission payée' : '💼 Commission à payer'} — {fmt(p.commissionMontant || 0)} €
                                </Text>
                                <Text style={{ fontSize: 9, color: p.commissionPaye ? '#155724' : '#856404', fontStyle: 'italic' }}>
                                  (tapez pour basculer)
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}

                      {/* Signature client */}
                      {m.signatureClientUri ? (
                        <View style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600', marginBottom: 4 }}>✍️ Signé par le client le {m.signatureClientDate ? new Date(m.signatureClientDate).toLocaleDateString('fr-FR') : ''}</Text>
                          <Image source={{ uri: m.signatureClientUri }} style={{ width: 200, height: 80, borderRadius: 6, borderWidth: 1, borderColor: '#E2E6EA' }} resizeMode="contain" />
                        </View>
                      ) : (
                        <Pressable style={{ backgroundColor: '#FFF3CD', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#FFE082' }}
                          onPress={() => setSignatureMarcheId(m.id)}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#856404' }}>✍️ Faire signer le client</Text>
                        </Pressable>
                      )}

                      {/* Actions marché */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <Pressable style={{ flex: 1, backgroundColor: '#F5EDE3', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => openEditMarche(m)}>
                          <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>✏️ Modifier</Text>
                        </Pressable>
                        <Pressable style={{ flex: 1, backgroundColor: '#FEF2F2', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => handleDeleteMarche(m)}>
                          <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>🗑 Supprimer</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* ── SUPPLÉMENTS ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2C' }}>➕ Suppléments ({supplements.length})</Text>
              <Pressable style={{ backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={openNewSupp}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>+ Supplément</Text>
              </Pressable>
            </View>
            {supplements.length === 0 && (
              <Text style={{ fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>Aucun supplément</Text>
            )}
            {supplements.map(s => {
              const totalRecuS = s.paiements.reduce((sum, p) => sum + p.montant, 0);
              const resteS = s.montantTTC - totalRecuS;
              const isOpen = openSuppId === s.id;
              const statutColor = s.statut === 'accepte' ? '#27AE60' : s.statut === 'refuse' ? '#E74C3C' : '#F59E0B';
              const statutLabel = s.statut === 'accepte' ? '✓ Accepté' : s.statut === 'refuse' ? '✗ Refusé' : '⏳ En attente';
              return (
                <View key={s.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E6EA', borderLeftWidth: 4, borderLeftColor: statutColor }}>
                  <Pressable onPress={() => setOpenSuppId(isOpen ? null : s.id)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C' }}>{s.libelle}</Text>
                        <Text style={{ fontSize: 11, color: '#687076', marginTop: 2 }}>{fmt(s.montantHT)} € HT · {fmt(s.montantTTC)} € TTC</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={{ backgroundColor: statutColor + '22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: statutColor, fontWeight: '700' }}>{statutLabel}</Text>
                          </View>
                          {s.statut === 'accepte' && (
                            <Text style={{ fontSize: 10, color: resteS > 0 ? '#DC2626' : '#27AE60', fontWeight: '600' }}>Reçu : {fmt(totalRecuS)} € · Reste : {fmt(resteS)} €</Text>
                          )}
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, color: '#687076' }}>{isOpen ? '▾' : '▸'}</Text>
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F5EDE3' }}>
                      {s.description && (
                        <Text style={{ fontSize: 12, color: '#11181C', marginBottom: 8 }}>{s.description}</Text>
                      )}
                      {/* Documents */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        {s.devisUri ? (
                          <Pressable style={{ flex: 1, backgroundColor: '#EBF0FF', borderRadius: 6, padding: 8, alignItems: 'center' }} onPress={() => openDoc(s.devisUri)}>
                            <Text style={{ fontSize: 16 }}>📄</Text>
                            <Text style={{ fontSize: 9, color: '#2C2C2C', fontWeight: '600' }} numberOfLines={1}>Devis</Text>
                          </Pressable>
                        ) : null}
                        {s.factureUri ? (
                          <Pressable style={{ flex: 1, backgroundColor: '#FFF3CD', borderRadius: 6, padding: 8, alignItems: 'center' }} onPress={() => openDoc(s.factureUri)}>
                            <Text style={{ fontSize: 16 }}>🧾</Text>
                            <Text style={{ fontSize: 9, color: '#856404', fontWeight: '600' }} numberOfLines={1}>Facture</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {/* Paiements (si accepté) */}
                      {s.statut === 'accepte' && (
                        <>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#687076' }}>Règlements ({s.paiements.length})</Text>
                            <Pressable style={{ backgroundColor: '#27AE60', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }} onPress={() => openPaiementForm('supplement', s.id)}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>+ Règlement</Text>
                            </Pressable>
                          </View>
                          {s.paiements.map(p => {
                            const modeLabel = MODES_PAIEMENT.find(x => x.value === p.mode)?.label || p.mode;
                            return (
                              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 6, padding: 8, marginBottom: 4, gap: 6 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#27AE60' }}>{fmt(p.montant)} €</Text>
                                  <Text style={{ fontSize: 10, color: '#687076' }}>{p.date} · {modeLabel}{p.reference ? ` · ${p.reference}` : ''}</Text>
                                </View>
                                {p.factureUri && (
                                  <Pressable onPress={() => openDoc(p.factureUri)}>
                                    <Text style={{ fontSize: 14 }}>📎</Text>
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
                        <Pressable style={{ flex: 1, backgroundColor: '#F5EDE3', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => openEditSupp(s)}>
                          <Text style={{ fontSize: 11, color: '#2C2C2C', fontWeight: '600' }}>✏️ Modifier</Text>
                        </Pressable>
                        <Pressable style={{ flex: 1, backgroundColor: '#FEF2F2', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => handleDeleteSupp(s)}>
                          <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>🗑 Supprimer</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── Modal Form Marché ── */}
      <ModalKeyboard visible={showMarcheForm} animationType="fade" transparent onRequestClose={() => setShowMarcheForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowMarcheForm(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 12 }}>{editMarche ? 'Modifier le marché' : 'Nouveau marché'}</Text>
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

              <Text style={lbl}>📄 Devis initial</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('devis'); if (f) setMarcheDevisInitial(f); }}>
                <Text style={{ fontSize: 12, color: '#2C2C2C', fontWeight: '600' }}>{marcheDevisInitial ? `📎 ${marcheDevisInitial.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>

              <Text style={lbl}>✍️ Devis signé</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('devis-signe'); if (f) setMarcheDevisSigne(f); }}>
                <Text style={{ fontSize: 12, color: '#2C2C2C', fontWeight: '600' }}>{marcheDevisSigne ? `📎 ${marcheDevisSigne.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>

              {/* ── Commission apporteur ── */}
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#E8DDD0', paddingTop: 12 }}>
                <Pressable
                  onPress={() => setCommissionEnabled(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: commissionEnabled ? '#FAF3E6' : '#F5EDE3', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: commissionEnabled ? '#C9A96E' : '#E8DDD0' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2C' }}>
                    💼 Commission apporteur / architecte
                  </Text>
                  <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: commissionEnabled ? '#C9A96E' : '#B0BEC5', justifyContent: 'center', paddingHorizontal: 2 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: commissionEnabled ? 'flex-end' : 'flex-start' }} />
                  </View>
                </Pressable>

                {commissionEnabled && (
                  <View style={{ marginTop: 10, backgroundColor: '#FFFEFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E8DDD0' }}>
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
                        style={{ backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#C9A96E', borderStyle: 'dashed', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 }}
                      >
                        <Text style={{ fontSize: 12, color: '#8C6D2F', fontWeight: '600' }}>
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
                                borderColor: commissionForm.apporteurId === a.id ? '#C9A96E' : '#E8DDD0',
                                backgroundColor: commissionForm.apporteurId === a.id ? '#C9A96E' : '#F5EDE3',
                              }}
                              onPress={() => setCommissionForm(f => ({ ...f, apporteurId: a.id }))}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: commissionForm.apporteurId === a.id ? '#fff' : '#2C2C2C' }}>
                                {a.type === 'architecte' ? '🏛' : '🤝'} {a.prenom} {a.nom}
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
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9A96E', backgroundColor: '#FAF3E6' }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#8C6D2F' }}>+ Ajouter</Text>
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
                            backgroundColor: commissionForm.modeCommission === mode ? '#C9A96E' : '#F5EDE3',
                            borderColor: commissionForm.modeCommission === mode ? '#C9A96E' : '#E8DDD0',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: commissionForm.modeCommission === mode ? '#fff' : '#687076' }}>
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
                                backgroundColor: commissionForm.baseCalcul === b ? '#C9A96E' : '#F5EDE3',
                                borderColor: commissionForm.baseCalcul === b ? '#C9A96E' : '#E8DDD0',
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: commissionForm.baseCalcul === b ? '#fff' : '#687076' }}>
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
                            backgroundColor: commissionForm.statut === st ? (st === 'paye' ? '#D4EDDA' : '#FFF3CD') : '#F5EDE3',
                            borderColor: commissionForm.statut === st ? (st === 'paye' ? '#27AE60' : '#F59E0B') : '#E8DDD0',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: commissionForm.statut === st ? (st === 'paye' ? '#155724' : '#856404') : '#687076' }}>
                            {st === 'a_payer' ? '⏳ À payer' : '✓ Payé'}
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
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 12 }}>{editSupp ? 'Modifier le supplément' : 'Nouveau supplément'}</Text>
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
                      { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E6EA', alignItems: 'center', backgroundColor: '#F5EDE3' },
                      suppForm.statut === st && { backgroundColor: st === 'accepte' ? '#D4EDDA' : st === 'refuse' ? '#FEF2F2' : '#FFF3CD', borderColor: st === 'accepte' ? '#27AE60' : st === 'refuse' ? '#E74C3C' : '#F59E0B' },
                    ]}
                    onPress={() => setSuppForm(f => ({ ...f, statut: st }))}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: suppForm.statut === st ? (st === 'accepte' ? '#155724' : st === 'refuse' ? '#DC2626' : '#856404') : '#687076' }}>
                      {st === 'en_attente' ? '⏳ En attente' : st === 'accepte' ? '✓ Accepté' : '✗ Refusé'}
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

              <Text style={lbl}>📄 Devis</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('devis'); if (f) setSuppDevis(f); }}>
                <Text style={{ fontSize: 12, color: '#2C2C2C', fontWeight: '600' }}>{suppDevis ? `📎 ${suppDevis.nom}` : '+ Choisir un fichier'}</Text>
              </Pressable>

              <Text style={lbl}>🧾 Facture</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('facture'); if (f) setSuppFacture(f); }}>
                <Text style={{ fontSize: 12, color: '#2C2C2C', fontWeight: '600' }}>{suppFacture ? `📎 ${suppFacture.nom}` : '+ Choisir un fichier'}</Text>
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
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#11181C', marginBottom: 12 }}>💰 Nouveau paiement</Text>
              <Text style={lbl}>Date</Text>
              <TextInput style={inp} value={paiementForm.date} onChangeText={v => setPaiementForm(f => ({ ...f, date: v }))} placeholder="2026-04-09" />
              <Text style={lbl}>Montant (€) *</Text>
              <TextInput style={inp} value={paiementForm.montant} onChangeText={v => setPaiementForm(f => ({ ...f, montant: v }))} keyboardType="decimal-pad" placeholder="2500" />
              <Text style={lbl}>Mode de paiement</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {MODES_PAIEMENT.map(m => (
                  <Pressable key={m.value} style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#E2E6EA', backgroundColor: '#F5EDE3' }, paiementForm.mode === m.value && { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' }]} onPress={() => setPaiementForm(f => ({ ...f, mode: m.value }))}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: paiementForm.mode === m.value ? '#fff' : '#687076' }}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={lbl}>Référence (n° chèque, virement...)</Text>
              <TextInput style={inp} value={paiementForm.reference} onChangeText={v => setPaiementForm(f => ({ ...f, reference: v }))} placeholder="Ex: 123456" />
              <Text style={lbl}>Note</Text>
              <TextInput style={inp} value={paiementForm.note} onChangeText={v => setPaiementForm(f => ({ ...f, note: v }))} placeholder="Note libre" />
              <Text style={lbl}>📎 Facture d'acompte</Text>
              <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('facture'); if (f) setPaiementFacture(f); }}>
                <Text style={{ fontSize: 12, color: '#2C2C2C', fontWeight: '600' }}>{paiementFacture ? `📎 ${paiementFacture.nom}` : '+ Choisir un fichier'}</Text>
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
                  <View style={{ marginTop: 14, backgroundColor: '#FAF3E6', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#C9A96E', borderLeftWidth: 4, borderLeftColor: '#C9A96E' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#8C6D2F' }}>
                      💼 Commission due sur cet acompte : {fmt(commissionDue)} €
                    </Text>
                    <Text style={{ fontSize: 11, color: '#8C6D2F', marginTop: 2 }}>
                      ({apporteurNom}{m.commission.modeCommission === 'pourcentage' ? ` — ${m.commission.valeur}%` : ''})
                    </Text>
                    <Text style={lbl}>📄 Facture commission (optionnel)</Text>
                    <Pressable style={fileBtn} onPress={async () => { const f = await pickFile('facture-commission'); if (f) setPaiementCommissionFacture(f); }}>
                      <Text style={{ fontSize: 12, color: '#2C2C2C', fontWeight: '600' }}>{paiementCommissionFacture ? `📎 ${paiementCommissionFacture.nom}` : '+ Choisir un fichier'}</Text>
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
                        borderColor: paiementCommissionPaye ? '#27AE60' : '#E8DDD0',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: paiementCommissionPaye ? '#155724' : '#687076' }}>
                        {paiementCommissionPaye ? '✅ Commission payée à l\'apporteur' : '⏳ Commission à payer'}
                      </Text>
                      <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: paiementCommissionPaye ? '#27AE60' : '#B0BEC5', justifyContent: 'center', paddingHorizontal: 2 }}>
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
      {/* ── Modal Signature Client ── */}
      <Modal visible={signatureMarcheId !== null} transparent animationType="fade" onRequestClose={() => setSignatureMarcheId(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C', marginBottom: 4 }}>✍️ Signature client</Text>
            <Text style={{ fontSize: 12, color: '#687076', marginBottom: 8 }}>{chantier?.nom} — {marches.find(m => m.id === signatureMarcheId)?.libelle}</Text>
            <View style={{ backgroundColor: '#FFF3CD', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FFE082' }}>
              <Text style={{ fontSize: 11, color: '#856404', lineHeight: 16 }}>
                En apposant ma signature ci-dessous, je reconnais avoir pris connaissance et accepté le devis référencé ci-joint, établi par SK DECO, pour les travaux décrits dans ledit document. Je m'engage à régler les sommes indiquées selon les modalités convenues.
              </Text>
              <Text style={{ fontSize: 10, color: '#856404', marginTop: 6, fontStyle: 'italic' }}>
                Fait le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <SignaturePad
              width={280}
              height={140}
              onCancel={() => setSignatureMarcheId(null)}
              onSave={async (base64) => {
                const m = marches.find(x => x.id === signatureMarcheId);
                if (!m) return;
                let uri = base64;
                if (base64.startsWith('data:')) {
                  const uploaded = await uploadFileToStorage(base64, `chantiers/${chantierId}/signatures`, `sig_${m.id}`);
                  if (uploaded) uri = uploaded;
                }
                updateMarcheChantier({ ...m, signatureClientUri: uri, signatureClientDate: new Date().toISOString(), updatedAt: new Date().toISOString() });
                setSignatureMarcheId(null);
              }}
            />
          </View>
        </View>
      </Modal>
    </ModalKeyboard>
  );
}

const lbl ={ fontSize: 12, fontWeight: '600' as const, color: '#687076', marginBottom: 4, marginTop: 8 };
const inp = { backgroundColor: '#F5EDE3', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 4, color: '#11181C' };
const fileBtn = { backgroundColor: '#EBF0FF', borderWidth: 1, borderColor: '#D0D8E8', borderRadius: 8, padding: 12, alignItems: 'center' as const, marginBottom: 4 };
const saveBtn = { backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 14, alignItems: 'center' as const, marginTop: 16 };
