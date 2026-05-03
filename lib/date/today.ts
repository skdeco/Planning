/**
 * Helpers de date centralisés.
 *
 * `todayYMD()` retourne la date du jour en heure locale au format YYYY-MM-DD.
 * À utiliser pour toute date métier (livraisons, RDV, dateResolution, etc.)
 * destinée à un <DatePicker> ou affichée à l'utilisateur.
 *
 * NE PAS utiliser `new Date().toISOString().slice(0, 10)` : cette forme
 * convertit vers UTC et renvoie J-1 entre 00h et 02h locale (CEST = UTC+2),
 * provoquant un décalage visible côté DatePicker.
 *
 * `nowISO()` retourne l'instant courant en ISO complet (UTC). À utiliser
 * pour les timestamps techniques (createdAt, updatedAt) où le fuseau
 * importe peu et où l'on veut un identifiant temporel monotone.
 */

export function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
