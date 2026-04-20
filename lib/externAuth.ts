/**
 * Auth externe : utilitaires pour hasher/vérifier les mots de passe
 * des apporteurs (clients, architectes, apporteurs, contractants).
 *
 * Hash : SHA-256(salt + mot_de_passe). Salt généré au premier set.
 * Le `motDePasseVisible` stocké séparément permet à l'admin de consulter
 * le mot de passe en clair (fonctionnalité demandée par SK DECO).
 */
import * as Crypto from 'expo-crypto';
import type { Apporteur } from '@/app/types';

export async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}::${password}`
  );
}

export function generateSalt(): string {
  const arr = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generatePassword(length = 10): string {
  // Caractères lisibles, sans ambiguïté (O/0, I/l)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const arr = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

/**
 * Vérifie un mot de passe contre un apporteur.
 * Gère la compat legacy (motDePasse en clair → migre vers hash à la volée).
 */
export async function verifierMotDePasse(
  apporteur: Apporteur,
  password: string
): Promise<{ ok: boolean; needsMigration?: boolean }> {
  if (!apporteur.accesApp) return { ok: false };

  if (apporteur.motDePasseHash && apporteur.motDePasseSalt) {
    const hash = await hashPassword(password, apporteur.motDePasseSalt);
    return { ok: hash === apporteur.motDePasseHash };
  }

  // Fallback legacy : comparaison en clair (pour les anciens comptes)
  if (apporteur.motDePasse && apporteur.motDePasse === password) {
    return { ok: true, needsMigration: true };
  }
  return { ok: false };
}

/**
 * Prépare la mise à jour d'un apporteur avec un nouveau mot de passe.
 * Retourne les champs à merger : { motDePasseHash, motDePasseSalt, motDePasseVisible, motDePasse: undefined }.
 */
export async function preparerChangementMotDePasse(password: string) {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  return {
    motDePasseHash: hash,
    motDePasseSalt: salt,
    motDePasseVisible: password,  // consultable par l'admin uniquement
    motDePasse: undefined as string | undefined,  // efface l'ancien champ en clair
  };
}
