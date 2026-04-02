import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useApp } from '@/app/context/AppContext';

export function SyncIndicator() {
  const { syncStatus } = useApp();
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
  if (effectiveStatus === 'synced' && !lastSyncAgo) return null;

  const configs = {
    synced: { color: '#27AE60', label: lastSyncAgo ? `Sync il y a ${lastSyncAgo}` : '' },
    saving: { color: '#F59E0B', label: 'Synchronisation...' },
    error: { color: '#EF4444', label: 'Erreur de sync' },
    offline: { color: '#EF4444', label: 'Hors ligne — données conservées localement' },
  };
  const config = configs[effectiveStatus];
  if (!config.label) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    gap: 6,
    backgroundColor: '#FAFBFC',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 11, fontWeight: '600' },
});
