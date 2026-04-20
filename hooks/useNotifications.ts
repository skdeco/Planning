import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

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
 * Enregistre le push token et retourne l'ExpoPushToken.
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data; // format: "ExponentPushToken[xxxx]"
}

/**
 * Envoie une push notification via Expo Push API.
 * Fonctionne même quand l'app est fermée.
 */
export async function sendPushNotification(
  pushTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (pushTokens.length === 0) return;

  const messages = pushTokens.filter(t => t && t.startsWith('ExponentPushToken')).map(token => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    data: data || {},
  }));

  if (messages.length === 0) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.warn('[Push] Erreur envoi:', e);
  }
}

/**
 * Hook pour gérer les notifications push (web + mobile).
 */
export function useNotifications() {
  const permissionGranted = useRef(false);
  const [pushToken, setPushToken] = useState<string | null>(null);

  // Enregistrer le push token au montage
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          permissionGranted.current = perm === 'granted';
        }
      } else {
        const token = await registerForPushNotificationsAsync();
        setPushToken(token);
        permissionGranted.current = !!token;
      }
    })();
  }, []);

  // Notification locale
  const sendNotification = useCallback(async (title: string, body: string) => {
    if (!permissionGranted.current) return;

    if (Platform.OS === 'web') {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    } else {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: 'default' },
        trigger: null,
      });
    }
  }, []);

  return { sendNotification, pushToken };
}
