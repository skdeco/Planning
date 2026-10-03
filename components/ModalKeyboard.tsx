/**
 * Wrapper pour Modal qui gère automatiquement le clavier iOS/Android.
 * Remplace <Modal> par <ModalKeyboard> pour que les TextInput
 * restent visibles au-dessus du clavier.
 */
import React from 'react';
import { Modal, KeyboardAvoidingView, Platform, type ModalProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export function ModalKeyboard({ children, ...props }: ModalProps) {
  // Web : pas de clavier virtuel à gérer
  if (Platform.OS === 'web') {
    return <Modal {...props}>{children}</Modal>;
  }
  // iOS et Android (affichage bord à bord : la fenêtre ne se redimensionne plus
  // toute seule, il faut pousser le contenu au-dessus du clavier)
  return (
    <Modal {...props}>
      {/* Fournisseur propre à la fenêtre : l'encoche / Dynamic Island est mesurée
          dans la modale (sinon les en-têtes plein écran passent sous l'heure
          et la croix de fermeture devient inaccessible). */}
      <SafeAreaProvider>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {children}
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}
