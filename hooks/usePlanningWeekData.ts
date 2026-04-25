import { useMemo, useCallback } from 'react';
import { useApp } from '@/app/context/AppContext';
import type {
  Chantier,
  Employe,
  Intervention,
  Note,
  SousTraitant,
} from '@/app/types';

// ─── Helpers de date locaux ───────────────────────────────────────────────────
//
// Dupliqués depuis app/(tabs)/planning.tsx — pas de lib/dateUtils centralisée
// dans le repo. Voir REFACTOR_NOTES.md "Dette technique — Helpers de date
// dupliqués" pour l'extraction future.

/** Mois abrégés FR (3 lettres). Identique à `MOIS` de planning.tsx. */
const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

/** Ajoute `n` jours à une date (retourne un nouvel objet, sans mutation). */
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Vérifie qu'une `date` (Date) est dans la plage `[start, end]`
 * (deux strings YYYY-MM-DD inclusives). Comparaison normalisée à minuit local
 * pour éviter les décalages horaires.
 */
function dateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  return d.getTime() >= s.getTime() && d.getTime() <= e.getTime();
}

// ─── Types exportés ───────────────────────────────────────────────────────────

/**
 * Note attachée à une cellule (chantier × jour) avec son contexte affectation.
 * Retournée par `getAllNotesForCell` — étend `Note` avec l'id de l'affectation
 * source et l'id de l'employé concerné, utiles pour les actions parent
 * (édition, suppression, navigation).
 */
export interface CellNote extends Note {
  affectationId:        string;
  affectationEmployeId: string;
}

/**
 * Données dérivées de la vue Semaine du planning.
 *
 * Toutes les valeurs sont mémoïsées et stables tant que leurs dépendances
 * (data, role, weekOffset) ne changent pas. Les `getXForCell` ferment sur
 * `data` et reçoivent `chantierId`/`day`/`dateStr` à l'appel.
 */
export interface PlanningWeekData {
  /** Les 7 dates de la semaine affichée (Lundi → Dimanche). */
  days: Date[];

  /** Libellé compact de la plage de la semaine (ex. "12 – 18 mars"). */
  weekLabel: string;

  /** Chantiers visibles pour le rôle courant, triés selon l'ordre planning. */
  visibleChantiers: Chantier[];

  /** Employés (hors ST) affectés à un chantier un jour donné, dédupliqués. */
  getEmployesForCell: (chantierId: string, day: Date) => Employe[];

  /** Interventions externes pour un chantier un jour donné. */
  getInterventionsForCell: (chantierId: string, day: Date) => Intervention[];

  /** Sous-traitants affectés à une cellule (filtrés au ST connecté si rôle ST). */
  getSTForCell: (chantierId: string, day: Date) => SousTraitant[];

  /** Toutes les notes d'une cellule (chantier × jour), tous auteurs confondus. */
  getAllNotesForCell: (chantierId: string, dateStr: string) => CellNote[];

  /** True si la cellule a au moins une note. */
  cellHasNotes: (chantierId: string, dateStr: string) => boolean;

  /** Liste ordonnée de chantierId pour un employé un jour donné. */
  getOrdreChantiers: (employeId: string, date: string) => string[];

  /** Numéro d'ordre 1-based, ou 0 si l'employé n'est que sur 1 chantier. */
  getOrdreNum: (employeId: string, chantierId: string, date: string) => number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook regroupant les calculs dérivés de la vue Semaine du planning.
 *
 * Encapsule les 10 helpers (mémoïsés) qui étaient inline dans
 * `app/(tabs)/planning.tsx`. Lit `data` + `currentUser` directement depuis
 * `useApp()` ; seul `weekOffset` (state UI du parent) est passé en paramètre.
 *
 * Comportement préservé 1:1 par rapport à l'original.
 *
 * @param weekOffset Décalage en semaines par rapport à la semaine courante.
 *                   `0` = semaine courante, `1` = suivante, `-1` = précédente.
 */
export function usePlanningWeekData(weekOffset: number): PlanningWeekData {
  const { data, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const isST    = currentUser?.role === 'soustraitant';

  // Calcul des 7 jours de la semaine
  const days = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = addDays(today, mondayOffset + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset]);

  // Plage de la semaine affichée
  const weekLabel = useMemo(() => {
    const first = days[0];
    const last = days[6];
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()} – ${last.getDate()} ${MOIS[first.getMonth()]}`;
    }
    return `${first.getDate()} ${MOIS[first.getMonth()]} – ${last.getDate()} ${MOIS[last.getMonth()]}`;
  }, [days]);

  // Chantiers visibles sur le planning
  const visibleChantiers = useMemo(() => {
    const customOrder = data.chantierOrderPlanning || [];
    const sortByOrdre = (arr: typeof data.chantiers) => {
      // Tri par défaut (champ "ordre")
      const base = [...arr].sort((a, b) => (a.ordre ?? 9999) - (b.ordre ?? 9999));
      // Si un ordre personnalisé existe, on le superpose : les chantiers listés
      // dans customOrder passent en premier dans l'ordre indiqué, les autres à la suite.
      if (customOrder.length === 0) return base;
      return base.sort((a, b) => {
        const ia = customOrder.indexOf(a.id);
        const ib = customOrder.indexOf(b.id);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    };
    if (isAdmin) {
      return sortByOrdre(data.chantiers.filter(c => c.visibleSurPlanning));
    }
    if (isST) {
      // Sous-traitant : chantiers où il a au moins une affectation
      const stAffChantierIds = data.affectations
        .filter(a => a.soustraitantId === currentUser?.soustraitantId)
        .map(a => a.chantierId);
      return sortByOrdre(data.chantiers.filter(c => c.visibleSurPlanning && stAffChantierIds.includes(c.id)));
    }
    // Apporteur (architecte / apporteur / contractant / client) : uniquement ses chantiers liés
    if (currentUser?.role === 'apporteur' && currentUser?.apporteurId) {
      const myId = currentUser.apporteurId;
      return sortByOrdre(data.chantiers.filter(c =>
        c.visibleSurPlanning && (
          c.architecteId === myId ||
          c.apporteurId === myId ||
          c.contractantId === myId ||
          c.clientApporteurId === myId
        )
      ));
    }
    // Employé : uniquement les chantiers où il est affecté
    return sortByOrdre(data.chantiers.filter(c =>
      c.visibleSurPlanning &&
      data.affectations.some(a =>
        a.chantierId === c.id &&
        a.employeId === currentUser?.employeId
      )
    ));
  }, [data, isAdmin, isST, currentUser]);

  // Employés affectés à un chantier pour un jour donné (excluant les affectations ST)
  const getEmployesForCell = useCallback((chantierId: string, day: Date): Employe[] => {
    const affectations = data.affectations.filter(a =>
      a.chantierId === chantierId &&
      !a.soustraitantId &&   // exclure les affectations sous-traitants
      dateInRange(day, a.dateDebut, a.dateFin)
    );
    if (!isAdmin && !isST) {
      const myAff = affectations.find(a => a.employeId === currentUser?.employeId);
      if (!myAff) return [];
      const emp = data.employes.find(e => e.id === myAff.employeId);
      return emp ? [emp] : [];
    }
    // Dédupliquer : un employé ne doit apparaître qu'une seule fois par case
    const seen = new Set<string>();
    return affectations
      .map(a => data.employes.find(e => e.id === a.employeId))
      .filter((e): e is Employe => !!e && !seen.has(e.id) && (seen.add(e.id), true));
  }, [data, isAdmin, isST, currentUser]);

  /** Interventions externes pour un chantier et un jour donné */
  const getInterventionsForCell = useCallback((chantierId: string, day: Date): Intervention[] => {
    return (data.interventions || []).filter(i =>
      i.chantierId === chantierId && dateInRange(day, i.dateDebut, i.dateFin)
    );
  }, [data]);

  /** Sous-traitants placés dans une cellule (via affectations ST) */
  const getSTForCell = useCallback((chantierId: string, day: Date): SousTraitant[] => {
    const stIds = data.affectations
      .filter(a =>
        a.chantierId === chantierId &&
        a.soustraitantId &&
        dateInRange(day, a.dateDebut, a.dateFin)
      )
      .map(a => a.soustraitantId!);
    // Sous-traitant connecté : ne voir que soi-même
    if (isST) {
      return data.sousTraitants.filter(s => stIds.includes(s.id) && s.id === currentUser?.soustraitantId);
    }
    return data.sousTraitants.filter(s => stIds.includes(s.id));
  }, [data, isST, currentUser]);

  /**
   * Récupère toutes les notes d'une cellule (chantier + jour), tous auteurs confondus.
   * IMPORTANT : compare les dates en string (YYYY-MM-DD) pour éviter les bugs de timezone.
   */
  const getAllNotesForCell = useCallback((chantierId: string, dateStr: string): CellNote[] => {
    return data.affectations
      .filter(a =>
        a.chantierId === chantierId &&
        // Comparaison string pour éviter le bug de timezone avec new Date()
        a.dateDebut <= dateStr && a.dateFin >= dateStr
      )
      .flatMap(a => (a.notes || [])
        // Filtrer par date exacte de la note (si le champ date est présent)
        .filter(n => !n.date || n.date === dateStr)
        .map(n => ({
          ...n,
          affectationId: a.id,
          affectationEmployeId: a.employeId,
        }))
      );
  }, [data]);

  /** Vérifie si la cellule a des notes */
  const cellHasNotes = useCallback((chantierId: string, dateStr: string): boolean => {
    return getAllNotesForCell(chantierId, dateStr).length > 0;
  }, [getAllNotesForCell]);

  /**
   * Retourne la liste ordonnée de chantierId pour un employé un jour donné.
   * Note : cette fonction est désormais mémoïsée (était une fonction simple
   * dans l'original — amélioration mémoïsation fonctionnellement identique).
   */
  const getOrdreChantiers = useCallback((employeId: string, date: string): string[] => {
    const key = `${employeId}_${date}`;
    const stored = data.ordreAffectations?.[key];
    // Chantiers réellement affectés ce jour — dédupliqués
    const affectedIds = [...new Set(
      data.affectations
        .filter(a => a.employeId === employeId && a.dateDebut <= date && a.dateFin >= date)
        .map(a => a.chantierId)
    )];
    if (!stored) return affectedIds;
    // Garder uniquement les chantiers encore affectés, dans l'ordre stocké, puis ajouter les nouveaux
    const ordered = stored.filter(id => affectedIds.includes(id));
    const extra = affectedIds.filter(id => !ordered.includes(id));
    return [...ordered, ...extra];
  }, [data]);

  /**
   * Numéro d'ordre (1-based) d'un chantier pour un employé un jour donné,
   * ou 0 si employé sur 1 seul chantier.
   * Note : mémoïsation ajoutée (cf. getOrdreChantiers).
   */
  const getOrdreNum = useCallback((employeId: string, chantierId: string, date: string): number => {
    const list = getOrdreChantiers(employeId, date);
    if (list.length < 2) return 0;
    return list.indexOf(chantierId) + 1;
  }, [getOrdreChantiers]);

  return {
    days,
    weekLabel,
    visibleChantiers,
    getEmployesForCell,
    getInterventionsForCell,
    getSTForCell,
    getAllNotesForCell,
    cellHasNotes,
    getOrdreChantiers,
    getOrdreNum,
  };
}
