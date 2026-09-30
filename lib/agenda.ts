/** Rendez-vous du Planning direction : occurrences (récurrences) et RDV qui me concernent. */
import type { AgendaEvent } from '@/app/types';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Dates (YYYY-MM-DD) auxquelles le RDV a lieu entre `du` et `au` inclus. */
export function datesRdv(evt: AgendaEvent, du: string, au: string): string[] {
  if (!evt.recurrence || evt.recurrence === 'aucune') return evt.date >= du && evt.date <= au ? [evt.date] : [];
  const out: string[] = [];
  const fin = evt.recurrenceFinDate && evt.recurrenceFinDate < au ? evt.recurrenceFinDate : au;
  const c = new Date(evt.date + 'T12:00:00');
  for (let g = 0; g < 800; g++) {
    const j = ymd(c);
    if (j > fin) break;
    if (j >= du) out.push(j);
    if (evt.recurrence === 'quotidien') c.setDate(c.getDate() + 1);
    else if (evt.recurrence === 'hebdomadaire') c.setDate(c.getDate() + 7);
    else c.setMonth(c.getMonth() + 1);
  }
  return out;
}

/** Je suis l'organisateur, ou invité sans avoir refusé. */
export function meConcerne(evt: AgendaEvent, moi: string): boolean {
  if (!moi) return false;
  return evt.createdBy === moi || ((evt.invites || []).includes(moi) && !(evt.refuses || []).includes(moi));
}

export interface OccurrenceRdv { evt: AgendaEvent; date: string }

/** Mes RDV entre deux dates, triés par date puis heure. */
export function mesRdv(events: AgendaEvent[], moi: string, du: string, au: string): OccurrenceRdv[] {
  return events
    .filter(e => meConcerne(e, moi))
    .flatMap(evt => datesRdv(evt, du, au).map(date => ({ evt, date })))
    .sort((a, b) => (a.date === b.date ? a.evt.heureDebut.localeCompare(b.evt.heureDebut) : a.date.localeCompare(b.date)));
}

export const aujourdhuiYMD = () => ymd(new Date());
export function dansNJours(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
