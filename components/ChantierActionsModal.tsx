import React from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView,
  Platform, Linking, Alert,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';

export interface ChantierActionsModalProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string | null;
  role: 'admin' | 'employe' | 'soustraitant';
  onOpenNotes: (chantierId: string) => void;
  onOpenPlans: (chantierId: string) => void;
  onOpenPhotos: (chantierId: string) => void;
  onOpenFiche: (chantierId: string) => void;
  onOpenMateriel: (chantierId: string) => void;
  onOpenSAV: (chantierId: string) => void;
  // Admin only:
  onOpenFinances?: (chantierId: string) => void;
  onOpenPortailClient?: (chantierId: string) => void;
  onOpenBudget?: (chantierId: string) => void;
  onOpenAchats?: (chantierId: string) => void;
  onOpenMarches?: (chantierId: string) => void;
  onDelete?: (chantierId: string) => void;
}

// ── SK DECO palette ─────────────────────────────────────────────────────────
const COLORS = {
  primary: '#2C2C2C',
  accent: '#C9A96E',
  bg: '#F5EDE3',
  border: '#E8DDD0',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#8C8077',
  danger: '#D94F4F',
};

// ── "Y aller" : choix Waze / Google Maps / Apple Plans ─────────────────────
const openWithWaze = (encoded: string) => {
  Linking.openURL(`waze://?q=${encoded}&navigate=yes`).catch(() => {
    // Fallback web si Waze non installé
    Linking.openURL(`https://waze.com/ul?q=${encoded}&navigate=yes`);
  });
};
const openWithGoogleMaps = (encoded: string) => {
  if (Platform.OS === 'ios') {
    Linking.openURL(`comgooglemaps://?daddr=${encoded}&directionsmode=driving`).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
    });
  } else {
    Linking.openURL(`google.navigation:q=${encoded}`).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
    });
  }
};
const openWithApplePlans = (encoded: string) => {
  Linking.openURL(`maps://?daddr=${encoded}`);
};

const openDirections = (adresse: string) => {
  if (!adresse) return;
  const encoded = encodeURIComponent(adresse);
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const choix = window.confirm('Ouvrir avec Google Maps ?\n(OK = Google Maps, Annuler = Waze)');
      if (choix) window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
      else window.open(`https://waze.com/ul?q=${encoded}&navigate=yes`, '_blank');
    }
    return;
  }
  // Native : choix entre Waze / Google Maps / Apple Plans (iOS)
  const buttons: any[] = [
    { text: 'Waze', onPress: () => openWithWaze(encoded) },
    { text: 'Google Maps', onPress: () => openWithGoogleMaps(encoded) },
  ];
  if (Platform.OS === 'ios') {
    buttons.push({ text: 'Apple Plans', onPress: () => openWithApplePlans(encoded) });
  }
  buttons.push({ text: 'Annuler', style: 'cancel' });
  Alert.alert('Avec quoi ouvrir ?', adresse, buttons, { cancelable: true });
};

export function ChantierActionsModal(props: ChantierActionsModalProps) {
  const {
    visible, onClose, chantierId, role,
    onOpenNotes, onOpenPlans, onOpenPhotos, onOpenFiche, onOpenMateriel, onOpenSAV,
    onOpenFinances, onOpenPortailClient, onOpenBudget, onOpenAchats, onOpenMarches, onDelete,
  } = props;

  const { data } = useApp();
  const chantier = chantierId ? data.chantiers.find(c => c.id === chantierId) : null;

  if (!chantier) return null;

  const run = (fn: ((id: string) => void) | undefined) => {
    if (!fn || !chantierId) return;
    onClose();
    // Laisse la modal se fermer avant d'ouvrir l'action suivante
    setTimeout(() => fn(chantierId), 120);
  };

  const handleDelete = () => {
    if (!onDelete || !chantierId) return;
    const doDelete = () => { onClose(); setTimeout(() => onDelete(chantierId), 120); };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Supprimer le chantier "${chantier.nom}" ?`)) doDelete();
    } else {
      Alert.alert('Supprimer le chantier', `Supprimer "${chantier.nom}" ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ── Boutons par rôle ──────────────────────────────────────────────────────
  type ActionBtn = { icon: string; label: string; onPress: () => void; danger?: boolean };

  const commonBtns: ActionBtn[] = [
    { icon: '🪪', label: 'Fiche',   onPress: () => run(onOpenFiche) },
    { icon: '📝', label: 'Notes',   onPress: () => run(onOpenNotes) },
    { icon: '📐', label: 'Plans',   onPress: () => run(onOpenPlans) },
    { icon: '📸', label: 'Photos',  onPress: () => run(onOpenPhotos) },
    { icon: '📍', label: 'Y aller', onPress: () => { onClose(); setTimeout(() => openDirections(chantier.adresse || ''), 120); } },
    { icon: '🧰', label: 'Matériel', onPress: () => run(onOpenMateriel) },
    { icon: '🛠', label: 'SAV',     onPress: () => run(onOpenSAV) },
  ];

  const adminBtns: ActionBtn[] = [
    { icon: '🛒', label: 'Achats',         onPress: () => run(onOpenAchats) },
    { icon: '💼', label: 'Marchés',        onPress: () => run(onOpenMarches) },
    { icon: '💰', label: 'Finances',       onPress: () => run(onOpenFinances) },
    { icon: '👤', label: 'Portail client', onPress: () => run(onOpenPortailClient) },
    { icon: '📊', label: 'Budget',         onPress: () => run(onOpenBudget) },
    { icon: '🗑', label: 'Supprimer',      onPress: handleDelete, danger: true },
  ];

  const btns: ActionBtn[] = role === 'admin' ? [...commonBtns, ...adminBtns] : commonBtns;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.colorDot, { backgroundColor: chantier.couleur || COLORS.accent }]} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.title} numberOfLines={1}>{chantier.nom}</Text>
                {chantier.adresse ? (
                  <Text style={styles.subtitle} numberOfLines={2}>{chantier.adresse}</Text>
                ) : null}
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
            <View style={styles.grid}>
              {btns.map((b, idx) => (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [
                    styles.btn,
                    b.danger && styles.btnDanger,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={b.onPress}
                >
                  <Text style={styles.btnIcon}>{b.icon}</Text>
                  <Text style={[styles.btnLabel, b.danger && styles.btnLabelDanger]} numberOfLines={1}>{b.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  overlayTop: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 12 },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16 },
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 12,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  closeTxt: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingBottom: 8,
  },
  btn: {
    width: '33.333%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  btnPressed: { opacity: 0.55 },
  btnDanger: {},
  btnIcon: {
    fontSize: 28,
    marginBottom: 6,
    textAlign: 'center',
  },
  btnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  btnLabelDanger: { color: COLORS.danger },
});
