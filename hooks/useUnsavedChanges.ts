import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Hook qui empêche la fermeture/refresh accidentel de la page
 * quand des modifications non sauvegardées sont en cours.
 *
 * Usage :
 *   useUnsavedChanges(formIsDirty);
 *
 * Sur web : affiche un dialogue natif "Voulez-vous quitter cette page ?"
 * Sur mobile : pas d'effet (les tabs ne perdent pas le state React)
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requiert returnValue
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
