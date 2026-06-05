/**
 * Rappels semestriels de vérification des documents légaux des sous-traitants.
 *
 * Objectif : tous les 6 mois, rappeler à l'admin de revérifier les documents
 * (Kbis, attestations, décennale…) de chaque sous-traitant. Les rappels sont
 * DÉCALÉS d'une semaine par sous-traitant pour éviter de tout traiter le même
 * jour : ST n°1 en semaine 0, ST n°2 en semaine 1, etc.
 *
 * Approche : une notification LOCALE programmée par sous-traitant (identifiant
 * préfixé `stdocrem_`), reprogrammée à chaque appel. On ne programme que la
 * PROCHAINE occurrence de chaque ST ; au déclenchement, le prochain lancement
 * de l'app reprogrammera l'occurrence suivante (+6 mois).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SousTraitant } from '@/app/types';

// Point d'ancrage du cycle semestriel (heure locale). Sert de référence stable
// pour calculer les occurrences ; la date exacte importe peu, seul le rythme
// (tous les 6 mois, décalé d'1 semaine par ST) compte.
const ANCHOR_YMD = '2026-01-15';
const ANCHOR_HOUR = '09:00';
const STAGGER_DAYS = 7;   // décalage entre deux sous-traitants
const MAX_REMINDERS = 40; // garde-fou (limite iOS = 64 notifs programmées)

/** Annule tous les rappels documents ST précédemment programmés. */
async function cancelPrevious(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(s => typeof s.identifier === 'string' && s.identifier.startsWith('stdocrem_'))
        .map(s => Notifications.cancelScheduledNotificationAsync(s.identifier)),
    );
  } catch {
    // best-effort
  }
}

/**
 * Calcule la prochaine occurrence (> now) pour un sous-traitant d'index `i`.
 * Base = ANCHOR + i*7 jours, puis +6 mois tant que la date est passée.
 */
export function nextStDocReminderDate(index: number, now: number): Date {
  const d = new Date(`${ANCHOR_YMD}T${ANCHOR_HOUR}:00`);
  d.setDate(d.getDate() + index * STAGGER_DAYS);
  let guard = 0;
  while (d.getTime() <= now && guard < 60) {
    d.setMonth(d.getMonth() + 6);
    guard++;
  }
  return d;
}

/**
 * Reprogramme un rappel de vérification documents par sous-traitant.
 * @param sousTraitants liste des sous-traitants.
 * @param enabled si false, on se contente d'annuler les rappels existants.
 */
export async function scheduleStDocReminders(
  sousTraitants: SousTraitant[],
  enabled: boolean,
): Promise<void> {
  if (Platform.OS === 'web') return;

  await cancelPrevious();
  if (!enabled) return;

  const now = Date.now();
  let count = 0;

  for (let i = 0; i < sousTraitants.length; i++) {
    if (count >= MAX_REMINDERS) break;
    const st = sousTraitants[i];
    if (!st?.id) continue;
    const date = nextStDocReminderDate(i, now);
    const nom = st.societe || `${st.prenom} ${st.nom}`.trim() || 'sous-traitant';
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `stdocrem_${st.id}`,
        content: {
          title: '📋 Vérification documents',
          body: `Pensez à revérifier les documents de ${nom}`,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
      count++;
    } catch {
      // best-effort
    }
  }
}
