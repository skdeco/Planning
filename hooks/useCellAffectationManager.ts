import { useCallback } from 'react';
import { useApp } from '@/app/context/AppContext';

// ─── Types exportés ───────────────────────────────────────────────────────────

/** Args du déplacement d'un employé d'une cellule à une autre. */
export interface MoveEmployeArgs {
  fromChantierId: string;
  fromDate:       string;
  toChantierId:   string;
  toDate:         string;
  employeId:      string;
}

/** Options pour le retrait d'un employé d'une cellule. */
export interface RemoveEmployeOptions {
  /** Si `true`, supprime aussi les pointages du jour pour cet employé. */
  deletePointages?: boolean;
}

/**
 * API du hook `useCellAffectationManager` — mutations data sur les affectations
 * cellule (chantier × jour). Toutes les fonctions sont mémoïsées.
 */
export interface CellAffectationManager {
  /**
   * Déplace un employé d'une cellule (chantier × date) vers une autre.
   * Migre les notes du jour vers la nouvelle date.
   * Préserve la logique 1:1 de l'ancien `handleMoveEmploye` parent.
   */
  moveEmploye: (args: MoveEmployeArgs) => void;

  /**
   * Toggle entre lieu de travail `'atelier'` et `'chantier'` pour
   * l'affectation employé × chantier × date.
   */
  toggleLieuTravail: (chantierId: string, employeId: string, dateStr: string) => void;

  /**
   * Retire un employé d'une cellule. Si `options.deletePointages === true`,
   * supprime AUSSI les pointages du jour pour cet employé (ordre original :
   * pointages d'abord, puis affectation).
   */
  removeEmployeFromCell: (
    chantierId: string,
    employeId:  string,
    dateStr:    string,
    options?:   RemoveEmployeOptions,
  ) => void;

  /**
   * Retire un sous-traitant d'une cellule. Encode le pseudo-employeId
   * `st:${stId}` (préservation 1:1 du pattern existant).
   */
  removeSTFromCell: (chantierId: string, stId: string, dateStr: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook regroupant les mutations data sur les affectations cellule
 * (chantier × jour × employé/ST).
 *
 * Self-contained : lit `data` + mutations directement depuis `useApp()`.
 * Aucun paramètre ; toute l'API est déclarative.
 *
 * Usage typique côté composant :
 * ```ts
 * const { moveEmploye, toggleLieuTravail, removeEmployeFromCell, removeSTFromCell } =
 *   useCellAffectationManager();
 * ```
 *
 * Comportement préservé 1:1 par rapport aux helpers inline parent
 * (handleMoveEmploye, toggleLieuTravail, doRemove, removeAffectation appels
 * directs). Aucune optimisation, aucun changement de signature.
 */
export function useCellAffectationManager(): CellAffectationManager {
  const { data, addAffectation, removeAffectation, updateAffectation, deletePointage } = useApp();

  const moveEmploye = useCallback((args: MoveEmployeArgs) => {
    const { fromChantierId, fromDate, toChantierId, toDate, employeId } = args;
    // Récupérer les notes de l'ancienne affectation AVANT suppression
    const oldAff = data.affectations.find(a =>
      a.chantierId === fromChantierId && a.employeId === employeId &&
      a.dateDebut <= fromDate && a.dateFin >= fromDate
    );
    const notesToKeep = (oldAff?.notes || []).filter(n => n.date === fromDate || !n.date);
    // Mettre à jour la date des notes pour la nouvelle date
    const migratedNotes = notesToKeep.map(n => ({ ...n, date: toDate }));
    // Supprimer l'ancienne affectation pour ce jour
    removeAffectation(fromChantierId, employeId, fromDate);
    // Créer la nouvelle affectation avec les notes conservées
    addAffectation({
      id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      chantierId: toChantierId,
      employeId,
      dateDebut: toDate,
      dateFin: toDate,
      notes: migratedNotes,
    });
  }, [data, addAffectation, removeAffectation]);

  const toggleLieuTravail = useCallback((chantierId: string, employeId: string, dateStr: string) => {
    const aff = data.affectations.find(a =>
      a.chantierId === chantierId && a.employeId === employeId &&
      a.dateDebut <= dateStr && a.dateFin >= dateStr
    );
    if (!aff) return;
    const newLieu = aff.lieu === 'atelier' ? 'chantier' : 'atelier';
    updateAffectation({ ...aff, lieu: newLieu });
  }, [data, updateAffectation]);

  const removeEmployeFromCell = useCallback((
    chantierId: string,
    employeId:  string,
    dateStr:    string,
    options?:   RemoveEmployeOptions,
  ) => {
    if (options?.deletePointages) {
      data.pointages
        .filter(p => p.employeId === employeId && p.date === dateStr)
        .forEach(p => deletePointage(p.id));
    }
    removeAffectation(chantierId, employeId, dateStr);
  }, [data, deletePointage, removeAffectation]);

  const removeSTFromCell = useCallback((chantierId: string, stId: string, dateStr: string) => {
    removeAffectation(chantierId, `st:${stId}`, dateStr);
  }, [removeAffectation]);

  return {
    moveEmploye,
    toggleLieuTravail,
    removeEmployeFromCell,
    removeSTFromCell,
  };
}
