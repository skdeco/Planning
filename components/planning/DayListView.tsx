/**
 * DayListView — vue « Jour » du planning (refonte sept. 2026).
 *
 * Bande des 7 jours de la semaine affichée + une carte par chantier ayant des
 * affectations ce jour-là (employés, sous-traitants, interventions).
 * Purement présentationnel : lit les données via `usePlanningWeekData`, toutes
 * les actions (notes, ajout, actions chantier) sont remontées au parent, qui
 * réutilise exactement les mêmes modales que la vue Semaine.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronRight, ChevronDown, Plus, StickyNote, CalendarOff } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { getMetierColors } from '@/app/types';
import { usePlanningWeekData } from '@/hooks/usePlanningWeekData';
import { DS, radius, shadows, font } from '@/constants/design';

export interface DayListViewProps {
  weekOffset: number;
  /** Jour sélectionné (YYYY-MM-DD). S'il n'est pas dans la semaine affichée, le 1er jour est utilisé. */
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  isAdmin: boolean;
  onOpenChantierActions: (chantierId: string) => void;
  onOpenEmpNote: (chantierId: string, dateStr: string, empId: string) => void;
  onOpenSTNote: (chantierId: string, dateStr: string, stId: string) => void;
  onOpenIntervention: (chantierId: string, dateStr: string, intervId: string) => void;
  onOpenAjoutModal: (chantierId: string, dateStr: string) => void;
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DayListView({
  weekOffset, selectedDate, onSelectDate, isAdmin,
  onOpenChantierActions, onOpenEmpNote, onOpenSTNote, onOpenIntervention, onOpenAjoutModal,
}: DayListViewProps) {
  const { data } = useApp();
  const { t } = useLanguage();
  const {
    days, visibleChantiers, getEmployesForCell, getSTForCell, getInterventionsForCell, cellHasNotes,
  } = usePlanningWeekData(weekOffset);
  const metiers = useMemo(() => getMetierColors(data.metiersPerso), [data.metiersPerso]);

  const [showVides, setShowVides] = useState(false);
  const todayStr = toYMD(new Date());
  const day = days.find(d => toYMD(d) === selectedDate) ?? days.find(d => toYMD(d) === todayStr) ?? days[0];
  const dateStr = toYMD(day);

  const tap = (fn: () => void) => () => {
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    fn();
  };

  const rows = visibleChantiers.map(ch => ({
    ch,
    employes: getEmployesForCell(ch.id, day),
    sts: getSTForCell(ch.id, day),
    interventions: getInterventionsForCell(ch.id, day),
  }));
  const actifs = rows.filter(r => r.employes.length + r.sts.length + r.interventions.length > 0);
  const vides = rows.filter(r => r.employes.length + r.sts.length + r.interventions.length === 0);
  const nbPersonnes = new Set(actifs.flatMap(r => r.employes.map(e => e.id))).size;

  const titreJour = day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Bande de la semaine */}
      <View style={styles.week}>
        {days.map(d => {
          const ds = toYMD(d);
          const on = ds === dateStr;
          const has = visibleChantiers.some(ch => getEmployesForCell(ch.id, d).length > 0 || getSTForCell(ch.id, d).length > 0);
          return (
            <Pressable
              key={ds}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              onPress={tap(() => onSelectDate(ds))}
              style={styles.weekDay}
            >
              <Text style={[styles.weekLetter, ds === todayStr && { color: DS.primary }]}>
                {d.toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase()}
              </Text>
              <View style={[styles.weekNum, on && styles.weekNumOn]}>
                <Text style={[styles.weekNumText, on && styles.weekNumTextOn]}>{d.getDate()}</Text>
              </View>
              <View style={[styles.weekDot, !has && { backgroundColor: 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>{titreJour.charAt(0).toUpperCase() + titreJour.slice(1)}</Text>
        {nbPersonnes > 0 && <Text style={styles.dayMeta}>{nbPersonnes} pers.</Text>}
      </View>

      {actifs.length === 0 && (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><CalendarOff size={20} color={DS.primary} strokeWidth={1.8} /></View>
          <Text style={styles.emptyTitle}>{t.ui.aucuneAffectationJour}</Text>
          {isAdmin && vides.length > 0 && <Text style={styles.empty}>{t.ui.choisirChantierPlacer}</Text>}
        </View>
      )}

      {actifs.map(({ ch, employes, sts, interventions }) => (
        <View key={ch.id} style={styles.card}>
          <Pressable style={styles.cardHead} onPress={tap(() => onOpenChantierActions(ch.id))} accessibilityRole="button">
            <View style={[styles.colorDot, { backgroundColor: ch.couleur || DS.primary }]} />
            <Text style={styles.cardTitle} numberOfLines={1}>{ch.nom}</Text>
            {cellHasNotes(ch.id, dateStr) && <StickyNote size={16} color={DS.primary} strokeWidth={1.9} />}
            <ChevronRight size={16} color={DS.textSecondary} />
          </Pressable>
          {!!ch.adresse && <Text style={styles.cardSub} numberOfLines={1}>{ch.adresse}</Text>}
          <View style={styles.chips}>
            {employes.map(e => (
              <Pressable key={e.id} style={styles.chip} onPress={tap(() => onOpenEmpNote(ch.id, dateStr, e.id))}>
                <View style={[styles.chipDot, { backgroundColor: metiers[e.metier]?.color ?? DS.textSecondary }]} />
                <Text style={styles.chipText} numberOfLines={1}>{e.prenom}</Text>
              </Pressable>
            ))}
            {sts.map(st => (
              <Pressable key={st.id} style={[styles.chip, styles.chipOutline]} onPress={tap(() => onOpenSTNote(ch.id, dateStr, st.id))}>
                <View style={[styles.chipDot, { backgroundColor: st.couleur || DS.textSecondary }]} />
                <Text style={styles.chipText} numberOfLines={1}>{st.societe || `${st.prenom} ${st.nom}`.trim()} · ST</Text>
              </Pressable>
            ))}
            {interventions.map(it => (
              <Pressable key={it.id} style={[styles.chip, styles.chipOutline]} onPress={tap(() => onOpenIntervention(ch.id, dateStr, it.id))}>
                <View style={[styles.chipDot, { backgroundColor: it.couleur || DS.textSecondary }]} />
                <Text style={styles.chipText} numberOfLines={1}>{it.libelle}</Text>
              </Pressable>
            ))}
            {isAdmin && (
              <Pressable
                style={[styles.chip, styles.chipAdd]}
                accessibilityLabel="Ajouter une affectation"
                onPress={tap(() => onOpenAjoutModal(ch.id, dateStr))}
              >
                <Plus size={15} color={DS.primary} strokeWidth={2.2} />
              </Pressable>
            )}
          </View>
        </View>
      ))}

      {isAdmin && vides.length > 0 && (
        <>
          <Pressable style={styles.sectionToggle} onPress={tap(() => setShowVides(v => !v))} accessibilityRole="button" accessibilityState={{ expanded: showVides || actifs.length === 0 }}>
            <Text style={styles.sectionLabel}>{t.ui.sansAffectation} ({vides.length})</Text>
            {(showVides || actifs.length === 0) ? <ChevronDown size={16} color={DS.textSecondary} /> : <ChevronRight size={16} color={DS.textSecondary} />}
          </Pressable>
          {(showVides || actifs.length === 0) && (
          <View style={styles.listCard}>
            {vides.map(({ ch }, i) => (
              <Pressable key={ch.id} style={styles.listRow} onPress={tap(() => onOpenAjoutModal(ch.id, dateStr))}>
                <View style={[styles.colorDot, { backgroundColor: ch.couleur || DS.primary }]} />
                <View style={[styles.listInner, i < vides.length - 1 && styles.listSeparator]}>
                  <Text style={styles.listTitle} numberOfLines={1}>{ch.nom}</Text>
                  <Plus size={17} color={DS.primary} strokeWidth={2.2} />
                </View>
              </Pressable>
            ))}
          </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32, gap: 12 },
  week: { flexDirection: 'row', backgroundColor: DS.surface, borderRadius: radius.xl, paddingTop: 10, paddingBottom: 4, paddingHorizontal: 4, ...shadows.sm },
  weekDay: { flex: 1, alignItems: 'center', gap: 3, minHeight: 62 },
  weekLetter: { fontSize: 11, fontWeight: font.semibold, color: DS.textSecondary },
  weekNum: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weekNumOn: { backgroundColor: DS.primary },
  weekNumText: { fontSize: 17, color: DS.text },
  weekNumTextOn: { color: DS.textInverse, fontWeight: font.semibold },
  weekDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: DS.primary },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: 4 },
  dayTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 22, letterSpacing: -0.3, color: DS.text },
  dayMeta: { fontSize: 14, color: DS.textSecondary },
  empty: { fontSize: 13, color: DS.textSecondary, textAlign: 'center' },
  emptyCard: { backgroundColor: DS.surface, borderRadius: radius.xl, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', gap: 8, ...shadows.sm },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: font.semibold, color: DS.text },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8, marginTop: 8, minHeight: 32 },
  card: { backgroundColor: DS.surface, borderRadius: radius.xl, padding: 14, gap: 8, ...shadows.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: font.semibold, color: DS.text },
  cardSub: { fontSize: 13, color: DS.textSecondary, marginTop: -4, marginLeft: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 9, paddingRight: 11, borderRadius: radius.full, backgroundColor: DS.soft, maxWidth: '100%' },
  chipOutline: { backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border },
  chipAdd: { paddingLeft: 9, paddingRight: 9, backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.primary, borderStyle: 'dashed' },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, fontWeight: font.medium, color: DS.text, flexShrink: 1 },
  sectionLabel: { fontSize: 13, fontWeight: font.semibold, letterSpacing: 0.4, textTransform: 'uppercase', color: DS.textSecondary, paddingHorizontal: 6 },
  listCard: { backgroundColor: DS.surface, borderRadius: radius.xl, ...shadows.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingLeft: 16 },
  listInner: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14 },
  listSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.border },
  listTitle: { flex: 1, fontSize: 15, color: DS.text },
});
