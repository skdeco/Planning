import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { useApp } from '@/app/context/AppContext';

const ACTION_ICONS: Record<string, string> = {
  pointage: '🕐',
  affectation: '📋',
  conge: '🏖️',
  avance: '💰',
  materiel: '🛒',
};

const ACTION_COLORS: Record<string, string> = {
  pointage: '#3498DB',
  affectation: '#27AE60',
  conge: '#E67E22',
  avance: '#9B59B6',
  materiel: '#E74C3C',
};

export function NotificationBanner() {
  const { notifications, markNotificationsRead } = useApp();
  const [showModal, setShowModal] = useState(false);

  if (notifications.length === 0) return null;

  const handleOpen = () => setShowModal(true);
  const handleClose = () => {
    markNotificationsRead();
    setShowModal(false);
  };

  return (
    <>
      <Pressable style={styles.banner} onPress={handleOpen}>
        <Text style={styles.bannerIcon}>🔔</Text>
        <Text style={styles.bannerText}>
          {notifications.length} notification{notifications.length > 1 ? 's' : ''} depuis votre dernière visite
        </Text>
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerBadgeText}>{notifications.length}</Text>
        </View>
      </Pressable>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔔 Notifications</Text>
              <Pressable onPress={handleClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕ Fermer</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.notifList}>
              {[...notifications].reverse().map(notif => {
                const icon = ACTION_ICONS[notif.action] || '📌';
                const color = ACTION_COLORS[notif.action] || '#687076';
                const date = new Date(notif.timestamp);
                const timeStr = `${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
                return (
                  <View key={notif.id} style={styles.notifItem}>
                    <View style={[styles.notifIcon, { backgroundColor: color + '15' }]}>
                      <Text style={{ fontSize: 18 }}>{icon}</Text>
                    </View>
                    <View style={styles.notifBody}>
                      <Text style={styles.notifDesc}>{notif.description}</Text>
                      <Text style={styles.notifMeta}>
                        {notif.userName} — {timeStr}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A6B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  bannerIcon: {
    fontSize: 16,
  },
  bannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  bannerBadge: {
    backgroundColor: '#E74C3C',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  bannerBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
  },
  closeBtn: {
    backgroundColor: '#1A3A6B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  notifList: {
    padding: 12,
  },
  notifItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBody: {
    flex: 1,
  },
  notifDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 2,
  },
  notifMeta: {
    fontSize: 11,
    color: '#687076',
  },
});
