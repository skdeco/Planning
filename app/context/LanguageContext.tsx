import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Language, type TranslationKeys, LANGUAGES, getTranslations } from '@/i18n';

const LANG_KEY = 'sk_deco_language_v2';
const LANG_SELECTED_KEY = 'sk_deco_language_selected_v2';

interface LanguageContextType {
  language: Language;
  t: TranslationKeys;
  setLanguage: (lang: Language) => void;
  hasSelectedLanguage: boolean;
  markLanguageSelected: () => void;
  isLanguageLoaded: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'fr',
  t: getTranslations('fr'),
  setLanguage: () => {},
  hasSelectedLanguage: false,
  markLanguageSelected: () => {},
  isLanguageLoaded: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr');
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState(false);
  const [isLanguageLoaded, setIsLanguageLoaded] = useState(false);

  // Charger la langue sauvegardée au démarrage
  useEffect(() => {
    const load = async () => {
      try {
        const [savedLang, langSelected] = await Promise.all([
          AsyncStorage.getItem(LANG_KEY),
          AsyncStorage.getItem(LANG_SELECTED_KEY),
        ]);
        if (savedLang && LANGUAGES.find(l => l.code === savedLang)) {
          setLanguageState(savedLang as Language);
        }
        if (langSelected === 'true') {
          setHasSelectedLanguage(true);
        }
      } catch {}
      setIsLanguageLoaded(true);
    };
    load();
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(LANG_KEY, lang).catch(() => {});
  }, []);

  const markLanguageSelected = useCallback(() => {
    setHasSelectedLanguage(true);
    AsyncStorage.setItem(LANG_SELECTED_KEY, 'true').catch(() => {});
  }, []);

  const t = getTranslations(language);

  return (
    <LanguageContext.Provider value={{
      language,
      t,
      setLanguage,
      hasSelectedLanguage,
      markLanguageSelected,
      isLanguageLoaded,
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
