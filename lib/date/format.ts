/**
 * Dates à la française — l'application STOCKE les dates en `YYYY-MM-DD` (tri, comparaisons,
 * synchro) mais les AFFICHE et les fait SAISIR en `JJ/MM/AAAA`.
 */

/** `2026-04-09` ou ISO complet → `09/04/2026`. Toute autre valeur est renvoyée telle quelle. */
export function formatDateFR(value?: string | null, vide = ''): string {
  if (!value) return vide;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** ISO complet → `09/04/2026 14:30`. */
export function formatDateHeureFR(iso?: string | null, vide = ''): string {
  if (!iso) return vide;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return formatDateFR(iso, vide);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Saisie utilisateur → `YYYY-MM-DD`, ou null si incomplète / invalide.
 * Accepte `09/04/2026`, `9/4/26`, `09-04-2026`, `09.04.2026`, `09042026` et l'ancien `2026-04-09`.
 */
export function parseDateFR(saisie?: string | null): string | null {
  const s = (saisie || '').trim();
  if (!s) return null;
  let j: number, mo: number, a: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) { a = +m[1]; mo = +m[2]; j = +m[3]; }
  else if ((m = /^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4}|\d{2})$/.exec(s))) { j = +m[1]; mo = +m[2]; a = +m[3]; }
  else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) { j = +m[1]; mo = +m[2]; a = +m[3]; }
  else return null;
  if (a < 100) a += 2000;
  if (mo < 1 || mo > 12 || j < 1 || j > 31 || a < 1900 || a > 2200) return null;
  const d = new Date(a, mo - 1, j);
  if (d.getMonth() !== mo - 1) return null;
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/** Met en forme pendant la frappe : `09042026` → `09/04/2026`. */
export function masqueDateFR(texte: string): string {
  if (/^\d{4}-/.test(texte)) return texte; // ancien format collé : laissé tel quel, parseDateFR le comprend
  if (/[\/.\- ]/.test(texte)) return texte.replace(/[.\- ]/g, '/').replace(/[^\d/]/g, '').slice(0, 10);
  const c = texte.replace(/\D/g, '').slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}
