import { Tabs, Redirect } from 'expo-router';
import { Platform, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/app/context/AppContext';
import { Ico } from '@/components/ui/Ico';

export default function ExterneLayout() {
  const { currentUser } = useApp();
  if (!currentUser) return <Redirect href={'/login' as any} />;
  if (currentUser.role !== 'apporteur') return <Redirect href={'/(tabs)' as any} />;
  return <ExterneContenu />;
}

function ExterneContenu() {
  const insets = useSafeAreaInsets();
  const { currentUser, setCurrentUser } = useApp();
  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  if (!currentUser) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F4F2' }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 16,
        backgroundColor: '#141414',
      }}>
        <View>
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>SK DECO</Text>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 2 }}>{currentUser.nom || 'Mon espace'}</Text>
        </View>
        <Pressable
          onPress={() => setCurrentUser(null)}
          style={{ backgroundColor: '#3A3A3A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
        >
          <Text style={{ color: '#141414', fontSize: 12, fontWeight: '700' }}>Déconnexion</Text>
        </Pressable>
      </View>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            height: 56 + bottomPadding,
            paddingBottom: bottomPadding,
            paddingTop: 6,
            backgroundColor: '#fff',
            borderTopColor: '#E2E2DF',
          },
          tabBarActiveTintColor: '#141414',
          tabBarInactiveTintColor: '#6A6A68',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="mes-chantiers"
          options={{
            title: 'Mes chantiers',
            tabBarIcon: ({ color }) => <Ico e="🏗️" size={24} />,
          }}
        />
        <Tabs.Screen
          name="planning"
          options={{
            title: 'Planning',
            tabBarIcon: ({ color }) => <Ico e="📅" size={24} />,
          }}
        />
      </Tabs>
    </View>
  );
}
