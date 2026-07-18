import type { Employe } from '@/app/types';
import { getJoursFeriesFrance } from '@/lib/date/joursFeries';

/**
 * Calcul du salaire mensuel d'un employé — SOURCE UNIQUE partagée entre la vue
 * "Par employé" et l'export PDF (qui divergeaient : jours ouvrables théoriques vs
 * heures pointées/8). La base compte les jours travaillés selon les HORAIRES RÉELS
 * de l'employé (emp.horaires[jour].actif), pas un générique lun-ven — sinon un
 * temps partiel / semaine de 4 j est mal payé.
 */
function calcDureeMin(debut: string, fin: string): number {
  const [dh, dm] = debut.split(':').map(Number);
  const [fh, fm] = fin.split(':').map(Number);
  return (fh * 60 + fm) - (dh * 60 + dm);
}

export interface PtDay { debut?: { heure: string }; fin?: { heure: string } }

export interface SalaireMensuel {
  joursOuvrables: number;        // jours théoriques (horaires employé, hors fériés)
  joursAbsents: number;
  joursFeriesTravailles: number;
  totalMinutes: number;
  salaireAvantAcompte: number | null;
}

export function calcSalaireMensuel(
  emp: Employe,
  ptsByDate: Record<string, PtDay | undefined>,
  joursDuMois: string[],
  year: number,
  presencesForcees: { employeId: string; date: string }[],
): SalaireMensuel {
  const feries = getJoursFeriesFrance(year);
  let joursOuvrables = 0, joursAbsents = 0, joursFeriesTravailles = 0, totalMinutes = 0;
  for (const dateStr of joursDuMois) {
    const p = ptsByDate[dateStr];
    const debut = p?.debut, fin = p?.fin;
    if (debut?.heure && fin?.heure) { const d = calcDureeMin(debut.heure, fin.heure); if (d > 0) totalMinutes += d; }
    const jourSemaine = new Date(dateStr + 'T12:00:00').getDay();
    const actif = emp.horaires?.[jourSemaine]?.actif ?? false;
    const isFerie = feries.has(dateStr);
    const isWeekend = jourSemaine === 0 || jourSemaine === 6;
    const forced = presencesForcees.some(pf => pf.employeId === emp.id && pf.date === dateStr);
    if (actif && !isFerie) joursOuvrables++;
    if (actif && !isFerie && !isWeekend && !debut && !fin && !forced) joursAbsents++;
    if (isFerie && (debut || fin)) joursFeriesTravailles++;
  }
  let salaireAvantAcompte: number | null = null;
  if (emp.modeSalaire === 'journalier' && emp.tarifJournalier != null) {
    salaireAvantAcompte = emp.tarifJournalier * (joursOuvrables - joursAbsents)
      + emp.tarifJournalier * joursFeriesTravailles;
  } else if (emp.salaireNet != null) {
    salaireAvantAcompte = emp.salaireNet;
  }
  return { joursOuvrables, joursAbsents, joursFeriesTravailles, totalMinutes, salaireAvantAcompte };
}
