import React from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { DS, font, radius, space } from '../../constants/design';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Props du composant `FilterChip`.
 *
 * Priorité des états visuels : `disabled` > `active` > inactif (défaut).
 */
export interface FilterChipProps {
  /** Texte du chip. */
  label: string;

  /** Chip sélectionné/actif. Défaut : `false`. */
  active?: boolean;

  /** Callback au tap. Ignoré si `disabled`. */
  onPress?: () => void;

  /**
   * Compteur inline après le label : "label (n)".
   * - Inactif : DS.textAlt (discret)
   * - Actif : `activeTextColor` résolu à opacity 0.75
   */
  count?: number;

  /**
   * Icône/emoji avant le label (gap space.xs).
   * Le consumer fournit le nœud — aucune dépendance icône dans ce composant.
   */
  icon?: React.ReactNode;

  /** Couleur de fond en état actif. Défaut : `DS.primary`. */
  activeColor?: string;

  /** Couleur du texte en état actif. Défaut : `DS.textInverse`. */
  activeTextColor?: string;

  /**
   * Gabarit de taille.
   * - `'md'` → font.body (13), ph space.md (12), pv space.sm (8) *(défaut)*
   * - `'sm'` → font.compact (11), ph space.sm (8), pv space.xs (4)
   */
  size?: 'sm' | 'md';

  /** Chip non cliquable : bg DS.surfaceAlt, texte DS.textDisabled, opacity 0.6. */
  disabled?: boolean;

  style?: StyleProp<ViewStyle>;
}

// ─── Constantes internes ──────────────────────────────────────────────────────

const COUNT_ACTIVE_OPACITY = 0.75; // count discret sur fond actif

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Chip de filtre / sélection interactif avec trois états visuels.
 * Feedback de pression via `opacity: 0.7` sur Pressable (sans Animated).
 *
 * @example Single-select filtre statut
 * ```tsx
 * <FilterChip
 *   label="En cours"
 *   active={statut === 'actif'}
 *   onPress={() => setStatut('actif')}
 * />
 * ```
 *
 * @example Multi-select avec count
 * ```tsx
 * <FilterChip
 *   label="Employés"
 *   count={12}
 *   active={tab === 'employes'}
 *   onPress={() => setTab('employes')}
 * />
 * ```
 *
 * @example Avec icône et couleur métier custom
 * ```tsx
 * <FilterChip
 *   label="Maçonnerie"
 *   icon={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mc.color }} />}
 *   active={filtre === 'maçonnerie'}
 *   activeColor={mc.color}
 *   activeTextColor={DS.textInverse}
 *   onPress={() => setFiltre('maçonnerie')}
 * />
 * ```
 */
export function FilterChip({
  label,
  active = false,
  onPress,
  count,
  icon,
  activeColor,
  activeTextColor,
  size = 'md',
  disabled = false,
  style,
}: FilterChipProps): React.ReactElement {
  const resolvedActiveTextColor = activeTextColor ?? DS.textInverse;
  const isActive = !disabled && active;
  const isSm     = size === 'sm';

  // Couleurs de texte résolues selon l'état
  const labelColor = disabled
    ? DS.textDisabled
    : isActive
      ? resolvedActiveTextColor
      : DS.text;

  const countColor = disabled
    ? DS.textDisabled
    : isActive
      ? resolvedActiveTextColor
      : DS.textAlt;

  // Style de fond résolu (seule la couleur active est dynamic — prop custom)
  const activeBgStyle: ViewStyle = { backgroundColor: activeColor ?? DS.primary };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive, disabled }}
      style={({ pressed }) => [
        styles.base,
        isSm ? styles.sizeSm : styles.sizeMd,
        disabled
          ? styles.stateDisabled
          : isActive
            ? activeBgStyle
            : styles.stateInactive,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon !== undefined && (
        <View style={styles.iconWrap}>{icon}</View>
      )}

      <Text style={[isSm ? styles.labelSm : styles.labelMd, { color: labelColor }]}>
        {label}
      </Text>

      {count !== undefined && (
        <Text
          style={[
            isSm ? styles.countSm : styles.countMd,
            { color: countColor },
            isActive && styles.countActiveOpacity,
          ]}
        >
          {` (${count})`}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems:    'center',
    alignSelf:     'flex-start',
  },

  // ── Gabarits ──
  sizeMd: {
    paddingHorizontal: space.md,    // 12
    paddingVertical:   space.sm,    // 8
    borderRadius:      radius.full, // 999 — pill
  },
  sizeSm: {
    paddingHorizontal: space.sm,    // 8
    paddingVertical:   space.xs,    // 4
    borderRadius:      radius.full,
  },

  // ── États conteneur ──
  stateInactive: {
    backgroundColor: DS.surface,
    borderWidth:     1,
    borderColor:     DS.border,
  },
  stateDisabled: {
    backgroundColor: DS.surfaceAlt,
    opacity:         0.6,
  },

  // ── Feedback pression ──
  pressed: {
    opacity: 0.7,
  },

  // ── Icône ──
  iconWrap: {
    marginRight: space.xs, // 4
  },

  // ── Labels ──
  labelMd: {
    fontSize:   font.body,   // 13
    fontWeight: font.medium, // '500'
  },
  labelSm: {
    fontSize:   font.compact, // 11
    fontWeight: font.medium,  // '500'
  },

  // ── Count ──
  countMd: {
    fontSize:   font.body,   // 13
    fontWeight: font.normal, // '400'
  },
  countSm: {
    fontSize:   font.compact, // 11
    fontWeight: font.normal,  // '400'
  },
  countActiveOpacity: {
    opacity: COUNT_ACTIVE_OPACITY, // 0.75
  },
});
