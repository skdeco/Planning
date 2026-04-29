// Sync debouncé du cache chantiers vers l'AppGroup iOS pour la share
// extension. Déclenché à chaque mutation de `data.chantiers` ou
// changement d'utilisateur. Debounce 300ms pour absorber les rafales
// (mass updates depuis Supabase realtime).
//
// iOS-only. Sur Android/web : no-op silencieux.

import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useApp } from '@/app/context/AppContext';
import type { CurrentUser } from '@/app/types';
import {
  writeChantiersCache,
  type ChantierCacheItem,
} from '@/lib/share/chantiersCache';

const DEBOUNCE_MS = 300;

function deriveUserId(user: CurrentUser | null): string | undefined {
  if (!user) return undefined;
  return user.employeId ?? user.soustraitantId ?? user.apporteurId ?? user.role;
}

export function useChantiersCacheSync(): void {
  const { data, currentUser, isHydrated } = useApp();

  useEffect(() => {
    if (!isHydrated) return;
    if (Platform.OS !== 'ios') return;

    const timer = setTimeout(() => {
      const items: ChantierCacheItem[] = data.chantiers.map((c) => ({
        id: c.id,
        nom: c.nom,
        adresse: c.adresse,
        couleur: c.couleur,
        statut: c.statut,
      }));
      writeChantiersCache(items, deriveUserId(currentUser));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isHydrated, data.chantiers, currentUser]);
}
