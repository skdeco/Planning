import { useSyncExternalStore } from 'react';
import type { Chantier } from '@/app/types';

/**
 * Filtre de planning partagé (admin / RH) : Travaux, Menuiserie, Dépannages.
 * Petit store global pour que l'écran Planning et ses sous-vues (jour, semaine,
 * mois, Gantt) lisent le même choix sans passer par des props.
 */
export type PlanningFiltre = 'tous' | 'travaux' | 'menuiserie' | 'depannage';

let filtre: PlanningFiltre = 'travaux';
const listeners = new Set<() => void>();

export function setPlanningFiltre(f: PlanningFiltre) {
  if (f === filtre) return;
  filtre = f;
  listeners.forEach(l => l());
}

export function usePlanningFiltre(): PlanningFiltre {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => filtre,
    () => filtre,
  );
}

/** Un chantier appartient-il au planning demandé ? Les lieux fixes (atelier…)
 *  apparaissent dans Travaux et Menuiserie, jamais dans Dépannages. */
export function chantierDansPlanning(c: Chantier, f: PlanningFiltre): boolean {
  if (f === 'tous') return true;
  const cat = c.categorie || 'chantier';
  if (f === 'depannage') return cat === 'depannage';
  if (cat === 'lieuFixe') return true;
  if (cat !== 'chantier') return false;
  const nature = c.nature || 'global';
  return f === 'menuiserie' ? nature === 'menuiserie' : nature === 'global';
}
