import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '@/app/context/AppContext';

const STATUS_CONFIG = {
  synced: { color: '#27AE60', label: '' },
  saving: { color: '#F59E0B', label: 'Synchronisation...' },
  error: { color: '#EF4444', label: 'Erreur de sync' },
  offline: { color: '#EF4444', label: 'Hors ligne' },
} as const;

export function SyncIndicator() {
  const { syncStatus } = useApp();
  const config = STATUS_CONFIG[syncStatus];

  // Ne rien afficher quand tout est ok
  if (syncStatus === 'synced') return null;

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
    paddingVertical: 4,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
