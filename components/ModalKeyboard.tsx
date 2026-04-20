/**
 * Wrapper pour Modal qui gère automatiquement le clavier iOS/Android.
 * Remplace <Modal> par <ModalKeyboard> pour que les TextInput
 * restent visibles au-dessus du clavier.
 */
import React from 'react';
import { Modal, KeyboardAvoidingView, Platform, type ModalProps } from 'react-native';

export function ModalKeyboard({ children, ...props }: ModalProps) {
  if (Platform.OS !== 'ios') {
    return <Modal {...props}>{children}</Modal>;
  }
  return (
    <Modal {...props}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}
