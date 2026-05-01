import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Keyboard,
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
  const { data, currentUser, toggleTask, addTask, deleteTask, addTaskPhoto, removeTaskPhoto } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const { draft, setDraft, ui, setUi, actions } = useNotesModalLogic(noteModal, setNoteModal);

  return (
    <Modal
      visible={noteModal !== null}
      animationType="slide"
      transparent
      onRequestClose={actions.close}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable style={{ flex: 0.08 }} onPress={actions.close} />
        <View style={{ flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {(() => {
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
                    {data.chantiers.find(c => c.id === noteModal.chantierId)?.nom} — {noteModal.date}
                  </Text>
                )}
              </View>
              <Pressable onPress={actions.close} style={styles.modalXBtn}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
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
                                    <Text style={styles.pdfThumbIcon}>📄</Text>
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
                              <Text style={styles.noteActionBtnText}>✏ Modifier</Text>
                            </Pressable>
                            <Pressable style={[styles.noteActionBtn, styles.noteActionBtnDanger]} onPress={() => actions.delete(note)}>
                              <Text style={[styles.noteActionBtnText, { color: '#E74C3C' }]}>🗑 Supprimer</Text>
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
                  {/* Modèles de notes rapides */}
                  {!noteModal?.editingNote && !draft.texte && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 4 }}>
                      {['Finitions à terminer', 'Attente livraison matériel', 'Nettoyage fin de chantier', 'Problème à signaler', 'RAS — Travail en cours'].map(tpl => (
                        <Pressable key={tpl} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E2E6EA' }}
                          onPress={() => setDraft({ texte: tpl })}>
                          <Text style={{ fontSize: 11, color: '#687076' }}>{tpl}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                  {/* Sélecteur SAV (si tickets existent pour ce chantier) */}
                  {noteModal && (() => {
                    const savTickets = (data.ticketsSAV || []).filter(t => t.chantierId === noteModal.chantierId && t.statut !== 'clos');
                    if (savTickets.length === 0) return null;
                    return (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#687076', marginBottom: 4 }}>🔧 Lier à un SAV :</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                          <Pressable style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E2E6EA' }, !draft.savTicketId && { backgroundColor: '#2C2C2C', borderColor: '#2C2C2C' }]}
                            onPress={() => setDraft({ savTicketId: null })}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: !draft.savTicketId ? '#fff' : '#687076' }}>Aucun</Text>
                          </Pressable>
                          {savTickets.map(t => (
                            <Pressable key={t.id} style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E2E6EA' }, draft.savTicketId === t.id && { backgroundColor: '#E74C3C', borderColor: '#E74C3C' }]}
                              onPress={() => {
                                setDraft({ savTicketId: t.id, ...(draft.texte.trim() ? {} : { texte: `SAV: ${t.objet}` }) });
                              }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: draft.savTicketId === t.id ? '#fff' : '#687076' }} numberOfLines={1}>🔧 {t.objet}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    );
                  })()}

                  <View style={styles.noteInputRow}>
                    <TextInput
                      style={styles.noteInput}
                      value={draft.texte}
                      onChangeText={(text) => {
                        const match = text.match(/@(\w*)$/);
                        setDraft({ texte: text });
                        setUi({ mentionQuery: match ? match[1] : null });
                      }}
                      placeholder="Saisir une note... (tapez @ pour mentionner)"
                      placeholderTextColor="#B0BEC5"
                      multiline
                      numberOfLines={4}
                      returnKeyType="done"
                      blurOnSubmit
                    />
                    {/* Suggestions @mentions */}
                    {ui.mentionQuery !== null && (() => {
                      const q = ui.mentionQuery.toLowerCase();
                      const suggestions = data.employes.filter(e =>
                        `${e.prenom} ${e.nom}`.toLowerCase().includes(q) || e.prenom.toLowerCase().startsWith(q)
                      ).slice(0, 5);
                      if (suggestions.length === 0) return null;
                      return (
                        <View style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 6, maxHeight: 150 }}>
                          {suggestions.map(emp => (
                            <Pressable key={emp.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}
                              onPress={() => {
                                const before = draft.texte.replace(/@\w*$/, '');
                                setDraft({ texte: `${before}@${emp.prenom} ` });
                                setUi({ mentionQuery: null });
                              }}>
                              <Text style={{ fontSize: 14, color: '#11181C' }}>
                                <Text style={{ fontWeight: '700' }}>{emp.prenom}</Text> {emp.nom}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      );
                    })()}
                    <Pressable style={styles.keyboardDismissBtn} onPress={Keyboard.dismiss}>
                      <Text style={styles.keyboardDismissText}>↓</Text>
                    </Pressable>
                  </View>

                  <Text style={[styles.noteLabel, { marginTop: 12 }]}>Photos & PDF</Text>
                  {draft.photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
                      {draft.photos.map((uri, idx) => {
                        const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                        return (
                          <View key={idx} style={styles.photoThumb}>
                            <Pressable
                              onPress={() => {
                                // Bug B fix : fermer la modal note AVANT openDocPreview pour éviter
                                // le conflit Modal native iOS qui ferme la modal note quand l'utilisateur
                                // ferme Safari in-app. Pattern emprunté à Suivi chantier (chantiers.tsx).
                                actions.close();
                                setTimeout(() => openDocPreview(uri), 150);
                              }}
                              style={{ width: '100%', height: '100%' }}
                              accessibilityRole="button"
                              accessibilityLabel={isPdf ? 'Ouvrir le PDF' : 'Ouvrir la photo'}
                            >
                              {isPdf ? (
                                <View style={[styles.photoImg, styles.pdfPreview]}>
                                  <Text style={styles.pdfPreviewIcon}>📄</Text>
                                  <Text style={styles.pdfPreviewLabel}>PDF</Text>
                                </View>
                              ) : (
                                <Image source={{ uri }} style={styles.photoImg} />
                              )}
                            </Pressable>
                            <Pressable style={styles.photoRemove} onPress={() => actions.removePhoto(idx)}>
                              <Text style={styles.photoRemoveText}>✕</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <NativeFilePickerButton
                      acceptImages
                      acceptPdf
                      acceptCamera
                      multiple
                      compressImages
                      onPick={actions.addPhotoFromFile}
                    />
                    <InboxPickerButton onPick={actions.addFromInbox} mimeFilter={(m) => m.startsWith('image/') || m === 'application/pdf'} />
                  </View>

                  {/* Section checklist */}
                  <Text style={[styles.noteLabel, { marginTop: 12 }]}>📋 Tâches à faire</Text>
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
                                  <Text style={{ color: '#2C2C2C', fontSize: 16 }}>➕</Text>
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
                              {task.photos && task.photos.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4, marginLeft: 32 }}>
                                  {task.photos.map((uri, idx) => {
                                    const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                    return (
                                      <View key={idx} style={{ marginRight: 6 }}>
                                        <Pressable onPress={() => openDocPreview(uri)} accessibilityRole="button" accessibilityLabel={isPdf ? 'Ouvrir le PDF' : 'Ouvrir la photo'}>
                                          {isPdf ? (
                                            <View style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                                              <Text style={{ fontSize: 18 }}>📄</Text>
                                            </View>
                                          ) : (
                                            <Image source={{ uri }} style={{ width: 48, height: 48, borderRadius: 6 }} />
                                          )}
                                        </Pressable>
                                        <Pressable
                                          onPress={() => handleRemovePhoto(uri)}
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
                        placeholderTextColor="#B0BEC5"
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
                        <Text style={{ color: '#687076' }}>✕</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.addTaskBtn} onPress={() => setUi({ showTaskInput: true })}>
                      <Text style={styles.addTaskBtnText}>+ Ajouter une tâche</Text>
                    </Pressable>
                  )}

                  {/* Options admin : visibilité et répétition */}
                  {isAdmin && !noteModal?.editingNote && (
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
                        // Récupérer les acteurs présents sur ce chantier ce jour
                        const dateStr = noteModal.date;
                        const chantierId = noteModal.chantierId;
                        const employes = draft.visiblePar === 'employes'
                          ? data.employes.filter(e => data.affectations.some(a =>
                              a.chantierId === chantierId && a.employeId === e.id &&
                              a.dateDebut <= dateStr && a.dateFin >= dateStr
                            ))
                          : [];
                        const sts = draft.visiblePar === 'soustraitants'
                          ? (data.sousTraitants || []).filter(s => data.affectations.some(a =>
                              a.chantierId === chantierId && a.soustraitantId === s.id &&
                              a.dateDebut <= dateStr && a.dateFin >= dateStr
                            ))
                          : [];
                        const acteurs = [
                          ...employes.map(e => ({ id: e.id, label: `${e.prenom} ${e.nom}`, color: getEmployeColor(e) })),
                          ...sts.map(s => ({ id: `st:${s.id}`, label: `${s.prenom} ${s.nom}${s.societe ? ' ('+s.societe+')' : ''}`, color: s.couleur })),
                        ];
                        if (acteurs.length === 0) return null;
                        return (
                          <View style={{ marginTop: 4 }}>
                            <Text style={[styles.noteLabel, { fontSize: 12, color: '#687076' }]}>
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
                      <Text style={styles.noteLabel}>Répéter sur</Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {[0, 1, 2, 3, 5, 7, 14].map(d => (
                          <FilterChip
                            key={d}
                            label={d === 0 ? 'Non' : d === 1 ? '+1 j' : `+${d} j`}
                            active={draft.repeatDays === d}
                            onPress={() => setDraft({ repeatDays: d })}
                          />
                        ))}
                      </View>
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
  // — Modal layout shared —
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E6EA',
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
    fontSize: 17,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#687076',
    marginBottom: 16,
  },
  modalXBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5EDE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalXText: {
    fontSize: 14,
    color: '#687076',
    fontWeight: '700',
  },
  modalCloseBtn: {
    marginTop: 16,
    backgroundColor: '#2C2C2C',
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
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E6EA',
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
    color: '#2C2C2C',
  },
  noteDate: {
    fontSize: 11,
    color: '#687076',
  },
  noteCardText: {
    fontSize: 14,
    color: '#11181C',
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
    backgroundColor: '#EEF2F8',
  },
  noteActionBtnDanger: {
    backgroundColor: '#FEE2E2',
  },
  noteActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  addNoteBtn: {
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#EEF2F8',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2C2C2C',
    borderStyle: 'dashed',
  },
  addNoteBtnText: {
    color: '#2C2C2C',
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
    color: '#11181C',
    marginBottom: 8,
  },
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteInput: {
    flex: 1,
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  keyboardDismissBtn: {
    backgroundColor: '#E2E6EA',
    borderRadius: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  keyboardDismissText: {
    fontSize: 18,
    color: '#11181C',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    borderColor: '#E2E6EA',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5EDE3',
    marginRight: 8,
  },
  addPhotoBtnText: {
    fontSize: 24,
    color: '#687076',
    fontWeight: '300',
  },
  addPhotoBtnLabel: {
    fontSize: 10,
    color: '#687076',
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
    backgroundColor: '#F5EDE3',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  cancelBtnText: {
    color: '#687076',
    fontWeight: '600',
    fontSize: 15,
  },
  saveNoteBtn: {
    flex: 2,
    backgroundColor: '#2C2C2C',
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
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  taskListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
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
    borderColor: '#B0BEC5',
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
    color: '#11181C',
    flex: 1,
  },
  taskTextDone: {
    textDecorationLine: 'line-through',
    color: '#B0BEC5',
  },
  taskDoneBy: {
    fontSize: 11,
    color: '#27AE60',
    fontStyle: 'italic',
    marginTop: 2,
  },
  taskProgress: {
    height: 4,
    backgroundColor: '#E2E6EA',
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
    color: '#687076',
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
    color: '#2C2C2C',
    fontWeight: '600',
    fontSize: 14,
  },
  taskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  taskInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#11181C',
  },
  taskInputCancel: {
    padding: 8,
  },

});
