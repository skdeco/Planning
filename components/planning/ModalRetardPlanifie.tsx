import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native';
import { DS, font, radius, space } from '../../constants/design';
import { ModalKeyboard } from '../ModalKeyboard';
import { DatePicker } from '../DatePicker';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Date locale YYYY-MM-DD (pas UTC — évite les décalages minuit-aube). */
function toYMDLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Entrée de retard planifié — forme minimale pour l'affichage en liste
 * dans la modale. Volontairement découplée du type `RetardPlanifie` global
 * (5 champs seulement).
 */
export interface RetardPlanifieEntry {
  id: string;
  /** Format YYYY-MM-DD. */
  date: string;
  /** Format HH:MM. */
  heureArrivee: string;
  motif: string;
  /** `true` = marqué comme "lu" par un admin. Optionnel pour matcher le type `RetardPlanifie` global. */
  lu?: boolean;
}

/**
 * Valeurs saisies au submit. Le parent reconstruit l'objet métier complet
 * (id, employeId, createdAt, lu) avant d'appeler `addRetardPlanifie`.
 */
export interface RetardPlanifieFormValues {
  date: string;
  heureArrivee: string;
  motif: string;
}

/**
 * Props du composant `ModalRetardPlanifie`.
 *
 * Modale controlled (pattern `visible`/`onClose`). State interne du
 * formulaire — reset à chaque ouverture.
 */
export interface ModalRetardPlanifieProps {
  /** Contrôle d'ouverture géré par le parent. */
  visible: boolean;
  /** Callback de fermeture (onRequestClose + bouton Annuler + tap outside). */
  onClose: () => void;
  /** Liste des retards existants, **pré-filtrée** par le parent. */
  retardsPlanifies: RetardPlanifieEntry[];
  /** Callback au submit — le parent construit l'objet métier complet. */
  onSave: (values: RetardPlanifieFormValues) => void;
  /** Callback de suppression d'un retard existant (✕ dans la liste). */
  onDelete: (id: string) => void;
}

// ─── Records statiques (emojis) ───────────────────────────────────────────────

/**
 * Emojis utilisés dans le composant. Centralisés pour faciliter la migration
 * vers `lucide-react-native` en Phase 4 — ne toucher que ce record.
 */
const EMOJI = {
  /** Titre de la modale (⏰). */
  title:  '⏰',
  /** Indicateur "lu par l'admin" sur un retard existant (✓). */
  lu:     '✓',
  /** Bouton supprimer un retard dans la liste (✕). */
  remove: '✕',
} as const;

// ─── Constantes internes ──────────────────────────────────────────────────────

// — Couleurs non couvertes par les tokens DS —

/**
 * Texte titre + saisie. Légèrement plus foncé que `DS.primary=#2C2C2C`
 * (pas de token équivalent dans le DS).
 */
const COLOR_TEXT_STRONG = '#1A1A2E';

/**
 * Texte des labels de formulaire. Entre `DS.text` et `DS.textAlt`.
 * Pas de token équivalent.
 */
const COLOR_LABEL = '#4A5568';

/** Border des TextInput — gris cool neutre. Pas de token équivalent. */
const COLOR_INPUT_BORDER = '#E2E8F0';

/** Fond des TextInput — quasi-blanc cool. Pas de token équivalent. */
const COLOR_INPUT_BG = '#F8FAFC';

/** Fond du bouton Annuler — gris clair neutre. Pas de token équivalent. */
const COLOR_CANCEL_BG = '#F0F4F8';

/** Fond du bouton Enregistrer — bleu action. Pas de token équivalent DS. */
const COLOR_CONFIRM_BG = '#2980B9';

/** Fond du bouton Enregistrer désactivé — bleu clair. Pas de token équivalent. */
const COLOR_CONFIRM_BG_DISABLED = '#B0C4D8';

/**
 * Fond des items "retards planifiés" — jaune soft spécifique.
 * Pas d'équivalent exact (DS.warningSoft est légèrement différent).
 */
const COLOR_ITEM_BG = '#FFF3CD';

/**
 * Texte des items — ambre foncé pour contraste sur `COLOR_ITEM_BG`.
 * Pas d'équivalent DS (warning est plus clair).
 */
const COLOR_ITEM_TEXT = '#856404';

/**
 * Vert "Lu par l'admin". DS.success vaut '#10B981' (vert Tailwind),
 * l'original utilise '#27AE60' (vert Flat UI). À harmoniser en Phase 4.
 */
const COLOR_LU = '#27AE60';

/**
 * Overlay modale. Valeur originale préservée. Harmonisation au DS à
 * évaluer en Phase 4 (overlay.medium = rgba(0,0,0,0.5) = 10 % plus sombre).
 */
const MODAL_OVERLAY_BG = 'rgba(0,0,0,0.4)';

/**
 * Radius des inputs. Valeur originale préservée. DS.radius.md vaut 12,
 * à harmoniser en Phase 4.
 */
const INPUT_RADIUS = 10;

// — Magic numbers non couverts par les tokens —

/** Padding-bottom du sheet (au-dessus du safe-area mobile). */
const SHEET_PADDING_BOTTOM = 36;

const SHEET_MAX_HEIGHT = '90%' as const;

/** Portion tap-to-close en haut de l'overlay (5 % de la hauteur). */
const OVERLAY_TAP_TOP_RATIO = 0.05;

/** Padding-vertical des boutons Annuler/Confirmer (entre `space.md=12` et `space.lg=16`). */
const BTN_PV = 13;

/** marginBottom des labels (entre `space.xs=4` et `space.sm=8`). */
const LABEL_MB = 6;

const MOTIF_MIN_HEIGHT = 80;

/** Padding-vertical des TextInput (entre `space.sm=8` et `space.md=12`). */
const INPUT_PV = 10;

const ITEM_PADDING = 10;

/** Gap entre items de liste (fine, entre `space.xs=4` et `space.sm=8`). */
const ITEM_MB = 6;

/** marginBottom du titre (micro-gap avant le subtitle). */
const TITLE_MB = 2;

/** marginTop des infos secondaires dans un item de liste. */
const ITEM_META_MT = 2;

const HANDLE_WIDTH = 40;
const HANDLE_HEIGHT = 4;

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Modale de déclaration d'un retard planifié par un employé.
 *
 * Controlled modal (pattern `visible` + `onClose`). State du formulaire
 * (date, heure, motif) géré en interne et reset à chaque ouverture.
 * Affiche aussi la liste des retards déjà enregistrés (fournie filtrée
 * par le parent) avec possibilité de suppression.
 *
 * @example
 * ```tsx
 * <ModalRetardPlanifie
 *   visible={showRetardModal}
 *   onClose={() => setShowRetardModal(false)}
 *   retardsPlanifies={(data.retardsPlanifies || []).filter(r => r.employeId === currentUser?.employeId)}
 *   onSave={(values) => addRetardPlanifie({
 *     id: `retard_${Date.now()}_${Math.random().toString(36).slice(2)}`,
 *     employeId: currentUser?.employeId || '',
 *     createdAt: new Date().toISOString(),
 *     lu: false,
 *     ...values,
 *   })}
 *   onDelete={deleteRetardPlanifie}
 * />
 * ```
 */
export function ModalRetardPlanifie({
  visible,
  onClose,
  retardsPlanifies,
  onSave,
  onDelete,
}: ModalRetardPlanifieProps): React.ReactElement {
  const [date, setDate]   = useState('');
  const [heure, setHeure] = useState('');
  const [motif, setMotif] = useState('');

  // Reset du formulaire à chaque ouverture (UX : champs vierges).
  useEffect(() => {
    if (visible) {
      setDate('');
      setHeure('');
      setMotif('');
    }
  }, [visible]);

  const isValid = date.length > 0 && heure.length > 0 && motif.trim().length > 0;

  const handleSave = (): void => {
    if (!isValid) return;
    onSave({ date, heureArrivee: heure, motif: motif.trim() });
  };

  return (
    <ModalKeyboard
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.overlayTap}
          onPress={onClose}
          accessibilityLabel="Fermer la modale"
        />
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{`${EMOJI.title} Déclarer un retard à venir`}</Text>
          <Text style={styles.subtitle}>Informez votre responsable d'un retard prévu</Text>

          <Text style={styles.label}>Date du retard prévu *</Text>
          <DatePicker
            value={date}
            onChange={setDate}
            minDate={toYMDLocal(new Date())}
            placeholder="Sélectionner la date"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Heure d'arrivée prévue *</Text>
          <TextInput
            style={styles.input}
            value={heure}
            onChangeText={setHeure}
            placeholder="Ex: 10:00"
            placeholderTextColor={DS.textAlt}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Motif *</Text>
          <TextInput
            style={[styles.input, styles.motifInput]}
            value={motif}
            onChangeText={setMotif}
            placeholder="Ex: Rendez-vous médical, travaux sur la route..."
            placeholderTextColor={DS.textAlt}
            multiline
          />

          {retardsPlanifies.length > 0 && (
            <View style={styles.listSection}>
              <Text style={[styles.label, styles.listSectionLabel]}>Retards planifiés</Text>
              {retardsPlanifies.map(r => (
                <View key={r.id} style={styles.listItem}>
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemHeader}>
                      {r.date} — {r.heureArrivee}
                    </Text>
                    <Text style={styles.listItemMotif}>{r.motif}</Text>
                    {r.lu && (
                      <Text style={styles.listItemLu}>
                        {`${EMOJI.lu} Lu par l'admin`}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => onDelete(r.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer le retard du ${r.date}`}
                    style={styles.removeBtn}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={styles.removeBtnText}>{EMOJI.remove}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actionsRow}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!isValid}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isValid }}
              style={[
                styles.confirmBtn,
                !isValid && styles.confirmBtnDisabled,
              ]}
            >
              <Text style={styles.confirmBtnText}>Enregistrer</Text>
            </Pressable>
          </View>
        </Pressable>
      </View>
    </ModalKeyboard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: MODAL_OVERLAY_BG,
    justifyContent:  'flex-end',
  },

  overlayTap: {
    flex: OVERLAY_TAP_TOP_RATIO,
  },

  sheet: {
    backgroundColor:     DS.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding:             space.xl,
    paddingBottom:       SHEET_PADDING_BOTTOM,
    maxHeight:           SHEET_MAX_HEIGHT,
  },

  handle: {
    alignSelf:       'center',
    width:           HANDLE_WIDTH,
    height:          HANDLE_HEIGHT,
    backgroundColor: DS.borderAlt,
    borderRadius:    radius.xs,
    marginBottom:    space.lg,
  },

  title: {
    fontSize:     font.title,  // 18
    fontWeight:   font.bold,   // '700'
    color:        COLOR_TEXT_STRONG,
    marginBottom: TITLE_MB,
  },

  subtitle: {
    fontSize:     font.body,  // 13
    color:        DS.textAlt,
    marginBottom: space.lg,
  },

  label: {
    fontSize:     font.body,      // 13
    fontWeight:   font.semibold,  // '600'
    color:        COLOR_LABEL,
    marginBottom: LABEL_MB,
    marginTop:    space.xs,
  },

  labelSpaced: {
    marginTop: space.md,
  },

  input: {
    borderWidth:       1,
    borderColor:       COLOR_INPUT_BORDER,
    borderRadius:      INPUT_RADIUS,
    paddingHorizontal: space.md,
    paddingVertical:   INPUT_PV,
    fontSize:          font.subhead,
    color:             COLOR_TEXT_STRONG,
    backgroundColor:   COLOR_INPUT_BG,
    marginBottom:      space.md,
  },

  motifInput: {
    minHeight:        MOTIF_MIN_HEIGHT,
    textAlignVertical: 'top',
  },

  listSection: {
    marginTop: space.lg,
  },

  listSectionLabel: {
    marginBottom: space.sm,
  },

  listItem: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: COLOR_ITEM_BG,
    borderRadius:    radius.sm,   // 8
    padding:         ITEM_PADDING,
    marginBottom:    ITEM_MB,
  },

  listItemContent: {
    flex: 1,
  },

  listItemHeader: {
    fontWeight: font.semibold,
    color:      COLOR_ITEM_TEXT,
    fontSize:   font.body,
  },

  listItemMotif: {
    color:     COLOR_ITEM_TEXT,
    fontSize:  font.sm,
    marginTop: ITEM_META_MT,
  },

  listItemLu: {
    color:     COLOR_LU,
    fontSize:  font.compact,
    marginTop: ITEM_META_MT,
  },

  removeBtn: {
    padding: ITEM_MB,
  },

  removeBtnText: {
    color:    DS.error,
    fontSize: font.md,
  },

  actionsRow: {
    flexDirection: 'row',
    gap:           space.md,
    marginTop:     space.lg,
  },

  cancelBtn: {
    flex:            1,
    paddingVertical: BTN_PV,
    borderRadius:    radius.md,
    backgroundColor: COLOR_CANCEL_BG,
    alignItems:      'center',
  },

  cancelBtnText: {
    fontSize:   font.subhead,
    fontWeight: font.semibold,
    color:      DS.textAlt,
  },

  confirmBtn: {
    flex:            2,
    paddingVertical: BTN_PV,
    borderRadius:    radius.md,
    backgroundColor: COLOR_CONFIRM_BG,
    alignItems:      'center',
  },

  confirmBtnDisabled: {
    backgroundColor: COLOR_CONFIRM_BG_DISABLED,
  },

  confirmBtnText: {
    fontSize:   font.subhead,
    fontWeight: font.bold,
    color:      DS.textInverse,
  },
});
