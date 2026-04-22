import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { DS, font, radius, space } from '../../constants/design';
// seul import hors design.ts — nécessaire pour le helper statutBadgeProps
import {
  STATUT_COLORS,
  STATUT_LABELS,
  type StatutChantier,
} from '../../app/types/index';

// ─── Types publics ────────────────────────────────────────────────────────────

/** Palette sémantique résolue depuis les tokens DS — aucune couleur en dur. */
export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Props du composant `StatusBadge`.
 *
 * **Mode 1 — `variant`** (préféré) : résout automatiquement `bg`/`color`
 * depuis les tokens sémantiques de `constants/design.ts`.
 *
 * **Mode 2 — `bg` + `color`** : échappatoire pour les palettes métier
 * (`STATUT_COLORS`, `METIER_COLORS`, apporteurs…). Ignoré si `variant` fourni.
 *
 * Si aucun des deux modes n'est utilisé → fallback silencieux sur `neutral`.
 *
 * Si `icon` et `dot` sont tous deux présents, `icon` prime et `dot` est ignoré.
 */
export interface StatusBadgeProps {
  /** Texte affiché dans le badge. */
  label: string;

  /** Mode 1 — prend le pas sur `bg`/`color`. */
  variant?: StatusVariant;

  /** Mode 2 — couleur de fond (palette métier). Ignoré si `variant` fourni. */
  bg?: string;
  /** Mode 2 — couleur de texte (palette métier). Ignoré si `variant` fourni. */
  color?: string;

  /** Icône avant le label (gap `space.xs`). Annule `dot` si les deux sont présents. */
  icon?: React.ReactNode;
  /** Cercle coloré avant le label (variante métier/dot). Ignoré si `icon` présent. */
  dot?: boolean;
  /** Couleur du dot. Défaut : couleur de texte résolue. */
  dotColor?: string;

  /** Transforme le texte en majuscules avec letter-spacing (variante apporteur). */
  uppercase?: boolean;

  /**
   * Gabarit de taille.
   * - `'sm'` → fs 10, br 8, ph 7, pv 2  *(compact — equipe, labels)*
   * - `'md'` → fs 11, br 12, ph 8, pv 3  *(standard — défaut)*
   */
  size?: 'sm' | 'md';

  style?: StyleProp<ViewStyle>;
}

// ─── Constantes internes ──────────────────────────────────────────────────────

/** Mapping variant → bg/color depuis les tokens DS. */
const VARIANT_COLORS: Record<StatusVariant, { bg: string; color: string }> = {
  success: { bg: DS.successSoft, color: DS.success },
  warning: { bg: DS.warningSoft, color: DS.warning },
  error:   { bg: DS.errorSoft,   color: DS.error },
  info:    { bg: DS.infoSoft,    color: DS.info },
  neutral: { bg: DS.surfaceAlt,  color: DS.textAlt },
};

// Valeurs fines non couvertes par les tokens du design system
const BADGE_PH_SM              = 7;    // padding-h compact (entre space.xs=4 et space.sm=8)
const BADGE_PV_SM              = 2;    // padding-v compact
const BADGE_PV_MD              = 3;    // padding-v standard
const BADGE_DOT_SIZE           = 6;    // diamètre du cercle indicateur
const BADGE_LETTER_SPACING_CAP = 0.3;  // letter-spacing pour text uppercase

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Badge de statut ou de catégorie réutilisable.
 *
 * @example Mode 1 — variant sémantique (préféré)
 * ```tsx
 * <StatusBadge variant="success" label="Actif" />
 * <StatusBadge variant="warning" label="En attente" />
 * <StatusBadge variant="error"   label="Ouvert" />
 * ```
 *
 * @example Mode 2 — palette métier custom
 * ```tsx
 * <StatusBadge {...statutBadgeProps(chantier.statut)} />
 * <StatusBadge label={emp.metier} bg={mc.color + '18'} color={mc.color} dot size="sm" />
 * <StatusBadge label={emp.codeApporteur} bg={empColor} color="#fff" uppercase size="sm" />
 * ```
 */
export function StatusBadge({
  label,
  variant,
  bg,
  color,
  icon,
  dot = false,
  dotColor,
  uppercase = false,
  size = 'md',
  style,
}: StatusBadgeProps): React.ReactElement {
  const resolved: { bg: string; color: string } =
    variant !== undefined
      ? VARIANT_COLORS[variant]
      : bg !== undefined && color !== undefined
        ? { bg, color }
        : VARIANT_COLORS.neutral;

  const resolvedDotColor = dotColor ?? resolved.color;
  const showIcon         = icon !== undefined;
  const showDot          = dot && !showIcon;

  return (
    <View
      style={[
        styles.container,
        size === 'sm' ? styles.sizeSm : styles.sizeMd,
        { backgroundColor: resolved.bg },
        style,
      ]}
    >
      {showIcon && icon}
      {showDot && (
        <View style={[styles.dot, { backgroundColor: resolvedDotColor }]} />
      )}
      <Text
        style={[
          size === 'sm' ? styles.textSm : styles.textMd,
          { color: resolved.color },
          uppercase ? styles.textUppercase : undefined,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Produit les props `{ label, bg, color }` pour `<StatusBadge>` depuis un `StatutChantier`.
 * Utilise `STATUT_COLORS` (Mode 2 — palette métier intentionnelle, non sémantique).
 *
 * @example
 * ```tsx
 * <StatusBadge {...statutBadgeProps(chantier.statut)} />
 * ```
 */
export function statutBadgeProps(statut: StatutChantier): {
  label: string;
  bg: string;
  color: string;
} {
  return {
    label: STATUT_LABELS[statut],
    bg:    STATUT_COLORS[statut].bg,
    color: STATUT_COLORS[statut].text,
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems:    'center',
    alignSelf:     'flex-start',
    gap:           space.xs,
  },

  sizeSm: {
    borderRadius:      radius.sm,    // 8
    paddingHorizontal: BADGE_PH_SM,  // 7
    paddingVertical:   BADGE_PV_SM,  // 2
  },
  sizeMd: {
    borderRadius:      radius.md,    // 12
    paddingHorizontal: space.sm,     // 8
    paddingVertical:   BADGE_PV_MD,  // 3
  },

  textSm: {
    fontSize:   font.xs,            // 10
    fontWeight: font.semibold,      // '600'
    lineHeight: font.xs * 1.4,      // 14
  },
  textMd: {
    fontSize:   font.compact,       // 11
    fontWeight: font.semibold,      // '600'
    lineHeight: font.compact * 1.4, // ~15.4
  },

  textUppercase: {
    textTransform: 'uppercase',
    letterSpacing: BADGE_LETTER_SPACING_CAP,
  },

  dot: {
    width:        BADGE_DOT_SIZE,
    height:       BADGE_DOT_SIZE,
    borderRadius: BADGE_DOT_SIZE / 2,
  },
});
