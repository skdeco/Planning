import { Redirect } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { View, ActivityIndicator } from 'react-native';

export default function RootIndex() {
  const { currentUser, isHydrated } = useApp();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F4F7' }}>
        <ActivityIndicator size="large" color="#1A3A6B" />
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href={'/login' as any} />;
  }

  return <Redirect href={'/(tabs)/planning' as any} />;
}
