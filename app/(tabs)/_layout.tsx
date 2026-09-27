import { Tabs } from "expo-router";
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useApp } from "@/app/context/AppContext";
import { useLanguage } from "@/app/context/LanguageContext";
import { NotificationBanner } from "@/components/NotificationBanner";
import { SyncIndicator } from "@/components/SyncIndicator";
import { NotificationListener } from "@/components/NotificationListener";
import { useNotifications } from "@/hooks/useNotifications";
import { DS, shadows } from "@/constants/design";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Barre flottante : pilule détachée des bords, posée sur le fond sable.
  const isWeb = Platform.OS === "web";
  const barBottomMargin = isWeb ? 12 : Math.max(insets.bottom, 10);
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

  // Pastille de l'onglet Plus : demandes RH à traiter
  const badgePlus = nbDemandesEnAttente;

  return (
    <View style={{ flex: 1, backgroundColor: DS.background }}>
    <NotificationListener />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: DS.primary,
        tabBarInactiveTintColor: DS.textSecondary,
        tabBarActiveBackgroundColor: DS.soft,
        headerShown: false,
        tabBarButton: HapticTab,
        sceneStyle: { backgroundColor: DS.background },
        tabBarStyle: {
          height: 64,
          marginHorizontal: 14,
          marginBottom: barBottomMargin,
          marginTop: 6,
          paddingTop: 5,
          paddingBottom: 5,
          paddingHorizontal: 5,
          borderRadius: 32,
          borderTopWidth: 1,
          borderWidth: 1,
          borderColor: DS.border,
          borderTopColor: DS.border,
          backgroundColor: DS.surface,
          ...shadows.lg,
          // Sur web : scroll horizontal si la largeur est insuffisante
          ...(isWeb ? ({ overflowX: 'auto' } as object) : {}),
        },
        tabBarItemStyle: { borderRadius: 27, overflow: 'hidden', ...(isWeb ? { minWidth: 72 } : {}) },
        tabBarIconStyle: { marginTop: 2 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: -0.1, marginBottom: 2 },
      }}
    >
      {/* ═══ ONGLET 1 : Accueil / Ma journée — en premier ═══ */}
      <Tabs.Screen
        name="index"
        options={{
          title: isAdmin ? t.nav.home : t.nav.myDay,
          href: (isST || isApporteur) ? null : undefined,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="house.fill" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLET 2 : Planning — visible pour tous sauf rôles sans accès ═══ */}
      <Tabs.Screen
        name="planning"
        options={{
          title: t.nav.planning,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="calendar" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLET 3 : Chantiers (admin + apporteur read-only) / Pointage (employé) ═══ */}
      <Tabs.Screen
        name="chantiers"
        options={{
          title: isApporteur ? t.nav.myChantiers : t.nav.chantiers,
          href: (isAdmin || isApporteur) ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="hammer.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pointage"
        options={{
          title: t.nav.pointage,
          href: null, // « Horaires » : via l'écran Plus ; l'accueil employé affiche arrivée / départ
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="clock.fill" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLET 4 : Équipe (admin) / Matériel (employé) ═══ */}
      <Tabs.Screen
        name="equipe"
        options={{
          title: t.nav.equipe,
          href: null, // accessible via l'écran Plus
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="person.3.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="materiel"
        options={{
          title: t.nav.materiel,
          // Employé : accès direct dans la barre. Admin : via l'écran Plus.
          href: isEmploye ? undefined : null,
          tabBarBadge: isAcheteur && nbNonAchetes > 0 ? nbNonAchetes : undefined,
          tabBarBadgeStyle: { backgroundColor: DS.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="cart.fill" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLET 7 : Messages — visible pour admin/employé/ST (pas les apporteurs) ═══ */}
      <Tabs.Screen
        name="messagerie"
        options={{
          title: t.nav.messages,
          href: isApporteur ? null : undefined,
          tabBarBadge: nbMessagesNonLus > 0 ? nbMessagesNonLus : undefined,
          tabBarBadgeStyle: { backgroundColor: DS.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="message.fill" color={color} />
          ),
        }}
      />

      {/* ═══ ONGLET 5 : Plus — Équipe, Matériel, Reporting, RH, Documents, Société ═══ */}
      <Tabs.Screen
        name="gestion"
        options={{
          title: t.gestion.plusTitle,
          href: (isAdmin || isEmploye) ? undefined : null,
          tabBarBadge: badgePlus > 0 ? badgePlus : undefined,
          tabBarBadgeStyle: { backgroundColor: DS.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="square.grid.2x2.fill" color={color} />
          ),
        }}
      />

      {/* Reporting — accessible via le hub Gestion (caché du bar) */}
      <Tabs.Screen
        name="reporting"
        options={{
          title: t.nav.reporting,
          href: null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="chart.bar.fill" color={color} />
          ),
        }}
      />

      {/* ═══ RH : direct pour les employés non-admin ; via Gestion pour l'admin ═══ */}
      <Tabs.Screen
        name="rh"
        options={{
          title: t.nav.rh,
          href: null, // accessible via l'écran Plus
          tabBarBadge: nbDemandesEnAttente > 0 ? nbDemandesEnAttente : undefined,
          tabBarBadgeStyle: { backgroundColor: DS.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={23} name="person.badge.clock.fill" color={color} />
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
            <IconSymbol size={23} name="eurosign.circle.fill" color={color} />
          ),
        }}
      />

      {/* Société : accessible via le hub Gestion (caché du bar) */}
      <Tabs.Screen
        name="societe"
        options={{
          title: t.nav.societe,
          href: null,
        }}
      />

      {/* Drive documentaire général : accessible via le hub Gestion (caché du bar) */}
      <Tabs.Screen
        name="drive"
        options={{
          title: t.nav.drive,
          href: null,
        }}
      />
    </Tabs>
    <SyncIndicator />
    </View>
  );
}
