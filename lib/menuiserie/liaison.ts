/**
 * Un seul compte pour Travaux et Menuiserie (administrateurs).
 *
 * À la connexion à l'app, on garde EN MÉMOIRE SEULEMENT (jamais sur le disque)
 * l'identifiant et le mot de passe saisis, le temps d'ouvrir la session Menuiserie :
 *  1. on tente la connexion Menuiserie avec les mêmes identifiants ;
 *  2. si aucun administrateur Menuiserie n'existe encore, on le crée avec ces identifiants ;
 *  3. sinon, dès que l'administrateur s'est connecté une fois à la Menuiserie, son compte
 *     Menuiserie est aligné (même identifiant, même mot de passe) : plus jamais de 2e connexion.
 */
import { connexionMn, creerCompteAdminAutoMn, existeAdminMn, monCompteMn } from './auth';
import { changerMotDePasseCompteMn, modifierCompteMn } from './api';
import type { CompteMn } from './types';

let identifiantsApp: { id: string; pwd: string; nom: string } | null = null;

export function oublierIdentifiantsApp() { identifiantsApp = null; }

/** Appelé juste après une connexion réussie à l'app, pour un compte ayant la Menuiserie. */
export async function ouvrirMenuiserieAvecApp(id: string, pwd: string, nom: string, estAdmin: boolean): Promise<void> {
  identifiantsApp = { id: id.trim().toLowerCase(), pwd, nom };
  const r = await connexionMn(id, pwd);
  if (r.ok && (await monCompteMn())) return;
  if (estAdmin && !(await existeAdminMn()) && pwd.length >= 8) {
    await creerCompteAdminAutoMn({ nom: nom || 'Administrateur', identifiant: id, motDePasse: pwd });
  }
}

/**
 * Après une connexion Menuiserie manuelle d'un administrateur : aligne son compte
 * Menuiserie sur ses identifiants de l'app. Renvoie un message à afficher (ou null).
 */
export async function alignerSurApp(compte: CompteMn): Promise<string | null> {
  if (!identifiantsApp || compte.role !== 'admin') return null;
  const { id, pwd } = identifiantsApp;
  if (compte.identifiant === id) return null;
  if (pwd.length < 8) {
    return "Pour ne plus avoir à te connecter ici, ton mot de passe de l'app doit faire au moins 8 caractères (change-le dans Plus → compte admin).";
  }
  try {
    await modifierCompteMn({ id: compte.id, nom: compte.nom, role: 'admin', usineId: null, identifiant: id, email: compte.email || '', telephone: compte.telephone || '' });
    await changerMotDePasseCompteMn(compte.id, pwd);
    return "Ton compte Menuiserie utilise maintenant les mêmes identifiants que l'app : tu ne te reconnecteras plus ici.";
  } catch (e) {
    return `Alignement impossible : ${(e as Error).message}`;
  }
}
