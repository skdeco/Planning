/**
 * Import automatique du montant HT d'un devis PDF déposé à l'étape « Devis » :
 *  - devis SK DECO (français, « SKDECO » / « SKDECO M ») → Vente client (admin seul) ;
 *  - autre devis (usine, portugais ou autre format) → Achat usine.
 * La lecture du PDF se fait côté serveur (fonction « lire-montant-devis »).
 */
import { mn } from './client';
import { ajouterMontantMn } from './api';
import type { CompteMn, MontantMn, TypeMontantMn } from './types';
import { tm } from './i18n';

export interface LectureDevis { emetteur?: 'skdeco' | 'autre'; montantHT?: number | null; extrait?: string | null; raison?: string; erreur?: string }

export async function lireMontantDevisMn(chemin: string): Promise<LectureDevis> {
  const { data, error } = await mn().functions.invoke('lire-montant-devis', { body: { chemin } });
  if (error) return { erreur: error.message };
  return (data || {}) as LectureDevis;
}

export const estPdf = (d: { nom: string; mime?: string | null; chemin?: string }) =>
  (d.mime || '').includes('pdf') || d.nom.toLowerCase().endsWith('.pdf') || (d.chemin || '').toLowerCase().endsWith('.pdf');

const fmt = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;

/** Lit le devis et enregistre son montant. Renvoie un message à afficher. */
export async function importerMontantDevisMn(moi: CompteMn, p: {
  chantierId: string; usineId: string | null; chemin: string; nom: string; montants: MontantMn[];
  /** Onglet du devis (Client = vente, Usine = achat) : impose le type */
  typeForce?: TypeMontantMn;
}): Promise<string> {
  const r = await lireMontantDevisMn(p.chemin);
  if (r.erreur) return tm("Lecture du devis impossible : {0}", r.erreur);
  if (r.montantHT == null) return r.raison ? tm("Montant HT non trouvé ({0}).", r.raison) : tm("Montant HT non trouvé dans ce devis.");
  const type: TypeMontantMn = p.typeForce || (r.emetteur === 'skdeco' ? 'vente_client' : 'achat_usine');
  // Le prix de vente client n'est saisi que par un administrateur
  if (type === 'vente_client' && moi.role !== 'admin') return '';
  if (type === 'achat_usine' && moi.role !== 'admin' && moi.role !== 'usine') return '';
  const libelle = libelleDevis(p.nom);
  if (p.montants.some(m => m.type === type && m.libelle === libelle)) return tm("Ce devis est déjà importé.");
  const visibilite = type === 'vente_client' ? 'admin' : (p.usineId ? 'usine' : 'admin');
  await ajouterMontantMn(moi, {
    chantier_id: p.chantierId, etape: 'devis', type, libelle, montant_ht: r.montantHT, visibilite,
    usine_id: visibilite === 'usine' ? p.usineId : null, compte_id: null,
    date_montant: new Date().toISOString().slice(0, 10),
  });
  return type === 'vente_client'
    ? tm("Vente client importée : {0} HT. Vérifie le montant.", fmt(r.montantHT))
    : tm("Achat usine importé : {0} HT. Vérifie le montant.", fmt(r.montantHT));
}

export const libelleDevis = (nom: string) => `Devis : ${nom.replace(/\.pdf$/i, '')}`.slice(0, 120);

/** Côté d'un document de l'étape Devis : rangé à l'envoi (pièce), sinon déduit. */
export function coteDevis(d: { nom: string; piece: string | null }, montants: MontantMn[]): 'client' | 'usine' {
  if (d.piece === 'client' || d.piece === 'usine') return d.piece;
  const lib = libelleDevis(d.nom);
  if (montants.some(m => m.type === 'vente_client' && m.libelle === lib)) return 'client';
  if (montants.some(m => m.type === 'achat_usine' && m.libelle === lib)) return 'usine';
  return /sk\s*-?\s*deco/i.test(d.nom) ? 'client' : 'usine';
}
