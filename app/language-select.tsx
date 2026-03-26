import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LANGUAGES, type Language } from '@/i18n';
import { useLanguage } from '@/app/context/LanguageContext';

export default function LanguageSelectScreen() {
  const router = useRouter();
  const { language, setLanguage, markLanguageSelected, t } = useLanguage();

  const handleSelect = (lang: Language) => {
    setLanguage(lang);
  };

  const handleContinue = () => {
    markLanguageSelected();
    router.replace('/(tabs)/planning' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F4F7" />

      <View style={styles.header}>
        <Text style={styles.logo}>SK DECO</Text>
        <Text style={styles.title}>{t.auth.selectLanguage}</Text>
        <Text style={styles.subtitle}>{t.auth.languageSubtitle}</Text>
      </View>

      <View style={styles.languageList}>
        {LANGUAGES.map((lang) => {
          const isSelected = language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.langItem, isSelected && styles.langItemSelected]}
              onPress={() => handleSelect(lang.code)}
              activeOpacity={0.7}
            >
              <Text style={styles.flag}>{lang.flag}</Text>
              <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                {lang.nativeLabel}
              </Text>
              {isSelected && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} activeOpacity={0.8}>
        <Text style={styles.continueBtnText}>
          {t.auth.continueWith} {LANGUAGES.find(l => l.code === language)?.nativeLabel}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 40,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A3A6B',
    letterSpacing: 2,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#11181C',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#687076',
    textAlign: 'center',
  },
  languageList: {
    flex: 1,
    gap: 12,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  langItemSelected: {
    borderColor: '#1A3A6B',
    backgroundColor: '#EEF2FF',
  },
  flag: {
    fontSize: 28,
    marginRight: 16,
  },
  langLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#11181C',
  },
  langLabelSelected: {
    color: '#1A3A6B',
  },
  checkmark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1A3A6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  continueBtn: {
    backgroundColor: '#1A3A6B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#1A3A6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
