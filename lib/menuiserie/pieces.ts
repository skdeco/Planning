/**
 * « Devis / Facture » : pièces financières d'un chantier (devis, factures, règlements)
 * côté client ou côté usine. Un PDF déposé est lu côté serveur pour trouver ses
 * montants HT et TTC, puis enregistré comme ligne (mn_montants) liée au document.
 */
import { mn } from './client';
import { deposerDocumentMn, journaliser } from './api';
import { lireMontantDevisMn } from './importDevis';
import { compresserPdf, compressionPdfPossible } from './compresserPdf';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import type { CompteMn, MontantMn, TypeMontantMn, VisibiliteMontantMn } from './types';
import { tm } from './i18n';

const TAILLE_MAX = 50 * 1024 * 1024;
export type CoteMn = 'client' | 'usine';

export const TYPES_COTE: Record<CoteMn, { devis: TypeMontantMn; facture: TypeMontantMn; reglement: TypeMontantMn }> = {
  client: { devis: 'vente_client', facture: 'facture_client', reglement: 'reglement_client' },
  usine: { devis: 'achat_usine', facture: 'facture_usine', reglement: 'reglement_usine' },
};

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface FichierDepose { id: string; chemin: string; nom: string; pdf: boolean }

/** Ouvre le sélecteur, allège les PDF trop lourds (web), envoie chaque fichier. */
export async function choisirEtDeposerMn(moi: CompteMn, p: {
  chantierId: string; etape: string; piece: string; visibilite: string[]; categorieClient?: string | null;
  multiple?: boolean; onInfo?: (t: string) => void;
}): Promise<{ deposes: FichierDepose[]; erreurs: string[] }> {
  const fichiers = await pickNativeFile({ acceptCamera: true, compressImages: true, multiple: p.multiple !== false });
  const deposes: FichierDepose[] = [];
  const erreurs: string[] = [];
  for (const f of fichiers) {
    const nom = f.filename || (f.mimeType === 'application/pdf' ? 'document.pdf' : 'photo.jpg');
    const pdf = f.mimeType === 'application/pdf' || nom.toLowerCase().endsWith('.pdf');
    const taille = f.size ?? (f.uri.startsWith('data:') ? Math.round((f.uri.length - f.uri.indexOf(',') - 1) * 0.75) : undefined);
    let uri = f.uri;
    if (taille && taille > TAILLE_MAX) {
      if (!pdf || !compressionPdfPossible()) {
        erreurs.push(tm("« {0} » est trop lourd ({1} Mo, maximum 50 Mo) : ajoute-le depuis l'ordinateur (version web), il sera allégé automatiquement.", nom, Math.round(taille / 1048576)));
        continue;
      }
      p.onInfo?.(tm("Allègement de « {0} » ({1} Mo)…", nom, Math.round(taille / 1048576)));
      const allege = await compresserPdf(f.uri, TAILLE_MAX * 0.95, (a, n) => p.onInfo?.(tm("Allègement de « {0} » : page {1} / {2}…", nom, a, n))).catch(() => null);
      if (!allege) { erreurs.push(tm("« {0} » n'a pas pu être allégé sous 50 Mo.", nom)); continue; }
      uri = allege;
    }
    try {
      p.onInfo?.(tm("Envoi de « {0} »…", nom));
      const chemin = await deposerDocumentMn(moi, {
        chantierId: p.chantierId, etape: p.etape, uri, mime: f.mimeType || 'application/pdf', nom,
        piece: p.piece, visibilite: p.visibilite, categorieClient: p.categorieClient || null,
      });
      const doc = ok(await mn().from('mn_documents').select('id').eq('chemin', chemin).single()) as { id: string };
      deposes.push({ id: doc.id, chemin, nom, pdf });
    } catch (e) { erreurs.push(`« ${nom} » : ${(e as Error).message}`); }
  }
  p.onInfo?.('');
  return { deposes, erreurs };
}

/** Montants HT / TTC lus dans un PDF (null si introuvables). */
export async function lireMontantsPdfMn(chemin: string): Promise<{ ht: number | null; ttc: number | null; message?: string }> {
  const r = await lireMontantDevisMn(chemin) as { montantHT?: number | null; montantTTC?: number | null; raison?: string; erreur?: string };
  if (r.erreur) return { ht: null, ttc: null, message: tm("Lecture impossible : {0}", r.erreur) };
  return { ht: r.montantHT ?? null, ttc: r.montantTTC ?? null, message: r.montantHT == null ? (r.raison ? tm("Montant non trouvé ({0}).", r.raison) : tm("Montant non trouvé dans ce PDF.")) : undefined };
}

export const nomSansExtension = (nom: string) => nom.replace(/\.[a-z0-9]{2,5}$/i, '');

/** Visibilité d'une ligne : côté usine → visible par l'usine ; côté client → admin (règlement : client). */
export function visibiliteLigne(type: TypeMontantMn, usineId: string | null): VisibiliteMontantMn {
  if (type === 'reglement_client') return 'client';
  if (type === 'achat_usine' || type === 'facture_usine' || type === 'reglement_usine') return usineId ? 'usine' : 'admin';
  return 'admin';
}

export async function ajouterLigneMn(moi: CompteMn, l: {
  chantierId: string; usineId: string | null; type: TypeMontantMn; libelle: string | null;
  ht: number; ttc: number | null; date: string | null; documentId?: string | null;
}) {
  const visibilite = visibiliteLigne(l.type, l.usineId);
  ok(await mn().from('mn_montants').insert({
    chantier_id: l.chantierId, etape: 'devis', type: l.type, libelle: l.libelle, montant_ht: l.ht, montant_ttc: l.ttc,
    visibilite, usine_id: visibilite === 'usine' ? l.usineId : null, compte_id: null,
    date_montant: l.date || new Date().toISOString().slice(0, 10), document_id: l.documentId || null, created_by_nom: moi.nom,
  }));
  journaliser(moi, l.chantierId, 'Montant ajouté', `${l.libelle || l.type} : ${l.ht} € HT`).catch(() => {});
}

export async function modifierLigneMn(moi: CompteMn, m: MontantMn, patch: { libelle?: string | null; montant_ht?: number; montant_ttc?: number | null; date_montant?: string | null; document_id?: string | null }) {
  ok(await mn().from('mn_montants').update(patch).eq('id', m.id));
  journaliser(moi, m.chantier_id, 'Montant modifié', `${patch.libelle ?? m.libelle ?? m.type} : ${patch.montant_ht ?? m.montant_ht} € HT`).catch(() => {});
}

/** Dépose des PDF et crée une ligne par fichier, montants lus automatiquement. */
export async function deposerPiecesMn(moi: CompteMn, p: {
  chantierId: string; usineId: string | null; cote: CoteMn; type: TypeMontantMn; onInfo?: (t: string) => void;
}): Promise<string[]> {
  const vis = p.cote === 'usine' ? ['admin', 'usine'] : ['admin'];
  const { deposes, erreurs } = await choisirEtDeposerMn(moi, { chantierId: p.chantierId, etape: 'devis', piece: p.cote, visibilite: vis, onInfo: p.onInfo });
  const messages = [...erreurs];
  for (const d of deposes) {
    let ht: number | null = null, ttc: number | null = null;
    if (d.pdf) {
      p.onInfo?.(tm("Lecture des montants de « {0} »…", d.nom));
      const r = await lireMontantsPdfMn(d.chemin);
      ht = r.ht; ttc = r.ttc;
      if (r.message) messages.push(`« ${d.nom} » : ${r.message} ${tm("Saisis-le à la main.")}`);
    }
    await ajouterLigneMn(moi, { chantierId: p.chantierId, usineId: p.usineId, type: p.type, libelle: nomSansExtension(d.nom), ht: ht ?? 0, ttc, date: null, documentId: d.id });
  }
  p.onInfo?.('');
  return messages;
}

/** Saisie « 12 500,50 » → nombre ; vide → null. */
export function lireNombre(t: string): number | null {
  const s = t.replace(/[\s €]/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
/** « JJ/MM/AAAA » → « AAAA-MM-JJ » (null si invalide). */
export function lireDateFR(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const a = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isNaN(Date.parse(iso)) ? null : iso;
}
export const dateFR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
