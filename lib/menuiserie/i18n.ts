/**
 * Traduction des espaces Menuiserie et Planning direction.
 * Les textes sont écrits en français dans le code et traduits via tm('texte français').
 * Un texte absent du dictionnaire reste en français. {0}, {1}… sont remplacés par les valeurs.
 */
import type { Language } from '@/i18n';
import en from '@/i18n/menuiserie/en';
import es from '@/i18n/menuiserie/es';
import pt from '@/i18n/menuiserie/pt';
import ru from '@/i18n/menuiserie/ru';
import ar from '@/i18n/menuiserie/ar';

const DICOS: Partial<Record<Language, Record<string, string>>> = { en, es, pt, ru, ar };
const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', pt: 'pt-PT', ru: 'ru-RU', ar: 'ar-EG' };

let langue: Language = 'fr';

/** Appelé par LanguageProvider à chaque rendu. */
export function definirLangueMn(l: Language) { langue = l; }
export function langueMn(): Language { return langue; }
export function localeMn(): string { return LOCALES[langue] ?? 'fr-FR'; }

export function tm(s: string, ...vars: unknown[]): string {
  const d = DICOS[langue];
  let r = (d && d[s]) || s;
  if (vars.length) r = r.replace(/\{(\d+)\}/g, (_, i) => { const v = vars[Number(i)]; return v == null ? '' : String(v); });
  return r;
}

const caches = new WeakMap<object, object>();
/** Rend un objet (ou tableau) de libellés traduit à la lecture : chaque texte passe par tm(). */
export function traduit<T extends object>(o: T): T {
  const deja = caches.get(o);
  if (deja) return deja as T;
  const p = new Proxy(o, {
    get(cible, cle, recepteur) {
      const v = Reflect.get(cible, cle, recepteur);
      if (typeof v === 'string') return tm(v);
      if (v && typeof v === 'object') return traduit(v as object);
      return v;
    },
  });
  caches.set(o, p);
  return p;
}
