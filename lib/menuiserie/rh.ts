/** Calculs RH Menuiserie. */
import type { CompteMn, CongeMn } from './types';

/** Solde de congés de l'année : droit annuel − congés acceptés. */
export function soldeConges(c: CompteMn, conges: CongeMn[]): number {
  const an = String(new Date().getFullYear());
  const pris = conges.filter(x => x.compte_id === c.id && x.type === 'conges' && x.statut === 'approuve' && x.date_debut.startsWith(an))
    .reduce((s, x) => s + Number(x.jours), 0);
  return Number(c.conges_annuels ?? 25) - pris;
}
