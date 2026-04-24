import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { DS, font, space } from '../../constants/design';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Vrai si `date` (comparée en date locale) est aujourd'hui. */
function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
}

/** Libellés courts des jours de la semaine, commençant au lundi. */
const CAL_JOURS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Chantier minimal pour l'affichage dans la grille mensuelle
 * (dots de cellule + ligne de légende). 3 champs seulement — découplé
 * du type `Chantier` global.
 */
export interface MonthGridChantier {
  id: string;
  nom: string;
  couleur: string;
}

/**
 * Cellule du calendrier mensuel (déjà résolue par le parent).
 * `day: null` → cellule vide (offset début/fin de mois).
 */
export interface MonthGridCell {
  day: Date | null;
  /** Chantiers actifs ce jour-là (pré-filtrés par le parent). */
  chantiers: MonthGridChantier[];
}

/**
 * Props du composant `MonthViewGrid`.
 *
 * Composant 100 % présentationnel : le parent précalcule les cellules
 * et gère la navigation au tap.
 */
export interface MonthViewGridProps {
  /** Cellules du calendrier (typiquement 42 = 6 semaines × 7 jours). */
  cells: MonthGridCell[];
  /** Liste des chantiers visibles pour la légende en bas. */
  chantiersLegend: MonthGridChantier[];
  /** Callback au tap sur une cellule non vide. Le parent gère la navigation. */
  onDayPress: (day: Date) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

// ─── Constantes internes ──────────────────────────────────────────────────────

/** Padding vertical du header des jours (entre `space.xs=4` et `space.sm=8`). */
const HEADER_PV = 6;

/** Largeur d'une cellule : 1/7 du container (7 jours). */
const CELL_WIDTH_PCT = '14.28%' as const;

/** Hauteur minimale d'une cellule pour afficher le numéro + 3 dots chantier. */
const CELL_MIN_HEIGHT = 70;

/** Padding interne des cellules (micro). */
const CELL_PADDING = 3;

/** Border hairline entre cellules. */
const CELL_BORDER = 0.5;

/** Border emphase pour la cellule "aujourd'hui". */
const CELL_BORDER_TODAY = 1.5;

/** marginBottom du numéro de jour avant les dots chantier. */
const CELL_NUM_MB = 2;

/** Border-radius des dots chantier et dots légende. */
const DOT_RADIUS = 3;

/** Padding-horizontal des dots chantier (petites pills). */
const DOT_PH = 3;

/** Padding-vertical des dots chantier. */
const DOT_PV = 1;

/** marginBottom entre dots chantier empilés. */
const DOT_MB = 1;

/** fontSize des labels chantier dans les dots (plus petit que `font.tiny=9`). */
const DOT_FS = 8;

/** Border-radius du conteneur légende (entre `radius.sm=8` et `radius.md=12`). */
const LEGEND_RADIUS = 10;

/** Gap entre dot et label dans un item de légende. */
const LEGEND_ITEM_GAP = 5;

/** Largeur d'un item de légende — 2 colonnes avec gap. */
const LEGEND_ITEM_WIDTH = '45%' as const;

/** Taille du dot coloré dans la légende. */
const LEGEND_DOT_SIZE = 10;

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Vue mensuelle du planning — grille 6 semaines × 7 jours avec les
 * chantiers actifs affichés en dots colorés dans chaque cellule.
 *
 * Composant purement présentationnel : aucune logique de filtrage ni de
 * navigation. Le parent précalcule les cellules et gère le tap.
 *
 * @example
 * ```tsx
 * <MonthViewGrid
 *   cells={monthCells}
 *   chantiersLegend={chantiers}
 *   onDayPress={(day) => jumpToWeek(day)}
 *   refreshing={refreshing}
 *   onRefresh={onRefresh}
 * />
 * ```
 */
export function MonthViewGrid({
  cells,
  chantiersLegend,
  onDayPress,
  refreshing,
  onRefresh,
}: MonthViewGridProps): React.ReactElement {
  return (
    <ScrollView
      style={styles.scrollView}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[DS.primary]}
          tintColor={DS.primary}
        />
      }
    >
      {/* En-tête jours de la semaine */}
      <View style={styles.headerRow}>
        {CAL_JOURS.map(j => (
          <View key={j} style={styles.headerCell}>
            <Text style={styles.headerText}>{j}</Text>
          </View>
        ))}
      </View>

      {/* Grille des jours */}
      <View style={styles.grid}>
        {cells.map((cell, idx) => {
          if (!cell.day) return <View key={idx} style={styles.cell} />;
          const day = cell.day;
          const tod = isToday(day);
          return (
            <Pressable
              key={idx}
              style={[styles.cell, tod && styles.cellToday]}
              onPress={() => onDayPress(day)}
              accessibilityRole="button"
            >
              <Text style={[styles.cellNum, tod && styles.cellNumToday]}>
                {day.getDate()}
              </Text>
              {cell.chantiers.slice(0, 3).map(c => (
                <View
                  key={c.id}
                  style={[styles.chantierDot, { backgroundColor: c.couleur }]}
                >
                  <Text style={styles.chantierDotText} numberOfLines={1}>
                    {c.nom}
                  </Text>
                </View>
              ))}
              {cell.chantiers.length > 3 && (
                <Text style={styles.moreText}>
                  +{cell.chantiers.length - 3}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Légende couleurs chantiers */}
      <View style={styles.legend}>
        {chantiersLegend.map(c => (
          <View key={c.id} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: c.couleur }]}
            />
            <Text style={styles.legendText} numberOfLines={1}>
              {c.nom}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollView: {
    flex:            1,
    backgroundColor: DS.background,
  },

  headerRow: {
    flexDirection:     'row',
    backgroundColor:   DS.surface,
    borderBottomWidth: 1,
    borderBottomColor: DS.borderAlt,
    paddingVertical:   HEADER_PV, // 6
  },

  headerCell: {
    flex:       1,
    alignItems: 'center',
  },

  headerText: {
    fontSize:      font.compact, // 11
    fontWeight:    font.bold,    // '700'
    color:         DS.textAlt,
    textTransform: 'uppercase',
  },

  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    padding:       space.xs, // 4
  },

  cell: {
    width:           CELL_WIDTH_PCT,    // '14.28%'
    minHeight:       CELL_MIN_HEIGHT,   // 70
    padding:         CELL_PADDING,      // 3
    borderWidth:     CELL_BORDER,       // 0.5
    borderColor:     DS.borderAlt,
    backgroundColor: DS.surface,
  },

  cellToday: {
    backgroundColor: DS.surfaceInfo,
    borderColor:     DS.primary,
    borderWidth:     CELL_BORDER_TODAY, // 1.5
  },

  cellNum: {
    fontSize:     font.sm,       // 12
    fontWeight:   font.semibold, // '600'
    color:        DS.textStrong,
    marginBottom: CELL_NUM_MB,   // 2
  },

  cellNumToday: {
    color:      DS.primary,
    fontWeight: font.semibold,
  },

  chantierDot: {
    borderRadius:      DOT_RADIUS, // 3
    paddingHorizontal: DOT_PH,     // 3
    paddingVertical:   DOT_PV,     // 1
    marginBottom:      DOT_MB,     // 1
  },

  chantierDotText: {
    fontSize:   DOT_FS, // 8
    color:      DS.textInverse,
    fontWeight: font.bold, // '700'
  },

  moreText: {
    fontSize:  font.tiny, // 9
    color:     DS.textAlt,
    fontStyle: 'italic',
  },

  legend: {
    flexDirection:   'row',
    flexWrap:        'wrap',
    padding:         space.md,      // 12
    gap:             space.sm,      // 8
    backgroundColor: DS.surface,
    marginTop:       space.sm,      // 8
    borderRadius:    LEGEND_RADIUS, // 10
    margin:          space.sm,      // 8
  },

  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           LEGEND_ITEM_GAP,   // 5
    width:         LEGEND_ITEM_WIDTH, // '45%'
  },

  legendDot: {
    width:        LEGEND_DOT_SIZE, // 10
    height:       LEGEND_DOT_SIZE, // 10
    borderRadius: DOT_RADIUS,      // 3
  },

  legendText: {
    fontSize:   font.compact, // 11
    color:      DS.textStrong,
    fontWeight: font.medium,  // '500'
    flex:       1,
  },
});
