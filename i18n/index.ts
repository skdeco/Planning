import fr from './fr';
import en from './en';
import es from './es';
import pt from './pt';
import ru from './ru';

export type Language = 'fr' | 'en' | 'es' | 'pt' | 'ru';

export const LANGUAGES: { code: Language; label: string; flag: string; nativeLabel: string }[] = [
  { code: 'fr', label: 'Français',    flag: '🇫🇷', nativeLabel: 'Français' },
  { code: 'en', label: 'English',     flag: '🇬🇧', nativeLabel: 'English' },
  { code: 'es', label: 'Español',     flag: '🇪🇸', nativeLabel: 'Español' },
  { code: 'pt', label: 'Português',   flag: '🇵🇹', nativeLabel: 'Português' },
  { code: 'ru', label: 'Русский',     flag: '🇷🇺', nativeLabel: 'Русский' },
];

const translations = { fr, en, es, pt, ru };

export type TranslationKeys = typeof fr;

export function getTranslations(lang: Language): TranslationKeys {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (translations[lang] as any) ?? translations.fr;
}

export { fr, en, es, pt, ru };
