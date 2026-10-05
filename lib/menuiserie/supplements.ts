/** Suppléments au devis : proposés par l'administrateur, acceptés ou refusés par le client. */
import { mn } from './client';
import { journaliser } from './api';
import type { CompteMn } from './types';

export type StatutSupplementMn = 'propose' | 'accepte' | 'refuse';
export interface SupplementMn {
  id: string;
  chantier_id: string;
  cote: 'client' | 'usine';
  usine_id: string | null;
  montant_ttc: number | null;
  document_id: string | null;
  libelle: string;
  description: string | null;
  montant_ht: number;
  statut: StatutSupplementMn;
  commentaire_client: string | null;
  repondu_par_nom: string | null;
  repondu_le: string | null;
  created_by_nom: string | null;
  created_at: string;
}

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function listerSupplementsMn(chantierId: string): Promise<SupplementMn[]> {
  return ok(await mn().from('mn_supplements').select('*').eq('chantier_id', chantierId).order('created_at')) || [];
}
export async function ajouterSupplementMn(moi: CompteMn, chantierId: string, s: {
  cote: 'client' | 'usine'; usineId: string | null; libelle: string; montant_ht: number; montant_ttc?: number | null; documentId?: string | null; description?: string;
}) {
  // Côté usine : un supplément saisi par l'admin est accepté d'office ; proposé par l'usine, il attend l'admin
  const statut = s.cote === 'usine' && moi.role === 'admin' ? 'accepte' : 'propose';
  ok(await mn().from('mn_supplements').insert({
    chantier_id: chantierId, cote: s.cote, usine_id: s.cote === 'usine' ? s.usineId : null, libelle: s.libelle.trim(),
    montant_ht: s.montant_ht, montant_ttc: s.montant_ttc ?? null, document_id: s.documentId || null,
    description: s.description?.trim() || null, created_by_nom: moi.nom, statut,
  }));
  journaliser(moi, chantierId, s.cote === 'client' ? 'Supplément proposé au client' : 'Supplément usine', `${s.libelle} : ${s.montant_ht} € HT`).catch(() => {});
}
export async function joindrePdfSupplementMn(id: string, documentId: string, ht?: number | null, ttc?: number | null) {
  const patch: Record<string, unknown> = { document_id: documentId };
  if (ht != null) patch.montant_ht = ht;
  if (ttc != null) patch.montant_ttc = ttc;
  ok(await mn().from('mn_supplements').update(patch).eq('id', id));
}
export async function supprimerSupplementMn(moi: CompteMn, s: SupplementMn) {
  ok(await mn().from('mn_supplements').delete().eq('id', s.id));
  journaliser(moi, s.chantier_id, 'Supplément retiré', s.libelle).catch(() => {});
}
export async function repondreSupplementMn(id: string, accord: boolean, commentaire?: string) {
  ok(await mn().rpc('mn_supplement_repondre', { p_id: id, p_ok: accord, p_commentaire: commentaire || null }));
}
export const totalAccepte = (l: SupplementMn[]) => l.filter(s => s.statut === 'accepte').reduce((x, s) => x + Number(s.montant_ht), 0);
