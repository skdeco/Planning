import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { DS, radius, space, font } from '@/constants/design';

/**
 * PanelHeader — en-tête commun des panneaux plein écran (architecte, sous-traitants…).
 * Gère la safe-area (encoche / Dynamic Island) : le titre descend sous la caméra
 * et la croix de fermeture a une grande zone de clic. Source unique de vérité
 * pour ne plus recopier le pattern header dans chaque panneau.
 */
export interface PanelHeaderProps {
  title: string;
  sub?: string;
  onClose: () => void;
}

export function PanelHeader({ title, sub, onClose }: PanelHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.hTitle}>{title}</Text>
        {sub ? <Text style={styles.hSub}>{sub}</Text> : null}
      </View>
      <Pressable hitSlop={16} onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fermer">
        <X size={22} color={DS.sombre} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingBottom: space.md },
  hTitle: { fontSize: font.xl, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  hSub: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
});
