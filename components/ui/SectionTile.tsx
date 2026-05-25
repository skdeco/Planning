import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { DS } from '@/constants/design';

/**
 * SectionTile — Tuile carrée pour grille de sections (palette V10).
 * Utilisée dans la vue d'ensemble de la fiche chantier (grille 3×4).
 *
 * @example
 * <SectionTile
 *   icon={Info}
 *   label="Infos utiles"
 *   variant="bordeaux"
 *   onPress={openInfos}
 * />
 *
 * @example avec badge de notification
 * <SectionTile
 *   icon={MessageCircle}
 *   label="Messagerie"
 *   variant="bordeaux"
 *   badge={3}
 *   onPress={openMessages}
 * />
 */
export interface SectionTileProps {
  icon: LucideIcon;
  label: string;
  /** bordeaux = gestion / admin (défaut) · marron = terrain / opérationnel */
  variant?: 'bordeaux' | 'marron';
  onPress?: () => void;
  /** Badge de notification (ex: messages non lus). 0 = masqué. */
  badge?: number;
}

export function SectionTile({
  icon: Icon,
  label,
  variant = 'bordeaux',
  onPress,
  badge,
}: SectionTileProps) {
  const isBrown = variant === 'marron';
  const iconBg = isBrown ? DS.nudeMoyen : DS.cremeNude;
  const iconColor = isBrown ? DS.marron : DS.bordeaux;

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };

  const showBadge = badge !== undefined && badge > 0;

  return (
    <Pressable onPress={handlePress} style={styles.touchable} disabled={!onPress}>
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed ? 0.97 : 1 }}
          transition={{ type: 'timing', duration: 100 }}
          style={styles.tile}
        >
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Icon size={18} color={iconColor} strokeWidth={2} />
          </View>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          {showBadge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {badge > 99 ? '99+' : String(badge)}
              </Text>
            </View>
          )}
        </MotiView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchable: {
    aspectRatio: 1,
  },
  tile: {
    flex: 1,
    backgroundColor: DS.surface,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    position: 'relative',
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.sombre,
    textAlign: 'center',
    lineHeight: 14.4,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: DS.bordeaux,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: DS.cremeFond,
  },
});
