import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { useNotesModalLogic, type NoteModalState } from '@/hooks/useNotesModalLogic';
import { getEmployeColor, type TaskItem } from '@/app/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChip } from '@/components/ui/FilterChip';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { NativeFilePickerButton } from '@/components/share/NativeFilePickerButton';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { DS } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { Ico } from '@/components/ui/Ico';
import { useLanguage } from '@/app/context/LanguageContext';
import { EnvoiConsigneSheet, type ConsigneAEnvoyer } from '@/components/ui/EnvoiConsigneSheet';

// ─── Helpers internes ─────────────────────────────────────────────────────────

/** Génère un identifiant unique pour une nouvelle tâche (locale au composant). */
function genTaskId(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ─── Types réexportés ─────────────────────────────────────────────────────────

export type { NoteModalState } from '@/hooks/useNotesModalLogic';

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * Props du modal de notes journalières par cellule (chantier × jour ×
 * employé/ST). Contient liste des notes existantes + éditeur multi-mode
 * (création / édition) avec tâches, photos, options admin (visibilité,
 * répétition, lien SAV).
 *
 * Ne pas confondre avec `ModalNotesChantier` (post-it jaune attaché au
 * chantier) — celui-ci gère les notes journalières liées à un employé/ST.
 */
export interface ModalNotesProps {
  noteModal:    NoteModalState | null;
  setNoteModal: React.Dispatch<React.SetStateAction<NoteModalState | null>>;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Modal Notes journalières (3 vues internes : liste, éditeur création,
 * éditeur modification). Logique form gérée par `useNotesModalLogic`.
 *
 * ⚠️ TODO Phase 4 — i18n : tous les libellés sont hardcodés FR
 * (préservation 1:1 de l'original).
 *
 * ⚠️ TODO Phase 3 — DS : couleurs hex et magic numbers dans StyleSheet
 * (préservation 1:1).
 */
export function ModalNotes({ noteModal, setNoteModal }: ModalNotesProps): React.ReactElement {
  const { data, currentUser, toggleTask, addTask, deleteTask, addTaskPhoto, removeTaskPhoto, addNoteChantier, updateNoteChantier, deleteNoteChantier } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const { t } = useLanguage();

  // ── Notes de direction (mode chantier) : rappels de l'admin pour lui-même,
  //    transmissibles en un geste aux employés comme consigne du jour. ──
  const [consigneAEnvoyer, setConsigneAEnvoyer] = useState<ConsigneAEnvoyer | null>(null);
  const [noteDirectionEnCours, setNoteDirectionEnCours] = useState<string | null>(null);
  const [texteDirection, setTexteDirection] = useState('');
  const [saisieDirection, setSaisieDirection] = useState(false);
  const notesDirection = (noteModal?.mode === 'chantier' && isAdmin)
    ? (data.notesChantier || [])
        .filter(n => n.chantierId === noteModal.chantierId && Array.isArray(n.destinataires) && n.destinataires.length === 1 && n.destinataires[0] === 'admin' && !n.archivedBy?.includes('admin'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const ajouterNoteDirection = () => {
    const texte = texteDirection.trim();
    if (!texte || !noteModal) return;
    addNoteChantier({
      id: `nc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      chantierId: noteModal.chantierId,
      auteurId: 'admin',
      auteurNom: currentUser?.nom || 'Admin',
      texte,
      createdAt: new Date().toISOString(),
      destinataires: ['admin'],
      archivedBy: [],
    });
    setTexteDirection('');
    setSaisieDirection(false);
  };

  const { draft, setDraft, ui, setUi, actions } = useNotesModalLogic(noteModal, setNoteModal);

  return (
    <Modal
      visible={noteModal !== null}
      animationType="slide"
      transparent
      onRequestClose={actions.close}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable style={{ flex: 0.08 }} onPress={actions.close} />
        <View style={{ flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 }}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {(() => {
                    // V10 — mode='chantier' : titre = nom du chantier (toutes notes)
                    if (noteModal?.mode === 'chantier') {
                      const chantier = data.chantiers.find(c => c.id === noteModal?.chantierId);
                      return chantier?.nom || 'Notes du chantier';
                    }
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
                    {noteModal.mode === 'chantier'
                      ? `Toutes les notes du chantier (${noteModal.allNotes.length})`
                      : `${data.chantiers.find(c => c.id === noteModal.chantierId)?.nom} — ${formatDateFR(noteModal.date)}`}
                  </Text>
                )}
              </View>
              <Pressable onPress={actions.close} style={styles.modalXBtn}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* ── Section Direction (mode chantier, admin) ── */}
              {noteModal?.mode === 'chantier' && isAdmin && !ui.showEditor && (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Text style={styles.sectionLabel}>{t.ui.sectionDirection} ({notesDirection.length})</Text>
                    <Pressable onPress={() => setSaisieDirection(v => !v)} hitSlop={8}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#5C1F2E' }}>{saisieDirection ? t.common.cancel : `+ ${t.ui.noteDirection}`}</Text>
                    </Pressable>
                  </View>
                  {saisieDirection && (
                    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#EDE2D6', marginBottom: 8, gap: 8 }}>
                      <TextInput
                        style={{ minHeight: 64, fontSize: 15, color: '#2B1D14', textAlignVertical: 'top' }}
                        placeholder={t.ui.noteDirectionAide}
                        placeholderTextColor="#9A8C80"
                        value={texteDirection}
                        onChangeText={setTexteDirection}
                        multiline
                        autoFocus
                      />
                      <Pressable
                        style={{ alignSelf: 'flex-end', backgroundColor: '#5C1F2E', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, opacity: texteDirection.trim() ? 1 : 0.4 }}
                        disabled={!texteDirection.trim()}
                        onPress={ajouterNoteDirection}
                      >
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{t.common.save}</Text>
                      </Pressable>
                    </View>
                  )}
                  {notesDirection.length === 0 && !saisieDirection && (
                    <Text style={{ fontSize: 13, color: '#6E5F54', paddingHorizontal: 4 }}>{t.ui.aucuneNoteDirection}</Text>
                  )}
                  {notesDirection.map(n => (
                    <View key={n.id} style={[styles.noteCard, { borderLeftWidth: 0 }]}>
                      <View style={styles.noteCardHeader}>
                        <Text style={styles.noteAuthor}>{t.ui.sectionDirection}</Text>
                        <Text style={styles.noteDate}>{new Date(n.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</Text>
                      </View>
                      <Text style={styles.noteCardText}>{n.texte}</Text>
                      {n.transmise && (
                        <Text style={{ fontSize: 12, color: '#2E7D32', marginTop: 4 }}>
                          → {t.ui.transmiseLe} {formatDateFR(n.transmise.date)} ({n.transmise.employeIds.length})
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                        <Pressable onPress={() => { setNoteDirectionEnCours(n.id); setConsigneAEnvoyer({ chantierId: n.chantierId, texte: n.texte, photos: n.photos }); }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#5C1F2E' }}>{t.ui.envoyerAuxEmployes} →</Text>
                        </Pressable>
                        <Pressable onPress={() => updateNoteChantier({ ...n, archivedBy: [...(n.archivedBy || []), 'admin'] })}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#6E5F54' }}>{t.common.archive}</Text>
                        </Pressable>
                        <Pressable onPress={() => deleteNoteChantier(n.id)}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#E74C3C' }}>{t.common.delete}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  <Text style={[styles.sectionLabel, { paddingHorizontal: 4, marginTop: 14 }]}>{t.ui.sectionEmployes} ({noteModal.allNotes.length})</Text>
                </View>
              )}

              {/* Liste des notes existantes */}
              {noteModal && noteModal.allNotes.length > 0 && !ui.showEditor && (
                <View style={styles.notesList}>
                  {noteModal.allNotes.map(note => {
                    const canEdit = actions.canEdit(note);
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
                                    onPress={() => openDocPreview(uri)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Ouvrir le PDF"
                                  >
                                    <Ico e="📄" size={16} />
                                    <Text style={styles.pdfThumbLabel}>PDF</Text>
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
                                  <Image source={{ uri }} style={styles.noteCardPhoto} />
                                </Pressable>
                              );
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
                                  {/* V10 — liens vers les pièces jointes de cette tâche */}
                                  {task.photos && task.photos.length > 0 && (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                                      {task.photos.map((uri, i) => {
                                        const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                        return (
                                          <Pressable
                                            key={i}
                                            onPress={() => openDocPreview(uri)}
                                            accessibilityRole="button"
                                            accessibilityLabel={isPdf ? 'Ouvrir le document' : 'Ouvrir la photo'}
                                          >
                                            <Text style={{ fontSize: 12, color: DS.bordeaux, fontWeight: '600', textDecorationLine: 'underline' }}>
                                              {isPdf ? 'Document' : 'Photo'}
                                            </Text>
                                          </Pressable>
                                        );
                                      })}
                                    </View>
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
                            <Pressable style={styles.noteActionBtn} onPress={() => actions.startEdit(note)}>
                              <Text style={styles.noteActionBtnText}>Modifier</Text>
                            </Pressable>
                            <Pressable style={[styles.noteActionBtn, styles.noteActionBtnDanger]} onPress={() => actions.delete(note)}>
                              <Text style={[styles.noteActionBtnText, { color: '#E74C3C' }]}>Supprimer</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Message si aucune note */}
              {noteModal && noteModal.allNotes.length === 0 && !ui.showEditor && (
                <EmptyState size="sm" title="Aucune note pour ce jour." />
              )}

              {/* Éditeur de note */}
              {ui.showEditor && (
                <View style={styles.noteEditor}>
                  <Text style={styles.noteLabel}>
                    {noteModal?.editingNote ? 'Modifier la note' : 'Nouvelle note'}
                  </Text>
                  {/* Modèles de notes rapides — SUPPRIMÉ V10 (Kevin : pas de saisie libre,
                      uniquement des cases à cocher) */}
                  {/* Sélecteur SAV (si tickets existent pour ce chantier) */}
                  {noteModal && (() => {
                    const savTickets = (data.ticketsSAV || []).filter(t => t.chantierId === noteModal.chantierId && t.statut !== 'clos');
                    if (savTickets.length === 0) return null;
                    return (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#6E5F54', marginBottom: 4 }}>Lier à un SAV :</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                          <Pressable style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F1E7DC', borderWidth: 1, borderColor: '#EDE2D6' }, !draft.savTicketId && { backgroundColor: '#5C1F2E', borderColor: '#5C1F2E' }]}
                            onPress={() => setDraft({ savTicketId: null })}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: !draft.savTicketId ? '#fff' : '#6E5F54' }}>Aucun</Text>
                          </Pressable>
                          {savTickets.map(t => (
                            <Pressable key={t.id} style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F1E7DC', borderWidth: 1, borderColor: '#EDE2D6' }, draft.savTicketId === t.id && { backgroundColor: '#E74C3C', borderColor: '#E74C3C' }]}
                              onPress={() => {
                                setDraft({ savTicketId: t.id, ...(draft.texte.trim() ? {} : { texte: `SAV: ${t.objet}` }) });
                              }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: draft.savTicketId === t.id ? '#fff' : '#6E5F54' }} numberOfLines={1}>{t.objet}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    );
                  })()}

                  {/* Champ texte libre + suggestions @mentions — SUPPRIMÉ V10
                      (Kevin : pas de saisie libre, uniquement des cases à cocher).
                      draft.texte reste en mémoire pour rétrocompat (notes existantes). */}

                  {/* Bloc "Photos & PDF" global — SUPPRIMÉ V10 (Kevin : les photos/PDF
                      doivent être attachées à une case à cocher spécifique, pas à
                      la note globale). Voir bouton ➕ par case dans la section
                      "Tâches à faire" ci-dessous. draft.photos reste en mémoire
                      pour rétrocompat mais n'est plus éditable via cette modal. */}

                  {/* Section checklist */}
                  <Text style={styles.noteLabel}>Tâches à faire</Text>
                  {/* Tâches dans l'éditeur : editingNote.tasks (note existante) ou draft.tasks (nouvelle note) */}
                  {(() => {
                    const editorTasks = noteModal?.editingNote ? (noteModal.editingNote.tasks || []) : draft.tasks;
                    if (editorTasks.length === 0) return null;
                    return (
                      <View style={{ marginBottom: 8 }}>
                        {editorTasks.map(task => {
                          const findAffId = (): string | undefined => data.affectations.find(a =>
                            a.chantierId === noteModal?.chantierId &&
                            a.dateDebut <= (noteModal?.date || '') && a.dateFin >= (noteModal?.date || '') &&
                            a.notes.some(n => n.id === noteModal?.editingNote?.id)
                          )?.id;

                          const handleAddPhoto = async () => {
                            const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true, compressImages: true });
                            for (const f of files) {
                              const chantierId = noteModal?.chantierId || 'general';
                              const folder = `chantiers/${chantierId}/notes/tasks`;
                              const photoId = `task_${task.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                              const url = await uploadFileToStorage(f.uri, folder, photoId);
                              if (!url) continue;
                              if (noteModal?.editingNote) {
                                const affId = findAffId();
                                if (affId) {
                                  addTaskPhoto(affId, noteModal.editingNote.id, task.id, url);
                                  setNoteModal(prev => prev && prev.editingNote ? {
                                    ...prev,
                                    editingNote: { ...prev.editingNote, tasks: (prev.editingNote.tasks || []).map(t =>
                                      t.id === task.id ? { ...t, photos: [...(t.photos || []), url] } : t
                                    ) }
                                  } : prev);
                                }
                              } else {
                                setDraft({ tasks: draft.tasks.map(t =>
                                  t.id === task.id ? { ...t, photos: [...(t.photos || []), url] } : t
                                ) });
                              }
                            }
                          };

                          const handleRemovePhoto = (uri: string) => {
                            Alert.alert('Supprimer la photo', 'Voulez-vous supprimer cette photo de la tâche ?', [
                              { text: 'Annuler', style: 'cancel' },
                              { text: 'Supprimer', style: 'destructive', onPress: () => {
                                if (noteModal?.editingNote) {
                                  const affId = findAffId();
                                  if (affId) {
                                    removeTaskPhoto(affId, noteModal.editingNote.id, task.id, uri);
                                    setNoteModal(prev => prev && prev.editingNote ? {
                                      ...prev,
                                      editingNote: { ...prev.editingNote, tasks: (prev.editingNote.tasks || []).map(t =>
                                        t.id === task.id ? { ...t, photos: (t.photos || []).filter(p => p !== uri) } : t
                                      ) }
                                    } : prev);
                                  }
                                } else {
                                  setDraft({ tasks: draft.tasks.map(t =>
                                    t.id === task.id ? { ...t, photos: (t.photos || []).filter(p => p !== uri) } : t
                                  ) });
                                }
                              } },
                            ]);
                          };

                          return (
                            <View key={task.id} style={{ marginBottom: 6 }}>
                              <View style={styles.taskRow}>
                                <View style={[styles.taskCheckbox, task.fait && styles.taskCheckboxDone]}>
                                  <Text style={styles.taskCheckboxText}>{task.fait ? '✓' : ''}</Text>
                                </View>
                                <Text style={[styles.taskText, task.fait && styles.taskTextDone, { flex: 1 }]}>{task.texte}</Text>
                                <Pressable onPress={handleAddPhoto} style={{ paddingHorizontal: 6, paddingVertical: 4 }} accessibilityRole="button" accessibilityLabel="Ajouter une photo à la tâche">
                                  <Ico e="➕" size={18} color="#5C1F2E" />
                                </Pressable>
                                <Pressable
                                  onPress={() => {
                                    if (noteModal?.editingNote) {
                                      const updatedTasks = (noteModal.editingNote.tasks || []).filter(t => t.id !== task.id);
                                      setNoteModal(prev => prev && prev.editingNote ? {
                                        ...prev,
                                        editingNote: { ...prev.editingNote, tasks: updatedTasks }
                                      } : prev);
                                    } else {
                                      setDraft({ tasks: draft.tasks.filter(t => t.id !== task.id) });
                                    }
                                  }}
                                  style={{ padding: 4 }}
                                >
                                  <Text style={{ color: '#E74C3C', fontSize: 12 }}>✕</Text>
                                </Pressable>
                              </View>
                              {/* V10 — liens texte (au lieu de thumbnails) pour cohérence avec vue lecture */}
                              {task.photos && task.photos.length > 0 && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginLeft: 32 }}>
                                  {task.photos.map((uri, idx) => {
                                    const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                    return (
                                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Pressable
                                          onPress={() => openDocPreview(uri)}
                                          accessibilityRole="button"
                                          accessibilityLabel={isPdf ? 'Ouvrir le document' : 'Ouvrir la photo'}
                                        >
                                          <Text style={{ fontSize: 12, color: DS.bordeaux, fontWeight: '600', textDecorationLine: 'underline' }}>
                                            {isPdf ? 'Document' : 'Photo'}
                                          </Text>
                                        </Pressable>
                                        <Pressable
                                          onPress={() => handleRemovePhoto(uri)}
                                          style={{ paddingHorizontal: 4 }}
                                          accessibilityRole="button"
                                          accessibilityLabel="Supprimer la pièce jointe"
                                        >
                                          <Text style={{ color: '#E74C3C', fontSize: 12 }}>✕</Text>
                                        </Pressable>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                  {/* "+ Ajouter une tâche" inconditionnel : si showTaskInput,
                      input affiché ; sinon bouton always visible (pas de toggle). */}
                  {ui.showTaskInput ? (
                    <View style={styles.taskInputRow}>
                      <TextInput
                        style={styles.taskInput}
                        value={ui.newTaskText}
                        onChangeText={(text) => setUi({ newTaskText: text })}
                        placeholder="Décrire la tâche..."
                        placeholderTextColor="#9A8C80"
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          if (ui.newTaskText.trim()) {
                            const newTask: TaskItem = {
                              id: genTaskId(),
                              texte: ui.newTaskText.trim(),
                              fait: false,
                            };
                            if (noteModal?.editingNote) {
                              // Note existante : sauvegarder immédiatement dans les données
                              const affId = data.affectations.find(a =>
                                a.chantierId === noteModal.chantierId &&
                                a.dateDebut <= noteModal.date && a.dateFin >= noteModal.date &&
                                a.notes.some(n => n.id === noteModal.editingNote!.id)
                              )?.id;
                              if (affId) addTask(affId, noteModal.editingNote.id, newTask);
                              // Aussi mettre à jour le state local pour l'affichage
                              setNoteModal(prev => prev && prev.editingNote ? {
                                ...prev,
                                editingNote: { ...prev.editingNote, tasks: [...(prev.editingNote.tasks || []), newTask] }
                              } : prev);
                            } else {
                              // Nouvelle note : stocker dans draft.tasks
                              setDraft({ tasks: [...draft.tasks, newTask] });
                            }
                            setUi({ newTaskText: '', showTaskInput: false });
                          }
                        }}
                      />
                      <Pressable style={styles.taskInputCancel} onPress={() => setUi({ showTaskInput: false, newTaskText: '' })}>
                        <Text style={{ color: '#6E5F54' }}>✕</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.addTaskBtn} onPress={() => setUi({ showTaskInput: true })}>
                      <Text style={styles.addTaskBtnText}>+ Ajouter une tâche</Text>
                    </Pressable>
                  )}

                  {/* Options admin : visibilité et répétition */}
                  {isAdmin && (
                    <View style={{ marginTop: 12, gap: 10 }}>
                      <Text style={styles.noteLabel}>Visible par</Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {(['tous', 'employes', 'soustraitants'] as const).map(v => {
                          const active = draft.visiblePar === v && draft.visibleIds.length === 0;
                          return (
                            <FilterChip
                              key={v}
                              label={v === 'tous' ? 'Tous' : v === 'employes' ? 'Employés' : 'Sous-traitants'}
                              active={active}
                              onPress={() => setDraft({ visiblePar: v, visibleIds: [] })}
                            />
                          );
                        })}
                      </View>
                      {/* Sélection spécifique d'acteurs présents sur le chantier */}
                      {(draft.visiblePar === 'employes' || draft.visiblePar === 'soustraitants') && noteModal && (() => {
                        // Tous les acteurs affectés au chantier (toutes dates) : permet
                        // de rendre une note accessible à un employé/ST affecté après coup.
                        const chantierId = noteModal.chantierId;
                        const employes = draft.visiblePar === 'employes'
                          ? data.employes.filter(e => data.affectations.some(a =>
                              a.chantierId === chantierId && a.employeId === e.id
                            ))
                          : [];
                        const sts = draft.visiblePar === 'soustraitants'
                          ? (data.sousTraitants || []).filter(s => data.affectations.some(a =>
                              a.chantierId === chantierId && a.soustraitantId === s.id
                            ))
                          : [];
                        const acteurs = [
                          ...employes.map(e => ({ id: e.id, label: `${e.prenom} ${e.nom}`, color: getEmployeColor(e) })),
                          ...sts.map(s => ({ id: `st:${s.id}`, label: `${s.prenom} ${s.nom}${s.societe ? ' ('+s.societe+')' : ''}`, color: s.couleur })),
                        ];
                        if (acteurs.length === 0) return null;
                        return (
                          <View style={{ marginTop: 4 }}>
                            <Text style={[styles.noteLabel, { fontSize: 12, color: '#6E5F54' }]}>
                              Sélectionner des acteurs spécifiques (optionnel)
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                              {acteurs.map(a => {
                                const isSelected = draft.visibleIds.includes(a.id);
                                return (
                                  <FilterChip
                                    key={a.id}
                                    label={a.label}
                                    active={isSelected}
                                    activeColor={a.color}
                                    inactiveBorderColor={a.color}
                                    onPress={() => {
                                      setDraft({
                                        visibleIds: draft.visibleIds.includes(a.id)
                                          ? draft.visibleIds.filter(x => x !== a.id)
                                          : [...draft.visibleIds, a.id],
                                      });
                                    }}
                                  />
                                );
                              })}
                            </View>
                          </View>
                        );
                      })()}
                      {/* "Répéter sur N jours" — SUPPRIMÉ V10 (Kevin : la note reste
                          active automatiquement tant qu'une case n'est pas cochée). */}
                    </View>
                  )}

                  <View style={styles.editorActions}>
                    <Pressable
                      style={styles.cancelBtn}
                      onPress={() => {
                        setUi({ showEditor: false, showTaskInput: false, newTaskText: '' });
                        setDraft({ texte: '', photos: [], repeatDays: 0, visiblePar: 'tous' });
                      }}
                    >
                      <Text style={styles.cancelBtnText}>Annuler</Text>
                    </Pressable>
                    <Pressable style={styles.saveNoteBtn} onPress={actions.save}>
                      <Text style={styles.saveNoteBtnText}>Enregistrer</Text>
                    </Pressable>
                  </View>
                </View>
              )}

            {/* Bouton ajouter une note (si pas en mode édition) */}
            {!ui.showEditor && (
              <Pressable style={styles.addNoteBtn} onPress={actions.startNew}>
                <Text style={styles.addNoteBtnText}>+ Ajouter une note</Text>
              </Pressable>
            )}
          </ScrollView>

          <Pressable style={styles.modalCloseBtn} onPress={actions.close}>
            <Text style={styles.modalCloseBtnText}>Fermer</Text>
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
      <EnvoiConsigneSheet
        consigne={consigneAEnvoyer}
        onClose={() => setConsigneAEnvoyer(null)}
        onEnvoye={(employeIds, date) => {
          const n = noteDirectionEnCours ? (data.notesChantier || []).find(x => x.id === noteDirectionEnCours) : undefined;
          if (n) updateNoteChantier({ ...n, transmise: { date, employeIds, le: new Date().toISOString() } });
          setNoteDirectionEnCours(null);
        }}
      />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// ~50 styles dupliqués depuis app/(tabs)/planning.tsx — pattern Phase 2
// (préservation 1:1 + duplication acceptée tant que <3 consommateurs).
// TODO Phase 3 : DS violations (couleurs hex, magic numbers) à corriger
// dans une passe de cleanup global.

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: '#6E5F54' },
  // — Modal layout shared —
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#EDE2D6',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Fraunces_600SemiBold',
    color: '#2B1D14',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6E5F54',
    marginBottom: 16,
  },
  modalXBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1E7DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalXText: {
    fontSize: 14,
    color: '#6E5F54',
    fontWeight: '700',
  },
  modalCloseBtn: {
    marginTop: 16,
    backgroundColor: '#5C1F2E',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // — Liste notes —
  notesList: {
    gap: 12,
    marginBottom: 8,
  },
  noteCard: {
    backgroundColor: '#FAF5EF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDE2D6',
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
    color: '#5C1F2E',
  },
  noteDate: {
    fontSize: 11,
    color: '#6E5F54',
  },
  noteCardText: {
    fontSize: 14,
    color: '#2B1D14',
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
    backgroundColor: '#F2E4E1',
  },
  noteActionBtnDanger: {
    backgroundColor: '#FEE2E2',
  },
  noteActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5C1F2E',
  },
  addNoteBtn: {
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#F2E4E1',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#5C1F2E',
    borderStyle: 'dashed',
  },
  addNoteBtnText: {
    color: '#5C1F2E',
    fontWeight: '700',
    fontSize: 14,
  },

  // — Éditeur —
  noteEditor: {
    marginBottom: 8,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2B1D14',
    marginBottom: 8,
  },
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteInput: {
    flex: 1,
    backgroundColor: '#F1E7DC',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#2B1D14',
    borderWidth: 1,
    borderColor: '#EDE2D6',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  keyboardDismissBtn: {
    backgroundColor: '#EDE2D6',
    borderRadius: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  keyboardDismissText: {
    fontSize: 18,
    color: '#2B1D14',
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
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    borderColor: '#EDE2D6',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1E7DC',
    marginRight: 8,
  },
  addPhotoBtnText: {
    fontSize: 24,
    color: '#6E5F54',
    fontWeight: '300',
  },
  addPhotoBtnLabel: {
    fontSize: 10,
    color: '#6E5F54',
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
    backgroundColor: '#F1E7DC',
    borderWidth: 1,
    borderColor: '#EDE2D6',
  },
  cancelBtnText: {
    color: '#6E5F54',
    fontWeight: '600',
    fontSize: 15,
  },
  saveNoteBtn: {
    flex: 2,
    backgroundColor: '#5C1F2E',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveNoteBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // — PDF (éléments joints) —
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

  // — Checklist de tâches —
  taskList: {
    marginTop: 12,
    backgroundColor: '#FAF5EF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDE2D6',
  },
  taskListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6E5F54',
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
    borderColor: '#9A8C80',
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
    color: '#2B1D14',
    flex: 1,
  },
  taskTextDone: {
    textDecorationLine: 'line-through',
    color: '#9A8C80',
  },
  taskDoneBy: {
    fontSize: 11,
    color: '#27AE60',
    fontStyle: 'italic',
    marginTop: 2,
  },
  taskProgress: {
    height: 4,
    backgroundColor: '#EDE2D6',
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
    color: '#6E5F54',
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
    color: '#5C1F2E',
    fontWeight: '600',
    fontSize: 14,
  },
  taskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#F1E7DC',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#5C1F2E',
  },
  taskInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2B1D14',
  },
  taskInputCancel: {
    padding: 8,
  },

});
