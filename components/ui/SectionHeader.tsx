import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { DS, font, space } from '../../constants/design';

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionSize = 'sm' | 'md' | 'lg';

/**
 * Props du composant `SectionHeader`.
 *
 * Layout : conteneur `row / space-between`.
 * Bloc gauche (`flex: 1`) : titre + compteur inline + sous-titre.
 * Bloc droit : action optionnelle, serre son contenu (no flex).
 */
export interface SectionHeaderProps {
  /** Titre principal, affiché à gauche. */
  title: string;

  /** Compteur inline après le titre : "Titre (n)". Couleur DS.textAlt, poids medium. */
  count?: number;

  /** Sous-titre sur la ligne suivante — plus petit, DS.textAlt. */
  subtitle?: string;

  /** Élément aligné à droite (bouton, lien, badge…). Serre son contenu. */
  action?: React.ReactNode;

  /**
   * Ajoute un `borderBottom` (DS.borderAlt, 1px) avec espacement :
   * `paddingBottom: space.sm` avant la bordure, `marginBottom: space.sm` après.
   */
  separator?: boolean;

  /** Titre en majuscules avec letter-spacing (pattern noteHistSection / legendTitle). */
  uppercase?: boolean;

  /**
   * Taille du titre.
   * - `'sm'` → font.body (13) · sous-titre font.compact (11)
   * - `'md'` → font.subhead (15) · sous-titre font.body (13) *(défaut)*
   * - `'lg'` → font.title (18) · sous-titre font.body (13)
   */
  size?: SectionSize;

  style?: StyleProp<ViewStyle>;
}

// ─── Constantes internes ──────────────────────────────────────────────────────

const TITLE_SIZE: Record<SectionSize, number> = {
  sm: font.body,    // 13
  md: font.subhead, // 15
  lg: font.title,   // 18
};

const SUBTITLE_SIZE: Record<SectionSize, number> = {
  sm: font.compact, // 11
  md: font.body,    // 13
  lg: font.body,    // 13
};

const LETTER_SPACING_UPPER = 0.4;

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * En-tête de section réutilisable — titre, compteur inline, sous-titre et
 * action optionnelle à droite.
 *
 * @example Titre simple
 * ```tsx
 * <SectionHeader title="Prochains rendez-vous" />
 * ```
 * @example Avec compteur et action
 * ```tsx
 * <SectionHeader title="Documents" count={4} action={<AddButton />} />
 * ```
 * @example Label compact uppercase avec séparateur
 * ```tsx
 * <SectionHeader title="Archivées" uppercase size="sm" separator />
 * ```
 * @example Avec sous-titre
 * ```tsx
 * <SectionHeader title="Chantier Martin" subtitle="12 rue de la Paix"
 *   action={<StatBadges />} />
 * ```
 */
export function SectionHeader({
  title,
  count,
  subtitle,
  action,
  separator = false,
  uppercase = false,
  size = 'md',
  style,
}: SectionHeaderProps): React.ReactElement {
  const titleFontSize    = TITLE_SIZE[size];
  const subtitleFontSize = SUBTITLE_SIZE[size];

  return (
    <View
      style={[
        styles.container,
        separator && styles.withSeparator,
        style,
      ]}
    >
      {/* ── Bloc gauche : titre + count inline + sous-titre ── */}
      <View style={styles.left}>
        <Text
          style={[
            styles.title,
            { fontSize: titleFontSize },
            uppercase && styles.titleUppercase,
          ]}
        >
          {title}
          {count !== undefined && (
            <Text style={styles.count}> ({count})</Text>
          )}
        </Text>

        {subtitle !== undefined && (
          <Text
            style={[styles.subtitle, { fontSize: subtitleFontSize }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {/* ── Bloc droit : action ── */}
      {action !== undefined && (
        <View style={styles.right}>
          {action}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },

  withSeparator: {
    paddingBottom:     space.sm,
    borderBottomWidth: 1,
    borderBottomColor: DS.borderAlt,
    marginBottom:      space.sm,
  },

  left: {
    flex: 1,
  },

  title: {
    fontWeight: font.semibold,
    color:      DS.textStrong,
  },

  titleUppercase: {
    textTransform: 'uppercase',
    letterSpacing: LETTER_SPACING_UPPER,
  },

  count: {
    fontWeight:    font.medium,
    color:         DS.textAlt,
    textTransform: 'none', // neutralise l'uppercase hérité du parent Text
  },

  subtitle: {
    fontWeight: font.normal,
    color:      DS.textAlt,
    marginTop:  space.xs,
  },

  right: {
    marginLeft: space.sm,
  },
});
