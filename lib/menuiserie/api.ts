/**
 * Accès aux données Menuiserie. Toutes les lectures / écritures passent par la
 * connexion sécurisée : le serveur (RLS) ne renvoie que ce que le compte a le droit de voir.
 */
import { Platform } from 'react-native';
import { mn } from './client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import type {
  ChantierMn, CompteMn, DocumentMn, EtapeMn, IntervenantMn, JournalMn, MontantMn,
  StatutEtapeMn, UsineMn,
} from './types';

import { tm } from '@/lib/menuiserie/i18n';
const BUCKET = 'menuiserie';

function verifier<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ── Lecture globale (accueil) ───────────────────────────────────────────────
export interface DonneesAccueilMn {
  chantiers: ChantierMn[];
  usines: UsineMn[];
  intervenants: IntervenantMn[];
  montants: MontantMn[];
  etapes: EtapeMn[];
}

export async function chargerAccueilMn(): Promise<DonneesAccueilMn> {
  const [ch, us, it, mo, et] = await Promise.all([
    mn().from('mn_chantiers').select('*').order('updated_at', { ascending: false }),
    mn().from('mn_usines').select('*').order('nom'),
    mn().from('mn_intervenants').select('*'),
    mn().from('mn_montants').select('*'),
    mn().from('mn_etapes').select('*'),
  ]);
  return {
    chantiers: verifier(ch) || [], usines: verifier(us) || [], intervenants: verifier(it) || [],
    montants: verifier(mo) || [], etapes: verifier(et) || [],
  };
}

// ── Chantier ───────────────────────────────────────────────────────────────
export interface DonneesChantierMn {
  chantier: ChantierMn;
  intervenants: IntervenantMn[];
  etapes: EtapeMn[];
  documents: DocumentMn[];
  montants: MontantMn[];
  journal: JournalMn[];
}

export async function chargerChantierMn(id: string): Promise<DonneesChantierMn> {
  const [ch, it, et, docs, mo, jo] = await Promise.all([
    mn().from('mn_chantiers').select('*').eq('id', id).single(),
    mn().from('mn_intervenants').select('*').eq('chantier_id', id),
    mn().from('mn_etapes').select('*').eq('chantier_id', id),
    mn().from('mn_documents').select('*').eq('chantier_id', id).eq('supprime', false).order('created_at', { ascending: false }),
    mn().from('mn_montants').select('*').eq('chantier_id', id).order('created_at'),
    mn().from('mn_journal').select('*').eq('chantier_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  return {
    chantier: verifier(ch), intervenants: verifier(it) || [], etapes: verifier(et) || [],
    documents: verifier(docs) || [], montants: verifier(mo) || [], journal: verifier(jo) || [],
  };
}

export type NouveauChantierMn = Omit<ChantierMn, 'id' | 'created_at' | 'updated_at' | 'created_by'>;

export async function creerChantierMn(
  moi: CompteMn, champs: NouveauChantierMn, intervenants: { role: IntervenantMn['role']; nom: string }[],
): Promise<string> {
  const ch = verifier(await mn().from('mn_chantiers').insert({ ...champs, created_by: moi.id }).select('id').single()) as { id: string };
  const lignes = intervenants.filter(i => i.nom.trim()).map(i => ({ chantier_id: ch.id, role: i.role, nom: i.nom.trim() }));
  if (lignes.length) verifier(await mn().from('mn_intervenants').insert(lignes));
  await journaliser(moi, ch.id, 'Chantier créé', champs.nom);
  return ch.id;
}

export async function majChantierMn(moi: CompteMn, id: string, patch: Partial<NouveauChantierMn>, detail: string): Promise<void> {
  verifier(await mn().from('mn_chantiers').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
  await journaliser(moi, id, 'Chantier modifié', detail);
}

// ── Étapes ─────────────────────────────────────────────────────────────────
export async function majEtapeMn(
  moi: CompteMn, chantierId: string, etape: string, patch: { statut?: StatutEtapeMn; infos?: Record<string, string> }, detail: string,
): Promise<void> {
  const existant = verifier(await mn().from('mn_etapes').select('*').eq('chantier_id', chantierId).eq('etape', etape).maybeSingle()) as EtapeMn | null;
  verifier(await mn().from('mn_etapes').upsert({
    chantier_id: chantierId, etape,
    statut: patch.statut ?? existant?.statut ?? 'a_faire',
    infos: { ...(existant?.infos || {}), ...(patch.infos || {}) },
    updated_by_nom: moi.nom, updated_at: new Date().toISOString(),
  }));
  await mn().from('mn_chantiers').update({ updated_at: new Date().toISOString() }).eq('id', chantierId);
  await journaliser(moi, chantierId, `Étape « ${etape} »`, detail);
}

// ── Montants ───────────────────────────────────────────────────────────────
export async function ajouterMontantMn(moi: CompteMn, m: Omit<MontantMn, 'id' | 'created_at' | 'created_by_nom'>): Promise<void> {
  verifier(await mn().from('mn_montants').insert({ ...m, created_by_nom: moi.nom }));
  await journaliser(moi, m.chantier_id, 'Montant ajouté', `${m.libelle || m.type} : ${m.montant_ht} € HT`);
}

export async function supprimerMontantMn(moi: CompteMn, m: MontantMn): Promise<void> {
  verifier(await mn().from('mn_montants').delete().eq('id', m.id));
  await journaliser(moi, m.chantier_id, 'Montant supprimé', `${m.libelle || m.type} : ${m.montant_ht} € HT`);
}

// ── Documents ──────────────────────────────────────────────────────────────
function extension(nom: string, mime?: string | null): string {
  const e = nom.split('.').pop()?.toLowerCase();
  if (e && e.length <= 5 && e !== nom.toLowerCase()) return e;
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

/** Envoie un fichier dans le bucket privé « menuiserie » au chemin donné. */
export async function envoyerFichierMn(chemin: string, uri: string, mime: string): Promise<void> {
  const { data: sess } = await mn().auth.getSession();
  const jeton = sess.session?.access_token;
  if (!jeton) throw new Error(tm("Session expirée : reconnecte-toi."));
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`;
  const headers = { Authorization: `Bearer ${jeton}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': mime };
  let ok = false;
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy');
    const r = await FileSystem.uploadAsync(url, uri, { httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers });
    ok = r.status >= 200 && r.status < 300;
  } else {
    const blob = await (await fetch(uri)).blob();
    const r = await fetch(url, { method: 'POST', headers, body: blob });
    ok = r.ok;
  }
  if (!ok) throw new Error(tm("Envoi du fichier refusé par le serveur."));
}

export function cheminFichierMn(prefixe: string, nom: string, mime?: string | null): string {
  return `${prefixe}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${extension(nom, mime)}`;
}

/** Envoie un fichier (photo / PDF) dans le bucket privé puis l'enregistre. */
export async function deposerDocumentMn(
  moi: CompteMn,
  p: { chantierId: string; etape: string; uri: string; nom: string; mime?: string | null; piece?: string | null; visibilite: string[]; categorieClient?: string | null },
): Promise<void> {
  const mime = p.mime || (extension(p.nom) === 'pdf' ? 'application/pdf' : 'image/jpeg');
  const chemin = cheminFichierMn(`${p.chantierId}/${p.etape}`, p.nom, mime);
  await envoyerFichierMn(chemin, p.uri, mime);
  verifier(await mn().from('mn_documents').insert({
    chantier_id: p.chantierId, etape: p.etape, piece: p.piece || null, nom: p.nom, chemin, mime,
    depose_par: moi.id, depose_par_nom: moi.nom, visibilite: p.visibilite, categorie_client: p.categorieClient || null,
  }));
  await journaliser(moi, p.chantierId, 'Document déposé', `${p.etape}${p.piece ? ` · ${p.piece}` : ''} : ${p.nom}`);
}

/** Partage (ou retire) un document dans une rubrique de l'espace client. */
export async function partagerClientMn(moi: CompteMn, doc: DocumentMn, categorie: string | null): Promise<void> {
  const vis = doc.visibilite.filter(v => v !== 'client');
  if (categorie) vis.push('client');
  verifier(await mn().from('mn_documents').update({ visibilite: vis, categorie_client: categorie }).eq('id', doc.id));
  await journaliser(moi, doc.chantier_id, categorie ? 'Document partagé au client' : 'Partage client retiré', doc.nom);
}

/** Lien temporaire (1 h) pour ouvrir un document privé. */
export async function lienDocumentMn(doc: { chemin: string }): Promise<string | null> {
  const { data } = await mn().storage.from(BUCKET).createSignedUrl(doc.chemin, 3600);
  return data?.signedUrl ?? null;
}

/** Suppression « douce » : le document disparaît mais reste tracé. */
export async function supprimerDocumentMn(moi: CompteMn, doc: DocumentMn): Promise<void> {
  verifier(await mn().from('mn_documents').update({ supprime: true }).eq('id', doc.id));
  await journaliser(moi, doc.chantier_id, 'Document supprimé', doc.nom);
}

// ── Usines & comptes ───────────────────────────────────────────────────────
export async function listerUsinesMn(): Promise<UsineMn[]> {
  return verifier(await mn().from('mn_usines').select('*').order('nom')) || [];
}

export async function enregistrerUsineMn(u: Partial<UsineMn> & { nom: string }): Promise<void> {
  if (u.id) verifier(await mn().from('mn_usines').update(u).eq('id', u.id));
  else verifier(await mn().from('mn_usines').insert(u));
}

export async function listerComptesMn(): Promise<CompteMn[]> {
  return verifier(await mn().from('mn_comptes').select('*').order('nom')) || [];
}

/** Droits d'un employé d'usine (montants, étapes visibles) — réglés par l'admin. */
export async function majDroitsCompteMn(id: string, droits: import('./types').DroitsCompteMn): Promise<void> {
  verifier(await mn().from('mn_comptes').update({ droits }).eq('id', id));
}
export async function activerCompteMn(id: string, actif: boolean): Promise<void> {
  verifier(await mn().from('mn_comptes').update({ actif }).eq('id', id));
}

// ── Journal ────────────────────────────────────────────────────────────────
export async function journaliser(moi: CompteMn, chantierId: string | null, action: string, detail?: string) {
  await mn().from('mn_journal').insert({ chantier_id: chantierId, action, detail: detail || null, par_nom: moi.nom, par_compte: moi.id });
}

// ── Gestion des comptes par un administrateur ─────────────────────────────
export async function modifierCompteMn(p: {
  id: string; nom: string; role: CompteMn['role']; usineId: string | null;
  identifiant: string; email: string; telephone: string;
}): Promise<void> {
  verifier(await mn().rpc('mn_admin_modifier_compte', {
    p_id: p.id, p_nom: p.nom, p_role: p.role, p_usine_id: p.usineId,
    p_identifiant: p.identifiant, p_email: p.email, p_telephone: p.telephone,
  }));
}

export async function changerMotDePasseCompteMn(id: string, motDePasse: string): Promise<void> {
  verifier(await mn().rpc('mn_admin_mot_de_passe', { p_id: id, p_mdp: motDePasse }));
}

export async function supprimerCompteMn(id: string): Promise<void> {
  verifier(await mn().rpc('mn_admin_supprimer_compte', { p_id: id }));
}

/** Suppression définitive d'un chantier : fichiers du stockage privé, puis toutes ses données. */
export async function supprimerChantierMn(id: string): Promise<void> {
  const { data } = await mn().from('mn_documents').select('chemin').eq('chantier_id', id);
  const chemins = ((data as { chemin: string }[]) || []).map(d => d.chemin);
  for (let i = 0; i < chemins.length; i += 100) {
    await mn().storage.from(BUCKET).remove(chemins.slice(i, i + 100));
  }
  verifier(await mn().from('mn_chantiers').delete().eq('id', id));
}
