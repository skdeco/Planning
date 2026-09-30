/**
 * Rappel 1 h avant chaque RDV du Planning direction dont je suis l'organisateur
 * ou un invité (notification locale, fonctionne app fermée). Reprogrammé à chaque
 * changement des RDV ; horizon de 14 jours, 40 rappels au plus (limite iOS : 64).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AgendaEvent, Chantier } from '@/app/types';
import { aujourdhuiYMD, dansNJours, mesRdv } from '@/lib/agenda';
import { tm } from '@/lib/menuiserie/i18n';

const PREFIXE = 'agrem_';
const MAX = 40;

export async function scheduleAgendaReminders(events: AgendaEvent[], chantiers: Chantier[], moi: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const prog = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(prog.filter(s => s.identifier?.startsWith(PREFIXE)).map(s => Notifications.cancelScheduledNotificationAsync(s.identifier)));
  } catch { /* best-effort */ }
  if (!moi) return;
  const maintenant = Date.now();
  let n = 0;
  for (const { evt, date } of mesRdv(events, moi, aujourdhuiYMD(), dansNJours(14))) {
    if (n >= MAX) break;
    const debut = new Date(`${date}T${evt.heureDebut}:00`).getTime();
    const quand = debut - 60 * 60 * 1000;
    if (isNaN(debut) || quand <= maintenant) continue;
    const ch = evt.chantierId ? chantiers.find(c => c.id === evt.chantierId) : undefined;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIXE}${evt.id}_${date}`,
        content: { title: tm('RDV dans 1 h'), body: `${evt.heureDebut} · ${evt.titre}${ch ? ` — ${ch.nom}` : evt.lieu ? ` — ${evt.lieu}` : ''}`, sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(quand) },
      });
      n++;
    } catch { /* best-effort */ }
  }
}
