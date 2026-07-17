/**
 * Hub "Gestion" (admin) — regroupe Reporting, RH et Société en un seul onglet
 * pour alléger la barre de navigation. Chaque carte ouvre l'écran dédié.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { ChartBar, Users, Building2, FolderOpen, ChevronRight } from 'lucide-react-native';
import { useRefresh } from '@/hooks/useRefresh';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';

interface HubCard {
  route: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  badge?: number;
}

export default function GestionScreen() {
  const { data } = useApp();
  const router = useRouter();
  const { refreshing, onRefresh } = useRefresh();

  const nbDemandesEnAttente =
    (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
    (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
    (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length;

  const cards: HubCard[] = [
    { route: '/(tabs)/reporting', title: 'Reporting', desc: 'Pointages, heures, paie et statistiques', icon: ChartBar },
    { route: '/(tabs)/rh', title: 'Ressources humaines', desc: 'Congés, avances, arrêts maladie', icon: Users, badge: nbDemandesEnAttente },
    { route: '/(tabs)/societe', title: 'Société', desc: 'Documents juridiques, fiscaux et assurances', icon: Building2 },
    { route: '/(tabs)/drive', title: 'Drive documentaire', desc: 'Tous les documents de tous les chantiers', icon: FolderOpen },
  ];

  return (
    <ScreenContainer>
      <ScrollView
        style={{ flex: 1, backgroundColor: DS.cremeFond }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>Gestion</Text>
        <Text style={styles.subtitle}>Reporting, ressources humaines et documents société</Text>

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
        </View>
      </ScrollView>
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
