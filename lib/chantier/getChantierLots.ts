import type { Chantier, MarcheChantier, SupplementMarche } from '@/app/types';

/**
 * Agrège les lots (avancementCorps) d'un chantier depuis TOUTES leurs sources :
 * marchés + suppléments + legacy chantier.avancementCorps (dédup par id).
 *
 * Après migration lots→marché, chantier.avancementCorps est vidé — lire ce seul
 * champ (planning externe, carte "mes chantiers") affiche 0% à tort. Ce helper
 * reproduit l'agrégation faite dans PortailClient pour aligner les lectures externes.
 */
export function getChantierLots(
  chantier: Chantier | undefined,
  marchesChantier: MarcheChantier[] | undefined,
  supplementsMarche: SupplementMarche[] | undefined,
): NonNullable<Chantier['avancementCorps']> {
  const all: NonNullable<Chantier['avancementCorps']> = [];
  const cid = chantier?.id;
  (marchesChantier || []).filter(m => m.chantierId === cid).forEach(m => (m.avancementCorps || []).forEach(l => all.push(l)));
  (supplementsMarche || []).filter(s => s.chantierId === cid).forEach(s => (s.avancementCorps || []).forEach(l => all.push(l)));
  (chantier?.avancementCorps || []).forEach(l => { if (!all.find(x => x.id === l.id)) all.push(l); });
  return all;
}
