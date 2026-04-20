/**
 * Modal avec fond flou (effet verre dépoli iOS).
 * Remplace les modals avec backgroundColor: 'rgba(0,0,0,0.5)'.
 */
import React from 'react';
import { Modal, Pressable, View, Platform, type ModalProps } from 'react-native';
import { BlurView } from 'expo-blur';

interface BlurModalProps extends ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Position du contenu : 'center' (défaut) ou 'bottom' (bottom sheet) */
  position?: 'center' | 'bottom';
  /** Intensité du flou (0-100, défaut 40) */
  intensity?: number;
}

export function BlurModal({ onClose, children, position = 'center', intensity = 40, ...modalProps }: BlurModalProps) {
  const isBottom = position === 'bottom';

  return (
    <Modal transparent animationType={isBottom ? 'slide' : 'fade'} onRequestClose={onClose} {...modalProps}>
      <Pressable
        style={{ flex: 1, justifyContent: isBottom ? 'flex-end' : 'center', alignItems: 'center' }}
        onPress={onClose}
      >
        {/* Fond flou (iOS) ou semi-transparent (Android/Web) */}
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={intensity}
            tint="dark"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        )}

        {/* Contenu */}
        <Pressable
          onPress={e => e.stopPropagation()}
          style={isBottom ? {
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            width: '100%',
            maxHeight: '90%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 10,
          } : {
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            width: '90%',
            maxWidth: 440,
            maxHeight: '85%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Poignée pour bottom sheet */}
          {isBottom && (
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E8DDD0' }} />
            </View>
          )}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
