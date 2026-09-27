/**
 * Barre du bas de l'espace Menuiserie (administrateur), toujours visible :
 * Accueil | Planning | Catalogue | Usines | Comptes — même style que la barre du haut.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS, radius } from '@/constants/design';

const ONGLETS = [
  { label: 'Accueil', route: '/menuiserie' },
  { label: 'Planning', route: '/menuiserie/planning' },
  { label: 'Catalogue', route: '/menuiserie/catalogue' },
  { label: 'Usines', route: '/menuiserie/usines' },
  { label: 'Comptes', route: '/menuiserie/comptes' },
];

export function BarreBasMn() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const chemin = usePathname();
  const actif = ONGLETS.slice(1).find(o => chemin.startsWith(o.route))?.route ?? '/menuiserie';

  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6, backgroundColor: DS.background, borderTopWidth: 1, borderTopColor: DS.border }}>
      <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: radius.md, padding: 3, marginHorizontal: 8 }}>
        {ONGLETS.map(o => {
          const on = o.route === actif;
          return (
            <Pressable key={o.route} accessibilityRole="tab" accessibilityState={{ selected: on }}
              onPress={() => { if (!on || chemin !== o.route) router.replace(o.route as any); }}
              style={{ flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? DS.primary : 'transparent' }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: on ? DS.textInverse : DS.text }} numberOfLines={1}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
