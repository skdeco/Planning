/**
 * Génère un libellé automatique pour une facture sans libellé saisi.
 * Format : "Facture du JJ/MM/AAAA à HH:MM"
 *
 * Utilise les méthodes locales (getDate/getMonth/getFullYear/getHours/getMinutes)
 * pour cohérence avec lib/date/today.ts (pas de toISOString.slice — éviter UTC).
 *
 * Préparation OCR (Phase C4) : l'auto-fill via cette fonction sera remplacé
 * par les valeurs détectées (libellé fournisseur, date facture, montants).
 */
export function genererNomAchatAuto(date?: Date): string {
  const d = date || new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `Facture du ${dd}/${mm}/${yyyy} à ${hh}:${mn}`;
}
