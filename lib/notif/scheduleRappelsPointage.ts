/**
 * Rappels de pointage (notifications locales sur le téléphone de l'employé).
 *
 * - Arrivée : à l'heure théorique de début + 15 min, si l'arrivée du jour n'est pas pointée.
 *   Programmé pour aujourd'hui et les 6 prochains jours travaillés (hors congés acceptés).
 * - Départ : à l'heure théorique de fin + 15 min, si le dernier pointage du jour est une
 *   arrivée (aucun départ pointé depuis) — aujourd'hui seulement.
 *
 * Une seule notification par événement et par jour (identifiant unique par date).
 * Reprogrammé à chaque changement des pointages : un pointage annule le rappel concerné.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DemandeConge, Employe, Pointage } from '@/app/types';
import { tm } from '@/lib/menuiserie/i18n';

const PREFIXE = 'ptrem_';
const DELAI_MIN = 15;
const JOURS = 7;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function aHeure(jour: string, hhmm: string, plusMin: number): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${jour}T00:00:00`);
  d.setHours(h || 0, (m || 0) + plusMin, 0, 0);
  return d;
}

async function annuler(): Promise<void> {
  try {
    const prog = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(prog.filter(s => s.identifier?.startsWith(PREFIXE)).map(s => Notifications.cancelScheduledNotificationAsync(s.identifier)));
  } catch { /* best-effort */ }
}

export async function scheduleRappelsPointage(emp: Employe | undefined, pointages: Pointage[], conges: DemandeConge[], actif: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  await annuler();
  if (!actif || !emp || emp.doitPointer === false || !emp.horaires) return;

  const maintenant = Date.now();
  const mesPts = pointages.filter(p => p.employeId === emp.id);
  const enConge = (jour: string) => conges.some(c => c.employeId === emp.id && c.statut === 'approuve' && c.dateDebut <= jour && c.dateFin >= jour);

  for (let i = 0; i < JOURS; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const jour = ymd(d);
    const h = emp.horaires[d.getDay()];
    if (!h?.actif || !h.debut || enConge(jour)) continue;
    const duJour = mesPts.filter(p => p.date === jour);

    // Arrivée
    const arr = aHeure(jour, h.debut, DELAI_MIN);
    if (!duJour.some(p => p.type === 'debut') && arr.getTime() > maintenant) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIXE}arr_${jour}`,
          content: { title: tm('Pointage'), body: tm("Tu n'as pas encore pointé ton arrivée."), sound: 'default' },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: arr },
        });
      } catch { /* best-effort */ }
    }

    // Départ (aujourd'hui seulement, une fois l'arrivée pointée)
    if (i === 0 && h.fin && duJour.some(p => p.type === 'debut')) {
      const dep = aHeure(jour, h.fin, DELAI_MIN);
      // Rappel seulement si le dernier pointage du jour est une arrivée (encore « sur place »)
      const dernier = [...duJour].sort((x, y) => x.heure.localeCompare(y.heure)).pop();
      if (dernier?.type === 'debut' && dep.getTime() > maintenant) {
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: `${PREFIXE}dep_${jour}`,
            content: { title: tm('Pointage'), body: tm("N'oublie pas de pointer ton départ."), sound: 'default' },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dep },
          });
        } catch { /* best-effort */ }
      }
    }
  }
}
