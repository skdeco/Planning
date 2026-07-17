import type { Apporteur, Chantier } from '@/app/types';

export type OngletPortail = 'projet' | 'chiffres' | 'planning' | 'suivisCR' | 'finChantier' | 'messages';

type PermKey = 'voirProjet' | 'voirChiffres' | 'voirPlanning' | 'voirSuivisCR' | 'voirFinChantier' | 'voirMessages';

/**
 * Cascade de résolution des permissions :
 *  1. Admin → tout visible
 *  2. Override chantier (chantier.portailOverrides[contact.id][onglet])
 *  3. Défaut contact (contact.portailDefaut[onglet])
 *  4. Défaut par onglet :
 *     - 'chiffres' (finances) = OPT-IN : masqué sauf pour l'architecte (partenaire
 *       technique) ; client / apporteur / contractant ne le voient que si l'admin
 *       l'a explicitement autorisé (override voirChiffres = true).
 *     - autres onglets = visibles par défaut.
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

  // Défaut opt-in pour les finances : seul l'architecte les voit sans autorisation.
  if (onglet === 'chiffres') return contact.type === 'architecte';

  return true;
}
