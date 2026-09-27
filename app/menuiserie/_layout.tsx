import { Stack, Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { droitsEspaces } from '@/lib/espaces';
import { SessionMnProvider, useSessionMn } from '@/lib/menuiserie/SessionMn';
import { ConnexionMn } from '@/components/menuiserie/ConnexionMn';
import { DS } from '@/constants/design';
import { AvecBarreEspaces } from '@/components/espaces/BarreEspaces';

/** Espace Menuiserie : rôle Menuiserie dans l'app + connexion sécurisée. */
export default function MenuiserieLayout() {
  const { data, currentUser } = useApp();
  if (!currentUser) return <Redirect href={'/login' as any} />;
  if (!droitsEspaces(currentUser, data).menuiserie) return <Redirect href={'/' as any} />;
  return (
    <SessionMnProvider>
      <AvecBarreEspaces actif="menuiserie">
        <Contenu />
      </AvecBarreEspaces>
    </SessionMnProvider>
  );
}

function Contenu() {
  const { compte, chargement } = useSessionMn();
  if (chargement) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.background }}>
        <ActivityIndicator size="large" color={DS.primary} />
      </View>
    );
  }
  if (!compte) return <ConnexionMn />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
