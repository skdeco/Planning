/**
 * Ordre d'affichage des chantiers — partagé entre le Planning et l'onglet Chantiers.
 *
 * Trois modes (data.chantierTri) :
 *  - 'manuel'  : ordre rangé à la main par l'admin (data.chantierOrderPlanning),
 *                complété par le champ `ordre` puis le nom pour les nouveaux chantiers.
 *  - 'nom'     : alphabétique (français).
 *  - 'dateFin' : date de fin la plus proche en premier, sans date à la fin.
 */

export type ChantierTri = 'manuel' | 'nom' | 'dateFin';

export const CHANTIER_TRI_LABELS: Record<ChantierTri, string> = {
  manuel: 'Le mien',
  nom: 'Nom',
  dateFin: 'Date de fin',
};

type Triable = { id: string; nom: string; dateFin?: string; ordre?: number };

/**
 * Trie une liste de chantiers selon le mode choisi.
 * Ne modifie pas le tableau reçu.
 */
export function trierChantiers<T extends Triable>(
  liste: T[],
  ordreManuel: string[] | undefined,
  tri: ChantierTri | undefined,
): T[] {
  const arr = [...liste];
  const parNom = (a: T, b: T) => a.nom.localeCompare(b.nom, 'fr');

  if (tri === 'nom') return arr.sort(parNom);

  if (tri === 'dateFin') {
    return arr.sort((a, b) => {
      if (!a.dateFin && !b.dateFin) return parNom(a, b);
      if (!a.dateFin) return 1;
      if (!b.dateFin) return -1;
      const cmp = a.dateFin.localeCompare(b.dateFin);
      return cmp !== 0 ? cmp : parNom(a, b);
    });
  }

  // Mode manuel (défaut)
  const ordre = ordreManuel || [];
  return arr.sort((a, b) => {
    const ia = ordre.indexOf(a.id);
    const ib = ordre.indexOf(b.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    // Chantiers pas encore rangés : ancien champ `ordre`, puis nom
    const oa = a.ordre ?? 9999;
    const ob = b.ordre ?? 9999;
    if (oa !== ob) return oa - ob;
    return parNom(a, b);
  });
}

/**
 * Déplace un chantier dans la liste ordonnée et renvoie le nouvel ordre complet.
 * `listeAffichee` sert de référence pour intégrer les chantiers pas encore rangés.
 */
export function deplacerChantier(
  id: string,
  direction: 'up' | 'down' | 'top' | 'bottom',
  listeAffichee: { id: string }[],
): string[] {
  const ids = listeAffichee.map(c => c.id);
  const idx = ids.indexOf(id);
  if (idx === -1) return ids;
  const out = [...ids];
  if (direction === 'up') {
    if (idx <= 0) return out;
    [out[idx - 1], out[idx]] = [out[idx], out[idx - 1]];
  } else if (direction === 'down') {
    if (idx >= out.length - 1) return out;
    [out[idx + 1], out[idx]] = [out[idx], out[idx + 1]];
  } else if (direction === 'top') {
    if (idx === 0) return out;
    out.splice(idx, 1);
    out.unshift(id);
  } else {
    if (idx === out.length - 1) return out;
    out.splice(idx, 1);
    out.push(id);
  }
  return out;
}
