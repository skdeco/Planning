import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import { canVoirOnglet } from '@/lib/portail/permissions';
import { getChantierLots } from '@/lib/chantier/getChantierLots';

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
function computeLotPlanning(chantier: Chantier, allLots: NonNullable<Chantier['avancementCorps']>): Array<{ id: string; nom: string; start: string; end: string; montant: number; manuel: boolean }> {
  const lots = allLots.filter(l => l.nom);
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
      // Opt-in client (aligné sur PortailClient.peutVoirPlanning) : masqué tant que
      // l'admin n'a pas activé afficherPlanningAuClient (undefined = masqué).
      if (estClient && c.afficherPlanningAuClient !== true) return false;
      // Respecte l'autorisation portail "planning" (comme PortailClient) : l'admin
      // peut masquer le planning à un intervenant via override.
      if (!canVoirOnglet('planning', apporteur, c, false)) return false;
      return true;
    });
  }, [data.chantiers, data.apporteurs, apporteurId]);

  // Par défaut, premier chantier
  const selectedChantier = useMemo(() => {
    if (selectedChantierId) return mesChantiers.find(c => c.id === selectedChantierId) || null;
    return mesChantiers[0] || null;
  }, [mesChantiers, selectedChantierId]);

  const lotPlanning = useMemo(() => {
    return selectedChantier ? computeLotPlanning(selectedChantier, getChantierLots(selectedChantier, data.marchesChantier, data.supplementsMarche)) : [];
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
      <ScrollView style={{ flex: 1, backgroundColor: '#FAF5EF' }} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Aucun chantier dans votre planning.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FAF5EF' }}>
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
                    <View key={l.id} style={[styles.ganttRow, idx % 2 === 0 && { backgroundColor: '#FAF5EF' }]}>
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
                              backgroundColor: isEnCours ? '#5C1F2E' : '#EDE2D6',
                              borderColor: isEnCours ? '#5C1F2E' : '#5C1F2E',
                            },
                          ]}
                        >
                          <Text style={[styles.ganttBarText, { color: isEnCours ? '#fff' : '#5C1F2E' }]} numberOfLines={1}>
                            {isEnCours ? 'En cours' : l.manuel ? 'Planifié' : '~ Prévu'}
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
            <Text style={styles.equipeTitle}>Jours avec équipe sur place</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {Array.from(joursAvecEquipe).sort().slice(0, 30).map(d => (
                <View key={d} style={styles.equipeChip}>
                  <Text style={styles.equipeChipText}>{new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</Text>
                </View>
              ))}
              {joursAvecEquipe.size > 30 && (
                <Text style={{ fontSize: 12.5, color: '#6E5F54', alignSelf: 'center' }}>+ {joursAvecEquipe.size - 30} autres</Text>
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
    maxHeight: 56, backgroundColor: 'transparent', flexGrow: 0,
  },
  chantierChip: {
    paddingHorizontal: 16, height: 36, justifyContent: 'center', borderRadius: 999,
    backgroundColor: '#FFFFFF', shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  chantierChipActive: {
    backgroundColor: '#5C1F2E',
  },
  chantierChipText: { fontSize: 13.5, fontWeight: '500', color: '#2B1D14' },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: '#2B1D14', marginBottom: 2 },
  subtitle: { fontSize: 13.5, color: '#6E5F54', marginBottom: 16 },
  weekHeader: {
    borderWidth: 1, borderColor: '#EDE2D6', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
  },
  weekHeaderText: { fontSize: 12.5, fontWeight: '600', color: '#6E5F54' },
  ganttRow: {
    flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#EDE2D6',
  },
  lotLabel: { fontSize: 13.5, fontWeight: '600', color: '#2B1D14' },
  prorataTag: { fontSize: 11, color: '#9A8C80' },
  ganttBar: {
    position: 'absolute', top: 6, bottom: 6,
    borderWidth: 1, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  ganttBarText: { fontSize: 12.5, fontWeight: '700' },
  equipeBox: {
    marginTop: 24, padding: 16, backgroundColor: '#fff', borderRadius: 24,
    shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2,
  },
  equipeTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: '#6E5F54' },
  equipeChip: {
    backgroundColor: '#F1E7DC', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  equipeChipText: { fontSize: 13, fontWeight: '500', color: '#2B1D14' },
  emptyBox: {
    padding: 32, backgroundColor: '#fff', borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 14, color: '#6E5F54', textAlign: 'center' },
  legendBox: {
    marginTop: 20, padding: 14, backgroundColor: '#F1E7DC', borderRadius: 18,
  },
  legendTitle: { fontSize: 13, fontWeight: '600', color: '#2B1D14', marginBottom: 4 },
  legendText: { fontSize: 13, color: '#6E5F54', lineHeight: 18 },
});
