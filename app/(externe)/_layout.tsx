import { Tabs, Redirect } from 'expo-router';
import { Platform, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/app/context/AppContext';

export default function ExterneLayout() {
  const insets = useSafeAreaInsets();
  const { currentUser, setCurrentUser } = useApp();
  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);

  if (!currentUser) return <Redirect href={'/login' as any} />;
  if (currentUser.role !== 'apporteur') return <Redirect href={'/(tabs)' as any} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5EDE3' }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 16,
        backgroundColor: '#2C2C2C',
      }}>
        <View>
          <Text style={{ color: '#C9A96E', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>SK DECO</Text>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 2 }}>{currentUser.nom || 'Mon espace'}</Text>
        </View>
        <Pressable
          onPress={() => setCurrentUser(null)}
          style={{ backgroundColor: '#3A3A3A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
        >
          <Text style={{ color: '#C9A96E', fontSize: 12, fontWeight: '700' }}>Déconnexion</Text>
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
            borderTopColor: '#E8DDD0',
          },
          tabBarActiveTintColor: '#8C6D2F',
          tabBarInactiveTintColor: '#8C8077',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="mes-chantiers"
          options={{
            title: 'Mes chantiers',
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🏗️</Text>,
          }}
        />
        <Tabs.Screen
          name="planning"
          options={{
            title: 'Planning',
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📅</Text>,
          }}
        />
      </Tabs>
    </View>
  );
}
