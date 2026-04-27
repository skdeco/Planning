import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { usePlanningWeekData } from '@/hooks/usePlanningWeekData';
import { useRefresh } from '@/hooks/useRefresh';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getEmployeColor, METIER_COLORS } from '@/app/types';
import { WeekGridCell, type CellModalOpeners } from './WeekGridCell';

// ─── Helpers de date locaux ───────────────────────────────────────────────────

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Convertit une `Date` en string `YYYY-MM-DD` en heure locale. */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True si la date est aujourd'hui. */
function isToday(date: Date): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(date); d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * Props du composant `WeekGridView` — grille hebdomadaire complète
 * (header jours + map chantiers/cellules + légende admin).
 *
 * Composant boss principal du planning. Lit en interne :
 * - `useApp()` (data, currentUser, role dérivés)
 * - `usePlanningWeekData(weekOffset)` (days, visibleChantiers, getXForCell, ...)
 * - `useRefresh()` (refreshing, onRefresh pour pull-to-refresh)
 *
 * Reçoit du parent :
 * - Layout (NAME_COL, dayCol calculés depuis windowWidth)
 * - weekOffset (UI state du parent — navigation semaines)
 * - 6 modal openers (UI state des modaux dans le parent)
 * - 2 chantier-row openers (actions chantier + reorder long-press)
 */
export interface WeekGridViewProps {
  NAME_COL:    number;
  dayCol:      number;
  weekOffset:  number;
  /** Click sur la cellule nom du chantier — ouvre ChantierActionsModal. */
  onOpenChantierActions: (chantierId: string) => void;
  /** Long press cellule nom (admin) — ouvre menu de réorganisation. */
  onLongPressChantier:   (chantierId: string) => void;
  /** Forwarded à WeekGridCell : ouvrir note employé. */
  onOpenEmpNote:         (chantierId: string, dateStr: string, empId: string) => void;
  /** Forwarded à WeekGridCell : ouvrir note sous-traitant. */
  onOpenSTNote:          (chantierId: string, dateStr: string, stId: string) => void;
  /** Forwarded à WeekGridCell : ouvrir édition intervention. */
  onOpenIntervention:    (chantierId: string, dateStr: string, intervId: string) => void;
  /** Forwarded à WeekGridCell : ouvrir modal ajout (cell click + bouton +). */
  onOpenAjoutModal:      (chantierId: string, dateStr: string) => void;
  /** Forwarded à WeekGridCell : ouvrir modal de déplacement employé. */
  onOpenMoveModal:       (employeId: string, chantierId: string, dateStr: string) => void;
  /** Forwarded à WeekGridCell : ouvrir modal de réordonnancement multi-chantiers. */
  onOpenOrdreModal:      (employeId: string, dateStr: string, chantierIds: string[]) => void;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Vue hebdomadaire de la grille planning (admin/employé/ST).
 *
 * Structure :
 * - Header : 7 jours de la semaine (Lu-Di) avec indication aujourd'hui
 * - Body : map des chantiers visibles, chaque ligne = name cell + 7 cells
 * - Empty state si aucun chantier sur la semaine
 * - Légende admin : employés + ST présents dans la semaine (avec couleurs)
 *
 * Interactions :
 * - Click name cell : ouvre ChantierActionsModal
 * - Long press name cell (admin) : menu de réorganisation
 * - Cell content (badges, intervenants, +) : délégué à WeekGridCell
 *
 * Préservation 1:1 stricte du comportement avant extraction.
 */
export function WeekGridView({
  NAME_COL,
  dayCol,
  weekOffset,
  onOpenChantierActions,
  onLongPressChantier,
  onOpenEmpNote,
  onOpenSTNote,
  onOpenIntervention,
  onOpenAjoutModal,
  onOpenMoveModal,
  onOpenOrdreModal,
}: WeekGridViewProps): React.ReactElement {
  const { data, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const {
    days,
    visibleChantiers,
    getEmployesForCell,
    getSTForCell,
    getInterventionsForCell,
    cellHasNotes,
    getOrdreNum,
    getOrdreChantiers,
  } = usePlanningWeekData(weekOffset);
  const { refreshing, onRefresh } = useRefresh();

  // Groupe les 6 modal openers en un seul objet stable (référence préservée
  // tant que les callbacks parent ne changent pas) pour passage à WeekGridCell.
  const cellOpeners = useMemo<CellModalOpeners>(() => ({
    empNote:      onOpenEmpNote,
    stNote:       onOpenSTNote,
    intervention: onOpenIntervention,
    ajout:        onOpenAjoutModal,
    move:         onOpenMoveModal,
    ordre:        onOpenOrdreModal,
  }), [onOpenEmpNote, onOpenSTNote, onOpenIntervention, onOpenAjoutModal, onOpenMoveModal, onOpenOrdreModal]);

  return (
    <ScrollView
      style={styles.gridScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C2C2C']} tintColor="#2C2C2C" />
      }
    >
      {/* En-tête des jours */}
      <View style={styles.gridRow}>
        <View style={[styles.nameCell, styles.headerCell, { width: NAME_COL }]} />
        {days.map((day, i) => {
          const today = isToday(day);
          return (
            <View
              key={i}
              style={[
                styles.dayHeaderCell,
                { width: dayCol },
                today && styles.dayHeaderCellToday,
              ]}
            >
              <Text style={[styles.dayName, today && styles.dayNameToday]}>
                {JOURS[i]}
              </Text>
              <Text style={[styles.dayNum, today && styles.dayNumToday]}>
                {day.getDate()}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Lignes des chantiers */}
      {visibleChantiers.map(chantier => (
        <View key={chantier.id} style={styles.chantierRow}>
          {/* Colonne nom — clic = ouvrir le menu d'actions chantier
              Appui long (admin) = menu de réorganisation */}
          <Pressable
            style={[styles.nameCell, { width: NAME_COL }]}
            onPress={() => onOpenChantierActions(chantier.id)}
            onLongPress={isAdmin ? () => onLongPressChantier(chantier.id) : undefined}
            delayLongPress={400}
          >
            <View style={[styles.colorBar, { backgroundColor: chantier.couleur }]} />
            <Text style={styles.chantierName} numberOfLines={2}>{chantier.nom}</Text>
          </Pressable>

          {/* Cellules des jours */}
          {days.map((day, i) => {
            const employes      = getEmployesForCell(chantier.id, day);
            const soustraitants = getSTForCell(chantier.id, day);
            const interventions = getInterventionsForCell(chantier.id, day);
            const dateStr       = toYMD(day);
            const hasNotes      = cellHasNotes(chantier.id, dateStr);
            return (
              <WeekGridCell
                key={i}
                chantier={chantier}
                day={day}
                dayCol={dayCol}
                employes={employes}
                soustraitants={soustraitants}
                interventions={interventions}
                hasNotes={hasNotes}
                getOrdreNum={getOrdreNum}
                getOrdreChantiers={getOrdreChantiers}
                openers={cellOpeners}
              />
            );
          })}
        </View>
      ))}

      {visibleChantiers.length === 0 && (
        <EmptyState size="md" title="Aucun chantier sur cette semaine" />
      )}

      {/* Légende : visible uniquement pour l'admin, filtrée sur la semaine visible */}
      {isAdmin && (() => {
        // Calculer les IDs des employés et ST présents dans la semaine affichée
        const weekDayStrings = days.map(d => toYMD(d));
        const weekStart = weekDayStrings[0];
        const weekEnd   = weekDayStrings[weekDayStrings.length - 1];
        const weekAffectations = data.affectations.filter(a =>
          a.dateDebut <= weekEnd && a.dateFin >= weekStart
        );
        const empIdsThisWeek = new Set(weekAffectations.filter(a => !a.soustraitantId).map(a => a.employeId));
        const stIdsThisWeek  = new Set(weekAffectations.filter(a => a.soustraitantId).map(a => a.soustraitantId!));
        const visibleEmps = data.employes.filter(e => empIdsThisWeek.has(e.id));
        const visibleSTs  = (data.sousTraitants || []).filter(s => stIdsThisWeek.has(s.id));
        if (visibleEmps.length === 0 && visibleSTs.length === 0) return null;
        return (
          <View style={styles.legendSection}>
            {/* Légende employés */}
            {visibleEmps.length > 0 && (
              <>
                <SectionHeader title="Employés" size="sm" uppercase />
                <View style={styles.legendGrid}>
                  {visibleEmps.map(emp => {
                    const empColor = getEmployeColor(emp);
                    const metierLabel = METIER_COLORS[emp.metier]?.label || '';
                    return (
                      <View key={emp.id} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: empColor }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.legendLabel}>{emp.prenom} {emp.nom}</Text>
                          <Text style={styles.legendSub}>{metierLabel}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
            {/* Légende sous-traitants */}
            {visibleSTs.length > 0 && (
              <>
                <SectionHeader title="Sous-traitants" size="sm" uppercase style={{ marginTop: 12 }} />
                <View style={styles.legendGrid}>
                  {visibleSTs.map(st => (
                    <View key={st.id} style={styles.legendItem}>
                      <View style={[styles.legendDotST, { backgroundColor: st.couleur }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.legendLabel}>{st.prenom} {st.nom}</Text>
                        {st.societe ? <Text style={styles.legendSub}>{st.societe}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        );
      })()}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// ~17 styles dupliqués depuis app/(tabs)/planning.tsx.
// TODO Phase 3+ : DS violations (couleurs hex, magic numbers).

const styles = StyleSheet.create({
  gridScroll: {
    flex: 1,
    backgroundColor: '#F5EDE3',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
  },
  nameCell: {
    minHeight: 50,
    paddingHorizontal: 4,
    paddingVertical: 4,
    paddingLeft: 6,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E6EA',
    position: 'relative',
    overflow: 'hidden',
  },
  headerCell: {
    backgroundColor: '#F5EDE3',
  },
  chantierName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#11181C',
    lineHeight: 14,
  },
  colorBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  dayHeaderCell: {
    alignItems: 'center',
    paddingVertical: 6,
    borderRightWidth: 0.5,
    borderRightColor: '#E2E6EA',
  },
  dayHeaderCellToday: {
    backgroundColor: '#EEF2F8',
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#687076',
  },
  dayNameToday: {
    color: '#2C2C2C',
    fontWeight: '700',
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginTop: 2,
  },
  dayNumToday: {
    color: '#2C2C2C',
    fontWeight: '600',
  },
  chantierRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
    minHeight: 70,
  },
  legendSection: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 24,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '45%',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#11181C',
  },
  legendSub: {
    fontSize: 10,
    color: '#687076',
    marginTop: 1,
  },
  legendDotST: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.2)',
  },
});
