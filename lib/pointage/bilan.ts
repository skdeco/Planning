/**
 * Bilan horaire d'une journée (réservé à l'admin / RH — jamais affiché à l'employé) :
 * temps réellement travaillé (somme des paires arrivée → départ) comparé à la journée
 * théorique de la fiche employé. Purement informatif : n'entre pas dans le calcul de la paie.
 */
import type { Employe, Pointage } from '@/app/types';

const min = (h: string) => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0); };

/** Minutes travaillées : chaque arrivée est appariée au départ suivant. */
export function minutesTravailleesJour(pts: Pointage[]): number {
  const tries = [...pts].sort((a, b) => a.heure.localeCompare(b.heure));
  let total = 0;
  let arrivee: number | null = null;
  for (const p of tries) {
    if (p.type === 'debut') { if (arrivee === null) arrivee = min(p.heure); }
    else if (arrivee !== null) { total += Math.max(0, min(p.heure) - arrivee); arrivee = null; }
  }
  return total;
}

/** Minutes théoriques du jour selon les horaires de la fiche employé (0 si jour non travaillé). */
export function minutesTheoriquesJour(emp: Employe, date: string): number {
  const h = emp.horaires?.[new Date(date + 'T12:00:00').getDay()];
  if (!h?.actif || !h.debut || !h.fin) return 0;
  return Math.max(0, min(h.fin) - min(h.debut));
}

/**
 * Écart du jour en minutes (positif = temps en plus, négatif = temps en moins).
 * null si rien à comparer : aucun pointage (absence traitée à part), ou journée non terminée.
 * Présence forcée sans heures : considérée comme une journée normale (écart 0).
 */
export function ecartJourMinutes(emp: Employe, ptsJour: Pointage[], date: string, presenceForcee: boolean): number | null {
  if (ptsJour.length === 0) return presenceForcee ? 0 : null;
  const derniere = [...ptsJour].sort((a, b) => a.heure.localeCompare(b.heure)).pop();
  if (derniere?.type !== 'fin') return null; // journée en cours ou départ non pointé
  return minutesTravailleesJour(ptsJour) - minutesTheoriquesJour(emp, date);
}

/** « +3h23 », « −0h15 », « 0h00 » */
export function formatEcartHeures(m: number): string {
  const s = m > 0 ? '+' : m < 0 ? '−' : '';
  const a = Math.abs(m);
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
}

export const couleurEcart = (m: number) => (m > 0 ? '#2E7D32' : m < 0 ? '#C0392B' : '#6E5F54');
