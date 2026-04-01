import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// ── Configuration Expo Notifications ──────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Hook pour gérer les notifications push (web + mobile).
 * - Sur web : utilise l'API Web Notifications
 * - Sur mobile : utilise Expo Notifications
 */
export function useNotifications() {
  const permissionGranted = useRef(false);

  // Demander la permission au montage
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          permissionGranted.current = perm === 'granted';
        }
      } else {
        const { status } = await Notifications.requestPermissionsAsync();
        permissionGranted.current = status === 'granted';
      }
    })();
  }, []);

  const sendNotification = useCallback(async (title: string, body: string) => {
    if (!permissionGranted.current) return;

    if (Platform.OS === 'web') {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    } else {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: 'default' },
        trigger: null, // Immédiat
      });
    }
  }, []);

  return { sendNotification };
}
