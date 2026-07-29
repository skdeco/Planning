/**
 * Hub "Gestion" (admin) — regroupe Reporting, RH et Société en un seul onglet
 * pour alléger la barre de navigation. Chaque carte ouvre l'écran dédié.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { ChartBar, Users, Building2, FolderOpen, ChevronRight, Store } from 'lucide-react-native';
import { useRefresh } from '@/hooks/useRefresh';
import { ScreenContainer } from '@/components/screen-container';
import { FournisseursManager } from '@/components/fournisseurs/FournisseursManager';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { DS, radius, space, font } from '@/constants/design';

interface HubCard {
  route: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  badge?: number;
}

export default function GestionScreen() {
  const { data, currentUser } = useApp();
  const { t } = useLanguage();
  const isAdmin = currentUser?.role === 'admin';
  const router = useRouter();
  const { refreshing, onRefresh } = useRefresh();
  const [showFournisseurs, setShowFournisseurs] = useState(false);

  const nbDemandesEnAttente =
    (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
    (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
    (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length;

  const cards: HubCard[] = [
    { route: '/(tabs)/reporting', title: t.gestion.reportingTitle, desc: t.gestion.reportingDesc, icon: ChartBar },
    { route: '/(tabs)/rh', title: t.gestion.rhTitle, desc: t.gestion.rhDesc, icon: Users, badge: nbDemandesEnAttente },
    { route: '/(tabs)/societe', title: t.gestion.societeTitle, desc: t.gestion.societeDesc, icon: Building2 },
    { route: '/(tabs)/drive', title: t.gestion.driveTitle, desc: t.gestion.driveDesc, icon: FolderOpen },
  ];

  // Garde de route : hub réservé à l'admin (route atteignable par URL sur le web).
  if (!isAdmin) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 14, color: '#8C8077' }}>{t.common.accessReserved}</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        style={{ flex: 1, backgroundColor: DS.cremeFond }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>{t.nav.gestion}</Text>
        <Text style={styles.subtitle}>{t.gestion.subtitle}</Text>

        <View style={{ gap: space.md, marginTop: space.lg }}>
          {cards.map(c => {
            const Icon = c.icon;
            return (
              <Pressable key={c.route} style={styles.card} onPress={() => router.push(c.route as never)}>
                <View style={styles.cardIcon}>
                  <Icon size={24} color={DS.bordeaux} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>{c.title}</Text>
                    {!!c.badge && c.badge > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeTxt}>{c.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardDesc}>{c.desc}</Text>
                </View>
                <ChevronRight size={20} color={DS.textDisabled} />
              </Pressable>
            );
          })}

          {/* Carnet fournisseurs (ouvre une modal, pas une route dédiée) */}
          <Pressable style={styles.card} onPress={() => setShowFournisseurs(true)}>
            <View style={styles.cardIcon}>
              <Store size={24} color={DS.bordeaux} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Fournisseurs</Text>
              </View>
              <Text style={styles.cardDesc}>Carnet d'adresses fournisseurs (fiches détaillées)</Text>
            </View>
            <ChevronRight size={20} color={DS.textDisabled} />
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showFournisseurs} animationType="slide" transparent onRequestClose={() => setShowFournisseurs(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFournisseurs(false)} />
          <View style={{ backgroundColor: DS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, height: '88%' }}>
            <FournisseursManager onClose={() => setShowFournisseurs(false)} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.xxl, fontWeight: font.heavy, color: DS.textStrong },
  subtitle: { fontSize: font.body, color: DS.textAlt, marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: DS.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: DS.border,
    padding: space.lg,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: DS.cremeNude,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { fontSize: font.lg, fontWeight: font.bold, color: DS.textStrong },
  cardDesc: { fontSize: font.sm, color: DS.textAlt, marginTop: 2 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: DS.error,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: { fontSize: font.tiny, fontWeight: font.bold, color: DS.surface },
});
