import type { Chantier } from '@/app/types';

/**
 * Génère le prochain numéro de PV pour l'année en cours.
 * Format : "PV-{YYYY}-{NNN}" où NNN = max+1 sur l'année (zero-padded sur 3 digits).
 *
 * Stratégie : scan tous les chantiers, extrait les numéros PV de l'année,
 * retourne max+1. Pas de state global → pas de risque de désync multi-device.
 */
export function genererNumeroPV(chantiers: Chantier[]): string {
  const year = new Date().getFullYear();
  const yearPrefix = `PV-${year}-`;

  let maxNumber = 0;
  for (const c of chantiers) {
    const numero = c.pvReception?.numeroPV;
    if (numero && numero.startsWith(yearPrefix)) {
      const numStr = numero.slice(yearPrefix.length);
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  const nextNumber = maxNumber + 1;
  return `${yearPrefix}${String(nextNumber).padStart(3, '0')}`;
}
