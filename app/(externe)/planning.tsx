import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useApp } from '@/app/context/AppContext';

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function parseISO(s: string): Date {
  return new Date(s + (s.length === 10 ? 'T12:00:00' : ''));
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isWithin(day: string, start: string, end: string) {
  return day >= start && day <= end;
}
function formatJour(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export default function PlanningExterne() {
  const { data, currentUser } = useApp();
  const apporteurId = currentUser?.apporteurId;
  const [offset, setOffset] = useState(0); // décalage en semaines

  // Semaine affichée (lundi → dimanche)
  const { lundi, dimanche, jours } = useMemo(() => {
    const today = new Date();
    const dow = today.getDay() === 0 ? 7 : today.getDay();
    const start = addDays(today, -(dow - 1) + offset * 7);
    const end = addDays(start, 6);
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) arr.push(addDays(start, i));
    return { lundi: start, dimanche: end, jours: arr };
  }, [offset]);

  // Chantiers visibles pour cet apporteur
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
      // Si client : masqué par défaut sauf si admin a activé afficherPlanningAuClient
      if (estClient && c.afficherPlanningAuClient === false) return false;
      return true;
    });
  }, [data.chantiers, data.apporteurs, apporteurId]);

  // Pour chaque jour : nb total d'employés/ST affectés sur mes chantiers + lots en cours ce jour
  const joursData = useMemo(() => {
    return jours.map(d => {
      const dayIso = iso(d);
      const chantiersActifsAujourdhui: { chantier: typeof mesChantiers[number]; nbPersonnes: number; lotsJour: string[] }[] = [];
      for (const c of mesChantiers) {
        // Affectations ce jour sur ce chantier
        const aff = data.affectations.filter(
          a => a.chantierId === c.id && isWithin(dayIso, a.dateDebut, a.dateFin)
        );
        const nbPersonnes = aff.length;
        // Lots prévus ce jour
        const lotsJour = (c.avancementCorps || [])
          .filter(l =>
            l.enCours ||
            (l.dateDebutPrevue && l.dateFinPrevue && isWithin(dayIso, l.dateDebutPrevue, l.dateFinPrevue))
          )
          .map(l => l.nom);
        if (nbPersonnes > 0 || lotsJour.length > 0) {
          chantiersActifsAujourdhui.push({ chantier: c, nbPersonnes, lotsJour });
        }
      }
      return { date: d, chantiers: chantiersActifsAujourdhui };
    });
  }, [jours, mesChantiers, data.affectations]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F5EDE3' }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      {/* Navigation semaine */}
      <View style={styles.navRow}>
        <Pressable onPress={() => setOffset(o => o - 1)} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹ Sem. préc.</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.weekTitle}>
            Du {lundi.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} au {dimanche.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </Text>
          {offset !== 0 && (
            <Pressable onPress={() => setOffset(0)} style={{ marginTop: 4 }}>
              <Text style={styles.todayLink}>Revenir à cette semaine</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setOffset(o => o + 1)} style={styles.navBtn}>
          <Text style={styles.navBtnText}>Sem. suiv. ›</Text>
        </Pressable>
      </View>

      {mesChantiers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Aucun chantier visible dans votre planning.</Text>
        </View>
      ) : (
        joursData.map((jd, idx) => {
          const isToday = iso(jd.date) === iso(new Date());
          const hasActivity = jd.chantiers.length > 0;
          return (
            <View key={idx} style={[styles.dayRow, isToday && styles.dayRowToday]}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayLabel, isToday && { color: '#8C6D2F' }]}>
                  {formatJour(jd.date)}{isToday ? ' · Aujourd\'hui' : ''}
                </Text>
                {!hasActivity && (
                  <Text style={styles.noActivity}>Aucune activité prévue</Text>
                )}
              </View>
              {jd.chantiers.map((cc, i) => (
                <View key={i} style={styles.chantierBox}>
                  <Text style={styles.chantierName}>🏗️ {cc.chantier.nom}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                    {cc.nbPersonnes > 0 && (
                      <View style={styles.presenceBadge}>
                        <Text style={styles.presenceBadgeText}>
                          👷 Équipe sur place ({cc.nbPersonnes})
                        </Text>
                      </View>
                    )}
                    {cc.nbPersonnes === 0 && cc.lotsJour.length > 0 && (
                      <View style={[styles.presenceBadge, { backgroundColor: '#E8DDD0' }]}>
                        <Text style={[styles.presenceBadgeText, { color: '#8C8077' }]}>📅 Planifié</Text>
                      </View>
                    )}
                  </View>
                  {cc.lotsJour.length > 0 && (
                    <Text style={styles.lotsJour}>🔨 {cc.lotsJour.join(' · ')}</Text>
                  )}
                </View>
              ))}
            </View>
          );
        })
      )}

      <View style={styles.legendBox}>
        <Text style={styles.legendTitle}>ℹ️ À propos de ce planning</Text>
        <Text style={styles.legendText}>
          Les journées d'activité indiquent la présence d'équipes SK DECO sur place et les lots planifiés ou en cours. Les détails des intervenants ne sont pas communiqués.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  navBtn: {
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#E8DDD0',
  },
  navBtnText: { fontSize: 12, fontWeight: '700', color: '#2C2C2C' },
  weekTitle: { fontSize: 13, fontWeight: '800', color: '#2C2C2C' },
  todayLink: { fontSize: 11, color: '#8C6D2F', textDecorationLine: 'underline' },
  dayRow: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#E8DDD0',
  },
  dayRowToday: {
    borderLeftColor: '#C9A96E', backgroundColor: '#FFFDF8',
  },
  dayHeader: { marginBottom: 6 },
  dayLabel: { fontSize: 13, fontWeight: '800', color: '#2C2C2C' },
  noActivity: { fontSize: 11, color: '#B0BEC5', fontStyle: 'italic', marginTop: 2 },
  chantierBox: {
    marginTop: 8, padding: 10, backgroundColor: '#FAF7F3', borderRadius: 8,
  },
  chantierName: { fontSize: 13, fontWeight: '700', color: '#2C2C2C' },
  presenceBadge: {
    backgroundColor: '#D4EDDA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  presenceBadgeText: { fontSize: 10, fontWeight: '800', color: '#155724' },
  lotsJour: { fontSize: 11, color: '#8C6D2F', marginTop: 4, fontWeight: '600' },
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
