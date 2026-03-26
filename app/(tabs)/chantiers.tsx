import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, ScrollView, Alert, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  METIER_COLORS, STATUT_LABELS, STATUT_COLORS, CHANTIER_COLORS,
  type Chantier, type StatutChantier, type FicheChantier, type NoteChantier,
} from '@/app/types';
import { DatePicker } from '@/components/DatePicker';

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
  const { data, currentUser, isHydrated, addChantier, updateChantier, deleteChantier, upsertFicheChantier, addNoteChantier, archiveNoteChantier, deleteNoteChantier } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ChantierForm>(DEFAULT_FORM);

  // Fiche chantier
  const [showFiche, setShowFiche] = useState(false);
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [fiche, setFiche] = useState<FicheChantier>(FICHE_VIDE);

  // Notes chantier
  const [showNotes, setShowNotes] = useState(false);
  const [notesChantierId, setNotesChantierId] = useState<string | null>(null);
  const [newNoteTexte, setNewNoteTexte] = useState('');
  const [noteDestinataires, setNoteDestinataires] = useState<'tous' | string[]>('tous');
  const [showDestPicker, setShowDestPicker] = useState(false);

  const openNotes = (chantier: Chantier) => {
    setNotesChantierId(chantier.id);
    setNewNoteTexte('');
    setNoteDestinataires('tous');
    setShowNotes(true);
  };

  const handleAddNote = () => {
    if (!newNoteTexte.trim() || !notesChantierId) return;
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
    });
    setNewNoteTexte('');
    setNoteDestinataires('tous');
  };

  const handleArchiveNote = (noteId: string) => {
    const userId = currentUser?.role === 'admin' ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || 'inconnu');
    archiveNoteChantier(noteId, userId);
  };

  const handleDeleteNote = (noteId: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm && window.confirm('Supprimer cette note ?')) deleteNoteChantier(noteId);
    } else {
      Alert.alert('Supprimer', 'Supprimer cette note ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteNoteChantier(noteId) },
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

  const handleSave = () => {
    if (!form.nom.trim()) return;
    const existing = editId ? data.chantiers.find(c => c.id === editId) : null;
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

  const handleDelete = (id: string, nom: string) => {
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Supprimer "${nom}" ?`) : true)) deleteChantier(id);
    } else {
      Alert.alert('Supprimer le chantier', `Êtes-vous sûr de vouloir supprimer "${nom}" ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteChantier(id) },
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
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const uri = reader.result as string;
          setFiche(f => ({ ...f, photos: [...f.photos, uri] }));
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
        setFiche(f => ({ ...f, photos: [...f.photos, uri] }));
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
            <Pressable style={styles.actionBtn} onPress={() => openFiche(item)}>
              <Text style={[styles.actionBtnFiche, hasFiche && styles.actionBtnFicheActive]}>
                🪪
              </Text>
            </Pressable>
            {isAdmin && (
              <>
                <Pressable style={styles.actionBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.actionBtnEdit}>✏</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => handleDelete(item.id, item.nom)}>
                  <Text style={styles.actionBtnDelete}>🗑</Text>
                </Pressable>
              </>
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
            <Text style={styles.fichePreviewText}>🪪 Voir la fiche chantier</Text>
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
            <Text style={styles.newBtnText}>+ Nouveau</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={data.chantiers}
        keyExtractor={item => item.id}
        renderItem={renderChantier}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t.chantiers.noChantiers}</Text>
            {isAdmin && <Text style={styles.emptyHint}>Appuyez sur "+ Nouveau" pour en créer un.</Text>}
          </View>
        }
      />

      {/* ── Modal formulaire chantier (admin) ── */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowForm(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? 'Modifier le chantier' : 'Nouveau chantier'}</Text>
              <Pressable onPress={() => setShowForm(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }} keyboardShouldPersistTaps="handled">
              <FormField label="Nom du chantier *">
                <TextInput
                  style={styles.input}
                  value={form.nom}
                  onChangeText={v => setForm(f => ({ ...f, nom: v }))}
                  placeholder="Ex: Villa Dupont"
                  placeholderTextColor="#B0BEC5"
                  returnKeyType="next"
                />
              </FormField>

              <FormField label="Adresse">
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
                    label="Date début"
                    value={form.dateDebut}
                    onChange={v => setForm(f => ({ ...f, dateDebut: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <DatePicker
                    label="Date fin"
                    value={form.dateFin}
                    onChange={v => setForm(f => ({ ...f, dateFin: v }))}
                    minDate={form.dateDebut || undefined}
                  />
                </View>
              </View>

              <FormField label="Statut">
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

              <FormField label="Couleur">
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

              <FormField label="Employés assignés">
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

              <FormField label="Visible sur le planning">
                <Pressable
                  style={[styles.toggleBtn, form.visibleSurPlanning && styles.toggleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, visibleSurPlanning: !f.visibleSurPlanning }))}
                >
                  <Text style={[styles.toggleBtnText, form.visibleSurPlanning && styles.toggleBtnTextActive]}>
                    {form.visibleSurPlanning ? 'Visible' : 'Masqué'}
                  </Text>
                </Pressable>
              </FormField>
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, !form.nom.trim() && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!form.nom.trim()}
            >
              <Text style={styles.saveBtnText}>{editId ? 'Enregistrer' : 'Créer le chantier'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Fiche Chantier ── */}
      <Modal visible={showFiche} animationType="slide" transparent onRequestClose={() => setShowFiche(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFiche(false)}>
          <Pressable style={styles.modalSheetFiche} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🪪 Fiche chantier</Text>
                <Text style={styles.modalSubtitle}>
                  {data.chantiers.find(c => c.id === ficheId)?.nom ?? ''}
                </Text>
              </View>
              <Pressable onPress={() => setShowFiche(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Code accès */}
              <View style={styles.ficheSection}>
                <Text style={styles.ficheSectionIcon}>🔢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheSectionLabel}>Code d'accès / Digicode</Text>
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
                  <Text style={styles.ficheSectionLabel}>Emplacement de la clé</Text>
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
                  <Text style={styles.ficheSectionLabel}>Code alarme</Text>
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
                  <Text style={styles.ficheSectionLabel}>Contacts utiles</Text>
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
                  <Text style={styles.ficheSectionLabel}>Notes & informations</Text>
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
                <Text style={styles.ficheSectionLabel}>📸 Photos, plans & documents</Text>
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
                      <Text style={styles.photoAddText}>Ajouter</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {fiche.updatedAt ? (
                <Text style={styles.ficheUpdated}>
                  Dernière mise à jour : {new Date(fiche.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
            </ScrollView>

            {isAdmin && (
              <Pressable style={styles.saveBtn} onPress={handleSaveFiche}>
                <Text style={styles.saveBtnText}>Enregistrer la fiche</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal Notes Chantier ── */}
      <Modal visible={showNotes} animationType="slide" transparent onRequestClose={() => setShowNotes(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotes(false)}>
          <Pressable style={[styles.modalSheet, { maxHeight: '80%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📝 Notes du chantier</Text>
              <Pressable onPress={() => setShowNotes(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {/* Liste des notes actives */}
              {notesChantierId && getNotesActives(notesChantierId).length === 0 && (
                <Text style={styles.emptyText}>Aucune note active pour ce chantier.</Text>
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
                      <Text style={styles.noteArchiveBtnText}>✓ Archiver</Text>
                    </Pressable>
                    {isAdmin && (
                      <Pressable style={styles.noteDeleteBtn} onPress={() => handleDeleteNote(note.id)}>
                        <Text style={styles.noteDeleteBtnText}>🗑 Supprimer</Text>
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
                  placeholder="Écrivez votre note ici..."
                  placeholderTextColor="#B0BEC5"
                  multiline
                />

                {/* Sélection des destinataires (admin seulement) */}
                {isAdmin && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.fieldLabel}>Destinataires</Text>
                    <View style={styles.chipRow}>
                      <Pressable
                        style={[styles.chip, noteDestinataires === 'tous' && styles.chipActive]}
                        onPress={() => setNoteDestinataires('tous')}
                      >
                        <Text style={[styles.chipText, noteDestinataires === 'tous' && styles.chipTextActive]}>Tous</Text>
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
                  style={[styles.saveBtn, { marginTop: 12, opacity: newNoteTexte.trim() ? 1 : 0.5 }]}
                  onPress={handleAddNote}
                  disabled={!newNoteTexte.trim()}
                >
                  <Text style={styles.saveBtnText}>{t.common.add}</Text>
                </Pressable>
              </View>
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
});
