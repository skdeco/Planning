/**
 * Tableau de bord admin : chiffres clés financiers et opérationnels.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { GanttGlobal } from '@/components/GanttGlobal';
import { PenLine, HardHat, Wallet, Hourglass, CalendarDays } from 'lucide-react-native';

// Séparateur de milliers fait à la main : toLocaleString ne groupe pas sur iPhone (Hermes).
function fmt(n: number) {
  const v = Math.round(n || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return v < 0 ? `-${s}` : s;
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
    const chantiersActifs = chantiers.filter(c => c.statut !== 'termine' && c.statut !== 'archive');
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

  const KpiCard = ({ label, value, color, icon: Icon, onPress }: { label: string; value: string; color: string; icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; onPress?: () => void }) => {
    const Comp: any = onPress ? Pressable : View;
    return (
      <Comp onPress={onPress} style={styles.kpiCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <View style={[styles.kpiIconWrap, { backgroundColor: color + '1A' }]}><Icon size={15} color={color} strokeWidth={2} /></View>
          <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={[styles.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      </Comp>
    );
  };

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 6 }}>
        <Text style={styles.title}>Tableau de bord</Text>
        <Pressable onPress={() => setShowGantt(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EBEBE8', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
          <CalendarDays size={14} color="#141414" strokeWidth={2} />
          <Text style={{ color: '#141414', fontSize: 13, fontWeight: '600' }}>Gantt</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <KpiCard label="CA signé HT" value={`${fmt(stats.caTotalHT)} €`} color="#141414" icon={PenLine} />
        <KpiCard label="En cours TTC" value={`${fmt(stats.caEnCoursTTC)} €`} color="#141414" icon={HardHat} />
        <KpiCard label="Encaissé" value={`${fmt(stats.caEncaisse)} €`} color="#2E7D32" icon={Wallet} />
        <KpiCard label="À encaisser" value={`${fmt(stats.caARecevoir)} €`} color="#141414" icon={Hourglass} />
      </View>

      <GanttGlobal visible={showGantt} onClose={() => setShowGantt(false)} />

      {stats.retardsPaiement.length > 0 && (
        <View style={styles.retardsBox}>
          <Text style={styles.retardsTitle}>{stats.retardsPaiement.length} situation{stats.retardsPaiement.length > 1 ? 's' : ''} en attente &gt; 30j
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
  title: { fontSize: 13, fontWeight: '600', color: '#6A6A68', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    flexBasis: '47%',
    flexGrow: 1,
    shadowColor: '#141414', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  kpiIconWrap: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  kpiLabel: { flex: 1, fontSize: 13, color: '#6A6A68', fontWeight: '500' },
  kpiValue: { fontFamily: 'Manrope_500Medium', fontSize: 22 },
  retardsBox: {
    backgroundColor: '#FBEFEC',
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  retardsTitle: { fontSize: 12, fontWeight: '800', color: '#B83A2E', marginBottom: 6 },
  retardRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3,
  },
  retardChantier: { flex: 1, fontSize: 11, color: '#141414', fontWeight: '600' },
  retardMontant: { fontSize: 11, color: '#B83A2E', fontWeight: '800' },
  retardMore: { fontSize: 10, color: '#6A6A68', fontStyle: 'italic', marginTop: 4 },
});
