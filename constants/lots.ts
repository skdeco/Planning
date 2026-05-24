/**
 * Lots / corps de métier — référentiel partagé V10.
 *
 * Utilisé par :
 * - Plans (PlanChantier.lotId) : un plan est rattaché à un lot
 * - Suivis / CR (cases reportées par lot)
 *
 * Pas utilisé par Marchés : les lots de marché sont extraits du devis
 * (lib/devisParser.ts).
 *
 * Pour l'instant la liste est hardcodée (Q4 décision Kevin : modifiable
 * plus tard via écran admin si besoin — DETTE-LOTS-ADMIN-001).
 */
export interface LotMetier {
  /** Slug stable utilisé pour la persistence (ex: 'cloisons') */
  id: string;
  /** Libellé affiché dans l'UI */
  nom: string;
  /** Ordre d'affichage dans les sélecteurs */
  ordre: number;
}

export const LOTS_DEFAUT: LotMetier[] = [
  { id: 'cloisons',         nom: 'Cloisons',         ordre: 1  },
  { id: 'faux-plafonds',    nom: 'Faux plafonds',    ordre: 2  },
  { id: 'carrelage',        nom: 'Carrelage',        ordre: 3  },
  { id: 'plomberie',        nom: 'Plomberie',        ordre: 4  },
  { id: 'electricite',      nom: 'Électricité',      ordre: 5  },
  { id: 'revetement-sol',   nom: 'Revêtement sol',   ordre: 6  },
  { id: 'revetement-mural', nom: 'Revêtement mural', ordre: 7  },
  { id: 'staff',            nom: 'Staff',            ordre: 8  },
  { id: 'demolition',       nom: 'Démolition',       ordre: 9  },
  { id: 'general',          nom: 'Général',          ordre: 10 },
  { id: 'climatisation',    nom: 'Climatisation',    ordre: 11 },
  { id: 'vmc',              nom: 'VMC',              ordre: 12 },
  { id: 'menuiserie',       nom: 'Menuiserie',       ordre: 13 },
  { id: 'fenetres',         nom: 'Fenêtres',         ordre: 14 },
  { id: 'chauffage',        nom: 'Chauffage',        ordre: 15 },
  { id: 'autre',            nom: 'Autre',            ordre: 16 },
];

/** Récupère un lot par son id, ou undefined si non trouvé */
export const getLotById = (id: string | undefined | null): LotMetier | undefined =>
  id ? LOTS_DEFAUT.find(l => l.id === id) : undefined;

/** Libellé d'un lot, ou '—' si lot inconnu (rétrocompat avec plans sans lotId) */
export const getLotNom = (id: string | undefined | null): string =>
  getLotById(id)?.nom ?? '—';

/** Liste triée par ordre, prête à être affichée dans un sélecteur */
export const LOTS_TRIES: ReadonlyArray<LotMetier> = [...LOTS_DEFAUT].sort(
  (a, b) => a.ordre - b.ordre
);
