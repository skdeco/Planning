/**
 * Détection HEURISTIQUE des totaux HT / TTC / TVA dans le texte d'une facture
 * (extrait gratuitement via /api/extract-pdf, sans IA payante).
 *
 * Le résultat est destiné à PRÉ-REMPLIR le formulaire d'achat : l'utilisateur
 * vérifie et corrige toujours manuellement. On privilégie donc la prudence
 * (ne rien renvoyer plutôt qu'une valeur douteuse).
 */

export interface TotauxFacture {
  ht: number | null;
  ttc: number | null;
  tva: number | null;
}

/** Parse un montant en format FR ("1 234,56") ou US ("1,234.56"). */
function parseMontantFr(s: string): number {
  let clean = s.replace(/[\s ]/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) clean = clean.replace(/\./g, '').replace(',', '.');
    else clean = clean.replace(/,/g, '');
  } else if (lastComma >= 0) {
    clean = clean.replace(',', '.');
  }
  return parseFloat(clean);
}

// Un montant : chiffres avec séparateurs de milliers (espace/point) + décimales optionnelles.
const AMOUNT = String.raw`\d[\d . ]*\d(?:[.,]\d{1,2})?|\d(?:[.,]\d{1,2})?`;

/**
 * Récupère toutes les valeurs numériques qui suivent (jusqu'à ~28 caractères)
 * une étiquette donnée. Insensible à la casse.
 */
function montantsApres(texte: string, labelSource: string): number[] {
  const re = new RegExp(`${labelSource}[^0-9\\-]{0,28}(${AMOUNT})`, 'gi');
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte)) !== null) {
    const v = parseMontantFr(m[1]);
    if (!isNaN(v) && v > 0 && v < 100_000_000) out.push(v);
  }
  return out;
}

export function extraireTotauxFacture(texteRaw: string): TotauxFacture {
  if (!texteRaw) return { ht: null, ttc: null, tva: null };
  const texte = texteRaw.replace(/ /g, ' ');

  // TTC / net à payer : le grand total → on prend la plus grande valeur.
  const ttcCands = montantsApres(
    texte,
    String.raw`(?:total\s*)?(?:t\s*\.?\s*t\s*\.?\s*c|toutes\s*taxes\s*comprises|net\s*[àa]\s*payer|net\s*[àa]\s*r[ée]gler|[àa]\s*payer|montant\s*d[ûu])`,
  );
  // HT : plusieurs "prix HT" par ligne possibles → on prend la plus grande (= total HT).
  const htCands = montantsApres(
    texte,
    String.raw`(?:total\s*)?(?:h\s*\.?\s*t\b|hors\s*taxes?)`,
  );
  const tvaCands = montantsApres(texte, String.raw`t\s*\.?\s*v\s*\.?\s*a`);

  let ttc: number | null = ttcCands.length ? Math.max(...ttcCands) : null;
  let ht: number | null = htCands.length ? Math.max(...htCands) : null;
  const tva: number | null = tvaCands.length ? Math.max(...tvaCands) : null;

  // Cohérence : le HT ne peut pas dépasser le TTC.
  if (ht !== null && ttc !== null && ht > ttc) ht = null;

  // Dérivations douces si une seule des deux valeurs est trouvée — uniquement
  // si la TVA ressemble à un MONTANT (2 % à 30 % du total), pas à un taux.
  const tvaEstMontant = (base: number) => tva !== null && tva >= base * 0.02 && tva <= base * 0.30;
  if (ht === null && ttc !== null && tvaEstMontant(ttc)) {
    ht = Math.round((ttc - (tva as number)) * 100) / 100;
  }
  if (ttc === null && ht !== null && tvaEstMontant(ht + (tva as number))) {
    ttc = Math.round((ht + (tva as number)) * 100) / 100;
  }

  return { ht, ttc, tva };
}
