/**
 * AlertHost — rend Alert.alert utilisable sur le WEB (Mac, PC).
 *
 * Sur react-native-web, Alert.alert ne fait rien : tout bouton qui ouvrait une
 * alerte à choix (« Modifier / Créer / Annuler », confirmations…) semblait mort
 * sur ordinateur. Ce composant, monté une fois à la racine, remplace Alert.alert
 * sur le web par une boîte de dialogue intégrée. iOS et Android gardent l'alerte native.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, Text, View, type AlertButton } from 'react-native';

interface PendingAlert { title: string; message?: string; buttons: AlertButton[] }

let push: ((a: PendingAlert) => void) | null = null;

if (Platform.OS === 'web') {
  (Alert as { alert: typeof Alert.alert }).alert = (title, message, buttons) => {
    const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    if (push) push({ title, message: message ?? undefined, buttons: list });
    else if (typeof window !== 'undefined') window.alert([title, message].filter(Boolean).join('\n\n'));
  };
}

export function AlertHost() {
  const [queue, setQueue] = useState<PendingAlert[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    push = a => setQueue(q => [...q, a]);
    return () => { push = null; };
  }, []);
  if (Platform.OS !== 'web' || queue.length === 0) return null;
  const current = queue[0];
  const close = (b?: AlertButton) => {
    setQueue(q => q.slice(1));
    b?.onPress?.();
  };
  const cancel = current.buttons.find(b => b.style === 'cancel');
  const actions = current.buttons.filter(b => b.style !== 'cancel');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(cancel)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, gap: 8, width: '100%', maxWidth: 440 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#2B1D14' }}>{current.title}</Text>
          {!!current.message && <Text style={{ fontSize: 14, color: '#6E5F54', marginBottom: 6 }}>{current.message}</Text>}
          {actions.map((b, i) => {
            const danger = b.style === 'destructive';
            const primary = !danger && i === actions.length - 1;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                onPress={() => close(b)}
                style={{ minHeight: 46, borderRadius: 999, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? '#FEE2E2' : primary ? '#5C1F2E' : '#F2E4E1' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: danger ? '#B91C1C' : primary ? '#FFFFFF' : '#5C1F2E' }}>{b.text ?? 'OK'}</Text>
              </Pressable>
            );
          })}
          {cancel && (
            <Pressable accessibilityRole="button" onPress={() => close(cancel)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#6E5F54' }}>{cancel.text ?? 'Annuler'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
