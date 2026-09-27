/**
 * Connexion à l'espace Menuiserie : e-mail OU identifiant + mot de passe.
 */
import { mn, mnClientJetable, emailTechnique } from './client';
import { viderCacheMn } from './cache';
import type { CompteMn, RoleCompteMn } from './types';

import { tm } from '@/lib/menuiserie/i18n';
export async function connexionMn(emailOuIdentifiant: string, motDePasse: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const saisie = emailOuIdentifiant.trim();
  if (!saisie || !motDePasse) return { ok: false, erreur: 'Renseigne ton e-mail (ou identifiant) et ton mot de passe.' };
  let email = saisie;
  if (!saisie.includes('@')) {
    const { data, error } = await mn().rpc('mn_email_connexion', { p_identifiant: saisie });
    if (error) return { ok: false, erreur: 'Connexion impossible pour le moment. Réessaie.' };
    email = (data as string | null) || emailTechnique(saisie);
  }
  const { error } = await mn().auth.signInWithPassword({ email: email.toLowerCase(), password: motDePasse });
  if (error) return { ok: false, erreur: 'E-mail / identifiant ou mot de passe incorrect.' };
  return { ok: true };
}

export async function deconnexionMn(): Promise<void> {
  viderCacheMn();
  await mn().auth.signOut();
}

export async function monCompteMn(): Promise<CompteMn | null> {
  const { data, error } = await mn().rpc('mn_mon_compte');
  if (error || !data) return null;
  const c = data as CompteMn;
  return c.id ? c : null;
}

export async function existeAdminMn(): Promise<boolean> {
  const { data } = await mn().rpc('mn_existe_admin');
  return data === true;
}

/** Tout premier administrateur : crée la connexion puis la fiche admin. */
export async function creerPremierAdminMn(p: { nom: string; email: string; motDePasse: string; identifiant?: string; appRef?: string }): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const email = p.email.trim().toLowerCase();
  const { error: e1 } = await mn().auth.signUp({ email, password: p.motDePasse });
  if (e1) return { ok: false, erreur: traduireErreurAuth(e1.message) };
  const { error: e2 } = await mn().auth.signInWithPassword({ email, password: p.motDePasse });
  if (e2) return { ok: false, erreur: "Compte créé mais connexion refusée : vérifie que la confirmation d'e-mail est désactivée dans Supabase." };
  const { error: e3 } = await mn().rpc('mn_creer_premier_admin', { p_nom: p.nom, p_identifiant: p.identifiant || '', p_app_ref: p.appRef || null });
  if (e3) return { ok: false, erreur: e3.message };
  return { ok: true };
}

/** Création d'un compte par un administrateur (e-mail réel et/ou identifiant). */
export async function creerCompteMn(p: {
  nom: string; role: RoleCompteMn; motDePasse: string;
  email?: string; identifiant?: string; telephone?: string; usineId?: string | null; appRef?: string | null;
}): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const identifiant = p.identifiant?.trim().toLowerCase() || '';
  const emailReel = p.email?.trim().toLowerCase() || '';
  if (!emailReel && !identifiant) return { ok: false, erreur: 'Indique un e-mail ou un identifiant.' };
  if (p.motDePasse.length < 8) return { ok: false, erreur: 'Mot de passe : 8 caractères minimum.' };
  const authEmail = emailReel || emailTechnique(identifiant);

  const jetable = mnClientJetable();
  const { data, error } = await jetable.auth.signUp({ email: authEmail, password: p.motDePasse });
  if (error || !data.user) return { ok: false, erreur: traduireErreurAuth(error?.message || '') };

  const { error: e2 } = await mn().from('mn_comptes').insert({
    user_id: data.user.id, nom: p.nom.trim(), role: p.role,
    usine_id: p.usineId || null, identifiant: identifiant || null,
    email: emailReel || null, telephone: p.telephone?.trim() || null,
    auth_email: authEmail, app_ref: p.appRef || null,
  });
  if (e2) return { ok: false, erreur: e2.message.includes('duplicate') ? 'Cet identifiant est déjà utilisé.' : e2.message };
  return { ok: true };
}

export async function motDePasseOublieMn(email: string): Promise<boolean> {
  const { error } = await mn().auth.resetPasswordForEmail(email.trim().toLowerCase());
  return !error;
}

function traduireErreurAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail / identifiant.';
  if (m.includes('password')) return 'Mot de passe trop faible (8 caractères minimum).';
  if (m.includes('rate limit')) return 'Trop de créations rapprochées : réessaie dans quelques minutes.';
  if (m.includes('invalid')) return 'Adresse e-mail invalide.';
  return msg || 'Erreur inconnue.';
}

/** Premier administrateur créé automatiquement avec les identifiants de l'app (identifiant seul). */
export async function creerCompteAdminAutoMn(p: { nom: string; identifiant: string; motDePasse: string }): Promise<boolean> {
  const email = emailTechnique(p.identifiant);
  const { error: e1 } = await mn().auth.signUp({ email, password: p.motDePasse });
  if (e1) return false;
  const { error: e2 } = await mn().auth.signInWithPassword({ email, password: p.motDePasse });
  if (e2) return false;
  const { error: e3 } = await mn().rpc('mn_creer_premier_admin', { p_nom: p.nom, p_identifiant: p.identifiant, p_app_ref: null });
  return !e3;
}

/** Le compte connecté change son mot de passe. */
export async function changerMonMotDePasseMn(motDePasse: string): Promise<void> {
  if (motDePasse.length < 8) throw new Error(tm("Mot de passe : 8 caractères minimum."));
  const { error } = await mn().auth.updateUser({ password: motDePasse });
  if (error) throw new Error(traduireErreurAuth(error.message));
}

/** Le compte connecté change son identifiant et / ou son e-mail de connexion. */
export async function changerMesIdentifiantsMn(identifiant: string, email: string): Promise<void> {
  const { error } = await mn().rpc('mn_mes_identifiants', { p_identifiant: identifiant, p_email: email });
  if (error) throw new Error(error.message);
}
