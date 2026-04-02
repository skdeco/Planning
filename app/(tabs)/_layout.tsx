import { Tabs } from "expo-router";
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/app/context/AppContext";
import { LanguageFlag } from "@/components/LanguageFlag";
import { useLanguage } from "@/app/context/LanguageContext";
import { NotificationBanner } from "@/components/NotificationBanner";
import { SyncIndicator } from "@/components/SyncIndicator";
import { NotificationListener } from "@/components/NotificationListener";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;
  const { currentUser, data } = useApp();
  const { t } = useLanguage();
  const isAdmin = currentUser?.role === 'admin';
  const isST = currentUser?.role === 'soustraitant';
  const isEmploye = currentUser?.role === 'employe';

  // Employé courant
  const currentEmployeRecord = isEmploye
    ? data.employes.find(e => e.id === currentUser?.employeId)
    : null;

  // Rôle acheteur : admin ou employé avec isAcheteur = true
  const isAcheteur = isAdmin || currentEmployeRecord?.isAcheteur === true;

  // Doit pointer : true par défaut, false si explicitement désactivé
  const doitPointer = !isEmploye || currentEmployeRecord?.doitPointer !== false;

  // Rôle RH : admin ou employé avec isRH = true
  const currentEmployeRH = data.employes.find(e => e.id === currentUser?.employeId);
  const isRH = isAdmin || currentEmployeRH?.isRH === true;
  // Accès RH : admin, employé RH, ou employé normal (pour ses propres demandes)
  const hasRHAccess = !isST;

  // Badge RH : demandes en attente (visible admin/RH uniquement)
  const nbDemandesEnAttente = isRH ? (
    (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
    (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
    (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length
  ) : 0;

  // Badge messagerie : messages non lus
  const nbMessagesNonLus = useMemo(() => {
    const msgs = data.messagesPrive || [];
    if (isAdmin) {
      // Admin : messages envoyés par employés/ST non lus
      return msgs.filter(m => !m.lu && m.expediteurRole !== 'admin').length;
    }
    // Employé : messages envoyés par admin non lus
    const myId = currentUser?.employeId || currentUser?.soustraitantId || '';
    return msgs.filter(m => m.conversationId === myId && !m.lu && m.expediteurRole === 'admin').length;
  }, [data.messagesPrive, isAdmin, currentUser]);

  // Badge : nombre d'articles non achetés (hors chantiers terminés)
  const chantiersActifsIds = new Set(
    data.chantiers.filter(c => c.statut !== 'termine').map(c => c.id)
  );
  const nbNonAchetes = (data.listesMateriaux || []).reduce(
    (acc, l) => {
      // Ignorer les listes des chantiers terminés
      if (!chantiersActifsIds.has(l.chantierId)) return acc;
      return acc + l.items.filter(i => !i.achete).length;
    },
    0
  );

  return (
    <View style={{ flex: 1 }}>
    <NotificationBanner />
    <SyncIndicator />
    <NotificationListener />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1A3A6B',
        tabBarInactiveTintColor: '#687076',
        headerShown: true,
        headerRight: () => <LanguageFlag />,
        headerRightContainerStyle: { paddingRight: 16 },
        headerStyle: { backgroundColor: '#FFFFFF', elevation: 0, shadowOpacity: 0 },
        headerTitleStyle: { fontSize: 16, fontWeight: '700', color: '#11181C' },
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E6EA',
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      {/* Planning : visible pour tous */}
      <Tabs.Screen
        name="planning"
        options={{
          title: t.nav.planning,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="calendar" color={color} />
          ),
        }}
      />

      {/* Horaires (pointage) : visible uniquement pour les employés qui doivent pointer */}
      <Tabs.Screen
        name="pointage"
        options={{
          title: t.nav.pointage,
          href: (isEmploye && doitPointer) ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="clock.fill" color={color} />
          ),
        }}
      />

      {/* Chantiers : admin uniquement */}
      <Tabs.Screen
        name="chantiers"
        options={{
          title: t.nav.chantiers,
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="hammer.fill" color={color} />
          ),
        }}
      />

      {/* Équipe : admin uniquement */}
      <Tabs.Screen
        name="equipe"
        options={{
          title: t.nav.equipe,
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="person.3.fill" color={color} />
          ),
        }}
      />

      {/* Sous-traitants : admin uniquement */}
      <Tabs.Screen
        name="sous-traitants"
        options={{
          title: t.nav.sousTraitants,
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="wrench.and.screwdriver.fill" color={color} />
          ),
        }}
      />

      {/* Reporting : admin uniquement */}
      <Tabs.Screen
        name="reporting"
        options={{
          title: t.nav.reporting,
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="chart.bar.fill" color={color} />
          ),
        }}
      />

      {/* Financier ST : sous-traitant uniquement */}
      <Tabs.Screen
        name="financier-st"
        options={{
          title: t.nav.finances,
          href: isST ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="eurosign.circle.fill" color={color} />
          ),
        }}
      />

      {/* Matériel : visible pour tous sauf sous-traitants */}
      <Tabs.Screen
        name="materiel"
        options={{
          title: t.nav.materiel,
          href: isST ? null : undefined,
          tabBarBadge: isAcheteur && nbNonAchetes > 0 ? nbNonAchetes : undefined,
          tabBarBadgeStyle: { backgroundColor: '#E74C3C', fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="cart.fill" color={color} />
          ),
        }}
      />

      {/* RH : visible pour tous sauf sous-traitants */}
      <Tabs.Screen
        name="rh"
        options={{
          title: t.nav.rh,
          href: hasRHAccess ? undefined : null,
          tabBarBadge: nbDemandesEnAttente > 0 ? nbDemandesEnAttente : undefined,
          tabBarBadgeStyle: { backgroundColor: '#E74C3C', fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="person.badge.clock.fill" color={color} />
          ),
        }}
      />

      {/* Messagerie : visible pour tous sauf sous-traitants (ou avec sous-traitants si on veut) */}
      <Tabs.Screen
        name="messagerie"
        options={{
          title: t.nav.messages,
          href: !isST ? undefined : undefined,
          tabBarBadge: nbMessagesNonLus > 0 ? nbMessagesNonLus : undefined,
          tabBarBadgeStyle: { backgroundColor: '#E74C3C', fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="message.fill" color={color} />
          ),
        }}
      />

      {/* Dashboard admin / Ma journée employé */}
      <Tabs.Screen
        name="index"
        options={{
          title: isAdmin ? 'Accueil' : 'Ma journée',
          href: isST ? null : undefined,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="house.fill" color={color} />
          ),
        }}
      />
    </Tabs>
    </View>
  );
}
