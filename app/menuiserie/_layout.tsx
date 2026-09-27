import { Stack, Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarreBasMn } from '@/components/menuiserie/BarreBasMn';
import { useApp } from '@/app/context/AppContext';
import { droitsEspaces } from '@/lib/espaces';
import { SessionMnProvider, useSessionMn } from '@/lib/menuiserie/SessionMn';
import { ConnexionMn } from '@/components/menuiserie/ConnexionMn';
import { DS } from '@/constants/design';

/** Espace Menuiserie : rôle Menuiserie dans l'app + connexion sécurisée. */
export default function MenuiserieLayout() {
  const { data, currentUser } = useApp();
  if (!currentUser) return <Redirect href={'/login' as any} />;
  if (!droitsEspaces(currentUser, data).menuiserie) return <Redirect href={'/' as any} />;
  return (
    <SessionMnProvider>
      <Contenu />
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
  if (compte.role !== 'admin') return <Stack screenOptions={{ headerShown: false }} />;
  return <AvecBarreBas />;
}

/** Administrateur : barre du bas toujours visible sous les écrans Menuiserie. */
function AvecBarreBas() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: DS.background }}>
      <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </View>
      </SafeAreaInsetsContext.Provider>
      <BarreBasMn />
    </View>
  );
}
