import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { X, Lock } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * JournalPanel — historique horodaté des actions du chantier (lecture seule).
 * S'appuie sur `activityLog` filtré par chantier. Traçabilité. Palette V10.
 */
export interface JournalPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${jj}.${mm} · ${hh}:${mi}`;
}

export function JournalPanel({ visible, onClose, chantierId }: JournalPanelProps) {
  const { data } = useApp();
  const chantierNom = useMemo(() => data.chantiers.find(c => c.id === chantierId)?.nom ?? '', [data.chantiers, chantierId]);

  const entries = useMemo(
    () => (data.activityLog || [])
      .filter(a => a.targetId === chantierId)
      .slice()
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [data.activityLog, chantierId],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Journal</Text>
            {chantierNom ? <Text style={styles.hSub}>{chantierNom}</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {entries.length === 0 ? (
            <EmptyState iconComponent={Lock} title="Journal vide" description="Les actions (validations, publications, situations…) apparaîtront ici, horodatées." />
          ) : (
            <>
              <View style={styles.journal}>
                {entries.map((e, i) => (
                  <View key={e.id} style={[styles.line, i === entries.length - 1 && styles.lineLast]}>
                    <View style={styles.dot} />
                    <Text style={styles.date}>{fmtDate(e.timestamp)}</Text>
                    <Text style={styles.what}>{e.description}</Text>
                    {e.userName ? <Text style={styles.by}>{e.userName}</Text> : null}
                  </View>
                ))}
              </View>
              <View style={styles.foot}>
                <Lock size={14} color={DS.marron} />
                <Text style={styles.footText}>Historique horodaté — traçabilité des actions du chantier.</Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.cremeFond },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingTop: space.xxxl, paddingBottom: space.md },
  hTitle: { fontSize: font.xl, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  hSub: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  journal: { paddingLeft: space.xs },
  line: { position: 'relative', paddingLeft: space.lg, paddingBottom: space.lg, borderLeftWidth: 2, borderLeftColor: DS.border, marginLeft: space.xs },
  lineLast: { borderLeftColor: 'transparent', paddingBottom: 0 },
  dot: { position: 'absolute', left: -7, top: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: DS.bordeaux, borderWidth: 2, borderColor: DS.cremeFond },
  date: { fontSize: font.tiny, fontWeight: font.bold, letterSpacing: 0.4, textTransform: 'uppercase', color: DS.textSecondary },
  what: { fontSize: font.body, fontWeight: font.semibold, color: DS.sombre, marginTop: 3 },
  by: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron, marginTop: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: space.md },
  footText: { flex: 1, fontSize: font.compact, fontWeight: font.medium, color: DS.marron },
});
