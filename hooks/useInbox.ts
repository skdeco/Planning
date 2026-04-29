// Hook React qui expose l'état de l'Inbox (manifest.json dans
// l'AppGroup partagé). Refresh sur AppState 'active' uniquement —
// pas de polling.
//
// iOS-only effectif. Sur Android/web : count toujours 0, items vide.

import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { listInboxItems, type InboxItem } from '@/lib/share/inboxStore';

export interface UseInboxResult {
  items: InboxItem[];
  count: number;
  refresh: () => void;
}

// Module-scope listener store : permet de synchroniser toutes les
// instances de useInbox() (banner + écran) après une mutation côté
// app principale (ex: removeInboxItem). À appeler après chaque write
// du manifest depuis le code app — voir notifyInboxChanged().
const inboxListeners = new Set<() => void>();

export function notifyInboxChanged(): void {
  inboxListeners.forEach((cb) => cb());
}

export function useInbox(): UseInboxResult {
  const [items, setItems] = useState<InboxItem[]>([]);

  const refresh = useCallback((): void => {
    if (Platform.OS !== 'ios') return;
    setItems(listInboxItems());
  }, []);

  useEffect(() => {
    refresh();
    if (Platform.OS !== 'ios') return;

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    inboxListeners.add(refresh);
    return () => {
      inboxListeners.delete(refresh);
    };
  }, [refresh]);

  return { items, count: items.length, refresh };
}
