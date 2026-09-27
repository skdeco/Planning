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
  recharger: () => Promise<void>;
  deconnecter: () => Promise<void>;
}

const Ctx = createContext<SessionMnValue>({
  compte: null, chargement: true, recharger: async () => {}, deconnecter: async () => {},
});

export function SessionMnProvider({ children }: { children: React.ReactNode }) {
  const [compte, setCompte] = useState<CompteMn | null>(null);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async () => {
    const { data } = await mn().auth.getSession();
    setCompte(data.session ? await monCompteMn() : null);
    setChargement(false);
  }, []);

  useEffect(() => {
    recharger();
    const { data: sub } = mn().auth.onAuthStateChange(() => { recharger(); });
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
