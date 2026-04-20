// ─────────────────────────────────────────────────────────────────────────────
// Cette page a été unifiée avec l'onglet « Sous-traitants » de /(tabs)/equipe.
// Toute UI (cartes 3-boutons Infos / Finances / Docs + modales) vit désormais
// dans equipe.tsx. Ce fichier reste uniquement pour rediriger les anciens liens
// (ex. ?stId=… depuis notifications, deep-links, etc.) vers la bonne vue.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';

export default function SousTraitantsRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stId?: string; view?: string }>();

  useEffect(() => {
    const query: Record<string, string> = { tab: 'soustraitants' };
    if (params.stId) query.stId = String(params.stId);
    if (params.view) query.view = String(params.view);
    const qs = new URLSearchParams(query).toString();
    router.replace(`/(tabs)/equipe?${qs}` as any);
  }, [params.stId, params.view, router]);

  return (
    <ScreenContainer containerClassName="bg-[#F5EDE3]">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2C2C2C" />
      </View>
    </ScreenContainer>
  );
}
