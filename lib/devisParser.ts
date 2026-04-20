/**
 * Extraction de "lots" (corps de métier) depuis un texte de devis français.
 *
 * Les devis français (type SK DECO) sont organisés ainsi :
 *   1 Mise en Oeuvre               7 854,00 €     ← LOT PRINCIPAL (on veut ça)
 *     1.1 Détail 1    1,00 u ...  7 038,00 €      ← sous-ligne (ignorée)
 *     1.2 Détail 2    1,00 u ...    816,00 €      ← sous-ligne (ignorée)
 *   2 Démolition                  64 260,00 €     ← LOT PRINCIPAL
 *     2.1 ... etc
 *
 * On ne veut QUE les lots principaux (numéro entier simple).
 */

export interface LotExtrait {
  nom: string;
  montantHT: number;
}

// Mots-clés à ignorer
const BLACKLIST_NOMS = [
  'total', 'sous-total', 'soustotal', 'tva', 'tvac', 'remise', 'rabais',
  'net à payer', 'net a payer', 'brut', 'taux', 'acompte', 'mention',
];

function estDansBlacklist(nom: string): boolean {
  const lower = nom.toLowerCase().trim();
  return BLACKLIST_NOMS.some(p => lower === p || lower.startsWith(p + ' ') || lower.startsWith(p + '\t'));
}

function nettoyerNom(nom: string): string {
  let n = nom.trim();
  n = n.replace(/\s+/g, ' ').trim();
  n = n.replace(new RegExp('^(?:-|:|\\.|\\)|\\s)+'), '').trim();
  n = n.replace(new RegExp('(?:-|:|\\.|\\s)+$'), '').trim();
  if (n.length > 0) n = n.charAt(0).toUpperCase() + n.slice(1);
  return n;
}

function parseMontant(s: string): number {
  let clean = s.replace(/\s+/g, '');
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

/**
 * Extrait les lots principaux d'un texte de devis.
 * Stratégie : cherche dans tout le texte des motifs
 *   <numéro_entier_SIMPLE> <NOM> <montant>€
 * en excluant les sous-sections (1.1, 2.3, 3.1.2, etc.)
 */
export function extraireLotsDuTexte(texte: string): LotExtrait[] {
  if (!texte || texte.length < 10) return [];

  // Normaliser : remplacer points de suite et tabs par espaces, garder la structure
  const normalise = texte
    .replace(/\.{3,}/g, ' ')
    .replace(/_{3,}/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/ {2,}/g, ' ');

  const lots: LotExtrait[] = [];

  // Regex globale : numéro simple + nom + montant en €
  // Construite avec RegExp() pour éviter les problèmes de classe de caractères Tailwind
  // \b(\d{1,3})       : numéro (1 à 999)
  // (?!\d*\.\d)       : PAS suivi de .chiffre (exclut 1.1, 3.2.1)
  // (?!\s*[,.]\d)     : PAS suivi de ,chiffre ou .chiffre (exclut 7 854,00 où 7 serait matché seul)
  // \s+([A-ZÉÈÀÂÎÔÛÇa-zà-ÿ][\w\sÀ-ÿ'/-]{3,60}?)  : nom
  // \s+(\d{1,3}(?:\s\d{3})*,\d{2}|\d+[,.]\d{2})\s*€  : montant en €
  // Permet les virgules dans le nom (ex: "Revêtement Sol, Murs et Mobilier")
  // mais rejette toute virgule suivie de 2 chiffres (qui serait une décimale de montant)
  const pattern = new RegExp(
    '(?:^|[\\s])(\\d{1,3})(?!\\d)(?!\\.\\d)(?!\\s*[,.]\\d)\\s*([A-ZÉÈÀÂÎÔÛÇ](?:[A-Za-zÀ-ÿ\\s\'’/\\-]|,(?!\\d))(?:[A-Za-zÀ-ÿ\\s\'’/\\-]|,(?!\\d)){2,60}?)\\s+(\\d{1,3}(?:\\s\\d{3})*,\\d{2})\\s*€',
    'g'
  );

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalise)) !== null) {
    const numero = parseInt(match[1], 10);
    const nomBrut = match[2];
    const montantStr = match[3];
    const montant = parseMontant(montantStr);

    // Filtres
    if (numero < 1 || numero > 50) continue; // N° de lot raisonnable
    const nom = nettoyerNom(nomBrut);
    if (nom.length < 3 || nom.length > 60) continue;
    if (isNaN(montant) || montant < 100 || montant > 50_000_000) continue;
    if (estDansBlacklist(nom)) continue;
    if (!(new RegExp('[A-Za-zÀ-ÿ]')).test(nom)) continue;
    // Le nom doit contenir plutôt du texte, pas juste "1,00 u" ou similaire
    if (/^\d/.test(nom)) continue;

    lots.push({ nom, montantHT: montant });
  }

  // Dédupliquer par nom (garde le premier)
  const seen = new Set<string>();
  return lots.filter(l => {
    const key = l.nom.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Détecte un montant de remise / rabais / réduction globale appliquée au devis.
 * Cherche des motifs comme "Remise 5 000,00 €", "Rabais 5%", "Réduction -2 500,00 €".
 * Retourne le montant HT absolu (positif) de la remise, ou null si non détectée.
 */
export function extraireRemiseHT(texte: string, totalLotsHT: number): number | null {
  if (!texte || totalLotsHT <= 0) return null;
  const t = texte.replace(/\s+/g, ' ');

  // Chaque occurrence du mot-clé (ignore "TVA", "acompte", "garantie", "retenue")
  const keyword = new RegExp('\\b(?:remise|rabais|r[eé]duction)\\b[^.\\n]{0,120}', 'gi');
  let match: RegExpExecArray | null;

  while ((match = keyword.exec(t)) !== null) {
    const segment = match[0];
    if (new RegExp('\\b(?:tva|acompte|garantie|retenue)\\b', 'i').test(segment)) continue;

    // 1) montant en € (signé ou non) — prioritaire
    const eurMatch = segment.match(new RegExp('-?\\s*(\\d{1,3}(?:\\s\\d{3})*,\\d{2})\\s*€'));
    if (eurMatch) {
      const amount = parseMontant(eurMatch[1]);
      if (!isNaN(amount) && amount > 0 && amount < totalLotsHT) {
        return amount;
      }
    }

    // 2) pourcentage
    const pctMatch = segment.match(new RegExp('(\\d{1,2}(?:[,.]\\d+)?)\\s*%'));
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1].replace(',', '.'));
      if (!isNaN(pct) && pct > 0 && pct < 100) {
        return Math.round(totalLotsHT * (pct / 100) * 100) / 100;
      }
    }
  }
  return null;
}

/**
 * Extrait les lots d'un devis ET ventile proportionnellement la remise éventuelle.
 * Retourne `{ lots, remiseHT, totalBrutHT }`.
 * Les montants dans `lots` sont DÉJÀ ajustés (nets après remise).
 */
export function extraireLotsAvecRemise(texte: string): { lots: LotExtrait[]; remiseHT: number; totalBrutHT: number } {
  const lotsBruts = extraireLotsDuTexte(texte);
  const totalBrutHT = lotsBruts.reduce((s, l) => s + l.montantHT, 0);
  const remiseHT = totalBrutHT > 0 ? (extraireRemiseHT(texte, totalBrutHT) || 0) : 0;
  if (remiseHT <= 0 || totalBrutHT <= 0) {
    return { lots: lotsBruts, remiseHT: 0, totalBrutHT };
  }
  const ratio = 1 - remiseHT / totalBrutHT;
  const lots = lotsBruts.map(l => ({
    nom: l.nom,
    montantHT: Math.round(l.montantHT * ratio * 100) / 100,
  }));
  return { lots, remiseHT, totalBrutHT };
}

/**
 * Détecte la décomposition TVA d'un devis (multi-taux : 5.5%, 10%, 20%...).
 *
 * Stratégie prioritaire : trouver la section récap "Taux TVA | Base HT | Total"
 * et parser toutes les lignes `X % <base>,XX € <montantTVA>,XX €`.
 * À défaut, fallback sur recherche "TVA X%" ligne par ligne.
 */
export function extraireTVAsDuTexte(texte: string): { taux: number; montant: number }[] {
  if (!texte) return [];
  const t = texte.replace(/\s+/g, ' ');
  const out: { taux: number; montant: number }[] = [];
  const seen = new Set<string>();

  // 1) PRIORITAIRE : récap "Taux TVA ... Base HT ... Total"
  const recapMatch = t.match(new RegExp('taux\\s*tva[\\s\\S]{0,30}?base\\s*ht[\\s\\S]{0,30}?total([\\s\\S]{0,500})', 'i'));
  if (recapMatch) {
    const section = recapMatch[1];
    // Capture répétée : (taux) % (base) € (montantTVA) €
    const line = new RegExp('(\\d{1,2}(?:[,.]\\d{1,2})?)\\s*%\\s*(\\d{1,3}(?:\\s\\d{3})*,\\d{2})\\s*€\\s*(\\d{1,3}(?:\\s\\d{3})*,\\d{2})\\s*€', 'g');
    let lm: RegExpExecArray | null;
    while ((lm = line.exec(section)) !== null) {
      const taux = parseFloat(lm[1].replace(',', '.'));
      const montant = parseMontant(lm[3]);
      if (isNaN(taux) || taux <= 0 || taux >= 40) continue;
      if (isNaN(montant) || montant <= 0) continue;
      const key = `${taux}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ taux, montant });
    }
    if (out.length > 0) return out.sort((a, b) => a.taux - b.taux);
  }

  // 2) FALLBACK : "TVA X%" ligne par ligne (pour devis sans récap)
  const pattern = new RegExp('\\btva\\b[^\\n]{0,12}?(\\d{1,2}(?:[,.]\\d{1,2})?)\\s*%([^\\n]{0,80})', 'gi');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(t)) !== null) {
    const taux = parseFloat(m[1].replace(',', '.'));
    if (isNaN(taux) || taux <= 0 || taux >= 40) continue;
    const after = m[2] || '';
    const amounts = Array.from(after.matchAll(new RegExp('(\\d{1,3}(?:\\s\\d{3})*,\\d{2})\\s*€', 'g')));
    if (amounts.length === 0) continue;
    const last = amounts[amounts.length - 1][1];
    const montant = parseMontant(last);
    if (isNaN(montant) || montant <= 0) continue;
    const key = `${taux}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ taux, montant });
  }
  return out.sort((a, b) => a.taux - b.taux);
}

/**
 * Extrait le "Total brut HT", "Remise globale", "Total net HT" du récap en bas du devis.
 * Utile pour afficher le vrai montant brut et la remise effective dans l'UI.
 */
export function extraireRecapDevis(texte: string): { totalBrutHT?: number; remiseGlobale?: number; totalNetHT?: number } {
  if (!texte) return {};
  const t = texte.replace(/\s+/g, ' ');
  const find = (label: string): number | undefined => {
    const re = new RegExp(label + '[^\\n]{0,20}?(-?\\s*\\d{1,3}(?:\\s\\d{3})*,\\d{2})\\s*€', 'i');
    const m = t.match(re);
    if (!m) return undefined;
    const clean = m[1].replace(/-\s*/, '-');
    const val = parseMontant(clean.replace(/^-/, ''));
    return clean.startsWith('-') ? -val : val;
  };
  return {
    totalBrutHT: find('total\\s*brut\\s*ht'),
    remiseGlobale: find('remise\\s*globale'),
    totalNetHT: find('total\\s*net\\s*ht'),
  };
}

/**
 * Cherche le "Total TTC" / "Net à payer TTC" dans le texte.
 */
export function extraireTotalTTC(texte: string): number | null {
  if (!texte) return null;
  const t = texte.replace(/\s+/g, ' ');
  const candidates = [
    'total(?:\\s+g[eé]n[eé]ral)?\\s*ttc',
    'ttc\\s*(?:total|final|g[eé]n[eé]ral)',
    'net\\s*[àa]\\s*payer\\s*ttc',
    'net\\s*[àa]\\s*payer',
  ];
  for (const c of candidates) {
    const re = new RegExp(c + '[^\\n]{0,40}?(\\d{1,3}(?:\\s\\d{3})*,\\d{2})\\s*€', 'i');
    const m = t.match(re);
    if (m) {
      const amt = parseMontant(m[1]);
      if (!isNaN(amt) && amt > 0) return amt;
    }
  }
  return null;
}

/**
 * Parse une saisie manuelle rapide (un lot par ligne).
 */
export function parseSaisieManuelle(texte: string): LotExtrait[] {
  if (!texte) return [];
  const lots: LotExtrait[] = [];
  const lines = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const saisieRegex = new RegExp('^(.+?)(?:\\s|,|:|;|\\||-)+(\\d[\\d\\s.,]*\\d|\\d)\\s*(?:€|eur|euros?)?\\s*$', 'i');

  for (const line of lines) {
    const match = line.match(saisieRegex);
    if (!match) continue;
    const nom = match[1].trim().replace(/(?:\s|_|\.|-|:|,|;|\|)+$/, '').trim();
    const montant = parseMontant(match[2]);
    if (!nom || nom.length < 2) continue;
    if (isNaN(montant) || montant <= 0) continue;
    lots.push({ nom: nom.charAt(0).toUpperCase() + nom.slice(1), montantHT: montant });
  }
  return lots;
}
