/**
 * Accès aux données Menuiserie — fonctions des étapes 2b / 2c / 2d :
 * intervenants, vérifications, réserves, messagerie, RDV, signalements,
 * ressources humaines, fournisseurs, catalogue, chargement par rôle.
 */
import { mn } from './client';
import { cheminFichierMn, envoyerFichierMn, journaliser } from './api';
import type {
  ArticleCatalogueMn, ChantierMn, CompteMn, CongeMn, DocRhMn, DocumentMn, EtapeMn, FournisseurMn,
  IntervenantMn, MessageMn, MontantMn, PointageMn, RdvMn, ReserveMn, RoleIntervenantMn, SignalementMn,
  UsineMn, VerificationMn,
} from './types';
import { groupeMn } from './types';

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ── Chantiers vus par un rôle non admin ────────────────────────────────────
/** Liste des chantiers accessibles : sans info client pour l'usine et le poseur. */
export async function mesChantiersMn(moi: CompteMn): Promise<ChantierMn[]> {
  const g = groupeMn(moi.role);
  const table = g === 'client' || g === 'apporteur' ? 'mn_chantiers' : 'mn_chantiers_vue';
  return (ok(await mn().from(table).select('*').order('updated_at', { ascending: false })) || []) as ChantierMn[];
}

export interface ChantierRoleMn {
  chantier: ChantierMn;
  etapes: EtapeMn[];
  documents: DocumentMn[];
  montants: MontantMn[];
  reserves: ReserveMn[];
  verifications: VerificationMn[];
}

export async function chantierPourRoleMn(moi: CompteMn, id: string): Promise<ChantierRoleMn> {
  const g = groupeMn(moi.role);
  const table = g === 'client' || g === 'apporteur' ? 'mn_chantiers' : 'mn_chantiers_vue';
  const [ch, et, docs, mo, re, ve] = await Promise.all([
    mn().from(table).select('*').eq('id', id).single(),
    mn().from('mn_etapes').select('*').eq('chantier_id', id),
    mn().from('mn_documents').select('*').eq('chantier_id', id).eq('supprime', false).order('created_at', { ascending: false }),
    mn().from('mn_montants').select('*').eq('chantier_id', id).order('created_at'),
    mn().from('mn_reserves').select('*').eq('chantier_id', id).order('created_at'),
    mn().from('mn_verifications').select('*').eq('chantier_id', id).order('meuble'),
  ]);
  return {
    chantier: ok(ch) as ChantierMn, etapes: ok(et) || [], documents: ok(docs) || [], montants: ok(mo) || [],
    reserves: ok(re) || [], verifications: ok(ve) || [],
  };
}

// ── Intervenants (lien avec les comptes) ───────────────────────────────────
export async function ajouterIntervenantMn(moi: CompteMn, chantierId: string, role: RoleIntervenantMn, nom: string, compteId: string | null) {
  ok(await mn().from('mn_intervenants').insert({ chantier_id: chantierId, role, nom: nom.trim(), compte_id: compteId }));
  await journaliser(moi, chantierId, 'Intervenant ajouté', `${role} : ${nom}`);
}
export async function lierCompteIntervenantMn(moi: CompteMn, it: IntervenantMn, compteId: string | null) {
  ok(await mn().from('mn_intervenants').update({ compte_id: compteId }).eq('id', it.id));
  await journaliser(moi, it.chantier_id, compteId ? 'Accès donné' : 'Accès retiré', `${it.role} : ${it.nom}`);
}
export async function retirerIntervenantMn(moi: CompteMn, it: IntervenantMn) {
  ok(await mn().from('mn_intervenants').delete().eq('id', it.id));
  await journaliser(moi, it.chantier_id, 'Intervenant retiré', `${it.role} : ${it.nom}`);
}

// ── Vérification des meubles ───────────────────────────────────────────────
export async function listerVerificationsMn(chantierId: string): Promise<VerificationMn[]> {
  return ok(await mn().from('mn_verifications').select('*').eq('chantier_id', chantierId).order('meuble')) || [];
}
export async function enregistrerVerificationMn(moi: CompteMn, v: { chantier_id: string; meuble: string; criteres: VerificationMn['criteres']; commentaire?: string | null }) {
  ok(await mn().from('mn_verifications').upsert({ ...v, updated_by_nom: moi.nom, updated_at: new Date().toISOString() }, { onConflict: 'chantier_id,meuble' }));
}

// ── Réserves ───────────────────────────────────────────────────────────────
export async function listerReservesMn(chantierId: string): Promise<ReserveMn[]> {
  return ok(await mn().from('mn_reserves').select('*').eq('chantier_id', chantierId).order('created_at')) || [];
}
export async function ajouterReserveMn(moi: CompteMn, chantierId: string, meuble: string, description: string) {
  ok(await mn().from('mn_reserves').insert({ chantier_id: chantierId, meuble: meuble.trim() || null, description: description.trim(), created_by_nom: moi.nom }));
  await journaliser(moi, chantierId, 'Réserve ajoutée', `${meuble} : ${description}`);
}
export async function majReserveMn(moi: CompteMn, r: ReserveMn, patch: Partial<Pick<ReserveMn, 'statut' | 'transmise_usine' | 'date_envoi_elements'>>) {
  ok(await mn().from('mn_reserves').update(patch).eq('id', r.id));
  await journaliser(moi, r.chantier_id, 'Réserve mise à jour', r.description);
}
export async function supprimerReserveMn(r: ReserveMn) {
  ok(await mn().from('mn_reserves').delete().eq('id', r.id));
}

// ── Messagerie & RDV ───────────────────────────────────────────────────────
export async function listerMessagesMn(chantierId: string): Promise<MessageMn[]> {
  return ok(await mn().from('mn_messages').select('*').eq('chantier_id', chantierId).order('created_at')) || [];
}
export async function envoyerMessageMn(moi: CompteMn, chantierId: string, texte: string) {
  ok(await mn().from('mn_messages').insert({ chantier_id: chantierId, auteur_compte: moi.id, auteur_nom: moi.nom, texte: texte.trim() }));
}
export async function listerRdvMn(chantierId?: string): Promise<RdvMn[]> {
  let q = mn().from('mn_rdv').select('*').order('date_rdv');
  if (chantierId) q = q.eq('chantier_id', chantierId);
  return ok(await q) || [];
}
export async function proposerRdvMn(p: { chantierId: string; titre: string; date: string; debut: string; fin?: string; lieu?: string }) {
  ok(await mn().rpc('mn_rdv_proposer', { p_chantier: p.chantierId, p_titre: p.titre, p_date: p.date, p_debut: p.debut, p_fin: p.fin || '', p_lieu: p.lieu || '' }));
}
export async function repondreRdvMn(rdvId: string, accord: boolean) {
  ok(await mn().rpc('mn_rdv_repondre', { p_rdv: rdvId, p_ok: accord }));
}

// ── Signalements du poseur ─────────────────────────────────────────────────
export async function listerSignalementsMn(chantierId?: string): Promise<SignalementMn[]> {
  let q = mn().from('mn_signalements').select('*').order('created_at', { ascending: false });
  if (chantierId) q = q.eq('chantier_id', chantierId);
  return ok(await q) || [];
}
export async function signalerMn(moi: CompteMn, s: { chantier_id: string; type: SignalementMn['type']; texte: string; meuble?: string; nouvelle_cote?: string }) {
  ok(await mn().from('mn_signalements').insert({ ...s, meuble: s.meuble || null, nouvelle_cote: s.nouvelle_cote || null, par_compte: moi.id, par_nom: moi.nom }));
  await journaliser(moi, s.chantier_id, s.type === 'materiel' ? 'Demande de matériel' : 'Problème signalé', s.texte);
}
export async function traiterSignalementMn(id: string) {
  ok(await mn().from('mn_signalements').update({ statut: 'traite' }).eq('id', id));
}

// ── Ressources humaines ────────────────────────────────────────────────────
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function pointerMn(moi: CompteMn, p: { type: 'arrivee' | 'depart'; position: { lat: number; lng: number } | null; usine: UsineMn | null; chantierId?: string | null }) {
  let distance: number | null = null;
  if (p.position && p.usine?.latitude != null && p.usine.longitude != null) {
    distance = distanceMetres(p.position, { lat: p.usine.latitude, lng: p.usine.longitude });
  }
  const horsZone = !p.chantierId && (distance == null ? !!p.usine : distance > (p.usine?.rayon_m || 200));
  ok(await mn().from('mn_pointages').insert({
    compte_id: moi.id, usine_id: moi.usine_id, chantier_id: p.chantierId || null, type: p.type,
    latitude: p.position?.lat ?? null, longitude: p.position?.lng ?? null, distance_m: distance, hors_zone: horsZone,
  }));
  return { distance, horsZone };
}
export async function listerPointagesMn(filtre: { compteId?: string; usineId?: string; depuis?: string }): Promise<PointageMn[]> {
  let q = mn().from('mn_pointages').select('*').order('horodatage', { ascending: false }).limit(300);
  if (filtre.compteId) q = q.eq('compte_id', filtre.compteId);
  if (filtre.usineId) q = q.eq('usine_id', filtre.usineId);
  if (filtre.depuis) q = q.gte('horodatage', filtre.depuis);
  return ok(await q) || [];
}

export async function listerCongesMn(filtre: { compteId?: string; usineId?: string }): Promise<CongeMn[]> {
  let q = mn().from('mn_conges').select('*').order('date_debut', { ascending: false });
  if (filtre.compteId) q = q.eq('compte_id', filtre.compteId);
  if (filtre.usineId) q = q.eq('usine_id', filtre.usineId);
  return ok(await q) || [];
}
export async function demanderCongeMn(moi: CompteMn, c: { type: CongeMn['type']; date_debut: string; date_fin: string; jours: number; motif?: string; justificatif?: { uri: string; nom: string; mime: string } | null }) {
  let chemin: string | null = null;
  if (c.justificatif) {
    chemin = cheminFichierMn(`rh/${moi.usine_id || 'sans'}/${moi.id}`, c.justificatif.nom, c.justificatif.mime);
    await envoyerFichierMn(chemin, c.justificatif.uri, c.justificatif.mime);
  }
  ok(await mn().from('mn_conges').insert({
    compte_id: moi.id, usine_id: moi.usine_id, type: c.type, date_debut: c.date_debut, date_fin: c.date_fin,
    jours: c.jours, motif: c.motif?.trim() || null, justificatif_chemin: chemin,
  }));
}
export async function traiterCongeMn(moi: CompteMn, id: string, statut: 'approuve' | 'refuse') {
  ok(await mn().from('mn_conges').update({ statut, traite_par_nom: moi.nom }).eq('id', id));
}

export async function listerDocsRhMn(filtre: { compteId?: string; usineId?: string }): Promise<DocRhMn[]> {
  let q = mn().from('mn_docs_rh').select('*').order('created_at', { ascending: false });
  if (filtre.compteId) q = q.eq('compte_id', filtre.compteId);
  if (filtre.usineId) q = q.eq('usine_id', filtre.usineId);
  return ok(await q) || [];
}
export async function deposerDocRhMn(employe: CompteMn, f: { uri: string; nom: string; mime: string; mois: string }) {
  const chemin = cheminFichierMn(`rh/${employe.usine_id || 'sans'}/${employe.id}`, f.nom, f.mime);
  await envoyerFichierMn(chemin, f.uri, f.mime);
  ok(await mn().from('mn_docs_rh').insert({ compte_id: employe.id, usine_id: employe.usine_id, type: 'fiche_paie', mois: f.mois || null, nom: f.nom, chemin }));
}

// ── Comptes de l'usine & position de l'usine ───────────────────────────────
export async function comptesDeLUsineMn(usineId: string): Promise<CompteMn[]> {
  return ok(await mn().from('mn_comptes').select('*').eq('usine_id', usineId).order('nom')) || [];
}
export async function monUsineMn(moi: CompteMn): Promise<UsineMn | null> {
  if (!moi.usine_id) return null;
  return ok(await mn().from('mn_usines').select('*').eq('id', moi.usine_id).maybeSingle()) as UsineMn | null;
}
export async function positionUsineMn(usineId: string, lat: number, lng: number) {
  ok(await mn().from('mn_usines').update({ latitude: lat, longitude: lng }).eq('id', usineId));
}

// ── Fournisseurs & catalogue ───────────────────────────────────────────────
export async function listerFournisseursMn(): Promise<FournisseurMn[]> {
  return ok(await mn().from('mn_fournisseurs').select('*').order('nom')) || [];
}
export async function enregistrerFournisseurMn(f: Partial<FournisseurMn> & { nom: string }) {
  if (f.id) ok(await mn().from('mn_fournisseurs').update(f).eq('id', f.id));
  else ok(await mn().from('mn_fournisseurs').insert(f));
}
export async function listerCatalogueMn(): Promise<ArticleCatalogueMn[]> {
  return ok(await mn().from('mn_catalogue').select('*').order('designation')) || [];
}
export async function enregistrerArticleMn(a: Partial<ArticleCatalogueMn> & { designation: string; categorie: ArticleCatalogueMn['categorie'] }, photo?: { uri: string; nom: string; mime: string } | null) {
  const ligne: Partial<ArticleCatalogueMn> = { ...a };
  if (photo) {
    const chemin = cheminFichierMn(`catalogue/${a.usine_id || 'commun'}`, photo.nom, photo.mime);
    await envoyerFichierMn(chemin, photo.uri, photo.mime);
    ligne.photo_chemin = chemin;
  }
  if (a.id) ok(await mn().from('mn_catalogue').update(ligne).eq('id', a.id));
  else ok(await mn().from('mn_catalogue').insert(ligne));
}
export async function supprimerArticleMn(id: string) {
  ok(await mn().from('mn_catalogue').delete().eq('id', id));
}
