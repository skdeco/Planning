import type { Apporteur, Chantier } from '@/app/types';

export type OngletPortail = 'projet' | 'chiffres' | 'planning' | 'finChantier' | 'messages';

type PermKey = 'voirProjet' | 'voirChiffres' | 'voirPlanning' | 'voirFinChantier' | 'voirMessages';

/**
 * Cascade de résolution des permissions :
 *  1. Admin → tout visible
 *  2. Override chantier (chantier.portailOverrides[contact.id][onglet])
 *  3. Défaut contact (contact.portailDefaut[onglet])
 *  4. Fallback : true (visible)
 */
export function canVoirOnglet(
  onglet: OngletPortail,
  contact: Apporteur | undefined,
  chantier: Chantier | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (!contact || !chantier) return false;

  const key = `voir${onglet.charAt(0).toUpperCase()}${onglet.slice(1)}` as PermKey;

  const override = chantier.portailOverrides?.[contact.id]?.[key];
  if (override !== undefined) return override;

  const defaut = contact.portailDefaut?.[key];
  if (defaut !== undefined) return defaut;

  return true;
}
