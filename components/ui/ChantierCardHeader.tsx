import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { DS, font, space } from '../../constants/design';
import { StatusBadge, statutBadgeProps } from './StatusBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Statut chantier — repris dynamiquement depuis la signature de
 * `statutBadgeProps`. Évite tout import direct du type `Chantier`
 * depuis `app/types` tout en restant aligné si le modèle évolue.
 */
export type StatutChantier = Parameters<typeof statutBadgeProps>[0];

/**
 * Props du composant `ChantierCardHeader`.
 *
 * Contient la matière textuelle d'une carte chantier :
 * nom, adresse optionnelle et badge de statut optionnel aligné à droite.
 *
 * Sous-composant partagé par `ChantierListCard` et `ChantierDashboardCard`.
 *
 * NOTE — L'identité visuelle colorée (bordure gauche) est portée par la carte
 * parente, pas par ce header. Ainsi la barre colorée traverse toute la hauteur
 * de la carte, indépendamment du contenu du header.
 */
export interface ChantierCardHeaderProps {
  /** Nom du chantier. Affiché en titre principal, tronqué à 1 ligne. */
  nom: string;

  /**
   * Adresse déjà composée par l'appelant (ex: `[rue, ville].filter(Boolean).join(', ')`).
   * Masquée si `undefined` ou chaîne vide. Wrap sur 2 lignes max.
   */
  adresse?: string;

  /**
   * Statut du chantier. Si fourni → `<StatusBadge {...statutBadgeProps(statut)} size="sm" />`
   * aligné à droite dans la rangée du titre. Masqué si `undefined`.
   */
  statut?: StatutChantier;

  style?: StyleProp<ViewStyle>;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * En-tête partagé pour les cartes chantier.
 *
 * Affiche le nom, l'adresse et un badge de statut optionnel.
 * La bordure gauche colorée est la responsabilité de la carte parente.
 *
 * @example En-tête minimal
 * ```tsx
 * <ChantierCardHeader nom="Villa Martin" />
 * ```
 *
 * @example En-tête complet avec statut
 * ```tsx
 * <ChantierCardHeader
 *   nom="Villa Martin"
 *   adresse={[chantier.rue, chantier.ville].filter(Boolean).join(', ')}
 *   statut={chantier.statut}
 * />
 * ```
 */
export function ChantierCardHeader({
  nom,
  adresse,
  statut,
  style,
}: ChantierCardHeaderProps): React.ReactElement {
  const hasAdresse = adresse !== undefined && adresse.length > 0;

  return (
    <View style={style}>
      <View style={styles.titleRow}>
        <Text style={styles.nom} numberOfLines={1}>
          {nom}
        </Text>
        {statut !== undefined && (
          <StatusBadge {...statutBadgeProps(statut)} size="sm" />
        )}
      </View>

      {hasAdresse && (
        <Text style={styles.adresse} numberOfLines={2}>
          {adresse}
        </Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  titleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            space.sm, // 8
  },

  nom: {
    flex:       1,
    fontSize:   font.subhead,  // 15
    fontWeight: font.semibold, // '600'
    color:      DS.textStrong,
  },

  adresse: {
    fontSize:   font.compact, // 11
    fontWeight: font.normal,  // '400'
    color:      DS.textAlt,
    marginTop:  space.xs,     // 4
  },
});
