/**
 * Écran « Plus » — regroupe tout ce qui n'est pas dans la barre d'onglets.
 * Admin : Équipe & terrain (Équipe, Matériel, Sous-traitants) + Gestion
 * (Reporting, RH, Documents, Fournisseurs, Société). Employé : Matériel, RH.
 * (Ancien hub « Gestion » — la route reste /(tabs)/gestion.)
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChartBar, Users, Building2, FolderOpen, ChevronRight, Store, ShoppingCart, HardHat, ClipboardList, LogOut, Clock } from 'lucide-react-native';
import { useRefresh } from '@/hooks/useRefresh';
import { ScreenContainer } from '@/components/screen-container';
import { FournisseursManager } from '@/components/fournisseurs/FournisseursManager';
import { LanguageFlag } from '@/components/LanguageFlag';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { DS, radius, space, font, shadows, screenTitle } from '@/constants/design';
import { libelleVersion } from '@/hooks/useMisesAJour';

interface PlusRow {
  key: string;
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
  badge?: number;
  detail?: string;
  destructive?: boolean;
}

function Section({ label, rows }: { label?: string; rows: PlusRow[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: space.sm }}>
      {!!label && <Text style={styles.sectionLabel}>{label}</Text>}
      <View style={styles.card}>
        {rows.map((r, i) => {
          const Icon = r.icon;
          const last = i === rows.length - 1;
          return (
            <Pressable
              key={r.key}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.selectionAsync();
                r.onPress();
              }}
            >
              <View style={styles.rowIcon}>
                <Icon size={18} color={r.destructive ? DS.error : DS.primary} strokeWidth={1.9} />
              </View>
              <View style={[styles.rowInner, !last && styles.rowSeparator]}>
                <Text style={[styles.rowTitle, r.destructive && { color: DS.error }]} numberOfLines={1}>{r.title}</Text>
                {!!r.detail && <Text style={styles.rowDetail}>{r.detail}</Text>}
                {!!r.badge && r.badge > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeTxt}>{r.badge}</Text></View>
                )}
                {!r.destructive && <ChevronRight size={16} color={DS.textSecondary} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function PlusScreen() {
  const { data, currentUser, logout } = useApp();
  const { t } = useLanguage();
  const router = useRouter();
  const { refreshing, onRefresh } = useRefresh();
  const [showFournisseurs, setShowFournisseurs] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const isEmploye = currentUser?.role === 'employe';
  const employe = isEmploye ? data.employes.find(e => e.id === currentUser?.employeId) : null;
  const isRH = isAdmin || employe?.isRH === true;
  const isAcheteur = isAdmin || employe?.isAcheteur === true;
  // Employé : « Matériel » est dans la barre d'onglets ; « Horaires » (pointage complet) est rangé ici.
  const materielDansLaBarre = isEmploye;
  const pointageIci = isEmploye && employe?.doitPointer !== false;

  const nbDemandesEnAttente = isRH
    ? (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
      (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
      (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length
    : 0;

  const chantiersActifs = new Set(data.chantiers.filter(c => c.statut !== 'termine').map(c => c.id));
  const nbNonAchetes = isAcheteur
    ? (data.listesMateriaux || []).reduce(
        (acc, l) => (chantiersActifs.has(l.chantierId) ? acc + l.items.filter(i => !i.achete).length : acc), 0)
    : 0;

  const go = (route: string) => () => router.push(route as never);

  const confirmLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t.home.logoutTitle)) logout();
    } else {
      Alert.alert(t.home.logoutTitle, t.home.logoutMsg, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.home.logout, style: 'destructive', onPress: logout },
      ]);
    }
  };

  if (!isAdmin && !isEmploye) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 14, color: DS.textSecondary }}>{t.common.accessReserved}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const terrain: PlusRow[] = [];
  if (isAdmin) {
    terrain.push({ key: 'equipe', title: t.nav.equipe, icon: Users, onPress: go('/(tabs)/equipe'), detail: String(data.employes.length) });
  }
  if (!materielDansLaBarre) {
    terrain.push({ key: 'materiel', title: t.gestion.materielAchats, icon: ShoppingCart, onPress: go('/(tabs)/materiel'), badge: nbNonAchetes });
  }
  if (pointageIci) {
    terrain.push({ key: 'pointage', title: t.nav.pointage, icon: Clock, onPress: go('/(tabs)/pointage') });
  }
  if (isAdmin) {
    terrain.push({ key: 'st', title: t.nav.sousTraitants, icon: HardHat, onPress: go('/(tabs)/equipe?tab=soustraitants'), detail: String(data.sousTraitants.length) });
  }

  const gestion: PlusRow[] = isAdmin
    ? [
        { key: 'reporting', title: t.gestion.reportingTitle, icon: ChartBar, onPress: go('/(tabs)/reporting') },
        { key: 'rh', title: t.gestion.rhTitle, icon: ClipboardList, onPress: go('/(tabs)/rh'), badge: nbDemandesEnAttente },
        { key: 'drive', title: t.gestion.driveTitle, icon: FolderOpen, onPress: go('/(tabs)/drive') },
        { key: 'fournisseurs', title: t.gestion.fournisseurs, icon: Store, onPress: () => setShowFournisseurs(true) },
        { key: 'societe', title: t.gestion.societeTitle, icon: Building2, onPress: go('/(tabs)/societe') },
      ]
    : [
        { key: 'rh', title: isRH ? t.gestion.rhTitle : t.gestion.mesDemandesRH, icon: ClipboardList, onPress: go('/(tabs)/rh'), badge: nbDemandesEnAttente },
      ];

  const compte: PlusRow[] = [
    { key: 'logout', title: t.home.logout, icon: LogOut, onPress: confirmLogout, destructive: true },
  ];

  return (
    <ScreenContainer>
      <ScrollView
        style={{ flex: 1, backgroundColor: DS.background }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 40, gap: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={screenTitle}>{t.gestion.plusTitle}</Text>
          <LanguageFlag />
        </View>
        <Section label={isAdmin ? t.gestion.terrainSection : undefined} rows={terrain} />
        <Section label={t.nav.gestion} rows={gestion} />
        <Section label={t.gestion.compteSection} rows={compte} />
        {/* Version installée (pour vérifier qu'un téléphone a bien la dernière mise à jour) */}
        <Text style={{ textAlign: 'center', fontSize: 11, color: DS.textMuted }}>Version {libelleVersion()}</Text>
      </ScrollView>

      <Modal visible={showFournisseurs} animationType="slide" transparent onRequestClose={() => setShowFournisseurs(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFournisseurs(false)} />
          <View style={{ backgroundColor: DS.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, height: '88%' }}>
            <FournisseursManager onClose={() => setShowFournisseurs(false)} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm },
  sectionLabel: { fontSize: 13, fontWeight: font.semibold, letterSpacing: 0.4, textTransform: 'uppercase', color: DS.textSecondary, paddingHorizontal: 6 },
  card: { backgroundColor: DS.surface, borderRadius: radius.xl, ...shadows.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingLeft: 14 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  rowInner: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: 12 },
  rowSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.border },
  rowTitle: { flex: 1, fontSize: font.lg, color: DS.text },
  rowDetail: { fontSize: font.subhead, color: DS.textSecondary },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: DS.primary, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 12.5, fontWeight: font.bold, color: DS.textInverse },
});
