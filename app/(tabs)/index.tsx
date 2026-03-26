import { Redirect } from 'expo-router';

// Cet écran ne devrait jamais s'afficher car app/index.tsx gère la redirection initiale.
// Mais en cas d'accès direct à /(tabs), on redirige vers le planning.
export default function TabsIndex() {
  return <Redirect href={'/(tabs)/planning' as any} />;
}
