/**
 * Planification des rappels de RDV de chantier (J-1 et H-1).
 *
 * Approche : notifications LOCALES programmées (fonctionnent app fermée sur iOS).
 * À chaque appel, on annule tous les rappels RDV précédents (identifiant préfixé
 * `rdvrem_`) puis on reprogramme les occurrences à venir sur un horizon court.
 *
 * Limite iOS : 64 notifications programmées simultanées. On plafonne donc à
 * MAX_REMINDERS rappels (2 par occurrence : J-1 + H-1).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { RdvChantier, Chantier } from '@/app/types';
import { todayYMD, dateOffsetYMD } from '@/lib/date/today';

const HORIZON_DAYS = 14;
const MAX_REMINDERS = 50;
const MS_24H = 24 * 60 * 60 * 1000;
const MS_1H = 60 * 60 * 1000;

function toYMDLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Étale les occurrences d'un RDV récurrent entre `fromYMD` et `toYMD` (inclus). */
export function expandRdvOccurrences(rdv: RdvChantier, fromYMD: string, toYMD: string): string[] {
  const result: string[] = [];
  const start = rdv.dateDebut;
  if (!start) return result;
  const horizon = rdv.dateFinRecurrence && rdv.dateFinRecurrence < toYMD ? rdv.dateFinRecurrence : toYMD;

  if (rdv.frequence === 'ponctuel') {
    if (start >= fromYMD && start <= horizon) result.push(start);
  } else {
    const cursor = new Date(start + 'T12:00:00');
    const endDate = new Date(horizon + 'T12:00:00');
    let guard = 0;
    while (cursor <= endDate && guard < 400) {
      guard++;
      const ymd = toYMDLocal(cursor);
      if (ymd >= fromYMD) result.push(ymd);
      if (rdv.frequence === 'mensuel') cursor.setMonth(cursor.getMonth() + 1);
      else if (rdv.frequence === 'bimensuel') cursor.setDate(cursor.getDate() + 14);
      else cursor.setDate(cursor.getDate() + 7); // hebdomadaire
    }
  }

  const annulations = rdv.annulations || [];
  return result.filter(d => !annulations.includes(d));
}

/** Annule tous les rappels RDV précédemment programmés. */
async function cancelPreviousRdvReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(s => typeof s.identifier === 'string' && s.identifier.startsWith('rdvrem_'))
        .map(s => Notifications.cancelScheduledNotificationAsync(s.identifier)),
    );
  } catch {
    // best-effort
  }
}

/**
 * Reprogramme les rappels J-1 et H-1 pour les RDV fournis.
 * @param rdvs RDV pertinents pour l'utilisateur courant (déjà filtrés par l'appelant).
 * @param chantiers pour résoudre le nom du chantier.
 * @param enabled si false, on se contente d'annuler les rappels existants.
 */
export async function scheduleRdvReminders(
  rdvs: RdvChantier[],
  chantiers: Chantier[],
  enabled: boolean,
): Promise<void> {
  if (Platform.OS === 'web') return;

  await cancelPreviousRdvReminders();
  if (!enabled) return;

  const now = Date.now();
  const fromYMD = todayYMD();
  const toYMD = dateOffsetYMD(HORIZON_DAYS);
  let count = 0;

  for (const rdv of rdvs) {
    if (count >= MAX_REMINDERS) break;
    const occurrences = expandRdvOccurrences(rdv, fromYMD, toYMD);
    const heure = rdv.heureDebut || '09:00';
    const chantier = chantiers.find(c => c.id === rdv.chantierId);
    const lieu = chantier?.nom || 'chantier';

    for (const ymd of occurrences) {
      if (count >= MAX_REMINDERS) break;
      const occMs = new Date(`${ymd}T${heure}:00`).getTime();
      if (isNaN(occMs)) continue;

      const reminders = [
        { offset: MS_24H, suffix: 'j1', title: '📅 RDV demain', body: `${rdv.titre} — ${lieu} à ${heure}` },
        { offset: MS_1H, suffix: 'h1', title: '📅 RDV dans 1h', body: `${rdv.titre} — ${lieu} à ${heure}` },
      ];

      for (const r of reminders) {
        if (count >= MAX_REMINDERS) break;
        const triggerMs = occMs - r.offset;
        if (triggerMs <= now) continue;
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: `rdvrem_${rdv.id}_${ymd}_${r.suffix}`,
            content: { title: r.title, body: r.body, sound: 'default' },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(triggerMs),
            },
          });
          count++;
        } catch {
          // best-effort
        }
      }
    }
  }
}
