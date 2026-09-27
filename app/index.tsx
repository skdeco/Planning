import { Redirect } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { View, ActivityIndicator } from 'react-native';
import { droitsEspaces } from '@/lib/espaces';

export default function RootIndex() {
  const { currentUser, isHydrated, data } = useApp();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF5EF' }}>
        <ActivityIndicator size="large" color="#5C1F2E" />
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href={'/login' as any} />;
  }

  // Espaces Travaux / Menuiserie : écran de choix si les deux sont ouverts
  // et qu'aucun n'a encore été choisi pour cette session.
  const { espaces } = droitsEspaces(currentUser, data);
  let espace = currentUser.espace;
  if (!espace || !espaces.includes(espace)) {
    if (espaces.length > 1) return <Redirect href={'/espace' as any} />;
    espace = espaces[0];
  }
  if (espace === 'menuiserie') {
    return <Redirect href={'/menuiserie' as any} />;
  }

  // Espace Travaux : routage historique selon le rôle
  if (currentUser.role === 'apporteur') {
    return <Redirect href={'/(externe)/mes-chantiers' as any} />;
  }
  if (currentUser.role === 'soustraitant') {
    return <Redirect href={'/(tabs)/planning' as any} />;
  }
  return <Redirect href={'/(tabs)' as any} />;
}
