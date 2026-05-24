import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { DS } from '@/constants/design';

/**
 * InfoTile — Tuile d'information pour sous-sections (palette V10).
 * Utilisée dans les écrans de section ouverte (ex: Infos utiles d'un chantier).
 *
 * @example
 * <InfoTile
 *   icon={MapPin}
 *   label="Adresse"
 *   value="12 rue de la Paix, 75002 Paris"
 *   action={{ label: 'Y aller →', onPress: openMaps }}
 *   wide
 * />
 */
export interface InfoTileProps {
  icon: LucideIcon;
  label: string;
  /** Texte simple ou ReactNode (pour rendu personnalisé) */
  value: string | React.ReactNode;
  /** Bouton d'action optionnel sous la valeur */
  action?: { label: string; onPress: () => void };
  /** bordeaux = info gestion (défaut) · marron = info terrain */
  variant?: 'bordeaux' | 'marron';
  /** Si true, la tuile prend toute la largeur (parent doit être en flexWrap) */
  wide?: boolean;
  /** Style additionnel pour le parent (override) */
  style?: ViewStyle;
}

export function InfoTile({
  icon: Icon,
  label,
  value,
  action,
  variant = 'bordeaux',
  wide = false,
  style,
}: InfoTileProps) {
  const isBrown = variant === 'marron';
  const iconBg = isBrown ? DS.nudeMoyen : DS.cremeNude;
  const iconColor = isBrown ? DS.marron : DS.bordeaux;

  return (
    <View style={[styles.tile, wide && styles.wide, style]}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Icon size={15} color={iconColor} strokeWidth={2} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={styles.value}>{value}</Text>
      ) : (
        value
      )}
      {action && (
        <Pressable onPress={action.onPress} style={styles.actionPressable}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: DS.surface,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 14,
    padding: 13,
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  wide: {
    width: '100%',
    flexBasis: '100%',
    flex: 0,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: DS.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: DS.sombre,
    lineHeight: 18.9,
  },
  actionPressable: {
    marginTop: 'auto',
    paddingTop: 2,
  },
  action: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.bordeaux,
  },
});
