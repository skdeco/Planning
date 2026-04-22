import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { DS, font, space } from '../../constants/design';

// ─── Types ────────────────────────────────────────────────────────────────────

type EmptySize = 'sm' | 'md';

/**
 * Props du composant `EmptyState`.
 *
 * Ne force jamais `flex: 1` — le parent contrôle le sizing via `style`.
 * - `'md'` : état vide pleine page, centré verticalement, padding généreux.
 * - `'sm'` : état vide inline dans une liste, centré horizontalement seulement.
 */
export interface EmptyStateProps {
  /** Message principal affiché en centré. */
  title: string;

  /** Texte explicatif sous le titre — wrapping multi-ligne naturel. */
  description?: string;

  /**
   * Illustration, emoji ou icône affichée au-dessus du titre.
   * La taille est libre — le parent (ou l'appelant) la définit.
   * @example `icon={<Text style={{ fontSize: 36 }}>📭</Text>}`
   */
  icon?: React.ReactNode;

  /**
   * Bouton ou lien CTA affiché sous la description.
   * Absent du code actuel — forward-compatible pour Phase 2+.
   */
  action?: React.ReactNode;

  /**
   * Gabarit de taille.
   * - `'md'` → padding space.xl (20), justifyContent:'center', title font.subhead (15) *(défaut)*
   * - `'sm'` → padding space.lg (16), pas de centrage vertical, title font.body (13)
   */
  size?: EmptySize;

  style?: StyleProp<ViewStyle>;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * État vide réutilisable — icône optionnelle, titre, description, action CTA.
 *
 * Remplace les 30+ patterns inline dispersés dans planning/chantiers/equipe/agenda/materiel.
 *
 * @example Pleine page avec emoji
 * ```tsx
 * <EmptyState
 *   icon={<Text style={{ fontSize: 36 }}>📭</Text>}
 *   title="Aucun rendez-vous ce jour"
 * />
 * ```
 *
 * @example Inline compact dans une liste
 * ```tsx
 * <EmptyState
 *   size="sm"
 *   title="Aucun devis"
 *   description="Ajoutez un devis pour commencer"
 * />
 * ```
 *
 * @example Avec bouton CTA
 * ```tsx
 * <EmptyState
 *   icon={<Text style={{ fontSize: 36 }}>🔧</Text>}
 *   title="Aucun ticket SAV"
 *   action={<Pressable onPress={onCreate}><Text>Créer un ticket</Text></Pressable>}
 * />
 * ```
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  size = 'md',
  style,
}: EmptyStateProps): React.ReactElement {
  const isMd = size === 'md';

  return (
    <View
      style={[
        styles.base,
        isMd ? styles.containerMd : styles.containerSm,
        style,
      ]}
    >
      {icon !== undefined && (
        <View style={styles.iconWrap}>{icon}</View>
      )}

      <Text style={isMd ? styles.titleMd : styles.titleSm}>
        {title}
      </Text>

      {description !== undefined && (
        <Text style={isMd ? styles.descriptionMd : styles.descriptionSm}>
          {description}
        </Text>
      )}

      {action !== undefined && (
        <View style={styles.action}>{action}</View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
  },

  containerMd: {
    justifyContent: 'center',
    padding:        space.xl,   // 20
  },

  containerSm: {
    padding: space.lg,          // 16
  },

  iconWrap: {
    marginBottom: space.md,     // 12
  },

  titleMd: {
    fontSize:   font.subhead,   // 15
    fontWeight: font.semibold,  // '600'
    color:      DS.textStrong,
    textAlign:  'center',
  },

  titleSm: {
    fontSize:   font.body,      // 13
    fontWeight: font.semibold,  // '600'
    color:      DS.textStrong,
    textAlign:  'center',
  },

  descriptionMd: {
    fontSize:   font.body,      // 13
    fontWeight: font.normal,    // '400'
    color:      DS.textAlt,
    textAlign:  'center',
    marginTop:  space.xs,       // 4
  },

  descriptionSm: {
    fontSize:   font.compact,   // 11
    fontWeight: font.normal,    // '400'
    color:      DS.textAlt,
    textAlign:  'center',
    marginTop:  space.xs,       // 4
  },

  action: {
    marginTop:  space.lg,       // 16
    alignItems: 'center',
  },
});
