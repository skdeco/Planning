import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  SafeAreaView, Platform,
} from 'react-native';
import { useLanguage } from '@/app/context/LanguageContext';
import { LANGUAGES, type Language } from '@/i18n';

export function LanguageFlag() {
  const { language, setLanguage, t } = useLanguage();
  const [showModal, setShowModal] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === language);

  return (
    <>
      <TouchableOpacity
        style={styles.flagBtn}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.flagEmoji}>{currentLang?.flag ?? '🇫🇷'}</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>{t.language.change}</Text>
            {LANGUAGES.map((lang) => {
              const isSelected = language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langItem, isSelected && styles.langItemSelected]}
                  onPress={() => {
                    setLanguage(lang.code as Language);
                    setShowModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                    {lang.nativeLabel}
                  </Text>
                  {isSelected && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flagBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  flagEmoji: {
    fontSize: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingRight: 16,
  },
  dropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
    paddingHorizontal: 12,
    paddingVertical: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 10,
  },
  langItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  langFlag: {
    fontSize: 20,
  },
  langLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#11181C',
  },
  langLabelSelected: {
    color: '#1A3A6B',
    fontWeight: '700',
  },
  check: {
    fontSize: 14,
    color: '#1A3A6B',
    fontWeight: '700',
  },
});
