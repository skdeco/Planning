/**
 * Carte de réglages des notifications (admin + RH).
 *
 * Modèle opt-out : un interrupteur ON = notification active (valeur absente ou
 * `true` dans `data.notificationPrefs[userKey]`). Les réglages sont propres à
 * l'utilisateur courant (clé `'admin'` pour l'admin, sinon son `employeId`).
 */
import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { Bell, Package, CalendarClock, HeartPulse, Clock } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import type { NotificationPrefKey } from '@/app/types';

interface ToggleRow {
  key: NotificationPrefKey;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const ROWS: ToggleRow[] = [
  { key: 'livraisonRecue', label: 'Livraison reçue', desc: 'Quand une livraison est marquée reçue', icon: <Package size={18} color={DS.bordeaux} /> },
  { key: 'rdvRappel', label: 'Rappels de RDV', desc: 'Rappels chantier la veille (J-1) et 1h avant (H-1)', icon: <CalendarClock size={18} color={DS.bordeaux} /> },
  { key: 'arretMaladie', label: 'Arrêt maladie', desc: 'Quand un employé déclare un arrêt maladie', icon: <HeartPulse size={18} color={DS.bordeaux} /> },
  { key: 'pointageRetard', label: 'Pointage en retard', desc: 'Quand un employé affecté n’a pas pointé à l’heure', icon: <Clock size={18} color={DS.bordeaux} /> },
];

export function NotificationSettings() {
  const { data, currentUser, updateNotificationPrefs } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const userKey = isAdmin ? 'admin' : (currentUser?.employeId || '');

  // N'afficher que pour l'admin ou un employé RH
  const employe = currentUser?.employeId ? data.employes.find(e => e.id === currentUser.employeId) : undefined;
  const isRH = !!employe?.isRH;
  if (!isAdmin && !isRH) return null;
  if (!userKey) return null;

  const prefs = data.notificationPrefs?.[userKey];
  const isOn = (key: NotificationPrefKey) => prefs?.[key] !== false;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Bell size={18} color={DS.bordeaux} />
        <Text style={styles.title}>Notifications</Text>
      </View>
      {ROWS.map((row, idx) => (
        <View key={row.key} style={[styles.row, idx < ROWS.length - 1 && styles.rowBorder]}>
          <View style={styles.rowIcon}>{row.icon}</View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowDesc}>{row.desc}</Text>
          </View>
          <Switch
            value={isOn(row.key)}
            onValueChange={(v) => updateNotificationPrefs(userKey, { [row.key]: v })}
            trackColor={{ false: DS.borderAlt, true: DS.bordeaux }}
            thumbColor={DS.surface}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: DS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DS.border,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: DS.textStrong,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: DS.divider,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: DS.cremeNude,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: DS.text,
  },
  rowDesc: {
    fontSize: 12,
    color: DS.textAlt,
    marginTop: 2,
  },
});
