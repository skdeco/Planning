/** Barre du bas de l'accueil Menuiserie, au même style que la barre du haut. */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS, radius } from '@/constants/design';

export function BarreBasMn({ onglets }: { onglets: { label: string; onPress: () => void }[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6, backgroundColor: DS.background }}>
      <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: radius.md, padding: 3, marginHorizontal: 12 }}>
        {onglets.map(o => (
          <Pressable key={o.label} onPress={o.onPress} accessibilityRole="button"
            style={{ flex: 1, minHeight: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: DS.text }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
