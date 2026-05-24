import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DS } from '@/constants/design';

/**
 * ProgressBar — Barre d'avancement chantier (palette V10).
 * Utilisée sur les cards chantier, fiches détail, et lots de marché.
 *
 * @example
 * <ProgressBar value={29} variant="bordeaux" showPercent />
 * <ProgressBar value={5} variant="marron" showPercent />
 */
export interface ProgressBarProps {
  /** Pourcentage 0-100 (clamp automatique hors bornes) */
  value: number;
  /** bordeaux = chantier actif (défaut) · marron = chantier en attente */
  variant?: 'bordeaux' | 'marron';
  /** Affiche le pourcentage à droite de la barre */
  showPercent?: boolean;
}

export function ProgressBar({
  value,
  variant = 'bordeaux',
  showPercent = false,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillColor = variant === 'marron' ? DS.marron : DS.bordeaux;
  const widthStyle = { width: (`${clamped}%` as `${number}%`), backgroundColor: fillColor };

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <View style={[styles.fill, widthStyle]} />
      </View>
      {showPercent && (
        <Text style={styles.pct}>{Math.round(clamped)}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: DS.cremeNude,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  pct: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.sombre,
    minWidth: 35,
    textAlign: 'right',
  },
});
