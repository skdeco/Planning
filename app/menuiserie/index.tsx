/**
 * Accueil de l'espace Menuiserie — étape 1 : invitations RDV, infos du compte,
 * bascule vers Travaux et Planning direction. Chantiers / usines / CA : étape 2.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, screenTitle, shadows } from '@/constants/design';
import { ROLE_MENUISERIE_LABELS } from '@/app/types';
import { droitsEspaces } from '@/lib/espaces';
import { EspaceBar } from '@/components/espaces/EspaceBar';
import { InvitationsRdv } from '@/components/espaces/InvitationsRdv';

function Carte({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: DS.surface, borderRadius: radius.xl, padding: 16, gap: 8, ...shadows.md }}>
      {children}
    </View>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 14, color: DS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text, flexShrink: 1, textAlign: 'right' }}>{valeur}</Text>
    </View>
  );
}

export default function MenuiserieAccueil() {
  const { data, currentUser, logout } = useApp();
  const droits = droitsEspaces(currentUser, data);
  const role = droits.menuiserie ? ROLE_MENUISERIE_LABELS[droits.menuiserie] : '—';

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 14 }}>
        <View style={{ marginTop: 8, gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: DS.textSecondary }}>SK DECO · ESPACE</Text>
          <Text style={screenTitle}>Menuiserie</Text>
          <EspaceBar espaceCourant="menuiserie" />
        </View>

        <View style={{ marginHorizontal: -12 }}>
          <InvitationsRdv />
        </View>

        <Carte>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary }}>Mon compte</Text>
          <Ligne label="Nom" valeur={currentUser?.nom || 'Administrateur'} />
          <Ligne label="Rôle Menuiserie" valeur={role} />
          <Ligne label="Espaces" valeur={droits.espaces.map(e => (e === 'travaux' ? 'Travaux' : 'Menuiserie')).join(' + ')} />
          <Ligne label="Planning direction" valeur={droits.planningDirection ? 'Oui' : 'Non'} />
        </Carte>

        <Carte>
          <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>Chantiers, usines et chiffre d'affaires</Text>
          <Text style={{ fontSize: 14, color: DS.textSecondary, lineHeight: 20 }}>
            {droits.menuiserie === 'admin'
              ? "Le suivi des chantiers menuiserie (plans, devis usine, production, livraison, pose, PV) et le CA par usine arrivent à la prochaine étape."
              : 'Votre espace est en cours de préparation. Vous serez prévenu dès son ouverture.'}
          </Text>
        </Carte>

        <Pressable onPress={logout} accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: DS.textSecondary }}>Déconnexion</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
