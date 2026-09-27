import { Stack, Redirect } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { droitsEspaces } from '@/lib/espaces';

/** Espace Menuiserie : réservé aux comptes ayant un rôle Menuiserie. */
export default function MenuiserieLayout() {
  const { data, currentUser } = useApp();
  if (!currentUser) return <Redirect href={'/login' as any} />;
  if (!droitsEspaces(currentUser, data).menuiserie) return <Redirect href={'/' as any} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
