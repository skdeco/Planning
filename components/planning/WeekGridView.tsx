import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { usePlanningWeekData } from '@/hooks/usePlanningWeekData';
import { useRefresh } from '@/hooks/useRefresh';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getEmployeColor, METIER_COLORS } from '@/app/types';
import { WeekGridCell, type CellModalOpeners } from './WeekGridCell';
import { BadgeSav } from './OeilChantier';
import { ChantiersMasques } from './ChantiersMasques';
import { FicheAffectationJour, type CibleAffectation } from './FicheAffectationJour';
import { EditionPointagesJour } from '@/components/pointage/EditionPointagesJour';
import { HORS_CHANTIER_ID } from '@/lib/planningAffichage';

// ─── Helpers de date locaux ───────────────────────────────────────────────────

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
  const { t } = useLanguage();
  const JOURS = t.planning.weekDaysShort;
  const isAdmin = currentUser?.role === 'admin';
  // Admin et RH : bouton œil pour masquer / réafficher un chantier du planning
  const peutMasquer = isAdmin || (currentUser?.role === 'employe' && data.employes.find(e => e.id === currentUser?.employeId)?.isRH === true);
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
  // Hauteurs mesurées : la colonne des noms (fixe) s'aligne sur les lignes de la grille (défilante)
  const [hauteurs, setHauteurs] = useState<Record<string, number>>({});
  const [hauteursNoms, setHauteursNoms] = useState<Record<string, number>>({});
  const [hauteurEntete, setHauteurEntete] = useState(0);
  const [fiche, setFiche] = useState<CibleAffectation | null>(null);
  const [edition, setEdition] = useState<{ employeId: string; date: string } | null>(null);

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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#141414']} tintColor="#141414" />
      }
    >
      {/* Grille : noms des chantiers fixes à gauche ; lundi → vendredi à l'écran,
          samedi et dimanche en glissant vers la gauche (comme le Planning direction) */}
      <View style={{ flexDirection: 'row' }}>
        {/* Colonne des noms */}
        <View style={{ width: NAME_COL }}>
          <View style={[styles.nameCell, styles.headerCell, { width: NAME_COL, minHeight: 0, height: hauteurEntete || undefined, borderBottomWidth: 1, borderBottomColor: '#E2E2DF' }]} />
          {visibleChantiers.map(chantier => {
            const h = Math.max(hauteurs[chantier.id] || 0, hauteursNoms[chantier.id] || 0);
            return (
              <Pressable
                key={chantier.id}
                style={[styles.nameCell, { width: NAME_COL, height: h || undefined, borderBottomWidth: 1, borderBottomColor: '#E2E2DF' }]}
                onPress={chantier.id === HORS_CHANTIER_ID ? undefined : () => onOpenChantierActions(chantier.id)}
                onLongPress={isAdmin && chantier.id !== HORS_CHANTIER_ID ? () => onLongPressChantier(chantier.id) : undefined}
                delayLongPress={400}
              >
                <View style={[styles.colorBar, { backgroundColor: chantier.couleur }]} />
                <View onLayout={e => { const v = Math.ceil(e.nativeEvent.layout.height + 8); setHauteursNoms(p => (p[chantier.id] === v ? p : { ...p, [chantier.id]: v })); }}>
                  <Text style={styles.chantierName} numberOfLines={2}>{chantier.nom}</Text>
                  {chantier.statut === 'sav' && <BadgeSav />}
                  {chantier.categorie === 'depannage' && (
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#B9770E', textTransform: 'uppercase', letterSpacing: 0.3 }}>{t.ui.catDepannage}</Text>
                  )}
                  {chantier.categorie === 'lieuFixe' && (
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#34506B', textTransform: 'uppercase', letterSpacing: 0.3 }}>{t.ui.catLieuFixe}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Jours (défilement horizontal) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToOffsets={[0, dayCol * 2]} decelerationRate="fast">
          <View>
            <View style={styles.gridRow} onLayout={e => setHauteurEntete(Math.ceil(e.nativeEvent.layout.height))}>
              {days.map((day, i) => {
                const today = isToday(day);
                return (
                  <View key={i} style={[styles.dayHeaderCell, { width: dayCol }, today && styles.dayHeaderCellToday]}>
                    <Text style={[styles.dayName, today && styles.dayNameToday]}>{JOURS[i]}</Text>
                    <Text style={[styles.dayNum, today && styles.dayNumToday]}>{day.getDate()}</Text>
                  </View>
                );
              })}
            </View>
            {visibleChantiers.map(chantier => (
              <View key={chantier.id} style={[styles.chantierRow, { minHeight: Math.max(70, hauteursNoms[chantier.id] || 0) }]}
                onLayout={e => { const v = Math.ceil(e.nativeEvent.layout.height); setHauteurs(p => (p[chantier.id] === v ? p : { ...p, [chantier.id]: v })); }}>
                {days.map((day, i) => {
                  const dateStr = toYMD(day);
                  return (
                    <WeekGridCell
                      key={i}
                      chantier={chantier}
                      day={day}
                      dayCol={dayCol}
                      employes={getEmployesForCell(chantier.id, day)}
                      soustraitants={getSTForCell(chantier.id, day)}
                      interventions={getInterventionsForCell(chantier.id, day)}
                      hasNotes={cellHasNotes(chantier.id, dateStr)}
                      getOrdreNum={getOrdreNum}
                      getOrdreChantiers={getOrdreChantiers}
                      openers={cellOpeners}
                      onFiche={(chantierId, d, empId) => {
                        // Pointé hors chantier : l'admin / les RH renseignent le chantier
                        if (chantierId === HORS_CHANTIER_ID) { if (peutMasquer) setEdition({ employeId: empId, date: d }); return; }
                        setFiche({ chantierId, employeId: empId, date: d });
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Chantiers masqués : réaffichables en un tap */}
      {peutMasquer && <ChantiersMasques />}

      <EditionPointagesJour visible={!!edition} employeId={edition?.employeId || null} date={edition?.date || ''} onFermer={() => setEdition(null)} />

      <FicheAffectationJour
        cible={fiche}
        onFermer={() => setFiche(null)}
        onNotes={c => cellOpeners.empNote(c.chantierId, c.date, c.employeId)}
        onDeplacer={c => {
          const ids = getOrdreChantiers(c.employeId, c.date);
          if (ids.length >= 2) cellOpeners.ordre(c.employeId, c.date, ids);
          else cellOpeners.move(c.employeId, c.chantierId, c.date);
        }}
      />

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
    backgroundColor: '#FFFFFF',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E2DF',
  },
  nameCell: {
    minHeight: 50,
    paddingHorizontal: 4,
    paddingVertical: 4,
    paddingLeft: 6,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E2DF',
    position: 'relative',
    overflow: 'hidden',
  },
  headerCell: {
    backgroundColor: '#F4F4F2',
  },
  chantierName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#141414',
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
    paddingVertical: 8,
    backgroundColor: '#F4F4F2',
    borderRightWidth: 0.5,
    borderRightColor: '#E2E2DF',
  },
  dayHeaderCellToday: {
    backgroundColor: '#EBEBE8',
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: '#6A6A68',
  },
  dayNameToday: {
    color: '#141414',
    fontWeight: '700',
  },
  dayNum: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
    marginTop: 2,
  },
  dayNumToday: {
    color: '#141414',
    fontWeight: '600',
  },
  chantierRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E2DF',
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
    color: '#141414',
  },
  legendSub: {
    fontSize: 10,
    color: '#6A6A68',
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
