/**
 * Helpers pour les snapshots d'avancement (= "situations" de facturation).
 *
 * Un snapshot fige l'état d'avancement des lots à un instant T pour servir
 * de base à une facture. La logique clé : chaque nouveau snapshot ne
 * facture QUE le delta depuis le précédent snapshot (cumul non rejoué).
 */
import type { LotAvancement, SnapshotAvancement } from '@/app/types';

export interface SnapshotComputationLot {
  lotId: string;
  nom: string;
  montant: number;                  // total HT du lot (devis)
  pourcentageActuel: number;        // % d'avancement à l'instant T
  montantAvanceActuel: number;      // montant * % / 100
  montantDejaFacture: number;       // cumul des snapshots précédents pour ce lot
  montantFacturableNouveau: number; // delta : ce qui serait facturé dans le nouveau snapshot
}

export interface SnapshotComputation {
  totalAvanceActuel: number;         // somme des avancements actuels (HT)
  cumulDejaFacture: number;          // cumul des snapshots précédents
  montantFacturableNouveau: number;  // delta = ce que ferait le nouveau snapshot
  lotsDetail: SnapshotComputationLot[];
}

/**
 * Calcule l'état d'avancement courant et ce qui resterait à facturer
 * si on créait un snapshot maintenant.
 */
export function calculerSnapshot(
  lots: LotAvancement[],
  snapshotsExistants: SnapshotAvancement[]
): SnapshotComputation {
  const detail: SnapshotComputationLot[] = lots.map(lot => {
    const montant = lot.montant || 0;
    const montantAvanceActuel = Math.round(((montant * lot.pourcentage) / 100) * 100) / 100;
    let dejaFacture = 0;
    for (const snap of snapshotsExistants) {
      const snapLot = snap.lots.find(sl => sl.lotId === lot.id);
      if (snapLot) dejaFacture += snapLot.montantFactureNouveau;
    }
    const facturableNouveau = Math.max(0, Math.round((montantAvanceActuel - dejaFacture) * 100) / 100);
    return {
      lotId: lot.id,
      nom: lot.nom,
      montant,
      pourcentageActuel: lot.pourcentage,
      montantAvanceActuel,
      montantDejaFacture: dejaFacture,
      montantFacturableNouveau: facturableNouveau,
    };
  });

  const totalAvanceActuel = Math.round(detail.reduce((s, d) => s + d.montantAvanceActuel, 0) * 100) / 100;
  const cumulDejaFacture = Math.round(detail.reduce((s, d) => s + d.montantDejaFacture, 0) * 100) / 100;
  const montantFacturableNouveau = Math.max(0, Math.round((totalAvanceActuel - cumulDejaFacture) * 100) / 100);

  return { totalAvanceActuel, cumulDejaFacture, montantFacturableNouveau, lotsDetail: detail };
}

/**
 * Crée un nouveau SnapshotAvancement à partir des lots actuels.
 */
export function creerSnapshot(opts: {
  lots: LotAvancement[];
  snapshotsExistants: SnapshotAvancement[];
  intitule?: string;
  note?: string;
  cocheParId?: string;
  cocheParNom?: string;
}): SnapshotAvancement {
  const { lots, snapshotsExistants, intitule, note, cocheParId, cocheParNom } = opts;
  const calc = calculerSnapshot(lots, snapshotsExistants);
  const numero = (snapshotsExistants.length || 0) + 1;
  return {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    dateGel: new Date().toISOString(),
    numero,
    intitule: intitule?.trim() || `Situation N°${numero}`,
    lots: calc.lotsDetail.map(d => ({
      lotId: d.lotId,
      nom: d.nom,
      montant: d.montant,
      pourcentageGel: d.pourcentageActuel,
      montantFactureNouveau: d.montantFacturableNouveau,
    })),
    cumulFacture: calc.totalAvanceActuel,
    note: note?.trim() || undefined,
    cocheParId,
    cocheParNom,
  };
}
