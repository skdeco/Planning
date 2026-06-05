/**
 * Helpers de ciblage des notifications "staff" (admin + RH).
 *
 * Modèle opt-out : une préférence absente ou `true` = notification active.
 * Chaque destinataire (admin, employés RH) est filtré individuellement selon
 * ses propres préférences (`data.notificationPrefs[userKey]`).
 */
import type { AppData, NotificationPrefKey } from '@/app/types';
import { getAdminPushTokens } from '@/lib/notif/getAdminPushTokens';

/** Vrai si la notification `key` est active pour l'utilisateur `userKey` (défaut : actif). */
export function isNotifEnabled(
  prefs: AppData['notificationPrefs'],
  userKey: string,
  key: NotificationPrefKey,
): boolean {
  const p = prefs?.[userKey];
  if (!p) return true;
  return p[key] !== false;
}

/**
 * Push tokens des destinataires "staff" (admin + employés RH) pour qui la
 * notification `key` est active. Déduplique les tokens.
 */
export function getStaffNotifTokens(data: AppData, key: NotificationPrefKey): string[] {
  const prefs = data.notificationPrefs;
  const tokens: string[] = [];

  // Admin (compte admin + employés role==='admin')
  if (isNotifEnabled(prefs, 'admin', key)) {
    for (const t of getAdminPushTokens(data.employes || [], data.adminEmployeId)) {
      if (!tokens.includes(t)) tokens.push(t);
    }
  }

  // Employés RH (hors admin, déjà couverts ci-dessus)
  for (const e of data.employes || []) {
    if (e.isRH && e.role !== 'admin' && e.pushToken && isNotifEnabled(prefs, e.id, key)) {
      if (!tokens.includes(e.pushToken)) tokens.push(e.pushToken);
    }
  }

  return tokens;
}
