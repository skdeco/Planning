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

/**
 * Tente de repérer le nom du fournisseur dans une facture.
 * 1) Correspondance avec un fournisseur déjà connu (fiable).
 * 2) Sinon, heuristique : première ligne « raison sociale » en tête de document.
 * Résultat destiné au pré-remplissage — toujours vérifiable/corrigeable.
 */
export function extraireFournisseur(texteRaw: string, nomsConnus: string[] = []): string | null {
  if (!texteRaw) return null;
  const texte = texteRaw.replace(/ /g, ' ');
  const lower = texte.toLowerCase();

  // 1) Fournisseur connu présent dans le texte → on renvoie le nom canonique.
  //    Comparaison directe ET normalisée (sans accents/ponctuation) pour tolérer
  //    « POINT.P » ~ « Point P », « Leroy-Merlin » ~ « Leroy Merlin », etc.
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  const lowerNorm = norm(texte);
  const connusTries = [...nomsConnus].filter(n => (n || '').trim().length >= 3)
    .sort((a, b) => b.length - a.length); // le plus long d'abord (évite les faux positifs)
  for (const nom of connusTries) {
    const nn = norm(nom);
    if (lower.includes(nom.trim().toLowerCase()) || (nn.length >= 3 && lowerNorm.includes(nn))) return nom;
  }

  // 2) Heuristique : parcourt les premières lignes non vides.
  const BLACKLIST = /(facture|devis|avoir|bon de|commande|client|date|n[°o]\b|siret|siren|t\.?v\.?a|rcs|naf|ape|adresse|t[ée]l|email|e-mail|@|www|http|iban|bic|page|montant|total|h\.?t\b|t\.?t\.?c|acompte|r[èe]glement)/i;
  const lines = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 12);
  for (const l of lines) {
    if (l.length < 3 || l.length > 45) continue;
    if (BLACKLIST.test(l)) continue;
    if (/\d{3,}/.test(l)) continue; // trop de chiffres → adresse/référence, pas un nom
    const letters = (l.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    if (letters < l.length * 0.6) continue; // majoritairement des lettres
    return l.replace(/\s{2,}/g, ' ').trim();
  }
  return null;
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
