import React from 'react';
import {
  View,
  Text,
  Pressable,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { useCellAffectationManager } from '@/hooks/useCellAffectationManager';
import {
  getEmployeColor,
  type Chantier,
  type Employe,
  type SousTraitant,
  type Intervention,
} from '@/app/types';

// ─── Helpers de date locaux ───────────────────────────────────────────────────
//
// Dupliqués depuis app/(tabs)/planning.tsx — pas de lib/dateUtils centralisée.
// Voir REFACTOR_NOTES.md "Dette technique — Helpers de date dupliqués".

/** Convertit une `Date` en string `YYYY-MM-DD` en heure locale. */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Vérifie qu'une date est dans la plage [start, end] inclusive. */
function dateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end);   e.setHours(0, 0, 0, 0);
  return d.getTime() >= s.getTime() && d.getTime() <= e.getTime();
}

/** True si la date passée est aujourd'hui (à la journée près, heure locale). */
function isToday(date: Date): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(date); d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * Ensemble des callbacks pour ouvrir les modaux depuis la cellule
 * (empNote / stNote / intervention / ajout / move / ordre).
 * Groupés en un seul objet pour clarté API et réutilisabilité —
 * réduit la surface des props de WeekGridCell de 15 à 9.
 */
export interface CellModalOpeners {
  empNote:      (chantierId: string, dateStr: string, empId: string) => void;
  stNote:       (chantierId: string, dateStr: string, stId: string) => void;
  intervention: (chantierId: string, dateStr: string, intervId: string) => void;
  ajout:        (chantierId: string, dateStr: string) => void;
  move:         (employeId: string, chantierId: string, dateStr: string) => void;
  ordre:        (employeId: string, dateStr: string, chantierIds: string[]) => void;
}

/**
 * Props du composant `WeekGridCell` — rendu d'une cellule unique
 * (chantier × jour) de la grille hebdomadaire.
 *
 * 9 props : 4 contexte + 4 data pré-calculée + 1 objet openers (6 callbacks).
 * Sous le seuil 12 (boss UI complexe : badges employés/ST, interventions,
 * bouton + admin, longPress menu, removeBtn avec Alert.alert).
 */
export interface WeekGridCellProps {
  chantier:      Chantier;
  day:           Date;
  dayCol:        number;
  /** Employés affectés à cette cellule (pré-calculé par WeekGridView). */
  employes:      Employe[];
  /** Sous-traitants affectés à cette cellule (filtré au ST connecté si rôle ST). */
  soustraitants: SousTraitant[];
  /** Interventions externes pour cette cellule. */
  interventions: Intervention[];
  /** True si la cellule a au moins une note. */
  hasNotes:      boolean;
  /** Closure sur le helper du hook usePlanningWeekData. */
  getOrdreNum:       (employeId: string, chantierId: string, dateStr: string) => number;
  /** Closure sur le helper du hook usePlanningWeekData. */
  getOrdreChantiers: (employeId: string, dateStr: string) => string[];
  /** Callbacks groupés pour ouvrir les 6 modaux depuis la cellule. */
  openers: CellModalOpeners;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Cellule de la grille hebdomadaire (1 chantier × 1 jour).
 *
 * Contient :
 * - Badges employés (couleur métier, ordre multi-chantiers, atelier dashed)
 * - Badges sous-traitants
 * - Bandeaux interventions externes
 * - Bouton + admin (ajout employés/ST/intervention)
 *
 * Interactions :
 * - Click cell (admin) : ouvre ModalAjout (pré-rempli intervention form)
 * - Click badge employé : ouvre note modal
 * - LongPress badge employé (admin) : choix Déplacer / Atelier (web prompt
 *   ou Alert mobile)
 * - Click ✕ employé (admin) : Alert avec choix Déplacer / Retirer / Retirer+
 *   pointages, sinon retrait direct
 * - Click ✕ ST (admin) : retrait direct
 *
 * Préservation 1:1 stricte du comportement parent (avant extraction).
 * Bug pré-existant `Alert.alert >2 boutons sur web` (REFACTOR_NOTES.md)
 * préservé tel quel.
 */
export function WeekGridCell({
  chantier,
  day,
  dayCol,
  employes,
  soustraitants,
  interventions,
  hasNotes,
  getOrdreNum,
  getOrdreChantiers,
  openers,
}: WeekGridCellProps): React.ReactElement {
  const { data, currentUser } = useApp();
  const { toggleLieuTravail, removeEmployeFromCell, removeSTFromCell } = useCellAffectationManager();
  const isAdmin = currentUser?.role === 'admin';
  const isST    = currentUser?.role === 'soustraitant';

  const dateStr = toYMD(day);
  const today   = isToday(day);
  const inRange = dateInRange(day, chantier.dateDebut, chantier.dateFin);

  return (
    <Pressable
      style={[
        styles.cell,
        { width: dayCol },
        today && styles.cellToday,
        !inRange && styles.cellOutOfRange,
        hasNotes && !today && { backgroundColor: '#FFF9E6' },
      ]}
      onPress={isAdmin ? () => openers.ajout(chantier.id, dateStr) : undefined}
    >
      {/* Badges employés : couleur personnalisée, masqués pour le sous-traitant connecté */}
      {!isST && employes.map(emp => {
        const empColor = getEmployeColor(emp);
        const empAff = data.affectations.find(a =>
          a.chantierId === chantier.id && a.employeId === emp.id &&
          a.dateDebut <= dateStr && a.dateFin >= dateStr
        );
        const empHasNotes = empAff && (empAff.notes || []).some(n => !n.date || n.date === dateStr);
        const ordreNum = getOrdreNum(emp.id, chantier.id, dateStr);
        const isAtelier = empAff?.lieu === 'atelier';
        return (
          <View key={emp.id} style={styles.badgeWrapper}>
            <Pressable
              style={[styles.empBadge, { backgroundColor: empColor }, isAtelier && { borderWidth: 2, borderColor: '#F59E0B', borderStyle: 'dashed' }]}
              onPress={() => openers.empNote(chantier.id, dateStr, emp.id)}
              onLongPress={isAdmin ? () => {
                if (Platform.OS === 'web') {
                  const choice = window.prompt(`${emp.prenom} — Choisir :\n1 = Déplacer\n2 = ${isAtelier ? 'Remettre sur chantier' : 'Mettre en atelier 🏭'}`);
                  if (choice === '2') toggleLieuTravail(chantier.id, emp.id, dateStr);
                  else if (choice === '1') {
                    const ids = getOrdreChantiers(emp.id, dateStr);
                    if (ids.length >= 2) openers.ordre(emp.id, dateStr, ids);
                    else openers.move(emp.id, chantier.id, dateStr);
                  }
                } else {
                  Alert.alert(emp.prenom, 'Que voulez-vous faire ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: isAtelier ? '🏗 Remettre sur chantier' : '🏭 Mettre en atelier', onPress: () => toggleLieuTravail(chantier.id, emp.id, dateStr) },
                    { text: '↔ Déplacer', onPress: () => {
                      const ids = getOrdreChantiers(emp.id, dateStr);
                      if (ids.length >= 2) openers.ordre(emp.id, dateStr, ids);
                      else openers.move(emp.id, chantier.id, dateStr);
                    }},
                  ]);
                }
              } : undefined}
            >
              <Text style={[styles.empBadgeText, { color: '#fff' }]} numberOfLines={1}>
                {isAtelier ? '🏭' : ''}{emp.prenom.slice(0, 3) + '.'}
              </Text>
              {empHasNotes && <View style={styles.noteDot} />}
              {ordreNum > 0 && (
                <View style={styles.ordreBadge}>
                  <Text style={styles.ordreBadgeText}>{ordreNum}</Text>
                </View>
              )}
            </Pressable>
            {isAdmin && (
              <Pressable
                style={styles.removeBadgeBtn}
                onPress={() => {
                  const hasPointage = data.pointages.some(p => p.employeId === emp.id && p.date === dateStr);
                  const aff = data.affectations.find(a => a.chantierId === chantier.id && a.employeId === emp.id && a.dateDebut <= dateStr && a.dateFin >= dateStr);
                  const hasNotesEmp = aff && (aff.notes || []).some(n => (n.date === dateStr || !n.date) && (n.texte?.trim() || (n.tasks && n.tasks.length > 0)));

                  const doRemove = (deletePointages?: boolean) => {
                    removeEmployeFromCell(chantier.id, emp.id, dateStr, { deletePointages });
                  };

                  if (hasNotesEmp || hasPointage) {
                    const messages: string[] = [];
                    if (hasNotesEmp) messages.push('des notes/tâches');
                    if (hasPointage) messages.push('un pointage');
                    Alert.alert(
                      `Retirer ${emp.prenom}`,
                      `${emp.prenom} a ${messages.join(' et ')} ce jour. Que faire ?`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        { text: '↔ Déplacer', onPress: () => openers.move(emp.id, chantier.id, dateStr) },
                        { text: 'Retirer du planning', onPress: () => doRemove(false) },
                        ...(hasPointage ? [{ text: 'Retirer + suppr. pointage', style: 'destructive' as const, onPress: () => doRemove(true) }] : []),
                      ]
                    );
                  } else {
                    removeEmployeFromCell(chantier.id, emp.id, dateStr);
                  }
                }}
              >
                <Text style={styles.removeBadgeBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {/* Badges sous-traitants : cliquables pour ouvrir les notes */}
      {(isAdmin || isST) && soustraitants.map(st => {
        const stHasNotes = data.affectations.some(a =>
          a.chantierId === chantier.id &&
          a.soustraitantId === st.id &&
          a.dateDebut <= dateStr && a.dateFin >= dateStr &&
          (a.notes || []).some(n => !n.date || n.date === dateStr)
        );
        return (
          <View key={st.id} style={styles.badgeWrapper}>
            <Pressable
              style={[styles.stBadge, { backgroundColor: st.couleur }]}
              onPress={() => openers.stNote(chantier.id, dateStr, st.id)}
            >
              <Text style={styles.stBadgeText} numberOfLines={1}>
                {(st.prenom || st.nom).slice(0, 3) + '.'}
              </Text>
              {stHasNotes && <View style={styles.noteDot} />}
            </Pressable>
            {isAdmin && (
              <Pressable
                style={styles.removeBadgeBtn}
                onPress={() => removeSTFromCell(chantier.id, st.id, dateStr)}
              >
                <Text style={styles.removeBadgeBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {/* Bandeaux interventions externes (visibles par tous) */}
      {interventions.map(interv => (
        <Pressable
          key={interv.id}
          style={[styles.intervBandeau, { backgroundColor: interv.couleur }]}
          onPress={() => isAdmin ? openers.intervention(chantier.id, dateStr, interv.id) : undefined}
        >
          <Text style={styles.intervBandeauIcon}>⚡</Text>
          <Text style={styles.intervBandeauText} numberOfLines={1}>
            {interv.libelle.length > 5 ? interv.libelle.slice(0, 4) + '…' : interv.libelle}
          </Text>
        </Pressable>
      ))}

      {/* Bouton + pour admin (ajout/suppression employés + externe) */}
      {isAdmin && (
        <Pressable
          style={styles.addBtn}
          onPress={() => openers.ajout(chantier.id, dateStr)}
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// ~15 styles dupliqués depuis app/(tabs)/planning.tsx.
// TODO Phase 3+ : DS violations (couleurs hex, magic numbers) à corriger.

const styles = StyleSheet.create({
  cell: {
    paddingVertical: 3,
    paddingHorizontal: 0,
    gap: 1,
    borderRightWidth: 0.5,
    borderRightColor: '#E2E6EA',
    alignItems: 'stretch',
  },
  cellToday: {
    backgroundColor: '#EEF2F8',
  },
  cellOutOfRange: {
    backgroundColor: '#F5EDE3',
  },
  badgeWrapper: {
    position: 'relative',
  },
  empBadge: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderRadius: 3,
    alignItems: 'center',
    position: 'relative',
  },
  empBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stBadge: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderRadius: 3,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    borderStyle: 'dashed',
  },
  stBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  noteDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  ordreBadge: {
    position: 'absolute',
    bottom: 1,
    left: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordreBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 10,
  },
  removeBadgeBtn: {
    position: 'absolute',
    top: -4,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#fff',
  },
  removeBadgeBtnText: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '900',
    lineHeight: 12,
  },
  intervBandeau: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    gap: 2,
    // Fond hachuré simulé par une ombre colorée
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  intervBandeauIcon: {
    fontSize: 9,
    color: '#fff',
  },
  intervBandeauText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  addBtn: {
    width: '100%',
    paddingVertical: 3,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 16,
    color: '#687076',
    fontWeight: '400',
  },
});
