import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';

export function SyncIndicator() {
  const { syncStatus } = useApp();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncAgo, setLastSyncAgo] = useState('');
  const lastSyncTime = useRef(Date.now());

  // Détection connexion réseau (web)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Tracker la dernière sync réussie
  useEffect(() => {
    if (syncStatus === 'synced') lastSyncTime.current = Date.now();
  }, [syncStatus]);

  // Rafraîchir l'indicateur "il y a X"
  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - lastSyncTime.current) / 1000);
      if (diff < 5) setLastSyncAgo('');
      else if (diff < 60) setLastSyncAgo(`${diff}s`);
      else if (diff < 3600) setLastSyncAgo(`${Math.floor(diff / 60)}min`);
      else setLastSyncAgo(`${Math.floor(diff / 3600)}h`);
    };
    tick();
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, []);

  const effectiveStatus = !isOnline ? 'offline' : syncStatus;

  // Synced récemment → petit indicateur vert discret
  // Synchronisé = rien à signaler : on n'affiche la pastille que s'il se passe quelque chose
  if (effectiveStatus === 'synced') return null;

  const configs = {
    synced: { color: '#2E7D32', label: lastSyncAgo ? `${t.ui.syncPrefix} ${lastSyncAgo}` : '' },
    saving: { color: '#E5A840', label: t.common.loading },
    error: { color: '#E74C3C', label: t.ui.erreurSync },
    offline: { color: '#E74C3C', label: t.ui.horsLigne },
  };
  const config = configs[effectiveStatus];
  if (!config.label) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 4 }]}>
      <View style={styles.container}>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
        <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDE2D6',
    shadowColor: '#2B1D14',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 11, fontWeight: '600' },
});
