/**
 * OrdreChantiersModal — « Ordre des chantiers » (admin).
 *
 * Un seul ordre, partagé par le Planning et l'onglet Chantiers :
 *  - mode « Le mien » : rangement à la main (flèches ↑ ↓, appui long = tout en haut / tout en bas)
 *  - modes « Nom » / « Date de fin » : tri automatique, flèches désactivées.
 *
 * Fonctionne sur iPhone, Mac, PC et Android (aucune dépendance ajoutée, pas de glisser-déposer).
 */
import React, { useMemo } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ChevronUp, ChevronDown, X } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, shadows, font } from '@/constants/design';
import { ChantierTri, CHANTIER_TRI_LABELS, trierChantiers, deplacerChantier } from '@/lib/chantierOrder';

const TRIS: ChantierTri[] = ['manuel', 'nom', 'dateFin'];

export interface OrdreChantiersModalProps {
  visible: boolean;
  onClose: () => void;
}

export function OrdreChantiersModal({ visible, onClose }: OrdreChantiersModalProps) {
  const { data, updateChantierOrderPlanning, updateChantierTri } = useApp();
  const tri: ChantierTri = data.chantierTri || 'manuel';

  // Tous les chantiers sauf les archivés : l'ordre sert aux deux écrans.
  const liste = useMemo(() => {
    const actifs = (data.chantiers || []).filter(c => c.statut !== 'archive');
    return trierChantiers(actifs, data.chantierOrderPlanning, tri);
  }, [data.chantiers, data.chantierOrderPlanning, tri]);

  const deplacer = (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const nouveau = deplacerChantier(id, direction, liste);
    // On conserve à la suite les chantiers absents de la liste affichée (archivés).
    const restants = (data.chantierOrderPlanning || []).filter(x => !nouveau.includes(x));
    updateChantierOrderPlanning([...nouveau, ...restants]);
  };

  const manuel = tri === 'manuel';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Ordre des chantiers</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Fermer">
              <X size={18} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <Text style={styles.intro}>
            Cet ordre s'applique au Planning comme à la liste des chantiers.
          </Text>

          <View style={styles.segment}>
            {TRIS.map(mode => (
              <Pressable
                key={mode}
                style={[styles.segmentBtn, tri === mode && styles.segmentBtnOn]}
                onPress={() => updateChantierTri(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: tri === mode }}
              >
                <Text style={[styles.segmentText, tri === mode && styles.segmentTextOn]} numberOfLines={1}>
                  {CHANTIER_TRI_LABELS[mode]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.hint}>
            {manuel
              ? 'Flèches pour déplacer. Appui long sur une flèche : tout en haut ou tout en bas.'
              : 'Tri automatique. Repasse sur « Le mien » pour ranger à la main.'}
          </Text>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            <View style={styles.listCard}>
              {liste.map((c, i) => (
                <View key={c.id} style={styles.row}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <View style={[styles.dot, { backgroundColor: c.couleur || DS.primary }]} />
                  <View style={[styles.rowInner, i < liste.length - 1 && styles.separator]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nom} numberOfLines={1}>{c.nom}</Text>
                      {!c.visibleSurPlanning && <Text style={styles.sub}>Masqué sur le planning</Text>}
                    </View>
                    <Pressable
                      disabled={!manuel || i === 0}
                      onPress={() => deplacer(c.id, 'up')}
                      onLongPress={() => deplacer(c.id, 'top')}
                      hitSlop={6}
                      accessibilityLabel={`Monter ${c.nom}`}
                      style={[styles.arrow, (!manuel || i === 0) && styles.arrowOff]}
                    >
                      <ChevronUp size={18} color={!manuel || i === 0 ? DS.textSecondary : DS.primary} strokeWidth={2.2} />
                    </Pressable>
                    <Pressable
                      disabled={!manuel || i === liste.length - 1}
                      onPress={() => deplacer(c.id, 'down')}
                      onLongPress={() => deplacer(c.id, 'bottom')}
                      hitSlop={6}
                      accessibilityLabel={`Descendre ${c.nom}`}
                      style={[styles.arrow, (!manuel || i === liste.length - 1) && styles.arrowOff]}
                    >
                      <ChevronDown size={18} color={!manuel || i === liste.length - 1 ? DS.textSecondary : DS.primary} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                </View>
              ))}
              {liste.length === 0 && <Text style={styles.empty}>Aucun chantier à ranger.</Text>}
            </View>
          </ScrollView>

          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>Terminé</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(43,29,20,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: DS.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, maxHeight: '90%', gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontFamily: 'Fraunces_600SemiBold', fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: DS.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: 13, color: DS.textSecondary, marginTop: -4 },
  segment: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: radius.full, backgroundColor: DS.segment },
  segmentBtn: { flex: 1, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentBtnOn: { backgroundColor: DS.surface, ...shadows.sm },
  segmentText: { fontSize: 13, fontWeight: font.medium, color: DS.text },
  segmentTextOn: { fontWeight: font.semibold, color: DS.primary },
  hint: { fontSize: 12, color: DS.textSecondary, paddingHorizontal: 4 },
  listCard: { backgroundColor: DS.surface, borderRadius: radius.xl, ...shadows.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingLeft: 12 },
  rank: { width: 20, fontSize: 13, fontWeight: font.semibold, color: DS.textSecondary, textAlign: 'right' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  rowInner: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10, paddingVertical: 8 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.border },
  nom: { fontSize: 15.5, color: DS.text },
  sub: { fontSize: 11.5, color: DS.textSecondary, marginTop: 1 },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { backgroundColor: DS.segment, opacity: 0.5 },
  empty: { fontSize: 14, color: DS.textSecondary, textAlign: 'center', padding: 20 },
  doneBtn: { height: 50, borderRadius: radius.full, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 16, fontWeight: font.semibold, color: DS.textInverse },
});
