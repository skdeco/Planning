import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function parseISO(s: string): Date { return new Date(s + (s.length === 10 ? 'T12:00:00' : '')); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Calcule les plages prévues pour chaque lot :
 * - Si le lot a dateDebutPrevue ET dateFinPrevue → on garde.
 * - Sinon : on répartit au prorata des montants HT sur la durée du chantier.
 */
function computeLotPlanning(chantier: Chantier): Array<{ id: string; nom: string; start: string; end: string; montant: number; manuel: boolean }> {
  const lots = (chantier.avancementCorps || []).filter(l => l.nom);
  if (lots.length === 0) return [];

  // Durée : fenêtre du chantier
  const chantierStart = chantier.dateDebut ? parseISO(chantier.dateDebut) : new Date();
  const chantierEnd = chantier.dateFin ? parseISO(chantier.dateFin) : addDays(chantierStart, 180); // défaut 6 mois
  const totalDays = Math.max(1, diffDays(chantierStart, chantierEnd));

  // Montant total des lots sans dates
  const autoLots = lots.filter(l => !(l.dateDebutPrevue && l.dateFinPrevue));
  const totalHTAuto = autoLots.reduce((s, l) => s + (l.montant || 1), 0) || autoLots.length;

  let cursor = chantierStart;
  const result: ReturnType<typeof computeLotPlanning> = [];
  for (const l of lots) {
    if (l.dateDebutPrevue && l.dateFinPrevue) {
      result.push({ id: l.id, nom: l.nom, start: l.dateDebutPrevue, end: l.dateFinPrevue, montant: l.montant || 0, manuel: true });
    } else {
      const part = (l.montant || 1) / totalHTAuto;
      const durationDays = Math.max(1, Math.round(totalDays * part));
      const startD = new Date(cursor);
      const endD = addDays(startD, durationDays - 1);
      result.push({
        id: l.id,
        nom: l.nom,
        start: iso(startD),
        end: iso(endD),
        montant: l.montant || 0,
        manuel: false,
      });
      cursor = addDays(endD, 1);
    }
  }
  return result;
}

export default function PlanningExterne() {
  const { data, currentUser } = useApp();
  const apporteurId = currentUser?.apporteurId;
  const [selectedChantierId, setSelectedChantierId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const mesChantiers = useMemo(() => {
    if (!apporteurId) return [];
    const apporteur = (data.apporteurs || []).find(a => a.id === apporteurId);
    const estClient = apporteur?.type === 'client';
    return data.chantiers.filter(c => {
      const lie =
        c.clientApporteurId === apporteurId ||
        c.architecteId === apporteurId ||
        c.apporteurId === apporteurId ||
        c.contractantId === apporteurId;
      if (!lie) return false;
      if (estClient && c.afficherPlanningAuClient === false) return false;
      return true;
    });
  }, [data.chantiers, data.apporteurs, apporteurId]);

  // Par défaut, premier chantier
  const selectedChantier = useMemo(() => {
    if (selectedChantierId) return mesChantiers.find(c => c.id === selectedChantierId) || null;
    return mesChantiers[0] || null;
  }, [mesChantiers, selectedChantierId]);

  const lotPlanning = useMemo(() => {
    return selectedChantier ? computeLotPlanning(selectedChantier) : [];
  }, [selectedChantier]);

  // Fenêtre Gantt : englobe tous les lots + marge
  const ganttRange = useMemo(() => {
    if (lotPlanning.length === 0) {
      const today = new Date();
      return { start: today, end: addDays(today, 84) }; // 12 semaines
    }
    const starts = lotPlanning.map(l => parseISO(l.start));
    const ends = lotPlanning.map(l => parseISO(l.end));
    const minS = new Date(Math.min(...starts.map(d => d.getTime())));
    const maxE = new Date(Math.max(...ends.map(d => d.getTime())));
    // aligner au lundi
    const dowS = (minS.getDay() + 6) % 7;
    const start = addDays(minS, -dowS);
    const dowE = (maxE.getDay() + 6) % 7;
    const end = addDays(maxE, 6 - dowE);
    return { start, end };
  }, [lotPlanning]);

  // Calcul jours totaux + semaines affichées
  const totalDays = diffDays(ganttRange.start, ganttRange.end) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  const screenW = Math.min(Dimensions.get('window').width, 1400);
  const labelColW = 120;
  const availableW = screenW - 32 - labelColW;
  const weekW = Math.max(50, Math.min(90, Math.floor(availableW / Math.max(totalWeeks, 6))));
  const dayW = weekW / 7;

  // Marqueur "aujourd'hui"
  const today = new Date();
  const todayOffsetDays = Math.max(0, diffDays(ganttRange.start, today));
  const todayOffsetPx = todayOffsetDays * dayW;
  const todayInRange = today >= ganttRange.start && today <= ganttRange.end;

  // Jours avec équipe sur place (aff. employés) sur ce chantier
  const joursAvecEquipe = useMemo(() => {
    if (!selectedChantier) return new Set<string>();
    const set = new Set<string>();
    for (const a of data.affectations) {
      if (a.chantierId !== selectedChantier.id) continue;
      const s = a.dateDebut;
      const e = a.dateFin;
      if (!s || !e) continue;
      let d = parseISO(s);
      const fin = parseISO(e);
      while (d <= fin) {
        set.add(iso(d));
        d = addDays(d, 1);
      }
    }
    return set;
  }, [data.affectations, selectedChantier]);

  if (mesChantiers.length === 0) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#F5EDE3' }} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Aucun chantier dans votre planning.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5EDE3' }}>
      {/* Sélecteur de chantier */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chantierTabs} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 12 }}>
        {mesChantiers.map(c => (
          <Pressable
            key={c.id}
            onPress={() => setSelectedChantierId(c.id)}
            style={[styles.chantierChip, selectedChantier?.id === c.id && styles.chantierChipActive]}
          >
            <Text style={[styles.chantierChipText, selectedChantier?.id === c.id && { color: '#fff' }]}>
              {c.nom}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {selectedChantier && (
          <>
            <Text style={styles.title}>{selectedChantier.nom}</Text>
            <Text style={styles.subtitle}>
              {selectedChantier.dateDebut ? new Date(selectedChantier.dateDebut).toLocaleDateString('fr-FR') : '?'}
              {' → '}
              {selectedChantier.dateFin ? new Date(selectedChantier.dateFin).toLocaleDateString('fr-FR') : '?'}
            </Text>
          </>
        )}

        {lotPlanning.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Pas encore de lots définis sur ce chantier.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View>
              {/* En-tête semaines */}
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: labelColW }} />
                {Array.from({ length: totalWeeks }).map((_, wi) => {
                  const wStart = addDays(ganttRange.start, wi * 7);
                  return (
                    <View key={wi} style={[styles.weekHeader, { width: weekW }]}>
                      <Text style={styles.weekHeaderText}>
                        {wStart.getDate().toString().padStart(2, '0')}/{String(wStart.getMonth() + 1).padStart(2, '0')}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Lignes de lots */}
              <View style={{ position: 'relative' }}>
                {lotPlanning.map((l, idx) => {
                  const s = parseISO(l.start);
                  const e = parseISO(l.end);
                  const offsetDays = Math.max(0, diffDays(ganttRange.start, s));
                  const durationDays = diffDays(s, e) + 1;
                  const left = offsetDays * dayW;
                  const width = durationDays * dayW;
                  const isEnCours = today >= s && today <= e;
                  return (
                    <View key={l.id} style={[styles.ganttRow, idx % 2 === 0 && { backgroundColor: '#FAF7F3' }]}>
                      <View style={{ width: labelColW, paddingHorizontal: 8, justifyContent: 'center' }}>
                        <Text style={styles.lotLabel} numberOfLines={2}>{l.nom}</Text>
                        {!l.manuel && <Text style={styles.prorataTag}>prorata</Text>}
                      </View>
                      <View style={{ width: totalWeeks * weekW, height: 36, position: 'relative' }}>
                        <View
                          style={[
                            styles.ganttBar,
                            {
                              left,
                              width,
                              backgroundColor: isEnCours ? '#C9A96E' : '#E8DDD0',
                              borderColor: isEnCours ? '#8C6D2F' : '#C9A96E',
                            },
                          ]}
                        >
                          <Text style={[styles.ganttBarText, { color: isEnCours ? '#fff' : '#8C6D2F' }]} numberOfLines={1}>
                            {isEnCours ? '🔨 En cours' : l.manuel ? '📅 Planifié' : '~ Prévu'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Ligne "aujourd'hui" */}
                {todayInRange && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: labelColW + todayOffsetPx,
                      width: 2, backgroundColor: '#E74C3C',
                    }}
                  />
                )}
              </View>
            </View>
          </ScrollView>
        )}

        {/* Équipes sur place : indication jour par jour (sans nombre, sans noms) */}
        {selectedChantier && joursAvecEquipe.size > 0 && (
          <View style={styles.equipeBox}>
            <Text style={styles.equipeTitle}>👷 Jours avec équipe sur place</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {Array.from(joursAvecEquipe).sort().slice(0, 30).map(d => (
                <View key={d} style={styles.equipeChip}>
                  <Text style={styles.equipeChipText}>{new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</Text>
                </View>
              ))}
              {joursAvecEquipe.size > 30 && (
                <Text style={{ fontSize: 11, color: '#8C8077', alignSelf: 'center' }}>+ {joursAvecEquipe.size - 30} autres</Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.legendBox}>
          <Text style={styles.legendTitle}>ℹ️ Légende</Text>
          <Text style={styles.legendText}>
            Les lots avec "prorata" sont estimés automatiquement selon leur part du budget. Les lots "Planifié" ont des dates saisies par SK DECO.
            Le statut "En cours" est automatique quand la date du jour est dans la fenêtre.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chantierTabs: {
    maxHeight: 54, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8DDD0', flexGrow: 0,
  },
  chantierChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F5EDE3', borderWidth: 1, borderColor: '#E8DDD0',
  },
  chantierChipActive: {
    backgroundColor: '#2C2C2C', borderColor: '#2C2C2C',
  },
  chantierChipText: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  title: { fontSize: 17, fontWeight: '800', color: '#2C2C2C', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#8C8077', marginBottom: 16 },
  weekHeader: {
    borderWidth: 1, borderColor: '#E8DDD0', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
  },
  weekHeaderText: { fontSize: 10, fontWeight: '700', color: '#2C2C2C' },
  ganttRow: {
    flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#E8DDD0',
  },
  lotLabel: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  prorataTag: { fontSize: 9, color: '#8C8077', fontStyle: 'italic' },
  ganttBar: {
    position: 'absolute', top: 6, bottom: 6,
    borderWidth: 1, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  ganttBarText: { fontSize: 10, fontWeight: '800' },
  equipeBox: {
    marginTop: 24, padding: 12, backgroundColor: '#fff',
    borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#2E7D32',
  },
  equipeTitle: { fontSize: 12, fontWeight: '800', color: '#2C2C2C' },
  equipeChip: {
    backgroundColor: '#D4EDDA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  equipeChipText: { fontSize: 10, fontWeight: '700', color: '#155724' },
  emptyBox: {
    padding: 32, backgroundColor: '#fff', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 13, color: '#8C8077', textAlign: 'center' },
  legendBox: {
    marginTop: 20, padding: 12, backgroundColor: '#FAF7F3', borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: '#C9A96E',
  },
  legendTitle: { fontSize: 11, fontWeight: '800', color: '#8C6D2F', marginBottom: 4 },
  legendText: { fontSize: 11, color: '#687076', lineHeight: 16 },
});
