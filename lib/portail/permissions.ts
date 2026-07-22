import type { Apporteur, Chantier } from '@/app/types';

export type OngletPortail = 'projet' | 'chiffres' | 'planning' | 'suivisCR' | 'finChantier' | 'messages' | 'materiaux';

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

  // Matériaux (prescriptions) : réservé à l'architecte (prescripteur). Le client
  // a sa propre vue de validation ailleurs ; apporteur/contractant n'y ont pas accès.
  if (onglet === 'materiaux') return contact.type === 'architecte';

  const key = `voir${onglet.charAt(0).toUpperCase()}${onglet.slice(1)}` as PermKey;

  const override = chantier.portailOverrides?.[contact.id]?.[key];
  if (override !== undefined) return override;

  const defaut = contact.portailDefaut?.[key];
  if (defaut !== undefined) return defaut;

  // Finances : le client voit SON suivi (budget TTC, versements, validation d'étapes,
  // avenants) et l'architecte le détail — par défaut. L'apporteur d'affaires et le
  // contractant (tiers) sont en OPT-IN : masqués sauf autorisation explicite de l'admin.
  if (onglet === 'chiffres') return contact.type === 'architecte' || contact.type === 'client';

  return true;
}
