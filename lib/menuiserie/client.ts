/**
 * Client Supabase de l'espace Menuiserie : connexion sécurisée (Supabase Auth)
 * avec session persistée, distincte du client historique de l'app Travaux.
 * Créé à la demande (évite tout accès au stockage pendant le rendu statique web).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

let instance: SupabaseClient | null = null;

export function mn(): SupabaseClient {
  if (!instance) {
    instance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        storageKey: 'sk-menuiserie-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return instance;
}

/**
 * Client jetable pour créer le compte d'une autre personne sans toucher
 * à la session de l'administrateur connecté.
 */
export function mnClientJetable(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Domaine technique des comptes créés avec un simple identifiant (pas d'e-mail réel). */
export const DOMAINE_COMPTES_ID = 'comptes.skdeco.fr';

export function emailTechnique(identifiant: string): string {
  const propre = identifiant.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${propre}@${DOMAINE_COMPTES_ID}`;
}
