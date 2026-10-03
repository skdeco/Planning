import { useSyncExternalStore } from 'react';
import type { Chantier } from '@/app/types';

/**
 * Affichage des chantiers dans le planning équipe (admin / RH) :
 *  - œil par chantier (choix mémorisé dans le chantier) ;
 *  - Terminé : masqué par défaut, réaffichable à la main ;
 *  - SAV : affiché avec une couleur dédiée et un badge « SAV » ;
 *  - seuls les chantiers affichés apparaissent ; un lien discret permet de montrer
 *    aussi les masqués (terminés compris) pour les réactiver avec l'œil.
 */
export type FiltreStatutPlanning = 'actifs' | 'avecMasques';

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
  return f === 'avecMasques' ? true : estAffiche(c);
}

/** Couleur SAV appliquée aux blocs du planning. */
export function avecCouleurSav(c: Chantier): Chantier {
  return c.statut === 'sav' ? { ...c, couleur: COULEUR_SAV } : c;
}

// ── Ligne « Pointé hors chantier » ──────────────────────────────────────────
// Un employé qui pointe loin de tout chantier connu apparaît quand même dans le
// planning, sur une ligne virtuelle de couleur dédiée, en attendant que
// l'admin ou les RH renseignent le chantier.
export const HORS_CHANTIER_ID = '__hors_chantier__';
export const COULEUR_HORS_CHANTIER = '#B42318';

export function chantierHorsChantier(nom: string): Chantier {
  return {
    id: HORS_CHANTIER_ID, nom, statut: 'actif', couleur: COULEUR_HORS_CHANTIER,
    dateDebut: '2000-01-01', dateFin: '2100-12-31', visibleSurPlanning: true, employeIds: [],
  } as unknown as Chantier;
}

/** Employés ayant pointé une arrivée sans chantier ce jour-là. */
export function idsPointesHorsChantier(pointages: { employeId: string; date: string; type: string; chantierId?: string }[], date: string): string[] {
  return [...new Set(pointages.filter(p => p.date === date && p.type === 'debut' && !p.chantierId).map(p => p.employeId))];
}
