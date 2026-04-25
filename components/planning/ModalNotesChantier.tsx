import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { DS, font, radius, space } from '../../constants/design';
import { useLanguage } from '../../app/context/LanguageContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format FR court "JJ mmm HH:MM" depuis un ISO timestamp.
 * Note : préserve exactement l'appel d'origine (`toLocaleDateString` avec
 * options d'heure — comportement selon moteur JS, cohérent avec l'original).
 */
function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day:    '2-digit',
    month:  'short',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

/**
 * Ouvre une pièce jointe en preview web-only via `window.open`.
 * PDF → iframe plein écran. Image → balise `<img>`.
 */
function openAttachment(uri: string, type: 'pdf' | 'image'): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const w = window.open();
  if (!w) return;
  if (type === 'pdf') {
    w.document.write(`<iframe src="${uri}" style="width:100%;height:100vh;border:none"></iframe>`);
  } else {
    w.document.write(`<img src="${uri}" style="max-width:100%;height:auto">`);
  }
}

/**
 * Confirmation de suppression — Alert natif sur mobile, `window.confirm` sur web.
 * Strings FR hardcodées (bug i18n pré-existant — préservé à l'identique pour
 * fidélité Phase 2). À corriger hors scope, documenté dans REFACTOR_NOTES.md.
 */
function confirmDelete(noteId: string, onConfirm: (id: string) => void): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm && window.confirm('Supprimer cette note ?')) {
      onConfirm(noteId);
    }
  } else {
    Alert.alert('Supprimer', 'Supprimer cette note ?', [
      { text: 'Annuler',   style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onConfirm(noteId) },
    ]);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Entrée de note chantier pour l'affichage dans la liste.
 * Volontairement découplée du type `NoteChantier` global (minimaliste).
 *
 * Deux types de pièces jointes coexistent :
 * - `pieceJointe` (legacy, single) + `pieceJointeType` + `pieceJointeNom`
 * - `photos[]` (modern, multiple, images ou PDF en data URI)
 */
export interface NoteChantierEntry {
  id: string;
  auteurId: string;
  auteurNom: string;
  texte: string;
  createdAt: string;
  destinataires: 'tous' | string[];
  photos?: string[];
  /** Pièce jointe legacy (une seule). */
  pieceJointe?: string;
  pieceJointeType?: 'pdf' | 'image';
  pieceJointeNom?: string;
}

/** Valeurs saisies au submit d'une nouvelle note. */
export interface NoteChantierFormValues {
  texte: string;
  destinataires: 'tous' | string[];
  photos: string[];
}

/** Participant pour le selector destinataires (admin only). */
export interface NoteParticipant {
  id: string;
  label: string;
  kind: 'employe' | 'soustraitant';
}

/**
 * Props du composant `ModalNotesChantier`.
 *
 * Modale controlled hybride : parent détient `visible` + `chantierNom`,
 * composant gère le state du formulaire (texte, destinataires, photos)
 * en interne avec reset à l'ouverture.
 */
export interface ModalNotesChantierProps {
  visible: boolean;
  onClose: () => void;
  /** Nom du chantier affiché dans le titre. */
  chantierNom: string;
  /** Notes déjà filtrées par le parent (archivedBy + destinataires + rôle). */
  notes: NoteChantierEntry[];
  /** Participants (employés + sous-traitants) pour le selector. */
  participants: NoteParticipant[];
  /** Gate le selector destinataires + sections admin + bouton supprimer. */
  isAdmin: boolean;
  /** Picker photos/PDF multi-fichier (retourne les data URIs). */
  onPickPhotos: () => Promise<string[]>;
  /** Callback submit. Le parent construit l'objet métier complet. */
  onAddNote: (values: NoteChantierFormValues) => void;
  /** Archivage (parent résout `userId` interne). */
  onArchiveNote: (noteId: string) => void;
  /** Suppression — confirmation gérée DANS le composant (préservation comportement). */
  onDeleteNote: (noteId: string) => void;
}

// ─── Types internes (list items avec headers admin) ───────────────────────────

type ListItem =
  | { kind: 'header'; label: string }
  | { kind: 'note'; note: NoteChantierEntry };

// ─── Constantes internes ──────────────────────────────────────────────────────

// — Couleurs non-DS (valeurs originales préservées) —

/** Overlay modale (rgba noire 0.4). Pas de token DS équivalent. */
const MODAL_OVERLAY_BG = 'rgba(0,0,0,0.4)';

/** Gris très clair pour placeholder + empty text. Pas de token DS équivalent. */
const COLOR_PLACEHOLDER = '#B0BEC5';

/** Fond des chips destinataires. Pas de token DS équivalent. */
const CHIP_BG_COLOR = '#F8FAFC';

/** Border des chips. Pas de token DS équivalent. */
const CHIP_BORDER_COLOR = '#CBD5E1';

/** Couleur du texte des chips. Pas de token DS équivalent. */
const CHIP_TEXT_COLOR = '#4A5568';

/**
 * Fond de la carte note (jaune post-it pâle).
 * Pas de token DS équivalent.
 */
const NOTE_CARD_BG = '#FFFDE7';

/** Accent borderLeft de la carte note (orange). Pas de token DS équivalent. */
const NOTE_CARD_ACCENT = '#F39C12';

/**
 * Vert bouton Archiver (Flat UI). DS.success vaut #10B981 — différent.
 * Valeur originale préservée.
 */
const ARCHIVE_BG = '#27AE60';

/** Border supérieur du formulaire (différent de DS.borderAlt). */
const FORM_BORDER_TOP = '#E8ECEF';

/** Fond des placeholders PDF dans les photos jointes. Pas de token DS équivalent. */
const PDF_PLACEHOLDER_BG = '#FFF3CD';

/** Shadow noir pur. Différent de DS.primary (#2C2C2C). */
const SHADOW_COLOR = '#000';

// — Magic numbers non-DS —

/** Padding-bottom iOS du sheet (safe-area). Pas de token équivalent. */
const SHEET_PB_IOS = 36;

/** Largeur du drag handle. */
const HANDLE_WIDTH = 40;

/** Border-radius du drag handle. */
const HANDLE_RADIUS = 2;

/** Taille du titre modale (entre `font.subhead=15` et `font.title=18`). */
const TITLE_FS = 17;

/** Padding-vertical du bouton "Ajouter" (entre `space.md=12` et `space.lg=16`). */
const CLOSE_BTN_PV = 14;

/** Border-radius du TextInput multiline (entre `radius.sm=8` et `radius.md=12`). */
const NOTE_INPUT_RADIUS = 10;

/** Hauteur minimale du TextInput note. */
const NOTE_INPUT_MIN_HEIGHT = 100;

/** Hauteur minimale du TextInput note dans la modale (override). */
const NOTE_INPUT_FORM_MIN_HEIGHT = 80;

/** Padding-horizontal des chips (entre `space.sm=8` et `space.md=12`). */
const CHIP_PH = 10;

/** Padding-vertical des chips (entre `space.xs=4` et `space.sm=8`). */
const CHIP_PV = 5;

/** Taille du carré photo preview dans la note. */
const PHOTO_THUMB_SIZE = 60;

/** Marge-right entre photos thumb. */
const PHOTO_THUMB_MR = 6;

/** fontSize du PDF placeholder. */
const PDF_EMOJI_FS = 22;

/** Taille du carré photo dans le form preview. */
const FORM_PHOTO_SIZE = 56;

/** Largeur du wrap autour d'une photo dans le form. */
const FORM_PHOTO_WRAP = 64;

/** Border-radius des photos form. */
const FORM_PHOTO_RADIUS = 6;

/** Position top/right offset du bouton × photo. */
const REMOVE_PHOTO_OFFSET = -4;

/** marginBottom de la ligne destinataires. */
const NOTE_DEST_MB = 6;

/** Border-radius du bandeau section header (admin). */
const SECTION_HEADER_RADIUS = 6;

/** Padding-vertical du bandeau section header. */
const SECTION_HEADER_PV = 6;

/** Top margin du bandeau section header. */
const SECTION_HEADER_MT = 10;

/** Bottom margin du bandeau section header. */
const SECTION_HEADER_MB = 6;

/** Shadow offset height (carte note). */
const SHADOW_OFFSET_Y = 2;

/** Shadow opacity (carte note). */
const SHADOW_OPACITY = 0.08;

/** Shadow radius (carte note). */
const SHADOW_RADIUS = 8;

/** Shadow elevation Android. */
const SHADOW_ELEVATION = 1;

// ─── Helpers internes ─────────────────────────────────────────────────────────

/** Construit la liste d'items à afficher (avec headers admin si applicable). */
function buildListItems(notes: NoteChantierEntry[], admin: boolean): ListItem[] {
  if (!admin) return notes.map(note => ({ kind: 'note' as const, note }));
  const mesNotes    = notes.filter(n => n.auteurId === 'admin');
  const autresNotes = notes.filter(n => n.auteurId !== 'admin');
  const items: ListItem[] = [];
  if (mesNotes.length > 0) {
    items.push({ kind: 'header', label: `📝 Mes notes (${mesNotes.length})` });
    mesNotes.forEach(n => items.push({ kind: 'note', note: n }));
  }
  if (autresNotes.length > 0) {
    items.push({ kind: 'header', label: `👥 Notes des autres (${autresNotes.length})` });
    autresNotes.forEach(n => items.push({ kind: 'note', note: n }));
  }
  return items;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Modale de gestion des notes d'un chantier spécifique.
 *
 * - Admin : voit la liste groupée (Mes notes / Notes des autres), peut
 *   ajouter, archiver et supprimer n'importe quelle note.
 * - Employé/ST : voit les notes dont il est destinataire, peut ajouter
 *   (visibilité forcée à "tous") et archiver.
 *
 * Controlled modal + state form interne (reset à l'ouverture).
 * i18n via `useLanguage()` pour `t.planning.notes` et `t.common.add`.
 *
 * @example
 * ```tsx
 * <ModalNotesChantier
 *   visible={showNotesPlanning}
 *   onClose={() => setShowNotesPlanning(false)}
 *   chantierNom={chantierNomNotes}
 *   notes={notesVisibles}
 *   participants={participants}
 *   isAdmin={isAdmin}
 *   onPickPhotos={handlePickNotePhotos}
 *   onAddNote={handleAddNote}
 *   onArchiveNote={handleArchiveNote}
 *   onDeleteNote={handleDeleteNote}
 * />
 * ```
 */
export function ModalNotesChantier({
  visible,
  onClose,
  chantierNom,
  notes,
  participants,
  isAdmin,
  onPickPhotos,
  onAddNote,
  onArchiveNote,
  onDeleteNote,
}: ModalNotesChantierProps): React.ReactElement {
  const { t } = useLanguage();

  const [texte, setTexte]               = useState('');
  const [destinataires, setDestinataires] = useState<'tous' | string[]>('tous');
  const [photos, setPhotos]             = useState<string[]>([]);

  // Reset à chaque ouverture (UX : formulaire vierge)
  useEffect(() => {
    if (visible) {
      setTexte('');
      setDestinataires('tous');
      setPhotos([]);
    }
  }, [visible]);

  const hasPhotos = photos.length > 0;
  const isValid   = texte.trim().length > 0 || hasPhotos;

  const listItems = useMemo(() => buildListItems(notes, isAdmin), [notes, isAdmin]);

  const handleSubmit = (): void => {
    if (!isValid) return;
    onAddNote({
      texte: texte.trim(),
      destinataires: isAdmin ? destinataires : 'tous',
      photos,
    });
    // Reset du form après submit (reste ouvert pour une autre note)
    setTexte('');
    setDestinataires('tous');
    setPhotos([]);
  };

  const handlePick = async (): Promise<void> => {
    const newPhotos = await onPickPhotos();
    if (newPhotos.length > 0) setPhotos(prev => [...prev, ...newPhotos]);
  };

  const toggleRecipient = (id: string): void => {
    setDestinataires(prev => {
      if (prev === 'tous') return [id];
      const arr = prev as string[];
      return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
    });
  };

  const isRecipientSelected = (id: string): boolean =>
    Array.isArray(destinataires) && destinataires.includes(id);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTap} onPress={onClose} />
        <Pressable style={styles.sheet} onPress={() => { /* bloque le tap-through */ }}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              📝 Notes — {chantierNom}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.xBtn}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Text style={styles.xBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {notes.length === 0 && (
              <Text style={styles.emptyText}>
                Aucune note active pour ce chantier.
              </Text>
            )}

            {listItems.map(item => item.kind === 'header' ? (
              <View key={`h_${item.label}`} style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{item.label}</Text>
              </View>
            ) : (
              <NoteCard
                key={item.note.id}
                note={item.note}
                isAdmin={isAdmin}
                participants={participants}
                onArchive={onArchiveNote}
                onDelete={onDeleteNote}
              />
            ))}

            {/* Formulaire ajout note */}
            <View style={styles.formBlock}>
              <Text style={styles.formTitle}>{t.planning.notes}</Text>

              <TextInput
                style={[styles.noteInput, styles.noteInputForm]}
                value={texte}
                onChangeText={setTexte}
                placeholder="Écrivez votre note ici..."
                placeholderTextColor={COLOR_PLACEHOLDER}
                multiline
              />

              {/* Sélecteur destinataires (admin only) */}
              {isAdmin && (
                <View style={styles.recipientsBlock}>
                  <Text style={styles.recipientsLabel}>Destinataires</Text>
                  <View style={styles.chipsRow}>
                    <Pressable
                      style={[styles.chip, destinataires === 'tous' && styles.chipActive]}
                      onPress={() => setDestinataires('tous')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: destinataires === 'tous' }}
                    >
                      <Text style={[styles.chipText, destinataires === 'tous' && styles.chipTextActive]}>
                        Tous
                      </Text>
                    </Pressable>
                    {participants.map(p => {
                      const selected = isRecipientSelected(p.id);
                      const suffix = p.kind === 'soustraitant' ? ' (ST)' : '';
                      return (
                        <Pressable
                          key={p.id}
                          style={[styles.chip, selected && styles.chipActive]}
                          onPress={() => toggleRecipient(p.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                            {p.label}{suffix}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Preview photos jointes (form) */}
              {hasPhotos && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.formPhotosRow}
                >
                  {photos.map((uri, idx) => (
                    <View key={idx} style={styles.formPhotoWrap}>
                      {uri.startsWith('data:image') ? (
                        <Image source={{ uri }} style={styles.formPhoto} />
                      ) : (
                        <View style={[styles.formPhoto, styles.formPhotoPdf]}>
                          <Text style={styles.pdfEmoji}>📄</Text>
                        </View>
                      )}
                      <Pressable
                        style={styles.removePhotoBtn}
                        onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                        accessibilityRole="button"
                        accessibilityLabel="Retirer la photo"
                      >
                        <Text style={styles.removePhotoText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              <Pressable
                style={styles.pickPhotosBtn}
                onPress={handlePick}
                accessibilityRole="button"
              >
                <Text style={styles.pickPhotosEmoji}>📎</Text>
                <Text style={styles.pickPhotosText}>Ajouter photo / PDF</Text>
              </Pressable>

              <Pressable
                style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!isValid}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isValid }}
              >
                <Text style={styles.submitBtnText}>{t.common.add}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Sous-composant interne : carte note ──────────────────────────────────────

interface NoteCardProps {
  note: NoteChantierEntry;
  isAdmin: boolean;
  participants: NoteParticipant[];
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function NoteCard({
  note,
  isAdmin,
  participants,
  onArchive,
  onDelete,
}: NoteCardProps): React.ReactElement {
  const hasDestinatairesList =
    note.destinataires !== 'tous' && isAdmin && Array.isArray(note.destinataires);

  const destinatairesLabels = hasDestinatairesList
    ? (note.destinataires as string[]).map(id => {
        const p = participants.find(x => x.id === id);
        return p ? p.label : id;
      }).join(', ')
    : '';

  return (
    <View style={styles.noteCard}>
      <View style={styles.noteHeader}>
        <Text style={styles.noteAuteur}>{note.auteurNom}</Text>
        <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
      </View>

      <Text style={styles.noteTexte}>{note.texte}</Text>

      {/* Pièce jointe legacy (unique) */}
      {note.pieceJointe && note.pieceJointeType && (
        <Pressable
          style={styles.attachmentBox}
          onPress={() => openAttachment(note.pieceJointe as string, note.pieceJointeType as 'pdf' | 'image')}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir ${note.pieceJointeNom || 'pièce jointe'}`}
        >
          <Text style={styles.attachmentEmoji}>
            {note.pieceJointeType === 'pdf' ? '📄' : '🖼️'}
          </Text>
          <Text style={styles.attachmentName} numberOfLines={1}>
            {note.pieceJointeNom || (note.pieceJointeType === 'pdf' ? 'PDF' : 'Image')}
          </Text>
          <Text style={styles.attachmentOpen}>Ouvrir →</Text>
        </Pressable>
      )}

      {/* Photos multiples */}
      {note.photos && note.photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.notePhotosRow}
        >
          {note.photos.map((uri, idx) => {
            const isPdf = uri.startsWith('data:application/pdf');
            if (isPdf) {
              return (
                <Pressable
                  key={idx}
                  style={[styles.notePhoto, styles.notePhotoPdf]}
                  onPress={() => openAttachment(uri, 'pdf')}
                  accessibilityRole="button"
                  accessibilityLabel="Ouvrir le PDF"
                >
                  <Text style={styles.pdfEmoji}>📄</Text>
                </Pressable>
              );
            }
            return (
              <Image
                key={idx}
                source={{ uri }}
                style={styles.notePhoto}
                resizeMode="cover"
              />
            );
          })}
        </ScrollView>
      )}

      {/* Destinataires (admin only, si pas "tous") */}
      {hasDestinatairesList && (
        <Text style={styles.destinatairesText}>
          👤 Pour : {destinatairesLabels}
        </Text>
      )}

      {/* Actions Archiver / Supprimer */}
      <View style={styles.actionsRow}>
        <Pressable
          style={styles.archiveBtn}
          onPress={() => onArchive(note.id)}
          accessibilityRole="button"
        >
          <Text style={styles.archiveBtnText}>✓ Archiver</Text>
        </Pressable>
        {isAdmin && (
          <Pressable
            style={styles.deleteBtn}
            onPress={() => confirmDelete(note.id, onDelete)}
            accessibilityRole="button"
          >
            <Text style={styles.deleteBtnText}>🗑 Supprimer</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // — Modal shell —
  overlay: {
    flex:            1,
    backgroundColor: MODAL_OVERLAY_BG,
    justifyContent:  'flex-end',
  },

  overlayTap: {
    flex: 0.05,
  },

  sheet: {
    backgroundColor:      DS.surface,
    borderTopLeftRadius:  radius.xl,           // 20
    borderTopRightRadius: radius.xl,           // 20
    padding:              space.xl,            // 20
    paddingBottom:        Platform.OS === 'ios' ? SHEET_PB_IOS : space.xl,
    maxHeight:            '80%',
  },

  handle: {
    alignSelf:       'center',
    width:           HANDLE_WIDTH,
    height:          space.xs,                 // 4
    backgroundColor: DS.borderAlt,
    borderRadius:    HANDLE_RADIUS,
    marginBottom:    space.lg,                 // 16
  },

  // — Header —
  headerRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginBottom:   space.xs,                  // 4
  },

  title: {
    flex:         1,
    fontSize:     TITLE_FS,                    // 17
    fontWeight:   font.bold,
    color:        DS.textStrong,
    marginBottom: space.xs,                    // 4
  },

  xBtn: {
    width:           space.xxxl,               // 32
    height:          space.xxxl,               // 32
    borderRadius:    radius.lg,                // 16
    backgroundColor: DS.background,
    alignItems:      'center',
    justifyContent:  'center',
  },

  xBtnText: {
    fontSize:   font.md,                       // 14
    color:      DS.textAlt,
    fontWeight: font.bold,
  },

  // — Scroll body —
  scrollBody: {
    flex: 1,
  },

  emptyText: {
    textAlign:     'center',
    color:         COLOR_PLACEHOLDER,
    marginVertical: space.xl,                  // 20
  },

  // — Section headers (admin groupement) —
  sectionHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               space.xs + 2,           // 6, fine
    marginTop:         SECTION_HEADER_MT,      // 10
    marginBottom:      SECTION_HEADER_MB,      // 6
    paddingHorizontal: space.xs,      // 4
    paddingVertical:   SECTION_HEADER_PV,      // 6
    backgroundColor:   DS.background,
    borderRadius:      SECTION_HEADER_RADIUS,  // 6
  },

  sectionHeaderText: {
    fontSize:   font.sm,                       // 12
    fontWeight: font.bold,
    color:      DS.primary,
  },

  // — Note card —
  noteCard: {
    backgroundColor:  NOTE_CARD_BG,
    borderRadius:     NOTE_INPUT_RADIUS,       // 10
    padding:          space.md,                // 12
    marginHorizontal: space.lg,                // 16
    marginVertical:   space.xs + 2,            // 6, fine
    borderLeftWidth:  space.xs,                // 4
    borderLeftColor:  NOTE_CARD_ACCENT,
    shadowColor:      SHADOW_COLOR,
    shadowOffset:     { width: 0, height: SHADOW_OFFSET_Y },
    shadowOpacity:    SHADOW_OPACITY,
    shadowRadius:     SHADOW_RADIUS,
    elevation:        SHADOW_ELEVATION,
  },

  noteHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   space.xs,            // 4
  },

  noteAuteur: {
    fontWeight: font.bold,
    color:      DS.primary,
    fontSize:   font.body,                     // 13
  },

  noteDate: {
    fontSize: font.compact,                    // 11
    color:    COLOR_PLACEHOLDER,
  },

  noteTexte: {
    fontSize:     font.md,                     // 14
    color:        DS.textStrong,
    marginBottom: space.sm,               // 8
  },

  attachmentBox: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             space.sm,                 // 8
    backgroundColor: DS.background,
    borderRadius:    radius.sm,                // 8
    padding:         space.sm,                 // 8
    marginBottom:    space.sm,            // 8
  },

  attachmentEmoji: {
    fontSize: font.xl,             // 20
  },

  attachmentName: {
    flex:       1,
    fontSize:   font.sm,                       // 12
    color:      DS.primary,
    fontWeight: font.semibold,
  },

  attachmentOpen: {
    fontSize: font.compact,                    // 11
    color:    DS.textAlt,
  },

  notePhotosRow: {
    marginBottom: space.sm,               // 8
  },

  notePhoto: {
    width:        PHOTO_THUMB_SIZE,            // 60
    height:       PHOTO_THUMB_SIZE,            // 60
    borderRadius: radius.sm,          // 8
    marginRight:  PHOTO_THUMB_MR,              // 6
  },

  notePhotoPdf: {
    backgroundColor: PDF_PLACEHOLDER_BG,
    alignItems:      'center',
    justifyContent:  'center',
  },

  pdfEmoji: {
    fontSize: PDF_EMOJI_FS,                    // 22
  },

  destinatairesText: {
    fontSize:     font.compact,                // 11
    color:        DS.textAlt,
    marginBottom: NOTE_DEST_MB,                // 6
  },

  actionsRow: {
    flexDirection: 'row',
    gap:           space.sm,                   // 8
  },

  archiveBtn: {
    backgroundColor:   ARCHIVE_BG,
    paddingHorizontal: space.md,               // 12
    paddingVertical:   space.xs + 2,           // 6, fine
    borderRadius:      radius.sm,              // 8
  },

  archiveBtnText: {
    color:      DS.textInverse,
    fontWeight: font.bold,
    fontSize:   font.sm,                       // 12
  },

  deleteBtn: {
    backgroundColor:   DS.error,
    paddingHorizontal: space.md,               // 12
    paddingVertical:   space.xs + 2,           // 6, fine
    borderRadius:      radius.sm,              // 8
  },

  deleteBtnText: {
    color:      DS.textInverse,
    fontWeight: font.bold,
    fontSize:   font.sm,                       // 12
  },

  // — Formulaire —
  formBlock: {
    padding:         space.lg,                 // 16
    borderTopWidth:  1,
    borderTopColor:  FORM_BORDER_TOP,
    marginTop:       space.sm,                 // 8
  },

  formTitle: {
    fontWeight:   font.bold,
    color:        DS.textStrong,
    marginBottom: space.sm,                    // 8
  },

  noteInput: {
    flex:              1,
    backgroundColor:   DS.background,
    borderRadius:      NOTE_INPUT_RADIUS,      // 10
    padding:           space.md,               // 12
    fontSize:          font.md,                // 14
    color:             DS.textStrong,
    borderWidth:       1,
    borderColor:       DS.borderAlt,
    minHeight:         NOTE_INPUT_MIN_HEIGHT,  // 100
    textAlignVertical: 'top',
  },

  noteInputForm: {
    minHeight: NOTE_INPUT_FORM_MIN_HEIGHT,     // 80 (override pour le form)
  },

  recipientsBlock: {
    marginTop: space.sm,                       // 8
  },

  recipientsLabel: {
    fontWeight:   font.semibold,
    color:        DS.textAlt,
    fontSize:     font.body,                   // 13
    marginBottom: NOTE_DEST_MB,                // 6
  },

  chipsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           NOTE_DEST_MB,               // 6
  },

  chip: {
    paddingHorizontal: CHIP_PH,                // 10
    paddingVertical:   CHIP_PV,                // 5
    borderRadius:      radius.lg,              // 16
    borderWidth:       1,
    borderColor:       CHIP_BORDER_COLOR,
    backgroundColor:   CHIP_BG_COLOR,
  },

  chipActive: {
    backgroundColor: DS.primary,
    borderColor:     DS.primary,
  },

  chipText: {
    fontSize:   font.sm,                       // 12
    color:      CHIP_TEXT_COLOR,
    fontWeight: font.medium,
  },

  chipTextActive: {
    color:      DS.textInverse,
    fontWeight: font.bold,
  },

  formPhotosRow: {
    marginTop:    space.sm,                    // 8
    marginBottom: space.xs,                    // 4
  },

  formPhotoWrap: {
    width:      FORM_PHOTO_WRAP,               // 64
    marginRight: space.sm,                     // 8
    alignItems:  'center',
  },

  formPhoto: {
    width:        FORM_PHOTO_SIZE,             // 56
    height:       FORM_PHOTO_SIZE,             // 56
    borderRadius: FORM_PHOTO_RADIUS,           // 6
  },

  formPhotoPdf: {
    backgroundColor: PDF_PLACEHOLDER_BG,
    alignItems:      'center',
    justifyContent:  'center',
  },

  removePhotoBtn: {
    position:        'absolute',
    top:             REMOVE_PHOTO_OFFSET,      // -4
    right:           REMOVE_PHOTO_OFFSET,      // -4
    backgroundColor: DS.error,
    borderRadius:    radius.sm,                // 8
    width:           space.lg,    // 16
    height:          space.lg,    // 16
    alignItems:      'center',
    justifyContent:  'center',
  },

  removePhotoText: {
    color:      DS.textInverse,
    fontSize:   font.tiny,               // 9
    fontWeight: font.bold,
  },

  pickPhotosBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             space.xs + 2,             // 6, fine
    backgroundColor: DS.background,
    borderRadius:    radius.sm,                // 8
    padding:         space.sm + 2,             // 10, fine
    marginTop:       space.sm,                 // 8
    borderWidth:     1,
    borderColor:     DS.borderAlt,
    borderStyle:     'dashed',
  },

  pickPhotosEmoji: {
    fontSize: font.lg,                         // 16
  },

  pickPhotosText: {
    fontSize:   font.body,                     // 13
    color:      DS.primary,
    fontWeight: font.semibold,
  },

  submitBtn: {
    marginTop:       space.md,                 // 12
    backgroundColor: DS.primary,
    paddingVertical: CLOSE_BTN_PV,             // 14
    borderRadius:    radius.md,                // 12
    alignItems:      'center',
  },

  submitBtnDisabled: {
    opacity: 0.5,
  },

  submitBtnText: {
    color:      DS.textInverse,
    fontWeight: font.bold,
    fontSize:   font.subhead,                  // 15
  },
});

