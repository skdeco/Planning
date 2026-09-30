import { useSyncExternalStore } from 'react';
import type { Chantier } from '@/app/types';

/**
 * Affichage des chantiers dans le planning équipe (admin / RH) :
 *  - œil par chantier (choix mémorisé dans le chantier) ;
 *  - Terminé : masqué par défaut, réaffichable à la main ;
 *  - SAV : affiché avec une couleur dédiée et un badge « SAV » ;
 *  - filtre rapide Actifs / SAV / Terminés / Masqués.
 */
export type FiltreStatutPlanning = 'actifs' | 'sav' | 'termines' | 'masques';

/** Couleur dédiée aux chantiers en SAV */
export const COULEUR_SAV = '#C2410C';

let filtre: FiltreStatutPlanning = 'actifs';
const abonnes = new Set<() => void>();
export function setFiltreStatutPlanning(f: FiltreStatutPlanning) {
  if (f === filtre) return;
  filtre = f;
  abonnes.forEach(a => a());
}
export function useFiltreStatutPlanning(): FiltreStatutPlanning {
  return useSyncExternalStore(cb => { abonnes.add(cb); return () => { abonnes.delete(cb); }; }, () => filtre, () => filtre);
}

/** Le chantier est-il affiché dans le planning (vue « Actifs ») ? */
export function estAffiche(c: Chantier): boolean {
  if (c.statut === 'archive') return false;
  if (c.statut === 'termine') return c.afficheSiTermine === true;
  return c.visibleSurPlanning !== false;
}

/** Champs à enregistrer pour inverser l'affichage d'un chantier (bouton œil). */
export function basculerAffichage(c: Chantier): Chantier {
  if (c.statut === 'termine') return { ...c, afficheSiTermine: !estAffiche(c) };
  return { ...c, visibleSurPlanning: !estAffiche(c) };
}

export function dansFiltreStatut(c: Chantier, f: FiltreStatutPlanning): boolean {
  if (c.statut === 'archive') return false;
  if (f === 'actifs') return estAffiche(c);
  if (f === 'sav') return c.statut === 'sav';
  if (f === 'termines') return c.statut === 'termine';
  return !estAffiche(c) && c.statut !== 'termine';
}

/** Couleur SAV appliquée aux blocs du planning. */
export function avecCouleurSav(c: Chantier): Chantier {
  return c.statut === 'sav' ? { ...c, couleur: COULEUR_SAV } : c;
}
