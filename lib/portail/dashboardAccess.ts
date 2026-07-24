import type { Apporteur, Chantier } from '@/app/types';
import { canVoirOnglet } from '@/lib/portail/permissions';

/**
 * Registre d'accès aux tuiles du dashboard chantier POUR LE PORTAIL (architecte,
 * client, apporteur, contractant). L'admin (SK DECO) garde sa grille complète
 * gérée directement dans ChantierDetailDashboard — ce registre ne le concerne pas.
 *
 * Chaque tuile a un mode par rôle :
 *  - 'act'    : peut créer / modifier / valider / signer
 *  - 'read'   : visible en lecture seule
 *  - 'hidden' : la tuile n'apparaît pas
 *
 * Les règles fines (finances, planning) restent déléguées à `canVoirOnglet`
 * (overrides chantier + défauts contact) pour ne pas dupliquer la logique.
 */
export type TileMode = 'act' | 'read' | 'hidden';

export type TileKey =
  | 'prescriptions' | 'budget' | 'metres' | 'honoraires' | 'finances'
  | 'notes' | 'photos' | 'suivis' | 'phases' | 'journal' | 'yAller'
  | 'marches' | 'achats' | 'rentabilite' | 'sousTraitants' | 'consultation'
  | 'drive' | 'fiche' | 'plans' | 'pv' | 'administratif' | 'livraison'
  | 'sav' | 'annuaire' | 'messagerie';

type PortailRole = 'architecte' | 'client' | 'apporteur' | 'contractant';

/** Modes statiques par rôle (tuile absente = 'hidden'). */
const ACCESS: Record<PortailRole, Partial<Record<TileKey, TileMode>>> = {
  architecte: {
    prescriptions: 'act', budget: 'act', metres: 'act', honoraires: 'act',
    phases: 'act', suivis: 'act', consultation: 'act', administratif: 'act',
    plans: 'act', messagerie: 'act',
    photos: 'read', journal: 'read', fiche: 'read', pv: 'read',
    livraison: 'read', annuaire: 'read',
  },
  client: {
    prescriptions: 'act',   // « Ma sélection » : valide / refuse
    honoraires: 'act',      // accepte les phases
    pv: 'act',              // signe la réception
    sav: 'act',             // signale un problème (décision Kevin)
    messagerie: 'act',
    finances: 'read', photos: 'read', suivis: 'read', phases: 'read',
    plans: 'read', fiche: 'read', livraison: 'read', annuaire: 'read',
  },
  apporteur: {
    fiche: 'read', photos: 'read', phases: 'read', messagerie: 'act',
  },
  contractant: {
    fiche: 'read', photos: 'read', phases: 'read', plans: 'read', messagerie: 'act',
  },
};

/**
 * Résout le mode d'une tuile pour un contact du portail.
 * Surcouche dynamique :
 *  - `finances` : suit `canVoirOnglet('chiffres')` (overrides + opt-in tiers).
 *  - `phases`   : masqué au client si l'admin n'a pas activé le planning client.
 */
export function tileAccess(
  key: TileKey,
  contact: Apporteur | undefined,
  chantier: Chantier | undefined,
): TileMode {
  if (!contact || !chantier) return 'hidden';
  const role = contact.type as PortailRole;
  let mode = ACCESS[role]?.[key] ?? 'hidden';

  if (key === 'finances') {
    return canVoirOnglet('chiffres', contact, chantier, false) ? (mode === 'hidden' ? 'read' : mode) : 'hidden';
  }
  if (key === 'phases' && role === 'client') {
    if (chantier.afficherPlanningAuClient !== true) return 'hidden';
  }
  return mode;
}
