/** Suppléments au devis : proposés par l'administrateur, acceptés ou refusés par le client. */
import { mn } from './client';
import { journaliser } from './api';
import type { CompteMn } from './types';

export type StatutSupplementMn = 'propose' | 'accepte' | 'refuse';
export interface SupplementMn {
  id: string;
  chantier_id: string;
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
export async function ajouterSupplementMn(moi: CompteMn, chantierId: string, s: { libelle: string; montant_ht: number; description?: string }) {
  ok(await mn().from('mn_supplements').insert({ chantier_id: chantierId, libelle: s.libelle.trim(), montant_ht: s.montant_ht, description: s.description?.trim() || null, created_by_nom: moi.nom }));
  journaliser(moi, chantierId, 'Supplément proposé', `${s.libelle} : ${s.montant_ht} € HT`).catch(() => {});
}
export async function supprimerSupplementMn(moi: CompteMn, s: SupplementMn) {
  ok(await mn().from('mn_supplements').delete().eq('id', s.id));
  journaliser(moi, s.chantier_id, 'Supplément retiré', s.libelle).catch(() => {});
}
export async function repondreSupplementMn(id: string, accord: boolean, commentaire?: string) {
  ok(await mn().rpc('mn_supplement_repondre', { p_id: id, p_ok: accord, p_commentaire: commentaire || null }));
}
export const totalAccepte = (l: SupplementMn[]) => l.filter(s => s.statut === 'accepte').reduce((x, s) => x + Number(s.montant_ht), 0);
