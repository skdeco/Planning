import type { Chantier } from '@/app/types';

/**
 * Un contact externe (architecte, apporteur, contractant, client, commercial)
 * est-il rattaché à ce chantier ?
 *
 * Les quatre premiers rôles sont liés par un champ unique ; les commerciaux
 * sont rattachés par une liste (`commerciauxIds`), plusieurs pouvant suivre
 * le même chantier.
 */
export function estLieAuContact(chantier: Chantier, contactId: string | undefined): boolean {
  if (!contactId) return false;
  return (
    chantier.architecteId === contactId ||
    chantier.apporteurId === contactId ||
    chantier.contractantId === contactId ||
    chantier.clientApporteurId === contactId ||
    (chantier.commerciauxIds || []).includes(contactId)
  );
}

/** Chantiers visibles par un contact externe. */
export function chantiersDuContact(chantiers: Chantier[], contactId: string | undefined): Chantier[] {
  if (!contactId) return [];
  return chantiers.filter(c => estLieAuContact(c, contactId));
}
