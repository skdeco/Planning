import { useState, useRef, useCallback } from 'react';

/**
 * Hook pour protéger les soumissions de formulaire :
 * - Empêche le double-clic (debounce 500ms)
 * - Expose un état `submitting` pour désactiver les boutons
 * - Gère les erreurs
 *
 * Usage :
 *   const { submitting, guardedSubmit } = useGuardedSubmit();
 *   <Pressable disabled={submitting} onPress={guardedSubmit(async () => { ... })} />
 */
export function useGuardedSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const lastSubmitRef = useRef(0);

  const guardedSubmit = useCallback(
    (fn: () => void | Promise<void>) => async () => {
      const now = Date.now();
      if (submitting || now - lastSubmitRef.current < 500) return;
      lastSubmitRef.current = now;
      setSubmitting(true);
      try {
        await fn();
      } finally {
        setSubmitting(false);
      }
    },
    [submitting],
  );

  return { submitting, guardedSubmit };
}
