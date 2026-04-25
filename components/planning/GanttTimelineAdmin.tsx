import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useApp } from '@/app/context/AppContext';

// ─── Helpers de date locaux ───────────────────────────────────────────────────
//
// Dupliqués depuis app/(tabs)/planning.tsx — pas de lib/dateUtils centralisée
// dans le repo. Voir REFACTOR_NOTES.md "Dette technique — Helpers de date
// dupliqués" pour l'extraction future.

/**
 * Convertit une `Date` en string `YYYY-MM-DD` en heure locale (pas UTC, pour
 * éviter les décalages aux changements d'heure).
 */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Props du composant `GanttTimelineAdmin`.
 *
 * Composant self-contained : lit `data` (chantiers, affectations, employés)
 * directement depuis `useApp()`. Le parent ne contrôle que la fenêtre
 * temporelle (monthOffset) et les callbacks de navigation.
 */
export interface GanttTimelineAdminProps {
  /** Décalage en mois pour la fenêtre 3 mois affichée. */
  monthOffset: number;
  /**
   * Callback navigation reculer de 3 mois.
   * Le parent fait typiquement `setMonthOffset(m => m - 3)`.
   */
  onPrevMonths: () => void;
  /** Callback navigation avancer de 3 mois. */
  onNextMonths: () => void;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Vue Gantt admin du planning — timeline 3 mois glissants avec barres
 * chantiers (couleur, statut, retard), ligne aujourd'hui, en-tête mois + jours.
 *
 * Layout : colonne CHANTIER fixée à gauche (NAME_W=120) + ScrollView
 * horizontale pour la timeline.
 *
 * ⚠️ Bug pré-existant connu : sur web, la colonne CHANTIER ne reste pas
 * figée lors du scroll horizontal. Pattern `flex: 1` sur ScrollView horizontal
 * dans un parent flex sans `minWidth: 0` — voir REFACTOR_NOTES.md "Gantt
 * web — colonne CHANTIER pas figée" (commit wip 7cb9565). Préservé ici pour
 * extraction 1:1 ; correction prévue dans un commit séparé.
 *
 * Code copié à l'identique depuis l'IIFE inline de planning.tsx
 * (L1469-1603 pré-extraction). Tous les styles sont inline (préservation 1:1).
 */
export function GanttTimelineAdmin({
  monthOffset,
  onPrevMonths,
  onNextMonths,
}: GanttTimelineAdminProps): JSX.Element {
  const { data } = useApp();

  // Calcul de la plage Gantt : 3 mois glissants
  const ganttToday = new Date();
  const ganttStart = new Date(ganttToday.getFullYear(), ganttToday.getMonth() + monthOffset, 1);
  const ganttEnd = new Date(ganttStart.getFullYear(), ganttStart.getMonth() + 3, 0);
  const ganttTotalDays = Math.ceil((ganttEnd.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const ganttChantiers = data.chantiers.filter(c => c.statut !== 'termine' || c.dateFin >= toYMD(ganttStart));
  const ganttMonths: { label: string; days: number; startDay: number }[] = [];
  let dayCount = 0;
  for (let m = 0; m < 3; m++) {
    const mDate = new Date(ganttStart.getFullYear(), ganttStart.getMonth() + m, 1);
    const daysInMonth = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0).getDate();
    const MOIS_NOMS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    ganttMonths.push({ label: `${MOIS_NOMS[mDate.getMonth()]} ${mDate.getFullYear()}`, days: daysInMonth, startDay: dayCount });
    dayCount += daysInMonth;
  }
  const DAY_W = 18;
  const NAME_W = 120;
  const todayStr = toYMD(ganttToday);

  const ganttSortedChantiers = ganttChantiers
    .filter(c => c.dateDebut)
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));

  const MONTH_H = 28;
  const DAY_ROW_H = 18;
  const HEADER_H = MONTH_H + DAY_ROW_H;
  const ROW_H = 36;
  // Hauteur explicite pour éviter overflow-y:hidden du ScrollView horizontal sur web
  const timelineH = HEADER_H + ganttSortedChantiers.length * ROW_H + 4;

  return (
    <View style={{ flex: 1, minHeight: 200 }}>
      {/* Navigation mois */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
        <Pressable onPress={onPrevMonths} style={{ padding: 6 }}>
          <Text style={{ fontSize: 18, color: '#2C2C2C' }}>‹‹</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C' }}>
          {ganttMonths.map(m => m.label).join(' — ')}
        </Text>
        <Pressable onPress={onNextMonths} style={{ padding: 6 }}>
          <Text style={{ fontSize: 18, color: '#2C2C2C' }}>››</Text>
        </Pressable>
      </View>

      {/* Grille : colonne gauche figée + timeline scrollable */}
      <View style={{ flexDirection: 'row', flex: 1 }}>

        {/* Colonne gauche figée (hors du ScrollView horizontal) */}
        <View style={{ width: NAME_W, borderRightWidth: 1, borderRightColor: '#E2E6EA', zIndex: 2, backgroundColor: '#FAFAF9' }}>
          {/* Espaceur aligné avec les en-têtes mois + jours */}
          <View style={{ height: HEADER_H, borderBottomWidth: 1, borderBottomColor: '#E2E6EA', justifyContent: 'flex-end', paddingBottom: 2, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 10, color: '#9CA3AF', fontWeight: '600' }}>CHANTIER</Text>
          </View>
          {ganttSortedChantiers.map(c => {
            const empAffectes = data.employes.filter(e =>
              data.affectations.some(a => a.chantierId === c.id && a.employeId === e.id)
            );
            return (
              <View key={c.id} style={{ height: ROW_H, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F5EDE3' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#11181C' }} numberOfLines={1}>{c.nom}</Text>
                <Text style={{ fontSize: 9, color: '#9CA3AF' }}>{empAffectes.length} pers.</Text>
              </View>
            );
          })}
        </View>

        {/* Timeline scrollable horizontalement */}
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1, height: timelineH }}>
          <View>
            {/* En-tête mois */}
            <View style={{ flexDirection: 'row', height: MONTH_H }}>
              {ganttMonths.map((m, i) => (
                <View key={i} style={{ width: m.days * DAY_W, borderRightWidth: 1, borderRightColor: '#E2E6EA', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#2C2C2C' }}>{m.label}</Text>
                </View>
              ))}
            </View>
            {/* En-tête jours */}
            <View style={{ flexDirection: 'row', height: DAY_ROW_H, borderBottomWidth: 1, borderBottomColor: '#E2E6EA' }}>
              {Array.from({ length: ganttTotalDays }, (_, i) => {
                const d = new Date(ganttStart);
                d.setDate(d.getDate() + i);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isT = toYMD(d) === todayStr;
                return (
                  <View key={i} style={{ width: DAY_W, alignItems: 'center', justifyContent: 'center', backgroundColor: isT ? '#E8F0FE' : isWeekend ? '#F8F9FA' : 'transparent', borderRightWidth: d.getDate() === 1 ? 1 : 0, borderRightColor: '#E2E6EA' }}>
                    <Text style={{ fontSize: 8, color: isT ? '#2C2C2C' : '#9CA3AF' }}>{d.getDate()}</Text>
                  </View>
                );
              })}
            </View>
            {/* Barres chantiers */}
            <View>
              {ganttSortedChantiers.map(c => {
                const cStart = new Date(c.dateDebut + 'T12:00:00');
                const cEnd = c.dateFin ? new Date(c.dateFin + 'T12:00:00') : cStart;
                const startOffset = Math.max(0, Math.ceil((cStart.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24)));
                const endOffset = Math.min(ganttTotalDays - 1, Math.ceil((cEnd.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24)));
                const barWidth = Math.max(DAY_W, (endOffset - startOffset + 1) * DAY_W);
                const barLeft = startOffset * DAY_W;
                const isEnRetard = c.statut === 'actif' && c.dateFin < todayStr;
                return (
                  <View key={c.id} style={{ height: ROW_H, borderBottomWidth: 1, borderBottomColor: '#F5EDE3' }}>
                    <View style={{ width: ganttTotalDays * DAY_W, height: ROW_H, position: 'relative' }}>
                      {/* Ligne aujourd'hui */}
                      {(() => {
                        const tOff = Math.ceil((ganttToday.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24));
                        if (tOff >= 0 && tOff < ganttTotalDays) {
                          return <View style={{ position: 'absolute', left: tOff * DAY_W, top: 0, bottom: 0, width: 1.5, backgroundColor: '#2C2C2C', opacity: 0.2, zIndex: 1 }} />;
                        }
                        return null;
                      })()}
                      <View style={{
                        position: 'absolute', left: barLeft, top: 8, width: barWidth, height: 20,
                        backgroundColor: c.couleur, borderRadius: 4, opacity: c.statut === 'termine' ? 0.4 : 0.9,
                        borderWidth: isEnRetard ? 2 : 0, borderColor: '#E74C3C',
                        justifyContent: 'center', paddingHorizontal: 4,
                      }}>
                        <Text style={{ fontSize: 9, color: '#fff', fontWeight: '600' }} numberOfLines={1}>
                          {c.nom}{isEnRetard ? ' ⚠️' : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
