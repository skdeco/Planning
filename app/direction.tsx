/**
 * Planning direction en plein écran — 3e onglet de la barre Travaux | Menuiserie | Planning.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import { droitsEspaces } from '@/lib/espaces';
import { PlanningDirection } from '@/components/PlanningDirection';

import { tm } from '@/lib/menuiserie/i18n';
export default function DirectionScreen() {
  const { data, currentUser } = useApp();
  if (!currentUser) return <Redirect href={'/login' as any} />;
  const droits = droitsEspaces(currentUser, data);
  if (!droits.planningDirection) return <Redirect href={'/' as any} />;
  // Le Planning direction a toujours la barre (au moins un espace + le planning) : pas de bouton Retour.

  return (
      <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: DS.text, flex: 1 }}>{tm("Planning direction")}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <PlanningDirection />
        </View>
      </ScreenContainer>
  );
}
