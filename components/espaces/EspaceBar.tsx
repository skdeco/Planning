/**
 * Barre d'accès rapide présente dans les deux espaces :
 *  - bascule vers l'autre espace (si le compte a Travaux ET Menuiserie) ;
 *  - accès direct au Planning direction (avec le nombre d'invitations à traiter).
 * Ne rend rien si le compte n'a ni second espace ni Planning direction.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import type { EspaceId } from '@/app/types';
import { droitsEspaces, routeEspace } from '@/lib/espaces';
import { useInvitationsRdv } from '@/hooks/useInvitationsRdv';

const LIBELLE: Record<EspaceId, string> = { travaux: 'Travaux', menuiserie: 'Menuiserie' };

export function EspaceBar({ espaceCourant, sombre }: { espaceCourant: EspaceId; sombre?: boolean }) {
  const { data, currentUser, setCurrentUser } = useApp();
  const router = useRouter();
  const { total } = useInvitationsRdv();
  const droits = droitsEspaces(currentUser, data);
  const autre = droits.espaces.find(e => e !== espaceCourant);
  if (!currentUser || (!autre && !droits.planningDirection)) return null;

  const basculer = () => {
    if (!autre) return;
    setCurrentUser({ ...currentUser, espace: autre });
    router.replace(routeEspace(autre, currentUser) as any);
  };

  const fondChip = sombre ? 'rgba(255,255,255,0.14)' : DS.surface;
  const texteChip = sombre ? DS.textInverse : DS.text;

  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {!!autre && (
        <Pressable
          onPress={basculer}
          accessibilityRole="button"
          accessibilityLabel={`Passer à l'espace ${LIBELLE[autre]}`}
          style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: radius.full, justifyContent: 'center', backgroundColor: fondChip, borderWidth: sombre ? 0 : 1, borderColor: DS.border }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: texteChip }}>⇄ {LIBELLE[autre]}</Text>
        </Pressable>
      )}
      {droits.planningDirection && (
        <Pressable
          onPress={() => router.push('/direction' as any)}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le Planning direction"
          style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: sombre ? DS.surface : DS.sombre }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: sombre ? DS.primary : DS.textInverse }}>Planning direction</Text>
          {total > 0 && (
            <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: DS.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: DS.sombre }}>{total}</Text>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}
