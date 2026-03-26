import { useRef, useState, useCallback } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

/**
 * Hook useConfirm — remplace window.confirm sur toutes plateformes (iOS, Android, Web).
 *
 * Usage :
 *   const { confirm, ConfirmModal } = useConfirm();
 *   // Dans le JSX : <ConfirmModal />
 *   // Pour déclencher : if (await confirm('Supprimer ?')) { ... }
 */
export function useConfirm() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const resolveRef = useRef<((val: boolean) => void) | null>(null);

  const confirm = useCallback((msg: string): Promise<boolean> => {
    return new Promise(resolve => {
      setMessage(msg);
      setVisible(true);
      resolveRef.current = resolve;
    });
  }, []);

  const handleOk = useCallback(() => {
    setVisible(false);
    resolveRef.current?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setVisible(false);
    resolveRef.current?.(false);
  }, []);

  const ConfirmModal = useCallback(() => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.btnCancel} onPress={handleCancel}>
              <Text style={styles.btnCancelText}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.btnOk} onPress={handleOk}>
              <Text style={styles.btnOkText}>Confirmer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  ), [visible, message, handleOk, handleCancel]);

  return { confirm, ConfirmModal };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  message: {
    fontSize: 15,
    color: '#1A3A6B',
    fontWeight: '500',
    marginBottom: 20,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
  },
  btnCancelText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
  btnOk: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#E74C3C',
    borderRadius: 8,
  },
  btnOkText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
