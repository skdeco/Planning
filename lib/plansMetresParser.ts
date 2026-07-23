/**
 * Extraction de pièces + surfaces depuis le TEXTE d'un plan PDF (gratuit, local).
 *
 * Même principe que `devisParser` : on extrait le texte du PDF via
 * `/api/extract-pdf` (pdfjs, gratuit) puis on repère par regex les motifs
 *   <NomPièce> <surface> m²
 * que les plans d'architecte impriment presque toujours sur chaque pièce
 * (ex : « Séjour 24,50 m² », « CHAMBRE 1 : 12.3 m² »).
 *
 * C'est un ASSISTANT : les pièces détectées sont proposées, l'utilisateur
 * vérifie / corrige avant d'enregistrer. Aucune IA, aucun coût.
 *
 * Limite connue : ne fonctionne que si le PDF contient une couche texte
 * (plan vectoriel avec libellés). Un plan scanné (image aplatie) ne renvoie
 * rien → saisie manuelle.
 */

export interface PieceExtraite {
  nom: string;
  surfaceM2: number;
}

// Libellés qui ne sont PAS des pièces (totaux, surfaces réglementaires, etc.)
const BLACKLIST = [
  'surface habitable', 'surface utile', 'surface totale', 'surface de plancher',
  'total', 'sous-total', 'shab', 'shon', 'shob', 'sdp', 'emprise', 'emprise au sol',
  'loi carrez', 'carrez', 'superficie', 'niveau', 'étage', 'etage', 'rdc',
  'rez-de-chaussée', 'rez de chaussee', 'terrain', 'parcelle', 'échelle', 'echelle',
  'plan', 'coupe', 'façade', 'facade', 'existant', 'projet', 'nord', 'sud', 'est', 'ouest',
];

function estBlacklist(nom: string): boolean {
  const l = nom.toLowerCase().trim();
  return BLACKLIST.some(b => l === b || l.startsWith(b + ' ') || l.endsWith(' ' + b));
}

function nettoyerNom(nom: string): string {
  let n = nom.replace(/\s+/g, ' ').trim();
  // retire ponctuation/tirets de bord
  n = n.replace(/^[\s:=.\-–—•·]+/, '').replace(/[\s:=.\-–—•·]+$/, '').trim();
  if (n.length > 0) n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  return n;
}

function parseSurface(s: string): number {
  return parseFloat(s.replace(/\s/g, '').replace(',', '.'));
}

/**
 * Extrait les couples (pièce, surface) d'un texte de plan.
 * Stratégie : pour chaque surface « N m² » trouvée, on capture le libellé
 * (1 à 4 mots) qui la précède immédiatement.
 */
export function extrairePiecesDuTexte(texte: string): PieceExtraite[] {
  if (!texte || texte.length < 4) return [];

  const normalise = texte
    .replace(/ /g, ' ')
    .replace(/[.]{2,}/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/ {2,}/g, ' ');

  // Nom = mot débutant par une lettre, + jusqu'à 3 mots suivants (lettres/chiffres).
  // Surface = 1 à 3 chiffres, décimale optionnelle, suivi de m² / m2 / M².
  const pattern = new RegExp(
    "([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\\-]*(?:\\s+[A-Za-zÀ-ÿ0-9'’.\\-]+){0,3}?)" +
    "\\s*[:=\\-–—]?\\s*" +
    "(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*m\\s*(?:²|2)(?![\\dA-Za-zÀ-ÿ])",
    'gi',
  );

  const out: PieceExtraite[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(normalise)) !== null) {
    const nom = nettoyerNom(m[1]);
    const surfaceM2 = parseSurface(m[2]);
    if (nom.length < 2 || nom.length > 32) continue;
    if (!/[A-Za-zÀ-ÿ]{2,}/.test(nom)) continue;   // au moins 2 lettres consécutives (WC, SB…)
    if (/^\d/.test(nom)) continue;
    if (estBlacklist(nom)) continue;
    if (isNaN(surfaceM2) || surfaceM2 < 0.5 || surfaceM2 > 500) continue;
    out.push({ nom, surfaceM2 });
  }

  // Dédup par nom (garde la 1re surface rencontrée)
  const seen = new Set<string>();
  return out.filter(p => {
    const key = p.nom.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
