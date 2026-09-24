import React, { useMemo } from 'react';
import { View, Text, ScrollView, Modal, StyleSheet } from 'react-native';
import { CheckSquare } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateFR } from '@/lib/date/format';

/**
 * NotesJourPanel — notes du jour (consignes) des employés sur un chantier,
 * en lecture seule pour le portail (commerciaux). Portail = français uniquement.
 */
export interface NotesJourPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

export function NotesJourPanel({ visible, onClose, chantierId }: NotesJourPanelProps) {
  const { data } = useApp();
  const chantierNom = useMemo(() => data.chantiers.find(c => c.id === chantierId)?.nom ?? '', [data.chantiers, chantierId]);

  const notes = useMemo(
    () => data.affectations
      .filter(a => a.chantierId === chantierId)
      .flatMap(a => (a.notes || [])
        .filter(n => !!n.texte?.trim() || !!(n.tasks && n.tasks.length > 0))
        .map(n => ({
          ...n,
          employeNom: data.employes.find(e => e.id === a.employeId)?.prenom || '',
          tri: n.date || n.createdAt || '',
        })))
      .sort((a, b) => b.tri.localeCompare(a.tri)),
    [data.affectations, data.employes, chantierId],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <PanelHeader title="Notes du jour" sub={chantierNom} onClose={onClose} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {notes.length === 0 ? (
            <EmptyState iconComponent={CheckSquare} title="Aucune note" description="Les consignes données aux équipes sur ce chantier apparaîtront ici." />
          ) : notes.map(n => {
            const nbFaites = (n.tasks || []).filter(t => t.fait).length;
            const nbTotal = (n.tasks || []).length;
            return (
              <View key={n.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.date}>{n.date ? formatDateFR(n.date) : ''}</Text>
                  {n.employeNom ? <Text style={styles.emp}>→ {n.employeNom}</Text> : null}
                  {n.auteurNom ? <Text style={styles.by}>par {n.auteurNom}</Text> : null}
                </View>
                {n.texte ? <Text style={styles.texte}>{n.texte}</Text> : null}
                {nbTotal > 0 && (
                  <View style={{ marginTop: 6, gap: 4 }}>
                    {(n.tasks || []).map(t => (
                      <Text key={t.id} style={[styles.task, t.fait && styles.taskDone]}>{t.fait ? '☑' : '☐'} {t.texte}</Text>
                    ))}
                    <Text style={[styles.progress, nbFaites === nbTotal && { color: '#2E7D32' }]}>{nbFaites}/{nbTotal} tâches</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.cremeFond },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: DS.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  date: { fontSize: font.compact, fontWeight: font.semibold, color: DS.primary },
  emp: { fontSize: font.compact, color: DS.textSecondary },
  by: { fontSize: 11, color: '#9A8C80' },
  texte: { fontSize: 14, color: DS.text, lineHeight: 20 },
  task: { fontSize: 13.5, color: DS.text },
  taskDone: { color: DS.textSecondary, textDecorationLine: 'line-through' },
  progress: { fontSize: 12, color: DS.textSecondary, marginTop: 2 },
});
