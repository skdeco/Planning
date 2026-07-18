/**
 * Jours fériés français d'une année (dates fixes + Pâques/Ascension/Pentecôte via
 * l'algorithme de Meeus/Jones/Butcher). Set de clés 'YYYY-MM-DD' (date locale).
 *
 * Extrait pour être partagé entre le calcul de salaire (reporting) et le décompte
 * des congés (rh) — les deux doivent exclure les fériés de la même façon.
 */
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getJoursFeriesFrance(year: number): Set<string> {
  const feries = new Set<string>();
  const fmt = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Fériés fixes
  feries.add(fmt(1, 1));   // 1er janvier
  feries.add(fmt(5, 1));   // Fête du Travail
  feries.add(fmt(5, 8));   // Victoire 1945
  feries.add(fmt(7, 14));  // Fête Nationale
  feries.add(fmt(8, 15));  // Assomption
  feries.add(fmt(11, 1));  // Toussaint
  feries.add(fmt(11, 11)); // Armistice
  feries.add(fmt(12, 25)); // Noël
  // Pâques (Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m2 + 114) / 31);
  const day = ((h + l - 7 * m2 + 114) % 31) + 1;
  const paques = new Date(year, month - 1, day);
  const lundiPaques = new Date(paques); lundiPaques.setDate(paques.getDate() + 1);
  feries.add(toYMD(lundiPaques));
  const ascension = new Date(paques); ascension.setDate(paques.getDate() + 39);
  feries.add(toYMD(ascension));
  const pentecote = new Date(paques); pentecote.setDate(paques.getDate() + 50);
  feries.add(toYMD(pentecote));
  return feries;
}
