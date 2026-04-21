/**
 * Tableau de bord admin : chiffres clés financiers et opérationnels.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { GanttGlobal } from '@/components/GanttGlobal';

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function DashboardKPI() {
  const { data } = useApp();
  const router = useRouter();
  const [showGantt, setShowGantt] = useState(false);

  const stats = useMemo(() => {
    const chantiers = data.chantiers || [];
    const marches = data.marchesChantier || [];
    const supps = (data.supplementsMarche || []).filter(s => s.statut === 'accepte');
    const chantiersActifs = chantiers.filter(c => c.statut !== 'termine');
    const chantiersActifsIds = new Set(chantiersActifs.map(c => c.id));

    // CA total signé
    let caTotalHT = 0, caTotalTTC = 0;
    let caEncaisse = 0;
    let caEnCoursHT = 0, caEnCoursTTC = 0;
    let caEnCoursEncaisse = 0;
    let retardsPaiement: { chantierNom: string; chantierId: string; montant: number; jours: number }[] = [];

    marches.forEach(m => {
      caTotalHT += m.montantHT;
      caTotalTTC += m.montantTTC;
      if (chantiersActifsIds.has(m.chantierId)) {
        caEnCoursHT += m.montantHT;
        caEnCoursTTC += m.montantTTC;
      }
      const paye = (m.paiements || []).reduce((s, p) => s + p.montant, 0);
      caEncaisse += paye;
      if (chantiersActifsIds.has(m.chantierId)) caEnCoursEncaisse += paye;
    });
    supps.forEach(s => {
      caTotalHT += s.montantHT;
      caTotalTTC += s.montantTTC;
      if (chantiersActifsIds.has(s.chantierId)) {
        caEnCoursHT += s.montantHT;
        caEnCoursTTC += s.montantTTC;
      }
      const paye = (s.paiements || []).reduce((sum, p) => sum + p.montant, 0);
      caEncaisse += paye;
      if (chantiersActifsIds.has(s.chantierId)) caEnCoursEncaisse += paye;
    });

    // Points financiers de situation : en attente depuis >30j
    chantiers.forEach(c => {
      const sits = c.situationsHistorique || [];
      sits.filter(s => s.statut === 'en_attente').forEach(s => {
        const j = daysSince(s.date);
        if (j >= 30) {
          retardsPaiement.push({
            chantierNom: c.nom,
            chantierId: c.id,
            montant: s.montantSituation,
            jours: j,
          });
        }
      });
    });

    const caARecevoir = Math.max(0, caTotalTTC - caEncaisse);

    return {
      chantiersActifs: chantiersActifs.length,
      caTotalHT,
      caTotalTTC,
      caEnCoursHT,
      caEnCoursTTC,
      caEncaisse,
      caARecevoir,
      retardsPaiement,
    };
  }, [data.chantiers, data.marchesChantier, data.supplementsMarche]);

  const KpiCard = ({ label, value, color, icon, onPress }: { label: string; value: string; color: string; icon: string; onPress?: () => void }) => {
    const Comp: any = onPress ? Pressable : View;
    return (
      <Comp onPress={onPress} style={[styles.kpiCard, { borderLeftColor: color }]}>
        <Text style={styles.kpiIcon}>{icon}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      </Comp>
    );
  };

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={styles.title}>📊 Tableau de bord</Text>
        <Pressable onPress={() => setShowGantt(true)} style={{ backgroundColor: '#2C2C2C', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: '#C9A96E', fontSize: 11, fontWeight: '800' }}>📅 Planning Gantt</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
        <KpiCard
          label="Chantiers actifs"
          value={String(stats.chantiersActifs)}
          color="#C9A96E"
          icon="🏗️"
          onPress={() => router.push('/(tabs)/chantiers' as any)}
        />
        <KpiCard
          label="CA signé HT"
          value={`${fmt(stats.caTotalHT)} €`}
          color="#2C2C2C"
          icon="✍️"
        />
        <KpiCard
          label="En cours TTC"
          value={`${fmt(stats.caEnCoursTTC)} €`}
          color="#8C6D2F"
          icon="🚧"
        />
        <KpiCard
          label="Encaissé"
          value={`${fmt(stats.caEncaisse)} €`}
          color="#2E7D32"
          icon="💰"
        />
        <KpiCard
          label="À encaisser"
          value={`${fmt(stats.caARecevoir)} €`}
          color="#8C6D2F"
          icon="⏳"
        />
      </ScrollView>

      <GanttGlobal visible={showGantt} onClose={() => setShowGantt(false)} />

      {stats.retardsPaiement.length > 0 && (
        <View style={styles.retardsBox}>
          <Text style={styles.retardsTitle}>
            🔴 {stats.retardsPaiement.length} situation{stats.retardsPaiement.length > 1 ? 's' : ''} en attente &gt; 30j
          </Text>
          {stats.retardsPaiement.slice(0, 3).map((r, i) => (
            <View key={i} style={styles.retardRow}>
              <Text style={styles.retardChantier} numberOfLines={1}>{r.chantierNom}</Text>
              <Text style={styles.retardMontant}>{fmt(r.montant)} € · {r.jours}j</Text>
            </View>
          ))}
          {stats.retardsPaiement.length > 3 && (
            <Text style={styles.retardMore}>+ {stats.retardsPaiement.length - 3} autres</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: { fontSize: 14, fontWeight: '800', color: '#2C2C2C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiCard: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiIcon: { fontSize: 18, marginBottom: 6 },
  kpiLabel: { fontSize: 11, color: '#8C8077', fontWeight: '600', textTransform: 'uppercase' },
  kpiValue: { fontSize: 17, fontWeight: '800', marginTop: 4 },
  retardsBox: {
    backgroundColor: '#FBEFEC',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#B83A2E',
  },
  retardsTitle: { fontSize: 12, fontWeight: '800', color: '#B83A2E', marginBottom: 6 },
  retardRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3,
  },
  retardChantier: { flex: 1, fontSize: 11, color: '#2C2C2C', fontWeight: '600' },
  retardMontant: { fontSize: 11, color: '#B83A2E', fontWeight: '800' },
  retardMore: { fontSize: 10, color: '#8C8077', fontStyle: 'italic', marginTop: 4 },
});
