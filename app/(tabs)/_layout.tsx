import { Tabs } from "expo-router";
import { useEffect, useMemo } from 'react';
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
import { useNotifications } from "@/hooks/useNotifications";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;
  const { currentUser, data, updateSousTraitant } = useApp();
  const { t } = useLanguage();
  const { pushToken } = useNotifications();
  const isAdmin = currentUser?.role === 'admin';
  const isST = currentUser?.role === 'soustraitant';
  const isApporteur = currentUser?.role === 'apporteur';

  // Enregistrer le push token du sous-traitant connecté
  useEffect(() => {
    if (!pushToken || !isST || !currentUser?.soustraitantId) return;
    const st = data.sousTraitants.find(s => s.id === currentUser.soustraitantId);
    if (st && st.pushToken !== pushToken) {
      updateSousTraitant({ ...st, pushToken });
    }
  }, [pushToken, isST, currentUser?.soustraitantId]);
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
  // Accès RH : admin, employé RH, ou employé normal (pour ses propres demandes) — pas ST ni apporteur
  const hasRHAccess = !isST && !isApporteur;

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
    <SyncIndicator />
    <NotificationListener />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2C2C2C',
        tabBarInactiveTintColor: '#B0A89E',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          borderTopWidth: 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: -0.2,
        },
      }}
    >
      {/* ═══ ONGLET 1 : Accueil / Ma journée — en premier ═══ */}
      <Tabs.Screen
        name="index"
        options={{
          title: isAdmin ? 'Accueil' : 'Ma journée',
          href: (isST || isApporteur) ? null : undefined,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="house.fill" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLET 2 : Planning — visible pour tous sauf rôles sans accès ═══ */}
      <Tabs.Screen
        name="planning"
        options={{
          title: t.nav.planning,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="calendar" color={color} />
          ),
        }}
      />

      {/* Agenda caché (intégré dans Planning) */}
      <Tabs.Screen name="agenda" options={{ href: null }} />

      {/* ═══ ONGLET 3 : Chantiers (admin + apporteur read-only) / Pointage (employé) ═══ */}
      <Tabs.Screen
        name="chantiers"
        options={{
          title: isApporteur ? 'Mes chantiers' : t.nav.chantiers,
          href: (isAdmin || isApporteur) ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="hammer.fill" color={color} />
          ),
        }}
      />
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

      {/* ═══ ONGLET 4 : Équipe (admin) / Matériel (employé) ═══ */}
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
      <Tabs.Screen
        name="materiel"
        options={{
          title: t.nav.materiel,
          href: (isST || isApporteur) ? null : undefined,
          tabBarBadge: isAcheteur && nbNonAchetes > 0 ? nbNonAchetes : undefined,
          tabBarBadgeStyle: { backgroundColor: '#E74C3C', fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="cart.fill" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLET 5 : Reporting (admin) ═══ */}
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

      {/* ═══ ONGLET 6 : RH (tous sauf ST & apporteur) ═══ */}
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

      {/* ═══ ONGLET 7 : Messages — caché pour apporteur ═══ */}
      <Tabs.Screen
        name="messagerie"
        options={{
          title: t.nav.messages,
          href: isApporteur ? null : undefined,
          tabBarBadge: nbMessagesNonLus > 0 ? nbMessagesNonLus : undefined,
          tabBarBadgeStyle: { backgroundColor: '#E74C3C', fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="message.fill" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLETS CACHÉS ═══ */}
      <Tabs.Screen
        name="sous-traitants"
        options={{
          title: t.nav.sousTraitants,
          href: null,
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
    </Tabs>
    </View>
  );
}
