/**
 * Cache mémoire des écrans Menuiserie (« affiche tout de suite, rafraîchit en fond »).
 * En revenant sur un écran déjà vu, les données s'affichent instantanément ;
 * la version à jour arrive ensuite sans écran de chargement.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

const cache = new Map<string, unknown>();

/** Compte Menuiserie gardé en mémoire (vidé à la déconnexion). */
let compteMemo: unknown = null;
export function lireCompteMemo<T>(): T | null { return compteMemo as T | null; }
export function ecrireCompteMemo(c: unknown) { compteMemo = c; }

export function lireCacheMn<T>(cle: string): T | undefined { return cache.get(cle) as T | undefined; }
export function ecrireCacheMn<T>(cle: string, v: T) { cache.set(cle, v); }
/** Vide le cache (déconnexion) — ou seulement les clés commençant par `prefixe`. */
export function viderCacheMn(prefixe?: string) {
  if (!prefixe) { cache.clear(); compteMemo = null; return; }
  for (const k of Array.from(cache.keys())) if (k.startsWith(prefixe)) cache.delete(k);
}

/** Précharge une donnée en arrière-plan (ex. la fiche d'un chantier au toucher). */
export function prechargerMn<T>(cle: string, charger: () => Promise<T>) {
  if (cache.has(cle)) return;
  charger().then(v => cache.set(cle, v)).catch(() => {});
}

export function useDonneesMn<T>(cle: string | null, charger: () => Promise<T>) {
  const [donnees, setDonnees] = useState<T | undefined>(() => (cle ? (cache.get(cle) as T | undefined) : undefined));
  const [erreur, setErreur] = useState('');
  const chargeur = useRef(charger); chargeur.current = charger;

  const recharger = useCallback(async () => {
    if (!cle) return;
    try {
      const v = await chargeur.current();
      cache.set(cle, v);
      setDonnees(v);
      setErreur('');
    } catch (e) { setErreur((e as Error).message); }
  }, [cle]);

  useFocusEffect(useCallback(() => { recharger(); }, [recharger]));
  return { donnees, erreur, recharger };
}
