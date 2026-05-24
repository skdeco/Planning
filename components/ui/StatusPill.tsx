import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DS } from '@/constants/design';

/**
 * StatusPill — Badge de statut chantier (palette V10).
 * Utilisé sur les cards chantier de la liste, en-tête fiche détail, etc.
 *
 * @example
 * <StatusPill label="Actif" status="actif" />
 * <StatusPill label="En attente" status="attente" />
 * <StatusPill label="Livré" status="livre" />
 */
export type StatusType = 'actif' | 'attente' | 'livre';

export interface StatusPillProps {
  label: string;
  status: StatusType;
}

const statusStyles: Record<StatusType, { bg: string; color: string }> = {
  actif:   { bg: DS.cremeNude, color: DS.bordeaux },
  attente: { bg: DS.nudeMoyen, color: DS.marron },
  livre:   { bg: DS.sombre,    color: DS.cremeFond },
};

export function StatusPill({ label, status }: StatusPillProps) {
  const { bg, color } = statusStyles[status];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});
