// Cache JSON des chantiers stocké dans l'AppGroup iOS partagé entre
// l'app principale (writer) et la share extension (reader).
//
// - Écrit : hook `useChantiersCacheSync` (debounce 300ms, app principale)
// - Lu    : `ShareExtension.tsx` (au mount du composant)
// - Container : group.fr.skdeco.planning (déclaré par expo-share-extension)
// - Fenêtre fresh : 7 jours — au-delà on retourne status='stale' pour
//   afficher un "Ouvrez l'app pour rafraîchir" côté extension.
//
// iOS-only. Sur Android/web : no-op (write) ou status='missing' (load).

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import type { StatutChantier } from '@/app/types';

export const APP_GROUP_ID = 'group.fr.skdeco.planning';
export const CACHE_FILENAME = 'chantiers-cache.json';
export const CACHE_VERSION = 1;
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ChantierCacheItem {
  id: string;
  nom: string;
  adresse: string;
  couleur: string;
  statut: StatutChantier;
}

export interface ChantiersCacheFile {
  version: number;
  updatedAt: number;
  userId?: string;
  chantiers: ChantierCacheItem[];
}

export type LoadStatus = 'fresh' | 'stale' | 'missing';

export interface LoadResult {
  chantiers: ChantierCacheItem[];
  status: LoadStatus;
  ageMs?: number;
  error?: string;
}

function getCacheDirectory(): Directory | null {
  if (Platform.OS !== 'ios') return null;
  const containers = Paths.appleSharedContainers;
  if (!containers) return null;
  const dir = containers[APP_GROUP_ID];
  return dir ?? null;
}

export function getCacheFile(): File | null {
  const dir = getCacheDirectory();
  if (!dir) return null;
  return new File(dir, CACHE_FILENAME);
}

export function writeChantiersCache(
  chantiers: ChantierCacheItem[],
  userId?: string,
): void {
  const file = getCacheFile();
  if (!file) return;

  const payload: ChantiersCacheFile = {
    version: CACHE_VERSION,
    updatedAt: Date.now(),
    userId,
    chantiers,
  };

  try {
    if (!file.exists) {
      file.create();
    }
    file.write(JSON.stringify(payload));
  } catch (err) {
    console.warn('[chantiersCache] write failed', err);
  }
}

export function loadChantiersCache(): LoadResult {
  const file = getCacheFile();
  if (!file) {
    return { chantiers: [], status: 'missing', error: 'no-app-group' };
  }
  if (!file.exists) {
    return { chantiers: [], status: 'missing' };
  }

  try {
    const raw = file.textSync();
    const parsed = JSON.parse(raw) as ChantiersCacheFile;

    if (parsed.version !== CACHE_VERSION) {
      return {
        chantiers: [],
        status: 'missing',
        error: `version-mismatch:${parsed.version}`,
      };
    }

    const ageMs = Date.now() - parsed.updatedAt;
    const status: LoadStatus = ageMs <= CACHE_MAX_AGE_MS ? 'fresh' : 'stale';

    return { chantiers: parsed.chantiers, status, ageMs };
  } catch (err) {
    return {
      chantiers: [],
      status: 'missing',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
