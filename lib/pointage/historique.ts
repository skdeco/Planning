/** Modifications de pointage avec journal (qui, quand, ancienne valeur). */
import type { Chantier, CurrentUser, Employe, ModifPointage, Pointage } from '@/app/types';

export function auteurCourant(cu: CurrentUser | null, employes: Employe[]): { id: string; nom: string } {
  if (cu?.employeId) {
    const e = employes.find(x => x.id === cu.employeId);
    return { id: cu.employeId, nom: e ? `${e.prenom} ${e.nom}`.trim() : cu.nom || '' };
  }
  return { id: 'admin', nom: cu?.nom || 'Admin' };
}

export function nomChantier(id: string | undefined, chantiers: Chantier[]): string {
  if (!id) return '—';
  return chantiers.find(c => c.id === id)?.nom || '—';
}

/**
 * Applique des changements (heure, chantier, type) et ajoute une ligne
 * d'historique par champ réellement modifié.
 */
export function modifierPointage(
  p: Pointage,
  changes: Partial<Pick<Pointage, 'heure' | 'chantierId' | 'type'>>,
  auteur: { id: string; nom: string },
  chantiers: Chantier[],
  manuel: boolean,
): Pointage {
  const le = new Date().toISOString();
  const hist: ModifPointage[] = [...(p.historique || [])];
  const suivant: Pointage = { ...p };
  if (changes.heure !== undefined && changes.heure !== p.heure) {
    hist.push({ le, parId: auteur.id, parNom: auteur.nom, champ: 'heure', ancien: p.heure, nouveau: changes.heure });
    suivant.heure = changes.heure;
  }
  if (changes.chantierId !== undefined && changes.chantierId !== p.chantierId) {
    hist.push({ le, parId: auteur.id, parNom: auteur.nom, champ: 'chantier', ancien: nomChantier(p.chantierId, chantiers), nouveau: nomChantier(changes.chantierId, chantiers) });
    suivant.chantierId = changes.chantierId;
    suivant.chantierManuel = true;
  }
  if (changes.type !== undefined && changes.type !== p.type) {
    hist.push({ le, parId: auteur.id, parNom: auteur.nom, champ: 'type', ancien: p.type, nouveau: changes.type });
    suivant.type = changes.type;
  }
  if (hist.length === (p.historique || []).length) return p;
  suivant.historique = hist;
  if (manuel) { suivant.saisieManuelle = true; suivant.saisieParId = auteur.id; suivant.saisiPar = auteur.nom; }
  return suivant;
}

/** Pointages d'un employé pour un jour, dans l'ordre chronologique. */
export function pointagesDuJour(pointages: Pointage[], employeId: string, date: string): Pointage[] {
  return pointages
    .filter(p => p.employeId === employeId && p.date === date)
    .sort((a, b) => (a.heure === b.heure ? a.timestamp.localeCompare(b.timestamp) : a.heure.localeCompare(b.heure)));
}
