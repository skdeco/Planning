/**
 * Un pointage rattaché à un chantier place l'employé sur ce chantier ce jour-là
 * dans le planning (affectation d'un jour), s'il n'y était pas déjà.
 * L'affectation apporte tout le reste : notes, matériel, photos, planning…
 */
import type { Affectation } from '@/app/types';

export function affecterSiBesoin(
  affectations: Affectation[],
  addAffectation: (a: Affectation) => void,
  employeId: string,
  chantierId: string | undefined,
  date: string,
): void {
  if (!employeId || !chantierId) return;
  const deja = affectations.some(a => a.employeId === employeId && a.chantierId === chantierId && a.dateDebut <= date && a.dateFin >= date);
  if (deja) return;
  addAffectation({ id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`, chantierId, employeId, dateDebut: date, dateFin: date, notes: [] });
}
