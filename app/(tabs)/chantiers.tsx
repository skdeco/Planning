import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, ScrollView, Alert, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import {
  METIER_COLORS, STATUT_LABELS, STATUT_COLORS, CHANTIER_COLORS,
  type Chantier, type StatutChantier, type FicheChantier, type NoteChantier, type PlanChantier,
} from '@/app/types';
import { DatePicker } from '@/components/DatePicker';
import { uploadFileToStorage } from '@/lib/supabase';

const STATUTS: StatutChantier[] = ['actif', 'en_attente', 'termine', 'en_pause'];

function genId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

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
  adresse: string;
  dateDebut: string;
  dateFin: string;
  statut: StatutChantier;
  couleur: string;
  employeIds: string[];
  visibleSurPlanning: boolean;
}

const DEFAULT_FORM: ChantierForm = {
  nom: '',
  adresse: '',
  dateDebut: '',
  dateFin: '',
  statut: 'actif',
  couleur: CHANTIER_COLORS[0],
  employeIds: [],
  visibleSurPlanning: true,
};

export default function ChantiersScreen() {
  const { data, currentUser, isHydrated, addChantier, updateChantier, deleteChantier, upsertFicheChantier, addNoteChantier, archiveNoteChantier, deleteNoteChantier, deleteNoteChantierArchivee, addPlanChantier, deletePlanChantier } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login');
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';
  const [exportingId, setExportingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ChantierForm>(DEFAULT_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  // Protection contre la perte de données si refresh pendant édition
  useUnsavedChanges(showForm && form.nom.trim().length > 0);

  // Fiche chantier unifiée (fiche + modifier)
  const [showFiche, setShowFiche] = useState(false);
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [fiche, setFiche] = useState<FicheChantier>(FICHE_VIDE);
  const [ficheOnglet, setFicheOnglet] = useState<'fiche' | 'modifier'>('fiche');

  const openFicheUnifiee = (chantier: Chantier) => {
    setFicheId(chantier.id);
    setFiche(chantier.fiche ? { ...chantier.fiche } : { ...FICHE_VIDE });
    setEditId(chantier.id);
    setForm({
      nom: chantier.nom,
      adresse: chantier.adresse,
      dateDebut: chantier.dateDebut,
      dateFin: chantier.dateFin,
      statut: chantier.statut,
      couleur: chantier.couleur,
      employeIds: [...chantier.employeIds],
      visibleSurPlanning: chantier.visibleSurPlanning,
    });
    setFicheOnglet('fiche');
    setShowFiche(true);
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

  const handlePickPlan = () => {
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
          const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const chantierId = plansChantierId || 'general';
          const storageUrl = await uploadFileToStorage(base64, `chantiers/${chantierId}/plans`, planId);
          if (storageUrl) {
            setNewPlanFichier(storageUrl);
          } else {
            if (Platform.OS === 'web') alert('Erreur lors de l\'upload du fichier. Veuillez réessayer.');
            else Alert.alert('Erreur', 'Erreur lors de l\'upload du fichier. Veuillez réessayer.');
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
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
  const [notePieceJointe, setNotePieceJointe] = useState<{ uri: string; nom: string; type: 'image' | 'pdf' } | null>(null);

  const openNotes = (chantier: Chantier) => {
    setNotesChantierId(chantier.id);
    setNewNoteTexte('');
    setNoteDestinataires('tous');
    setNotesOnglet('actives');
    setNotePieceJointe(null);
    setShowNotes(true);
  };

  const handlePickNotePJ = () => {
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
          const type = file.type.startsWith('image') ? 'image' : 'pdf';
          const pjId = `note_pj_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const chantierId = notesChantierId || 'general';
          const storageUrl = await uploadFileToStorage(base64, `chantiers/${chantierId}/notes`, pjId);
          if (storageUrl) {
            setNotePieceJointe({ uri: storageUrl, nom: file.name, type });
          } else {
            if (Platform.OS === 'web') alert('Erreur lors de l\'upload. Veuillez réessayer.');
            else Alert.alert('Erreur', 'Erreur lors de l\'upload. Veuillez réessayer.');
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  };

  const handleAddNote = () => {
    // Valider si texte OU photo(s) présents
    const hasPhotos = notePieceJointe !== null;
    if (!hasPhotos && !newNoteTexte.trim()) return;
    if (!notesChantierId) return;
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    const nom = currentUser?.role === 'admin' ? 'Admin' : (data.employes.find(e => e.id === userId)?.prenom || data.sousTraitants?.find(s => s.id === userId)?.nom || 'Inconnu');
    // Convertir notePieceJointe en photos[] pour qu'elle soit stockée dans la note ET dans la galerie
    const photosNote: string[] = notePieceJointe ? [notePieceJointe.uri] : [];
    addNoteChantier({
      id: `nc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      chantierId: notesChantierId,
      auteurId: userId,
      auteurNom: nom,
      texte: newNoteTexte.trim(),
      createdAt: new Date().toISOString(),
      destinataires: isAdmin ? noteDestinataires : 'tous',
      archivedBy: [],
      photos: photosNote.length > 0 ? photosNote : undefined,
      ...(notePieceJointe ? {
        pieceJointe: notePieceJointe.uri,
        pieceJointeNom: notePieceJointe.nom,
        pieceJointeType: notePieceJointe.type,
      } : {}),
    });
    setNewNoteTexte('');
    setNoteDestinataires('tous');
    setNotePieceJointe(null);
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
      adresse: chantier.adresse,
      dateDebut: chantier.dateDebut,
      dateFin: chantier.dateFin,
      statut: chantier.statut,
      couleur: chantier.couleur,
      employeIds: [...chantier.employeIds],
      visibleSurPlanning: chantier.visibleSurPlanning,
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

  const handleSave = async () => {
    if (!form.nom.trim()) return;
    const existing = editId ? data.chantiers.find(c => c.id === editId) : null;
    // Géocoder l'adresse si elle a changé
    let coords = existing ? { latitude: existing.latitude, longitude: existing.longitude } : null;
    if (form.adresse.trim() && (!existing || form.adresse.trim() !== existing.adresse)) {
      coords = await geocodeAddress(form.adresse.trim());
    }
    if (editId) {
      updateChantier({
        id: editId,
        nom: form.nom.trim(),
        adresse: form.adresse.trim(),
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
        statut: form.statut,
        couleur: form.couleur,
        employeIds: form.employeIds,
        visibleSurPlanning: form.visibleSurPlanning,
        fiche: existing?.fiche,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      });
    } else {
      addChantier({
        id: genId(),
        nom: form.nom.trim(),
        adresse: form.adresse.trim(),
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
        statut: form.statut,
        couleur: form.couleur,
        employeIds: form.employeIds,
        visibleSurPlanning: form.visibleSurPlanning,
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

  const handlePickPhoto = async () => {
    const uploadAndAddFichePhoto = async (base64Uri: string) => {
      const photoId = `fiche_photo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      // On ne connaît pas encore le chantierId ici (création en cours), on utilise 'fiche'
      const storageUrl = await uploadFileToStorage(base64Uri, 'chantiers/fiche/photos', photoId);
      if (storageUrl) {
        setFiche(f => ({ ...f, photos: [...f.photos, storageUrl] }));
      } else {
        if (Platform.OS === 'web') alert('Erreur lors de l\'upload de la photo. Veuillez réessayer.');
        else Alert.alert('Erreur', 'Erreur lors de l\'upload de la photo. Veuillez réessayer.');
      }
    };
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          await uploadAndAddFichePhoto(reader.result as string);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        await uploadAndAddFichePhoto(uri);
      }
    }
  };

  const removePhoto = (idx: number) => {
    setFiche(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
  };

  const renderChantier = ({ item }: { item: Chantier }) => {
    const statut = STATUT_COLORS[item.statut];
    const assignedEmps = data.employes.filter(e => item.employeIds.includes(e.id));
    const hasFiche = item.fiche && (
      item.fiche.codeAcces || item.fiche.emplacementCle || item.fiche.codeAlarme ||
      item.fiche.contacts || item.fiche.notes || item.fiche.photos.length > 0
    );
    const notesActives = getNotesActives(item.id);
    const hasNotes = notesActives.length > 0;

    return (
      <View style={[styles.card, { borderLeftColor: item.couleur }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName}>{item.nom}</Text>
            <View style={[styles.statutBadge, { backgroundColor: statut.bg }]}>
              <Text style={[styles.statutText, { color: statut.text }]}>
                {STATUT_LABELS[item.statut]}
              </Text>
            </View>
          </View>
          <View style={styles.cardActions}>
            {/* Bouton notes avec badge */}
            <Pressable style={styles.actionBtn} onPress={() => openNotes(item)}>
              <View style={{ position: 'relative' }}>
                <Text style={[styles.actionBtnNote, hasNotes && styles.actionBtnNoteActive]}>📝</Text>
                {hasNotes && (
                  <View style={styles.noteBadge}>
                    <Text style={styles.noteBadgeText}>{notesActives.length}</Text>
                  </View>
                )}
              </View>
            </Pressable>
            {/* Bouton Plans */}
            <Pressable style={styles.actionBtn} onPress={() => openPlans(item)}>
              <View style={{ position: 'relative' }}>
                <Text style={[styles.actionBtnFiche, (item.fiche?.plans?.length ?? 0) > 0 && styles.actionBtnFicheActive]}>📍</Text>
                {(item.fiche?.plans?.length ?? 0) > 0 && (
                  <View style={styles.noteBadge}>
                    <Text style={styles.noteBadgeText}>{item.fiche!.plans!.length}</Text>
                  </View>
                )}
              </View>
            </Pressable>
            {/* Bouton Fiche Chantier unifié (fiche + modifier) */}
            <Pressable style={styles.actionBtn} onPress={() => openFicheUnifiee(item)}>
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.actionBtnFiche, hasFiche && styles.actionBtnFicheActive]}>🪪</Text>
              </View>
            </Pressable>
            {isAdmin && item.statut !== 'termine' && (
              <Pressable
                style={[styles.actionBtn, exportingId === item.id && { opacity: 0.5 }]}
                onPress={() => handleClotureChantier(item)}
                disabled={exportingId === item.id}
              >
                <Text style={{ fontSize: 18 }}>{exportingId === item.id ? '⏳' : '📦'}</Text>
              </Pressable>
            )}
            {isAdmin && (
              <Pressable style={styles.actionBtn} onPress={() => handleDelete(item.id, item.nom)}>
                <Text style={styles.actionBtnDelete}>🗑</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>📍 {item.adresse || '—'}</Text>
          <Text style={styles.cardMetaText}>🕐 {item.dateDebut} → {item.dateFin}</Text>
        </View>

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

        {hasFiche && (
          <Pressable style={styles.fichePreviewBtn} onPress={() => openFiche(item)}>
            <Text style={styles.fichePreviewText}>{t.common.viewFiche}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]">
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.chantiers.title}</Text>
        {isAdmin && (
          <Pressable style={styles.newBtn} onPress={openNew}>
            <Text style={styles.newBtnText}>{t.common.new}</Text>
          </Pressable>
        )}
      </View>

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

      <FlatList
        data={searchQuery.trim() ? data.chantiers.filter(c => {
          const q = searchQuery.toLowerCase().trim();
          return c.nom.toLowerCase().includes(q) || (c.adresse || '').toLowerCase().includes(q) || (c.ville || '').toLowerCase().includes(q);
        }) : data.chantiers}
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

      {/* ── Modal formulaire chantier (admin) ── */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowForm(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
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

              <FormField label={t.common.address}>
                <TextInput
                  style={styles.input}
                  value={form.adresse}
                  onChangeText={v => setForm(f => ({ ...f, adresse: v }))}
                  placeholder="Ex: 12 rue des Lilas, Paris"
                  placeholderTextColor="#B0BEC5"
                  returnKeyType="next"
                />
              </FormField>

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
                        <Text style={[styles.empAvatarText, { color: mc.textColor }]}>{emp.prenom[0]}</Text>
                      </View>
                      <Text style={styles.empRowName}>{emp.prenom} {emp.nom}</Text>
                      <Text style={styles.empRowMetier}>{mc.label}</Text>
                      {selected && <Text style={styles.empCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </FormField>

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
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, !form.nom.trim() && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!form.nom.trim()}
            >
              <Text style={styles.saveBtnText}>{editId ? t.common.save : t.chantiers.add}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Fiche Chantier Unifié (Fiche + Modifier) ── */}
      <Modal visible={showFiche} animationType="slide" transparent onRequestClose={() => setShowFiche(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFiche(false)}>
          <Pressable style={styles.modalSheetFiche} onPress={e => e.stopPropagation()}>
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

            {/* Onglets Fiche / Modifier */}
            <View style={styles.noteTabRow}>
              <Pressable
                style={[styles.noteTab, ficheOnglet === 'fiche' && styles.noteTabActive]}
                onPress={() => setFicheOnglet('fiche')}
              >
                <Text style={[styles.noteTabText, ficheOnglet === 'fiche' && styles.noteTabTextActive]}>
                  {t.chantiers.ficheTitle}
                </Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  style={[styles.noteTab, ficheOnglet === 'modifier' && styles.noteTabActive]}
                  onPress={() => setFicheOnglet('modifier')}
                >
                  <Text style={[styles.noteTabText, ficheOnglet === 'modifier' && styles.noteTabTextActive]}>
                    {t.common.edit}
                  </Text>
                </Pressable>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {ficheOnglet === 'fiche' ? (
                <>
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
                    const isPdf = uri.startsWith('data:application/pdf');
                    return (
                      <View key={idx} style={styles.photoWrap}>
                        {isPdf ? (
                          <Pressable
                            style={styles.pdfThumb}
                            onPress={() => {
                              if (Platform.OS === 'web') {
                                const w = window.open();
                                if (w) { w.document.write(`<iframe src="${uri}" width="100%" height="100%"></iframe>`); }
                              }
                            }}
                          >
                            <Text style={styles.pdfThumbIcon}>📄</Text>
                            <Text style={styles.pdfThumbText}>PDF</Text>
                          </Pressable>
                        ) : (
                          <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                        )}
                        {isAdmin && (
                          <Pressable style={styles.photoRemove} onPress={() => removePhoto(idx)}>
                            <Text style={styles.photoRemoveText}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  {isAdmin && (
                    <Pressable style={styles.photoAdd} onPress={handlePickPhoto}>
                      <Text style={styles.photoAddIcon}>+</Text>
                      <Text style={styles.photoAddText}>{t.common.add}</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {fiche.updatedAt ? (
                <Text style={styles.ficheUpdated}>
                  Dernière mise à jour : {new Date(fiche.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
                </>
              ) : (
                /* Onglet Modifier */
                <>
                  <FormField label={t.common.siteName}>
                    <TextInput
                      style={styles.input}
                      value={form.nom}
                      onChangeText={v => setForm(f => ({ ...f, nom: v }))}
                      placeholder="Ex: Villa Dupont"
                      placeholderTextColor="#B0BEC5"
                    />
                  </FormField>
                  <FormField label={t.common.address}>
                    <TextInput
                      style={styles.input}
                      value={form.adresse}
                      onChangeText={v => setForm(f => ({ ...f, adresse: v }))}
                      placeholder="Ex: 12 rue des Lilas, Paris"
                      placeholderTextColor="#B0BEC5"
                    />
                  </FormField>
                  <View style={styles.dateRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <DatePicker label={t.common.startDate} value={form.dateDebut} onChange={v => setForm(f => ({ ...f, dateDebut: v }))} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <DatePicker label={t.common.endDate} value={form.dateFin} onChange={v => setForm(f => ({ ...f, dateFin: v }))} minDate={form.dateDebut || undefined} />
                    </View>
                  </View>
                  <FormField label={t.common.status}>
                    <View style={styles.chipRow}>
                      {STATUTS.map(s => (
                        <Pressable key={s} style={[styles.chip, form.statut === s && styles.chipActive]} onPress={() => setForm(f => ({ ...f, statut: s }))}>
                          <Text style={[styles.chipText, form.statut === s && styles.chipTextActive]}>{STATUT_LABELS[s]}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </FormField>
                  <FormField label={t.common.color}>
                    <View style={styles.colorRow}>
                      {CHANTIER_COLORS.map(c => (
                        <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, form.couleur === c && styles.colorSwatchActive]} onPress={() => setForm(f => ({ ...f, couleur: c }))} />
                      ))}
                    </View>
                  </FormField>
                  <FormField label={t.common.assignedEmployees}>
                    {data.employes.map(emp => {
                      const mc = METIER_COLORS[emp.metier];
                      const selected = form.employeIds.includes(emp.id);
                      return (
                        <Pressable key={emp.id} style={[styles.empRow, selected && styles.empRowSelected]} onPress={() => toggleEmploye(emp.id)}>
                          <View style={[styles.empAvatar, { backgroundColor: mc.color }]}>
                            <Text style={[styles.empAvatarText, { color: mc.textColor }]}>{emp.prenom[0]}</Text>
                          </View>
                          <Text style={styles.empRowName}>{emp.prenom} {emp.nom}</Text>
                          <Text style={styles.empRowMetier}>{mc.label}</Text>
                          {selected && <Text style={styles.empCheck}>✓</Text>}
                        </Pressable>
                      );
                    })}
                  </FormField>
                  <FormField label={t.common.visibleOnPlanning}>
                    <Pressable style={[styles.toggleBtn, form.visibleSurPlanning && styles.toggleBtnActive]} onPress={() => setForm(f => ({ ...f, visibleSurPlanning: !f.visibleSurPlanning }))}>
                      <Text style={[styles.toggleBtnText, form.visibleSurPlanning && styles.toggleBtnTextActive]}>{form.visibleSurPlanning ? t.common.yes : t.common.no}</Text>
                    </Pressable>
                  </FormField>
                </>
              )}
            </ScrollView>

            {isAdmin && ficheOnglet === 'fiche' && (
              <Pressable style={styles.saveBtn} onPress={handleSaveFiche}>
                <Text style={styles.saveBtnText}>{t.chantiers.saveFiche}</Text>
              </Pressable>
            )}
            {isAdmin && ficheOnglet === 'modifier' && (
              <Pressable
                style={[styles.saveBtn, !form.nom.trim() && styles.saveBtnDisabled]}
                onPress={() => { handleSave(); setShowFiche(false); }}
                disabled={!form.nom.trim()}
              >
                <Text style={styles.saveBtnText}>{t.common.save}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Notes Chantier (enrichi) ── */}
      <Modal visible={showNotes} animationType="slide" transparent onRequestClose={() => setShowNotes(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotes(false)}>
          <Pressable style={[styles.modalSheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
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

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
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
                      {/* Pièce jointe unique */}
                      {note.pieceJointe && (
                        <Pressable
                          style={styles.notePJBtn}
                          onPress={() => {
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                              const w = window.open();
                              if (w) w.document.write(note.pieceJointeType === 'pdf'
                                ? `<iframe src="${note.pieceJointe}" width="100%" height="100%"></iframe>`
                                : `<img src="${note.pieceJointe}" style="max-width:100%">`);
                            }
                          }}
                        >
                          <Text style={styles.notePJIcon}>{note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}</Text>
                          <Text style={styles.notePJText}>{note.pieceJointeNom || (note.pieceJointeType === 'pdf' ? 'PDF' : 'Image')}</Text>
                        </Pressable>
                      )}
                      {/* Photos multiples */}
                      {note.photos && note.photos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 6 }}>
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

                    {/* Pièce jointe */}
                    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable style={styles.notePJPickBtn} onPress={handlePickNotePJ}>
                        <Text style={styles.notePJPickText}>📎 {t.common.attachFile}</Text>
                      </Pressable>
                      {notePieceJointe && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <Text style={styles.notePJIcon}>{notePieceJointe.type === 'pdf' ? '📄' : '🖼️'}</Text>
                          <Text style={[styles.notePJText, { flex: 1 }]} numberOfLines={1}>{notePieceJointe.nom}</Text>
                          <Pressable onPress={() => setNotePieceJointe(null)}>
                            <Text style={{ color: '#E74C3C', fontWeight: '700' }}>✕</Text>
                          </Pressable>
                        </View>
                      )}
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
                      style={[styles.saveBtn, { marginTop: 12, opacity: (newNoteTexte.trim() || notePieceJointe !== null) ? 1 : 0.5 }]}
                      onPress={handleAddNote}
                      disabled={!newNoteTexte.trim() && notePieceJointe === null}
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
                          {/* Pièce jointe */}
                          {note.pieceJointe && (
                            <Pressable
                              style={styles.notePJBtn}
                              onPress={() => {
                                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                  const w = window.open();
                                  if (w) w.document.write(note.pieceJointeType === 'pdf'
                                    ? `<iframe src="${note.pieceJointe}" width="100%" height="100%"></iframe>`
                                    : `<img src="${note.pieceJointe}" style="max-width:100%">`);
                                }
                              }}
                            >
                              <Text style={styles.notePJIcon}>{note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}</Text>
                              <Text style={styles.notePJText}>{note.pieceJointeNom || 'Fichier'}</Text>
                            </Pressable>
                          )}
                          {/* Photos multiples */}
                          {note.photos && note.photos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 6 }}>
                              {note.photos.map((uri, idx) => {
                                const isPdf = uri.startsWith('data:application/pdf');
                                if (isPdf) {
                                  return (
                                    <Pressable
                                      key={idx}
                                      style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF3CD', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}
                                      onPress={() => {
                                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                          const w = window.open();
                                          if (w) w.document.write(`<iframe src="${uri}" style="width:100%;height:100vh;border:none"></iframe>`);
                                        }
                                      }}
                                    >
                                      <Text style={{ fontSize: 20 }}>📄</Text>
                                    </Pressable>
                                  );
                                }
                                return (
                                  <Image
                                    key={idx}
                                    source={{ uri }}
                                    style={{ width: 56, height: 56, borderRadius: 8, marginRight: 6 }}
                                    resizeMode="cover"
                                  />
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
                              onPress={() => {
                                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                  const w = window.open();
                                  if (w) w.document.write(note.pieceJointeType === 'pdf'
                                    ? `<iframe src="${note.pieceJointe}" width="100%" height="100%"></iframe>`
                                    : `<img src="${note.pieceJointe}" style="max-width:100%">`);
                                }
                              }}
                            >
                              <Text style={styles.notePJIcon}>{note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}</Text>
                              <Text style={styles.notePJText}>{note.pieceJointeNom || 'Fichier'}</Text>
                            </Pressable>
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Plans Chantier ── */}
      <Modal visible={showPlans} animationType="slide" transparent onRequestClose={() => setShowPlans(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPlans(false)}>
          <Pressable style={[styles.modalSheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
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

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {/* Liste des plans */}
              {plansChantierId && getPlansVisibles(plansChantierId).length === 0 && (
                <Text style={[styles.emptyText, { margin: 16 }]}>{t.chantiers.noPlans}</Text>
              )}
              {plansChantierId && getPlansVisibles(plansChantierId).map(plan => (
                <View key={plan.id} style={styles.planCard}>
                  <Pressable
                    style={styles.planCardContent}
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
                    <Text style={styles.planIcon}>{plan.fichier.startsWith('data:application/pdf') ? '📄' : '🖼️'}</Text>
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

                  {/* Sélection du fichier */}
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable style={styles.notePJPickBtn} onPress={handlePickPlan}>
                      <Text style={styles.notePJPickText}>📎 {t.chantiers.addPlan}</Text>
                    </Pressable>
                    {newPlanFichier && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={styles.notePJIcon}>{newPlanFichier.startsWith('data:application/pdf') ? '📄' : '🖼️'}</Text>
                        <Text style={[styles.notePJText, { flex: 1 }]} numberOfLines={1}>{t.common.fileSelected}</Text>
                        <Pressable onPress={() => setNewPlanFichier(null)}>
                          <Text style={{ color: '#E74C3C', fontWeight: '700' }}>✕</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* Visibilité */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.fieldLabel}>{t.chantiers.planRecipients}</Text>
                    <View style={styles.chipRow}>
                      {(['tous', 'employes', 'soustraitants', 'specifique'] as const).map(v => (
                        <Pressable
                          key={v}
                          style={[styles.chip, newPlanVisiblePar === v && styles.chipActive]}
                          onPress={() => setNewPlanVisiblePar(v)}
                        >
                          <Text style={[styles.chipText, newPlanVisiblePar === v && styles.chipTextActive]}>
                            {v === 'tous' ? t.chantiers.allRecipients : v === 'employes' ? '👷 Employés' : v === 'soustraitants' ? '👤 ST' : '👥 Sélection'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
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
  searchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F2F4F7', borderRadius: 10, borderWidth: 1, borderColor: '#E2E6EA' },
  searchInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#11181C' },
  searchClear: { paddingHorizontal: 12, paddingVertical: 10 },
  newBtn: {
    backgroundColor: '#1A3A6B',
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
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
    color: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
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
    backgroundColor: '#F2F4F7',
  },
  chipActive: {
    borderColor: '#1A3A6B',
    backgroundColor: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  empRowSelected: {
    borderColor: '#1A3A6B',
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
    color: '#1A3A6B',
    fontWeight: '700',
    fontSize: 15,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E6EA',
    backgroundColor: '#F2F4F7',
    alignSelf: 'flex-start',
  },
  toggleBtnActive: {
    borderColor: '#1A3A6B',
    backgroundColor: '#EEF2F8',
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#687076',
  },
  toggleBtnTextActive: {
    color: '#1A3A6B',
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
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
    borderColor: '#1A3A6B',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F8',
    gap: 4,
  },
  photoAddIcon: {
    fontSize: 24,
    color: '#1A3A6B',
    fontWeight: '700',
  },
  photoAddText: {
    fontSize: 11,
    color: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
  },
  noteTabActive: {
    backgroundColor: '#1A3A6B',
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
    backgroundColor: '#F2F4F7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  notePJPickText: {
    fontSize: 13,
    color: '#1A3A6B',
    fontWeight: '600',
  },
  notePJIcon: {
    fontSize: 16,
  },
  notePJText: {
    fontSize: 13,
    color: '#1A3A6B',
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
    color: '#1A3A6B',
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
