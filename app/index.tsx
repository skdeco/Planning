import { Redirect } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { View, ActivityIndicator } from 'react-native';
import { droitsEspaces } from '@/lib/espaces';

export default function RootIndex() {
  const { currentUser, isHydrated, data } = useApp();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F2' }}>
        <ActivityIndicator size="large" color="#141414" />
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
    // Plusieurs espaces : on arrive sur Travaux, la barre du haut permet de basculer
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
