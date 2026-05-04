/**
 * Modal de détail / édition d'un ticket SAV.
 *
 * Mode 'admin' : édition complète (objet, description, priorité, statut,
 * assigné, photos, photos résolution) + suppression.
 *
 * Mode 'lecture-commentaire' : lecture des détails uniquement.
 * - Ajout de commentaires possible (avec photo optionnelle)
 * - Si statut === 'resolu' : ajout de photos de résolution possible
 * - Statut, priorité, assigné, suppression : MASQUÉ ou désactivé
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, Image, Modal, Platform, Alert,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { TicketSAV, PrioriteSAV, StatutSAV } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { todayYMD } from '@/lib/date/today';

const PRIO_LABELS: Record<PrioriteSAV, string> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
  urgente: 'Urgente',
};
const PRIO_COLORS: Record<PrioriteSAV, { bg: string; text: string; border: string }> = {
  basse:   { bg: '#D4EDDA', text: '#155724', border: '#27AE60' },
  normale: { bg: '#EBF0FF', text: '#1A3A6B', border: '#2C2C2C' },
  haute:   { bg: '#FFF3CD', text: '#856404', border: '#F59E0B' },
  urgente: { bg: '#FEF2F2', text: '#991B1B', border: '#E74C3C' },
};
const STATUT_LABELS: Record<StatutSAV, string> = {
  ouvert:   'Ouvert',
  en_cours: 'En cours',
  resolu:   'Résolu',
  clos:     'Clos',
};
const STATUT_COLORS: Record<StatutSAV, { bg: string; text: string }> = {
  ouvert:   { bg: '#FFF3E0', text: '#E65100' },
  en_cours: { bg: '#FFF9C4', text: '#F57F17' },
  resolu:   { bg: '#E8F5E9', text: '#2E7D32' },
  clos:     { bg: '#ECEFF1', text: '#607D8B' },
};

interface Props {
  visible: boolean;
  ticketId: string;
  chantierId: string;
  /** Identité de l'auteur des commentaires ajoutés via ce modal. */
  currentAuthorNom: string;
  /**
   * 'admin' = édition complète + suppression.
   * 'lecture-commentaire' = lecture + ajout commentaire + ajout photo résolution si statut résolu.
   */
  mode: 'admin' | 'lecture-commentaire';
  /**
   * Liste optionnelle des employés pour le dropdown "Assigner à" (admin only).
   * Si non fournie ou liste vide, le dropdown n'est pas affiché.
   */
  employes?: { id: string; prenom: string; nom: string }[];
  onClose: () => void;
}

export function ModalSAVDetail({ visible, ticketId, currentAuthorNom, mode, employes, onClose }: Props) {
  const { data, updateTicketSAV, deleteTicketSAV } = useApp();
  const ticket = useMemo(
    () => (data.ticketsSAV || []).find(t => t.id === ticketId),
    [data.ticketsSAV, ticketId],
  );
  const isAdminMode = mode === 'admin';

  const [editObjet, setEditObjet] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriorite, setEditPriorite] = useState<PrioriteSAV>('normale');
  const [editingHeader, setEditingHeader] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [pendingCommentPhoto, setPendingCommentPhoto] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  // Réinitialiser l'édition quand on ouvre le modal sur un autre ticket
  React.useEffect(() => {
    if (ticket) {
      setEditObjet(ticket.objet);
      setEditDescription(ticket.description || '');
      setEditPriorite(ticket.priorite);
      setEditingHeader(false);
      setNewCommentText('');
      setPendingCommentPhoto(null);
    }
  }, [ticket?.id]);

  if (!ticket) return null;

  const saveHeader = () => {
    if (!editObjet.trim()) return;
    updateTicketSAV({
      ...ticket,
      objet: editObjet.trim(),
      description: editDescription.trim() || undefined,
      priorite: editPriorite,
      updatedAt: new Date().toISOString(),
    });
    setEditingHeader(false);
  };

  const changeStatut = (statut: StatutSAV) => {
    const now = new Date().toISOString();
    if (statut === 'resolu' && ticket.statut !== 'resolu') {
      updateTicketSAV({
        ...ticket,
        statut,
        dateResolution: todayYMD(),
        resoluPar: currentAuthorNom,
        updatedAt: now,
      });
    } else {
      updateTicketSAV({ ...ticket, statut, updatedAt: now });
    }
  };

  const pickAndAddProblemPhoto = async () => {
    // ActionSheet natif iOS gère Photothèque/Caméra/Fichiers — pas de bouton
    // Scanner dédié séparé (redondance évitée).
    const files = await pickNativeFile({ acceptImages: true, acceptPdf: false, acceptCamera: true, multiple: false, compressImages: true });
    if (files.length === 0) return;
    const url = await uploadFileToStorage(files[0].uri, `chantiers/${ticket.chantierId}/sav`, `sav_photo_${Date.now()}`);
    if (!url) return;
    updateTicketSAV({
      ...ticket,
      photos: [...(ticket.photos || []), url],
      updatedAt: new Date().toISOString(),
    });
  };

  const pickAndAddPdfFile = async () => {
    const files = await pickNativeFile({ acceptImages: false, acceptPdf: true, acceptCamera: false, multiple: false, compressImages: false });
    if (files.length === 0) return;
    const file = files[0];
    const url = await uploadFileToStorage(file.uri, `chantiers/${ticket.chantierId}/sav`, `sav_doc_${Date.now()}`);
    if (!url) return;
    updateTicketSAV({
      ...ticket,
      fichiers: [...(ticket.fichiers || []), { uri: url, nom: file.filename || 'Document.pdf' }],
      updatedAt: new Date().toISOString(),
    });
  };

  const removePdfFile = (uri: string) => {
    const doDel = () => updateTicketSAV({
      ...ticket,
      fichiers: (ticket.fichiers || []).filter(f => f.uri !== uri),
      updatedAt: new Date().toISOString(),
    });
    if (Platform.OS === 'web') { if (window.confirm('Supprimer ce fichier ?')) doDel(); }
    else Alert.alert('Supprimer le fichier ?', 'Action irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: doDel },
    ]);
  };

  const setAssigne = (employeId: string | undefined) => {
    updateTicketSAV({
      ...ticket,
      assigneA: employeId || undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const pickAndAddResolutionPhoto = async () => {
    const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, multiple: false, compressImages: true });
    if (files.length === 0) return;
    const url = await uploadFileToStorage(files[0].uri, `chantiers/${ticket.chantierId}/sav-resolution`, `res_${ticket.id}_${Date.now()}`);
    if (!url) return;
    updateTicketSAV({
      ...ticket,
      photosResolution: [...(ticket.photosResolution || []), url],
      updatedAt: new Date().toISOString(),
    });
  };

  const pickCommentPhoto = async () => {
    const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, multiple: false, compressImages: true });
    if (files.length === 0) return;
    const url = await uploadFileToStorage(files[0].uri, `chantiers/${ticket.chantierId}/sav-comments`, `cm_${Date.now()}`);
    if (!url) return;
    setPendingCommentPhoto(url);
  };

  const submitComment = () => {
    const txt = newCommentText.trim();
    if (!txt && !pendingCommentPhoto) return;
    const now = new Date().toISOString();
    updateTicketSAV({
      ...ticket,
      commentaires: [
        ...(ticket.commentaires || []),
        {
          id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          auteur: currentAuthorNom,
          texte: txt,
          date: now,
          photo: pendingCommentPhoto || undefined,
        },
      ],
      updatedAt: now,
    });
    setNewCommentText('');
    setPendingCommentPhoto(null);
  };

  const removeProblemPhoto = (uri: string) => {
    const doDel = () => updateTicketSAV({
      ...ticket,
      photos: (ticket.photos || []).filter(p => p !== uri),
      updatedAt: new Date().toISOString(),
    });
    if (Platform.OS === 'web') { if (window.confirm('Supprimer cette photo ?')) doDel(); }
    else Alert.alert('Supprimer la photo ?', 'Action irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: doDel },
    ]);
  };

  const removeResolutionPhoto = (uri: string) => {
    const doDel = () => updateTicketSAV({
      ...ticket,
      photosResolution: (ticket.photosResolution || []).filter(p => p !== uri),
      updatedAt: new Date().toISOString(),
    });
    if (Platform.OS === 'web') { if (window.confirm('Supprimer cette photo ?')) doDel(); }
    else Alert.alert('Supprimer la photo ?', 'Action irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: doDel },
    ]);
  };

  const confirmDelete = () => {
    const doDel = () => { deleteTicketSAV(ticket.id); onClose(); };
    if (Platform.OS === 'web') { if (window.confirm('Supprimer ce ticket ?')) doDel(); }
    else Alert.alert('Supprimer le ticket ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: doDel },
    ]);
  };

  const prioColors = PRIO_COLORS[ticket.priorite];
  const statutColors = STATUT_COLORS[ticket.statut];

  const isImage = (uri: string): boolean => {
    if (uri.startsWith('data:image/')) return true;
    return /\.(png|jpe?g|gif|webp|heic|heif|bmp)(\?|$)/i.test(uri);
  };
  const isPdf = (uri: string): boolean =>
    uri.toLowerCase().endsWith('.pdf') || uri.startsWith('data:application/pdf');

  const renderThumb = (uri: string, size: number, onRemove?: () => void) => (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <Pressable
        onPress={() => { if (isPdf(uri)) { openDocPreview(uri); } else if (isImage(uri)) { setViewerUri(uri); } else { openDocPreview(uri); } }}
        style={{ width: '100%', height: '100%' }}
      >
        {isPdf(uri) ? (
          <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.4 }}>📄</Text>
          </View>
        ) : (
          <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 6 }} resizeMode="cover" />
        )}
      </Pressable>
      {onRemove && (
        <Pressable
          onPress={onRemove}
          style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <ModalKeyboard visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>🔧 Ticket SAV</Text>
              {ticket.creePar && ticket.creePar.type !== 'admin' && (
                <Text style={styles.headerSub}>Signalé par {ticket.creePar.nom}</Text>
              )}
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            {/* Détails / Titre / Description / Priorité */}
            {!editingHeader ? (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Text style={styles.objet}>{ticket.objet}</Text>
                  {isAdminMode && (
                    <Pressable onPress={() => setEditingHeader(true)} style={{ padding: 4 }}>
                      <Text style={{ fontSize: 14 }}>✏️</Text>
                    </Pressable>
                  )}
                </View>
                {ticket.description && <Text style={styles.description}>{ticket.description}</Text>}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <View style={[styles.badge, { backgroundColor: prioColors.bg, borderColor: prioColors.border }]}>
                    <Text style={[styles.badgeText, { color: prioColors.text }]}>Priorité {PRIO_LABELS[ticket.priorite]}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: statutColors.bg }]}>
                    <Text style={[styles.badgeText, { color: statutColors.text }]}>{STATUT_LABELS[ticket.statut]}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>Ouvert le {ticket.dateOuverture}</Text>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.label}>Objet *</Text>
                <TextInput
                  style={styles.input}
                  value={editObjet}
                  onChangeText={setEditObjet}
                  placeholder="Ex: Fuite robinet"
                />
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Détails du problème..."
                  multiline
                />
                <Text style={styles.label}>Priorité</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {(['basse', 'normale', 'haute', 'urgente'] as PrioriteSAV[]).map(p => {
                    const c = PRIO_COLORS[p];
                    const active = editPriorite === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setEditPriorite(p)}
                        style={[styles.prioChip, active && { backgroundColor: c.bg, borderColor: c.border }]}
                      >
                        <Text style={[styles.prioChipText, active && { color: c.text, fontWeight: '700' }]}>{PRIO_LABELS[p]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setEditingHeader(false)} style={[styles.btn, styles.btnSecondary]}>
                    <Text style={styles.btnSecondaryText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveHeader}
                    disabled={!editObjet.trim()}
                    style={[styles.btn, styles.btnPrimary, !editObjet.trim() && { opacity: 0.5 }]}
                  >
                    <Text style={styles.btnPrimaryText}>Enregistrer</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Statut — admin only */}
            {isAdminMode && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Statut</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {(['ouvert', 'en_cours', 'resolu', 'clos'] as StatutSAV[]).map(s => {
                    const c = STATUT_COLORS[s];
                    const active = ticket.statut === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => changeStatut(s)}
                        style={[styles.statutChip, active && { backgroundColor: c.bg }]}
                      >
                        <Text style={[styles.statutChipText, active && { color: c.text, fontWeight: '700' }]}>{STATUT_LABELS[s]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Assigner à — admin only, si liste employés disponible */}
            {isAdminMode && employes && employes.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Assigner à</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <Pressable
                    onPress={() => setAssigne(undefined)}
                    style={[styles.statutChip, !ticket.assigneA && { backgroundColor: '#2C2C2C' }]}
                  >
                    <Text style={[styles.statutChipText, !ticket.assigneA && { color: '#fff', fontWeight: '700' }]}>Non assigné</Text>
                  </Pressable>
                  {employes.map(emp => {
                    const active = ticket.assigneA === emp.id;
                    return (
                      <Pressable
                        key={emp.id}
                        onPress={() => setAssigne(emp.id)}
                        style={[styles.statutChip, active && { backgroundColor: '#2C2C2C' }]}
                      >
                        <Text style={[styles.statutChipText, active && { color: '#fff', fontWeight: '700' }]}>{emp.prenom}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Photos du problème */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>📷 Photos du problème</Text>
              {(ticket.photos || []).length === 0 && !isAdminMode ? (
                <Text style={styles.empty}>Aucune photo</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {(ticket.photos || []).map(uri => (
                    <View key={uri}>
                      {renderThumb(uri, 72, isAdminMode ? () => removeProblemPhoto(uri) : undefined)}
                    </View>
                  ))}
                </ScrollView>
              )}
              {isAdminMode && (
                <Pressable onPress={pickAndAddProblemPhoto} style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}>
                  <Text style={styles.btnSecondaryText}>+ Ajouter une photo</Text>
                </Pressable>
              )}
            </View>

            {/* Fichiers PDF — section séparée des photos */}
            {(isAdminMode || (ticket.fichiers || []).length > 0) && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>📎 Fichiers PDF</Text>
                {(ticket.fichiers || []).length === 0 ? (
                  <Text style={styles.empty}>Aucun fichier</Text>
                ) : (
                  <View style={{ gap: 6 }}>
                    {(ticket.fichiers || []).map(f => (
                      <Pressable
                        key={f.uri}
                        onPress={() => openDocPreview(f.uri)}
                        style={styles.fichierRow}
                      >
                        <Text style={{ fontSize: 18 }}>📄</Text>
                        <Text style={styles.fichierNom} numberOfLines={1}>{f.nom}</Text>
                        {isAdminMode && (
                          <Pressable onPress={() => removePdfFile(f.uri)} style={{ padding: 6 }}>
                            <Text style={{ fontSize: 14 }}>🗑</Text>
                          </Pressable>
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
                {isAdminMode && (
                  <Pressable onPress={pickAndAddPdfFile} style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}>
                    <Text style={styles.btnSecondaryText}>+ Ajouter un PDF</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Section Résolution */}
            {(isAdminMode || ticket.statut === 'resolu') && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>✓ Résolution</Text>
                {ticket.statut === 'resolu' && (
                  <Text style={styles.meta}>
                    Résolu{ticket.resoluPar ? ` par ${ticket.resoluPar}` : ''}
                    {ticket.dateResolution ? ` le ${ticket.dateResolution}` : ''}
                  </Text>
                )}
                {(ticket.photosResolution || []).length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                    {(ticket.photosResolution || []).map(uri => (
                      <View key={uri}>
                        {renderThumb(uri, 72, isAdminMode ? () => removeResolutionPhoto(uri) : undefined)}
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.empty}>Aucune photo de résolution</Text>
                )}
                {(isAdminMode || ticket.statut === 'resolu') && (
                  <Pressable onPress={pickAndAddResolutionPhoto} style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}>
                    <Text style={styles.btnSecondaryText}>+ Ajouter photo résolution</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Commentaires */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>💬 Commentaires ({(ticket.commentaires || []).length})</Text>
              {(ticket.commentaires || []).length === 0 ? (
                <Text style={styles.empty}>Aucun commentaire</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {(ticket.commentaires || []).map(c => (
                    <View key={c.id} style={styles.commentRow}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.commentAuteur}>{c.auteur}</Text>
                        <Text style={styles.commentDate}>{new Date(c.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {c.texte && <Text style={styles.commentTexte}>{c.texte}</Text>}
                      {c.photo && (
                        <View style={{ marginTop: 6 }}>
                          {renderThumb(c.photo, 80)}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Form ajout commentaire */}
              <View style={{ marginTop: 12, gap: 6 }}>
                <TextInput
                  style={[styles.input, { minHeight: 50 }]}
                  value={newCommentText}
                  onChangeText={setNewCommentText}
                  placeholder="Ajouter un commentaire..."
                  multiline
                />
                {pendingCommentPhoto && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {renderThumb(pendingCommentPhoto, 60, () => setPendingCommentPhoto(null))}
                    <Text style={{ fontSize: 11, color: '#8C8077' }}>Photo prête</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable onPress={pickCommentPhoto} style={[styles.btn, styles.btnSecondary]}>
                    <Text style={styles.btnSecondaryText}>📷 Photo</Text>
                  </Pressable>
                  <Pressable
                    onPress={submitComment}
                    disabled={!newCommentText.trim() && !pendingCommentPhoto}
                    style={[styles.btn, styles.btnPrimary, (!newCommentText.trim() && !pendingCommentPhoto) && { opacity: 0.5 }]}
                  >
                    <Text style={styles.btnPrimaryText}>Envoyer</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* 4 boutons d'action rapide — admin only, cohérent avec la card liste */}
            {isAdminMode && (
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => changeStatut('resolu')}
                  disabled={ticket.statut === 'resolu' || ticket.statut === 'clos'}
                  style={[styles.actionBtn, styles.actionResolu, (ticket.statut === 'resolu' || ticket.statut === 'clos') && { opacity: 0.4 }]}
                >
                  <Text style={styles.actionResoluText}>✓ Résolu</Text>
                </Pressable>
                <Pressable
                  onPress={() => changeStatut('en_cours')}
                  disabled={ticket.statut === 'en_cours'}
                  style={[styles.actionBtn, styles.actionEnCours, ticket.statut === 'en_cours' && { opacity: 0.4 }]}
                >
                  <Text style={styles.actionEnCoursText}>→ En cours</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditingHeader(true)}
                  style={[styles.actionBtn, styles.actionEdit]}
                >
                  <Text>✏️</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  style={[styles.actionBtn, styles.actionDelete]}
                >
                  <Text>🗑</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Viewer plein écran (images uniquement) */}
      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <Pressable onPress={() => setViewerUri(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}>
          {viewerUri && <Image source={{ uri: viewerUri }} style={{ width: '100%', height: '90%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </ModalKeyboard>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%', overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E8DDD0',
    backgroundColor: '#2C2C2C',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub: { color: '#C9A96E', fontSize: 11, fontWeight: '600', marginTop: 2, fontStyle: 'italic' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#2C2C2C', fontSize: 14, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E8DDD0' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#2C2C2C', marginBottom: 8 },
  objet: { flex: 1, fontSize: 16, fontWeight: '800', color: '#11181C' },
  description: { fontSize: 13, color: '#2C2C2C', marginTop: 6, lineHeight: 19 },
  meta: { fontSize: 11, color: '#8C8077', marginTop: 6 },
  empty: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: '#687076', marginBottom: 4, marginTop: 6 },
  input: {
    backgroundColor: '#FAF7F3', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#11181C',
    borderWidth: 1, borderColor: '#E8DDD0',
  },
  prioChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderColor: '#E8DDD0',
    backgroundColor: '#fff',
  },
  prioChipText: { fontSize: 11, color: '#687076', fontWeight: '600' },
  statutChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 14, backgroundColor: '#F5EDE3',
  },
  statutChipText: { fontSize: 11, color: '#687076', fontWeight: '600' },
  commentRow: { backgroundColor: '#FAF7F3', borderRadius: 8, padding: 10 },
  commentAuteur: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  commentDate: { fontSize: 10, color: '#8C8077' },
  commentTexte: { fontSize: 13, color: '#2C2C2C', marginTop: 4, lineHeight: 18 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#2C2C2C' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnSecondary: { backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E8DDD0' },
  btnSecondaryText: { color: '#2C2C2C', fontSize: 13, fontWeight: '600' },
  btnDanger: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#E74C3C' },
  btnDangerText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
  fichierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8, backgroundColor: '#FAF7F3',
    borderWidth: 1, borderColor: '#E8DDD0',
  },
  fichierNom: { flex: 1, fontSize: 13, color: '#2C2C2C', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionResolu: { backgroundColor: '#E8F5E9' },
  actionResoluText: { color: '#2E7D32', fontSize: 11, fontWeight: '700' },
  actionEnCours: { backgroundColor: '#FFF9C4' },
  actionEnCoursText: { color: '#F57F17', fontSize: 11, fontWeight: '700' },
  actionEdit: { backgroundColor: '#F5EDE3' },
  actionDelete: { backgroundColor: '#FFEBEE' },
});
