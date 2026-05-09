/**
 * Normalise un nom de plan pour comparaison.
 * Règles :
 *   - trim
 *   - lowercase
 *   - retire les diacritiques (é → e)
 *   - collapse les espaces multiples en 1
 *
 * Utilisé pour détecter "même plan" lors de l'upload (versioning auto).
 */
export function normalizePlanNom(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}
