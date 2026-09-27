/**
 * Session de l'espace Menuiserie : compte connecté (table mn_comptes) via la
 * connexion sécurisée. Fournie par app/menuiserie/_layout.tsx.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { mn } from './client';
import { monCompteMn, deconnexionMn } from './auth';
import type { CompteMn } from './types';

interface SessionMnValue {
  compte: CompteMn | null;
  chargement: boolean;
  recharger: () => Promise<CompteMn | null>;
  deconnecter: () => Promise<void>;
}

const Ctx = createContext<SessionMnValue>({
  compte: null, chargement: true, recharger: async () => null, deconnecter: async () => {},
});

export function SessionMnProvider({ children }: { children: React.ReactNode }) {
  const [compte, setCompte] = useState<CompteMn | null>(null);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async () => {
    let c: CompteMn | null = null;
    try {
      const { data } = await mn().auth.getSession();
      c = data.session ? await monCompteMn() : null;
    } catch { c = null; }
    setCompte(c);
    setChargement(false);
    return c;
  }, []);

  useEffect(() => {
    recharger();
    // IMPORTANT : ne jamais appeler Supabase directement dans ce rappel (verrou interne :
    // la connexion resterait bloquée). On diffère d'un tour de boucle.
    const { data: sub } = mn().auth.onAuthStateChange(() => { setTimeout(() => { recharger(); }, 0); });
    return () => sub.subscription.unsubscribe();
  }, [recharger]);

  const deconnecter = useCallback(async () => {
    await deconnexionMn();
    setCompte(null);
  }, []);

  return <Ctx.Provider value={{ compte, chargement, recharger, deconnecter }}>{children}</Ctx.Provider>;
}

export function useSessionMn() {
  return useContext(Ctx);
}

/** Compte connecté, garanti non nul (à utiliser sous le layout Menuiserie). */
export function useCompteMn(): CompteMn {
  const { compte } = useContext(Ctx);
  if (!compte) throw new Error('Compte Menuiserie absent');
  return compte;
}
