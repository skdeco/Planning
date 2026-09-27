/**
 * Choix de l'espace après connexion, pour un compte qui a accès
 * à la fois à Travaux et à Menuiserie. Planning direction accessible directement.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, screenTitle, shadows } from '@/constants/design';
import type { EspaceId } from '@/app/types';
import { ROLE_MENUISERIE_LABELS, APPORTEUR_TYPE_LABELS } from '@/app/types';
import { droitsEspaces, routeEspace } from '@/lib/espaces';
import { useInvitationsRdv } from '@/hooks/useInvitationsRdv';

export default function ChoixEspaceScreen() {
  const { data, currentUser, setCurrentUser, logout } = useApp();
  const router = useRouter();
  const { total } = useInvitationsRdv();
  if (!currentUser) return <Redirect href={'/login' as any} />;
  const droits = droitsEspaces(currentUser, data);

  const roleTravaux = (() => {
    if (currentUser.role === 'admin') return 'Administrateur';
    if (currentUser.role === 'employe') return 'Employé';
    if (currentUser.role === 'soustraitant') return 'Sous-traitant';
    const a = (data.apporteurs || []).find(x => x.id === currentUser.apporteurId);
    return a ? (APPORTEUR_TYPE_LABELS[a.type]?.label || 'Contact') : 'Contact';
  })();

  const entrer = (espace: EspaceId) => {
    setCurrentUser({ ...currentUser, espace });
    router.replace(routeEspace(espace, currentUser) as any);
  };

  const Carte = ({ espace, titre, role, plein }: { espace: EspaceId; titre: string; role: string; plein?: boolean }) => (
    <Pressable
      onPress={() => entrer(espace)}
      accessibilityRole="button"
      accessibilityLabel={`Entrer dans l'espace ${titre}`}
      style={{ backgroundColor: plein ? DS.primary : DS.surface, borderRadius: radius.xl, padding: 20, gap: 10, borderWidth: plein ? 0 : 1, borderColor: DS.border, ...shadows.md }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: plein ? DS.textInverse : DS.text }}>{titre}</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: plein ? DS.textInverse : DS.primary }}>›</Text>
      </View>
      <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: plein ? DS.surface : DS.soft }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: DS.primary }}>{role}</Text>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }}>
        <View style={{ marginTop: 16, gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: DS.textSecondary }}>SK DECO{currentUser.nom ? ` · ${currentUser.nom}` : ''}</Text>
          <Text style={screenTitle}>Dans quel espace voulez-vous entrer ?</Text>
        </View>

        {droits.menuiserie && (
          <Carte espace="menuiserie" titre="Menuiserie" role={ROLE_MENUISERIE_LABELS[droits.menuiserie]} plein />
        )}
        {droits.travaux && <Carte espace="travaux" titre="Travaux" role={roleTravaux} />}

        <View style={{ flex: 1 }} />

        {droits.planningDirection && (
          <Pressable
            onPress={() => router.push('/direction' as any)}
            accessibilityRole="button"
            style={{ backgroundColor: DS.sombre, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: DS.textInverse }}>Planning direction</Text>
              <Text style={{ fontSize: 13, color: '#D8D2CC', marginTop: 2 }}>Commun aux deux espaces</Text>
            </View>
            {total > 0 && (
              <View style={{ backgroundColor: DS.warning, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: DS.sombre }}>{total} à traiter</Text>
              </View>
            )}
          </Pressable>
        )}

        <Pressable onPress={logout} accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: DS.textSecondary }}>Déconnexion</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
