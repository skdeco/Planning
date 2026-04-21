/**
 * Vue Gantt globale admin : tous les chantiers actifs sur une ligne de temps.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function parseISO(s: string): Date { return new Date(s + (s.length === 10 ? 'T12:00:00' : '')); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function GanttGlobal({ visible, onClose }: Props) {
  const { data } = useApp();
  const router = useRouter();
  const [showTermines, setShowTermines] = useState(false);

  const chantiers: Chantier[] = useMemo(() => {
    const all = data.chantiers || [];
    return showTermines ? all : all.filter(c => c.statut !== 'termine');
  }, [data.chantiers, showTermines]);

  // Fenêtre Gantt : englobe toutes les dates
  const { start, end, totalWeeks, weekW, totalDays, dayW } = useMemo(() => {
    const today = new Date();
    let minD = today;
    let maxD = addDays(today, 90);
    chantiers.forEach(c => {
      if (c.dateDebut) {
        const d = parseISO(c.dateDebut);
        if (d < minD) minD = d;
      }
      if (c.dateFin) {
        const d = parseISO(c.dateFin);
        if (d > maxD) maxD = d;
      }
    });
    // Arrondir au lundi / dimanche
    const dowS = (minD.getDay() + 6) % 7;
    const startAligned = addDays(minD, -dowS);
    const dowE = (maxD.getDay() + 6) % 7;
    const endAligned = addDays(maxD, 6 - dowE);
    const totalDays = diffDays(startAligned, endAligned) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);
    const screenW = Math.min(Dimensions.get('window').width, 1400);
    const labelColW = 150;
    const availableW = screenW - 32 - labelColW;
    const weekW = Math.max(60, Math.min(120, Math.floor(availableW / Math.max(Math.min(totalWeeks, 10), 4))));
    return { start: startAligned, end: endAligned, totalWeeks, weekW, totalDays, dayW: weekW / 7 };
  }, [chantiers]);

  const todayOffsetPx = Math.max(0, diffDays(start, new Date())) * dayW;
  const labelColW = 150;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '94%', flex: 1 }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>📅 Planning Gantt — tous les chantiers</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={{ fontSize: 14, fontWeight: '800' }}>✕</Text>
            </Pressable>
          </View>

          <View style={{ padding: 14 }}>
            <Pressable onPress={() => setShowTermines(s => !s)} style={styles.filterBtn}>
              <Text style={styles.filterBtnText}>
                {showTermines ? '✓ Afficher les clôturés' : '◯ Masquer les clôturés'}
              </Text>
            </Pressable>
            <Text style={styles.info}>
              Du {start.toLocaleDateString('fr-FR')} au {end.toLocaleDateString('fr-FR')} · {chantiers.length} chantier{chantiers.length > 1 ? 's' : ''}
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }}>
              <View>
                {/* En-tête semaines */}
                <View style={{ flexDirection: 'row', backgroundColor: '#2C2C2C' }}>
                  <View style={{ width: labelColW, padding: 8, justifyContent: 'center' }}>
                    <Text style={styles.headerChantierCol}>Chantier</Text>
                  </View>
                  {Array.from({ length: totalWeeks }).map((_, wi) => {
                    const wStart = addDays(start, wi * 7);
                    const isThisMonth = wStart.getDate() <= 7; // début de mois
                    return (
                      <View key={wi} style={[styles.weekHeader, { width: weekW }]}>
                        <Text style={styles.weekHeaderText}>
                          {wStart.getDate().toString().padStart(2, '0')}/{String(wStart.getMonth() + 1).padStart(2, '0')}
                        </Text>
                        {isThisMonth && (
                          <Text style={styles.monthLabel}>
                            {wStart.toLocaleDateString('fr-FR', { month: 'short' })}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Lignes chantiers */}
                <View style={{ position: 'relative' }}>
                  {chantiers.map((c, idx) => {
                    if (!c.dateDebut) return null;
                    const s = parseISO(c.dateDebut);
                    const e = c.dateFin ? parseISO(c.dateFin) : addDays(s, 60);
                    const offsetDays = Math.max(0, diffDays(start, s));
                    const duration = Math.max(1, diffDays(s, e) + 1);
                    const left = offsetDays * dayW;
                    const width = duration * dayW;
                    const isTermine = c.statut === 'termine';
                    const today = new Date();
                    const isEnCours = today >= s && today <= e && !isTermine;
                    const color = c.couleur || (isTermine ? '#8C8077' : '#C9A96E');

                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => { onClose(); setTimeout(() => router.push('/(tabs)/chantiers' as any), 200); }}
                        style={[styles.ganttRow, idx % 2 === 0 && { backgroundColor: '#FAF7F3' }]}
                      >
                        <View style={{ width: labelColW, padding: 8, justifyContent: 'center' }}>
                          <Text style={styles.chantierName} numberOfLines={1}>{c.nom}</Text>
                          <Text style={styles.chantierMeta} numberOfLines={1}>
                            {c.ville || c.adresse?.slice(0, 20) || '—'}
                          </Text>
                        </View>
                        <View style={{ width: totalWeeks * weekW, height: 48, position: 'relative' }}>
                          <View
                            style={[
                              styles.ganttBar,
                              {
                                left,
                                width,
                                backgroundColor: isEnCours ? color : isTermine ? '#E8DDD0' : '#F5EDE3',
                                borderColor: color,
                              },
                            ]}
                          >
                            <Text style={[styles.ganttBarText, { color: isEnCours ? '#fff' : '#2C2C2C' }]} numberOfLines={1}>
                              {isTermine ? '✓ Clôturé' : isEnCours ? '🔨 En cours' : '📅 Planifié'}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}

                  {/* Ligne aujourd'hui */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: labelColW + todayOffsetPx,
                      width: 2,
                      backgroundColor: '#E74C3C',
                    }}
                  />
                </View>
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#E8DDD0',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#2C2C2C' },
  closeBtn: { width: 32, height: 32, backgroundColor: '#F5EDE3', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { backgroundColor: '#F5EDE3', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' },
  filterBtnText: { fontSize: 11, fontWeight: '700', color: '#2C2C2C' },
  info: { fontSize: 11, color: '#8C8077', marginTop: 6 },
  headerChantierCol: { fontSize: 11, color: '#C9A96E', fontWeight: '800', textTransform: 'uppercase' },
  weekHeader: {
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
  },
  weekHeaderText: { fontSize: 10, fontWeight: '700', color: '#C9A96E' },
  monthLabel: { fontSize: 9, color: '#fff', textTransform: 'uppercase', fontWeight: '800' },
  ganttRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E8DDD0',
  },
  chantierName: { fontSize: 12, fontWeight: '800', color: '#2C2C2C' },
  chantierMeta: { fontSize: 10, color: '#8C8077', marginTop: 2 },
  ganttBar: {
    position: 'absolute', top: 8, bottom: 8,
    borderWidth: 2, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  ganttBarText: { fontSize: 10, fontWeight: '800' },
});
