/**
 * Planning direction en plein écran, accessible depuis les deux espaces
 * (et depuis l'écran de choix d'espace) pour les comptes qui y ont droit.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import { droitsEspaces, routeEspace } from '@/lib/espaces';
import { PlanningDirection } from '@/components/PlanningDirection';

export default function DirectionScreen() {
  const { data, currentUser } = useApp();
  const router = useRouter();
  if (!currentUser) return <Redirect href={'/login' as any} />;
  if (!droitsEspaces(currentUser, data).planningDirection) return <Redirect href={'/' as any} />;

  const retour = () => {
    if (router.canGoBack()) { router.back(); return; }
    const espaces = droitsEspaces(currentUser, data).espaces;
    const espace = currentUser.espace && espaces.includes(currentUser.espace) ? currentUser.espace : espaces[0];
    router.replace((espaces.length > 1 && !currentUser.espace ? '/espace' : routeEspace(espace, currentUser)) as any);
  };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        <Pressable onPress={retour} accessibilityRole="button" accessibilityLabel="Retour" style={{ minHeight: 44, justifyContent: 'center', paddingRight: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: DS.primary }}>‹ Retour</Text>
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '800', color: DS.text, flex: 1 }}>Planning direction</Text>
      </View>
      <View style={{ flex: 1 }}>
        <PlanningDirection />
      </View>
    </ScreenContainer>
  );
}
