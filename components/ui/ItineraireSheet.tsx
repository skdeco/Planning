/**
 * ItineraireSheet — choix de l'application de navigation pour « Y aller ».
 * Waze et Google Maps pour la voiture, Plans sur iPhone, et l'itinéraire
 * en transports en commun. Même fenêtre sur téléphone et sur ordinateur.
 */
import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Platform } from 'react-native';
import { Navigation, Map, Bus, X } from 'lucide-react-native';
import { useLanguage } from '@/app/context/LanguageContext';
import { DS, radius, shadows, font } from '@/constants/design';
import { ouvrirWaze, ouvrirPlans, ouvrirGoogleMaps, ouvrirItineraireTransports } from '@/lib/ouvrirCarte';

export interface ItineraireSheetProps {
  /** Adresse de destination ; la fenêtre est ouverte tant qu'elle n'est pas nulle. */
  adresse: string | null;
  onClose: () => void;
}

export function ItineraireSheet({ adresse, onClose }: ItineraireSheetProps) {
  const { t } = useLanguage();
  if (!adresse) return null;

  const choix: { cle: string; libelle: string; icone: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; action: () => void }[] = [
    { cle: 'waze', libelle: 'Waze', icone: Navigation, action: () => ouvrirWaze(adresse) },
    { cle: 'gmaps', libelle: 'Google Maps', icone: Map, action: () => ouvrirGoogleMaps(adresse) },
    ...(Platform.OS === 'ios'
      ? [{ cle: 'plans', libelle: 'Plans', icone: Map, action: () => ouvrirPlans(adresse) }]
      : []),
    { cle: 'transit', libelle: t.ui.itineraireTransports, icone: Bus, action: () => ouvrirItineraireTransports(adresse) },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>{t.ui.yAllerTitre}</Text>
              <Text style={styles.adresse} numberOfLines={2}>{adresse}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel={t.common.close}>
              <X size={18} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.listCard}>
            {choix.map((c, i) => {
              const Icone = c.icone;
              return (
                <Pressable
                  key={c.cle}
                  style={styles.row}
                  onPress={() => { c.action(); onClose(); }}
                >
                  <View style={styles.rowIcon}><Icone size={18} color={DS.primary} strokeWidth={1.9} /></View>
                  <View style={[styles.rowInner, i < choix.length - 1 && styles.separator]}>
                    <Text style={styles.rowText}>{c.libelle}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(20,20,20,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: DS.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titre: { fontFamily: 'Manrope_500Medium', fontSize: 22, lineHeight: 28, color: DS.text },
  adresse: { fontSize: 13.5, color: DS.textSecondary, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  listCard: { backgroundColor: DS.surface, borderRadius: radius.xl, ...shadows.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingLeft: 14 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  rowInner: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', paddingRight: 14 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.border },
  rowText: { flex: 1, fontSize: 16, fontWeight: font.medium, color: DS.text },
});
