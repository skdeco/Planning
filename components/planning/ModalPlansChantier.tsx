import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { DS, font, radius, space } from '../../constants/design';
import { useLanguage } from '../../app/context/LanguageContext';
import { EmptyState } from '../ui/EmptyState';
import { FilterChip } from '../ui/FilterChip';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { NativeFilePickerButton } from '@/components/share/NativeFilePickerButton';
import { openDocPreview } from '@/lib/share/openDocPreview';
import type { InboxItem } from '@/lib/share/inboxStore';
import type { PickedFile } from '@/lib/share/pickNativeFile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Filtre mime pour l'InboxPickerButton : photos + PDF. */
const inboxMimeFilterImagePdf = (m: string): boolean =>
  m.startsWith('image/') || m === 'application/pdf';

/** Format FR court "JJ mmm AAAA" depuis un ISO timestamp. */
function formatUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

/** Emoji du type de fichier (PDF vs image). */
function fileEmoji(fichier: string): string {
  return (fichier.endsWith('.pdf') || fichier.includes('application/pdf')) ? '📄' : '🖼️';
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Plan d'un chantier — forme minimale pour affichage dans la liste.
 * Volontairement découplé du type `PlanChantier` global.
 */
export interface PlanChantierEntry {
  id: string;
  nom: string;
  /** URL Supabase Storage ou data-URI base64. */
  fichier: string;
  /** ISO timestamp de l'upload. */
  uploadedAt: string;
}

/**
 * Participant sélectionnable pour la visibilité "spécifique".
 * `kind` permet d'afficher le suffixe "(ST)" pour les sous-traitants.
 */
export interface PlanParticipant {
  id: string;
  label: string;
  kind: 'employe' | 'soustraitant';
}

/**
 * Valeurs saisies au submit d'un nouveau plan. Le parent construit
 * ensuite l'objet `PlanChantier` complet (id, uploadedAt) avant appel
 * à `addPlanChantier`.
 */
export interface PlanChantierValues {
  nom: string;
  fichier: string;
  visiblePar: 'tous' | 'employes' | 'soustraitants' | 'specifique';
  visibleIds?: string[];
}

/**
 * Props du composant `ModalPlansChantier`.
 *
 * Modale controlled (pattern `visible` + `onClose`). State interne du
 * formulaire (nom, fichier, visibilité). Parent pré-filtre les plans
 * selon le rôle utilisateur et fournit les callbacks.
 */
export interface ModalPlansChantierProps {
  /** Contrôle d'ouverture. */
  visible: boolean;
  /** Callback de fermeture (requestClose + tap outside + bouton ✕). */
  onClose: () => void;
  /** Nom du chantier affiché en sous-titre. */
  chantierNom: string;
  /** Plans déjà filtrés par le parent selon la visibilité + rôle. */
  plans: PlanChantierEntry[];
  /** Participants (employés + sous-traitants) pour le selector "spécifique". */
  participants: PlanParticipant[];
  /** Gate la section "ajouter un plan" + bouton 🗑 suppression. */
  isAdmin: boolean;
  /** Picker natif (web input / iOS ActionSheet Photos+Fichiers). Upload + retour URL Storage. */
  onPickNativeFile?: (file: PickedFile) => Promise<string | null>;
  /** Picker depuis l'Inbox iOS (Share Extension). Upload + retour URL Storage. */
  onPickFromInbox?: (item: InboxItem) => Promise<string | null>;
  /** Callback submit — le parent construit l'objet métier complet. */
  onAddPlan: (values: PlanChantierValues) => void;
  /** Callback suppression d'un plan existant (admin only). */
  onDeletePlan: (planId: string) => void;
}

// ─── Records statiques (emojis) ───────────────────────────────────────────────

/**
 * Emojis utilisés dans la modale. Centralisés pour la migration
 * vers `lucide-react-native` en Phase 4 — ne toucher que ce record.
 */
const EMOJI = {
  /** Bouton supprimer un plan. */
  trash:  '🗑',
  /** Bouton fermer (✕). */
  close: '✕',
  /** Radios de visibilité. */
  employes:   '👷 Employés',
  soustraits: '👤 ST',
  specifique: '👥 Sélection',
} as const;

// ─── Constantes internes ──────────────────────────────────────────────────────

// — Couleurs non couvertes par les tokens DS (fidélité pixel-perfect) —

/** Overlay modale (rgba noire 0.4). Original préservé. */
const MODAL_OVERLAY_BG = 'rgba(0,0,0,0.4)';

/** Fond des items de liste plans (quasi-blanc). Pas de token DS équivalent. */
const LIST_ITEM_BG = '#F8F9FB';

/** Fond du bouton supprimer (rouge pâle). Pas de token DS équivalent. */
const DELETE_BTN_BG = '#FFF0F0';

/** Couleur des placeholders TextInput. Pas de token DS équivalent. */
const PLACEHOLDER_COLOR = '#B0BEC5';

// — Magic numbers non couverts par les tokens —

/** Padding-bottom iOS du sheet (safe-area). */
const SHEET_PB_IOS = 36;

/** Largeur du drag handle. */
const HANDLE_WIDTH = 40;

/** Border-radius du drag handle. */
const HANDLE_RADIUS = 2;

/**
 * Taille du titre modale (entre `font.subhead=15` et `font.title=18`).
 * Valeur originale préservée.
 */
const TITLE_FS = 17;

/** Padding-vertical du bouton principal "Ajouter" (entre `space.md=12` et `space.lg=16`). */
const CLOSE_BTN_PV = 14;

/** Border-radius du TextInput multiline (entre `radius.sm=8` et `radius.md=12`). */
const NOTE_INPUT_RADIUS = 10;

/** Hauteur minimale du TextInput nom du plan. */
const NOTE_INPUT_MIN_HEIGHT = 100;

/** Border-radius des items de liste (entre `radius.sm=8` et `radius.md=12`). */
const LIST_ITEM_RADIUS = 10;

/** marginBottom entre items de liste (entre `space.xs=4` et `space.sm=8`). */
const LIST_ITEM_MB = 6;

/** Taille de l'emoji fichier dans l'item de liste. */
const FILE_EMOJI_FS = 24;

/** Gap entre éléments dans un item de liste. */
const LIST_ITEM_GAP = 10;

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Modale de gestion des plans (PDF / images) d'un chantier.
 *
 * - Liste les plans existants (déjà filtrés par le parent selon la visibilité).
 * - Permet aux admins d'ajouter un plan : nom, fichier, visibilité (tous /
 *   employés / sous-traitants / sélection spécifique).
 * - Permet aux admins de supprimer un plan (confirmation Alert / window.confirm).
 *
 * Controlled modal (pattern `visible` + `onClose`). State du formulaire
 * (nom, fichier, visiblePar, visibleIds) géré en interne et reset à
 * chaque ouverture.
 *
 * Le picker de fichier (+ upload Supabase) est déporté au parent via
 * `onPickNativeFile` (web input / iOS ActionSheet) et `onPickFromInbox`
 * (iOS Share Extension) — ce composant reste agnostique du backend.
 *
 * @example
 * ```tsx
 * <ModalPlansChantier
 *   visible={showPlansPlanning}
 *   onClose={() => setShowPlansPlanning(false)}
 *   chantierNom={chantierNom}
 *   plans={plansVisibles}
 *   participants={participants}
 *   isAdmin={isAdmin}
 *   onPickNativeFile={handlePlanPickNative}
 *   onPickFromInbox={handlePlanFromInbox}
 *   onAddPlan={(values) => addPlanChantier(chantierId, { ...values, id, uploadedAt })}
 *   onDeletePlan={(planId) => deletePlanChantier(chantierId, planId)}
 * />
 * ```
 */
export function ModalPlansChantier({
  visible,
  onClose,
  chantierNom,
  plans,
  participants,
  isAdmin,
  onPickNativeFile,
  onPickFromInbox,
  onAddPlan,
  onDeletePlan,
}: ModalPlansChantierProps): React.ReactElement {
  const { t } = useLanguage();

  const [nom, setNom]             = useState('');
  const [fichier, setFichier]     = useState<string | null>(null);
  const [visiblePar, setVisiblePar] = useState<PlanChantierValues['visiblePar']>('tous');
  const [visibleIds, setVisibleIds] = useState<string[]>([]);

  // Reset à chaque ouverture (UX : champs vierges)
  useEffect(() => {
    if (visible) {
      setNom('');
      setFichier(null);
      setVisiblePar('tous');
      setVisibleIds([]);
    }
  }, [visible]);

  const isValid = nom.trim().length > 0 && fichier !== null;

  const handleAdd = (): void => {
    if (!isValid) return;
    onAddPlan({
      nom:       nom.trim(),
      fichier:   fichier as string,
      visiblePar,
      visibleIds: visiblePar === 'specifique' ? visibleIds : undefined,
    });
    // Reset form (reste ouvert pour ajouter un autre plan si voulu)
    setNom('');
    setFichier(null);
    setVisiblePar('tous');
    setVisibleIds([]);
  };

  const confirmDelete = (planId: string): void => {
    if (Platform.OS === 'web') {
      if (window.confirm(t.chantiers.deletePlan)) onDeletePlan(planId);
    } else {
      Alert.alert(t.common.delete, t.chantiers.deletePlan, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: () => onDeletePlan(planId) },
      ]);
    }
  };

  const toggleVisibleId = (id: string): void => {
    setVisibleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const visibiliteOptions: PlanChantierValues['visiblePar'][] = [
    'tous', 'employes', 'soustraitants', 'specifique',
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTap} onPress={onClose} />
        <View style={[styles.sheet, styles.sheetMaxHeight]}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>{t.chantiers.plansTitle}</Text>
              <Text style={styles.subtitle}>{chantierNom}</Text>
            </View>
            <Pressable
              style={styles.xBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Text style={styles.xBtnText}>{EMOJI.close}</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Liste plans existants */}
            {plans.length === 0 && (
              <EmptyState size="sm" title={t.chantiers.noPlans} />
            )}
            {plans.map(plan => (
              <View key={plan.id} style={styles.listItem}>
                <Pressable
                  style={styles.listItemMain}
                  onPress={() => openDocPreview(plan.fichier)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir ${plan.nom}`}
                >
                  <Text style={styles.fileEmoji}>{fileEmoji(plan.fichier)}</Text>
                  <View style={styles.listItemInfo}>
                    <Text style={styles.listItemName}>{plan.nom}</Text>
                    <Text style={styles.listItemDate}>
                      {formatUploadDate(plan.uploadedAt)}
                    </Text>
                  </View>
                  <Text style={styles.listItemAction}>
                    {t.chantiers.viewPlan} →
                  </Text>
                </Pressable>
                {isAdmin && (
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => confirmDelete(plan.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer ${plan.nom}`}
                  >
                    <Text style={styles.deleteBtnText}>{EMOJI.trash}</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {/* Section ajouter (admin only) */}
            {isAdmin && (
              <View style={styles.addBlock}>
                <Text style={styles.addBlockTitle}>{t.chantiers.addPlan}</Text>

                <TextInput
                  style={styles.nameInput}
                  value={nom}
                  onChangeText={setNom}
                  placeholder={t.chantiers.planName}
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />

                {fichier && (
                  <View style={styles.fileSelectedRow}>
                    <Text style={styles.fileSelectedEmoji}>
                      {(fichier.startsWith('data:application/pdf') || fichier.toLowerCase().endsWith('.pdf')) ? '📄' : '🖼️'}
                    </Text>
                    <Text
                      style={styles.fileSelectedLabel}
                      numberOfLines={1}
                    >
                      {t.common.fileSelected}
                    </Text>
                    <Pressable
                      onPress={() => setFichier(null)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel="Retirer le fichier"
                    >
                      <Text style={styles.fileRemoveText}>{EMOJI.close}</Text>
                    </Pressable>
                  </View>
                )}

                <View style={{ gap: 4, marginTop: space.sm }}>
                  {onPickNativeFile && (
                    <NativeFilePickerButton
                      onPick={async (file) => {
                        const url = await onPickNativeFile(file);
                        if (!url) return false;
                        setFichier(url);
                        return true;
                      }}
                      acceptImages
                      acceptPdf
                      multiple={false}
                    />
                  )}
                  {onPickFromInbox && (
                    <InboxPickerButton
                      onPick={async (item) => {
                        const url = await onPickFromInbox(item);
                        if (!url) return false;
                        setFichier(url);
                        return true;
                      }}
                      mimeFilter={inboxMimeFilterImagePdf}
                    />
                  )}
                </View>

                {/* Sélecteur visibilité */}
                <View style={styles.recipientsBlock}>
                  <Text style={styles.recipientsLabel}>{t.chantiers.planRecipients}</Text>
                  <View style={styles.chipsRow}>
                    {visibiliteOptions.map(v => {
                      const active = visiblePar === v;
                      const label =
                        v === 'tous'          ? t.chantiers.allRecipients
                        : v === 'employes'     ? EMOJI.employes
                        : v === 'soustraitants' ? EMOJI.soustraits
                        :                         EMOJI.specifique;
                      return (
                        <FilterChip
                          key={v}
                          label={label}
                          active={active}
                          onPress={() => setVisiblePar(v)}
                        />
                      );
                    })}
                  </View>
                </View>

                {/* Sélecteur participants (si visibilité "spécifique") */}
                {visiblePar === 'specifique' && (
                  <View style={styles.recipientsBlock}>
                    <Text style={styles.recipientsLabel}>{t.chantiers.recipients}</Text>
                    <View style={styles.chipsRow}>
                      {participants.map(p => {
                        const active = visibleIds.includes(p.id);
                        const suffix = p.kind === 'soustraitant' ? ' (ST)' : '';
                        return (
                          <FilterChip
                            key={p.id}
                            label={`${p.label}${suffix}`}
                            active={active}
                            onPress={() => toggleVisibleId(p.id)}
                          />
                        );
                      })}
                    </View>
                  </View>
                )}

                <Pressable
                  style={[
                    styles.submitBtn,
                    !isValid && styles.submitBtnDisabled,
                  ]}
                  onPress={handleAdd}
                  disabled={!isValid}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !isValid }}
                >
                  <Text style={styles.submitBtnText}>{t.common.add}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
    borderTopLeftRadius:  radius.xl,       // 20
    borderTopRightRadius: radius.xl,       // 20
    padding:              space.xl,        // 20
    paddingBottom:        Platform.OS === 'ios' ? SHEET_PB_IOS : space.xl,
  },

  sheetMaxHeight: {
    maxHeight: '90%',
  },

  handle: {
    alignSelf:       'center',
    width:           HANDLE_WIDTH,
    height:          space.xs,
    backgroundColor: DS.borderAlt,
    borderRadius:    HANDLE_RADIUS,
    marginBottom:    space.lg, // 16
  },

  // — Header —
  headerRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginBottom:   space.xs, // 4
  },

  headerLeft: {
    flex: 1,
  },

  title: {
    fontSize:     TITLE_FS, // 17
    fontWeight:   font.bold,
    color:        DS.textStrong,
    marginBottom: space.xs, // 4
  },

  subtitle: {
    fontSize: font.body, // 13
    color:    DS.textAlt,
  },

  xBtn: {
    width:           space.xxxl, // 32
    height:          space.xxxl, // 32
    borderRadius:    radius.lg, // 16
    backgroundColor: DS.background,
    alignItems:      'center',
    justifyContent:  'center',
  },

  xBtnText: {
    fontSize:   font.md, // 14
    color:      DS.textAlt,
    fontWeight: font.bold,
  },

  // — Scroll content —
  scrollContent: {
    paddingBottom: space.xl, // 20
  },

  // — List item (plan existant) —
  listItem: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: LIST_ITEM_BG,
    borderRadius:    LIST_ITEM_RADIUS, // 10
    marginBottom:    space.sm, // 8
    borderWidth:     1,
    borderColor:     DS.borderAlt,
    overflow:        'hidden',
  },

  listItemMain: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    padding:         space.md, // 12
    gap:             LIST_ITEM_GAP,     // 10
  },

  fileEmoji: {
    fontSize: FILE_EMOJI_FS, // 24
  },

  listItemInfo: {
    flex: 1,
  },

  listItemName: {
    fontSize:     font.md, // 14
    fontWeight:   font.bold,
    color:        DS.textStrong,
    marginBottom: 2,
  },

  listItemDate: {
    fontSize: font.sm, // 12
    color:    DS.textAlt,
  },

  listItemAction: {
    fontSize:   font.body, // 13
    color:      DS.primary,
    fontWeight: font.semibold,
  },

  deleteBtn: {
    paddingHorizontal: space.md, // 12
    paddingVertical:   space.md, // 12
    backgroundColor:   DELETE_BTN_BG,
    borderLeftWidth:   1,
    borderLeftColor:   DS.borderAlt,
  },

  deleteBtnText: {
    fontSize: radius.lg, // 16
  },

  // — Add block (admin) —
  addBlock: {
    padding:         space.lg, // 16
    backgroundColor: DS.background,
    borderRadius:    radius.md, // 12
    marginTop:       space.sm, // 8
  },

  addBlockTitle: {
    fontSize:     font.md, // 14
    fontWeight:   font.bold,
    color:        DS.textStrong,
    marginBottom: LIST_ITEM_GAP, // 10
  },

  nameInput: {
    flex:            1,
    backgroundColor: DS.background,
    borderRadius:    NOTE_INPUT_RADIUS, // 10
    padding:         space.md, // 12
    fontSize:        font.md, // 14
    color:           DS.textStrong,
    borderWidth:     1,
    borderColor:     DS.borderAlt,
    minHeight:       NOTE_INPUT_MIN_HEIGHT, // 100
    textAlignVertical: 'top',
  },

  fileSelectedRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           LIST_ITEM_MB, // 6
    flex:          1,
  },

  fileSelectedEmoji: {
    fontSize: font.md, // 14
  },

  fileSelectedLabel: {
    flex:     1,
    fontSize: font.sm, // 12
    color:    DS.textAlt,
  },

  fileRemoveText: {
    color:      DS.error,
    fontWeight: font.bold,
  },

  // — Recipients selector —
  recipientsBlock: {
    marginTop: space.sm, // 8
  },

  recipientsLabel: {
    fontSize:     font.sm, // 12
    color:        DS.textAlt,
    marginBottom: LIST_ITEM_MB, // 6
  },

  chipsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           LIST_ITEM_MB, // 6
  },

  // — Submit button —
  submitBtn: {
    marginTop:       space.md, // 12
    backgroundColor: DS.primary,
    paddingVertical: CLOSE_BTN_PV, // 14
    borderRadius:    radius.md, // 12
    alignItems:      'center',
  },

  submitBtnDisabled: {
    opacity: 0.5,
  },

  submitBtnText: {
    color:      DS.textInverse,
    fontWeight: font.bold,
    fontSize:   font.subhead, // 15
  },
});
