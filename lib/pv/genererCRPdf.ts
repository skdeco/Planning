import * as Print from 'expo-print';
import type { Chantier, SuiviCR, CRSection, CRSubSection, CRItem, CRAttachment } from '@/app/types';

/**
 * Génère le PDF d'un compte-rendu de chantier (CR) au thème bordeaux SK DECO.
 * Reprend la structure sections (lot) → sous-sections (pièce) → items
 * (tâches cochées / textes), avec personnes présentes, commentaires et photos.
 */
export interface GenererCRPdfResult { uri: string }

const esc = (s: string): string =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brs = (s: string): string => esc(s).replace(/\n/g, '<br/>');
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

/** Photos d'un item (nouveau format + legacy). */
function photosOf(it: { photos?: CRAttachment[]; photoUri?: string; photoNom?: string }): CRAttachment[] {
  if (it.photos && it.photos.length) return it.photos;
  if (it.photoUri) return [{ uri: it.photoUri, nom: it.photoNom }];
  return [];
}
/** PDF joints d'un item (nouveau format + legacy). */
function pdfsOf(it: { pdfs?: CRAttachment[]; pdfUri?: string; pdfNom?: string }): CRAttachment[] {
  if (it.pdfs && it.pdfs.length) return it.pdfs;
  if (it.pdfUri) return [{ uri: it.pdfUri, nom: it.pdfNom }];
  return [];
}

function attachmentsHtml(photos: CRAttachment[], pdfs: CRAttachment[]): string {
  const imgs = photos
    .filter(p => p.uri && (p.uri.startsWith('http') || p.uri.startsWith('data:')))
    .map(p => `<img class="thumb" src="${p.uri}"/>`)
    .join('');
  const docs = pdfs
    .filter(p => p.uri)
    .map(p => `<span class="pdfChip">&#128206; ${esc(p.nom || 'Document')}</span>`)
    .join('');
  if (!imgs && !docs) return '';
  return `<div class="atts">${imgs}${docs ? `<div class="pdfList">${docs}</div>` : ''}</div>`;
}

function itemHtml(item: CRItem): string {
  if (item.kind === 'task') {
    const t = item.task;
    const box = t.fait ? '&#9745;' : '&#9744;'; // ☑ / ☐
    const done = t.fait ? ' done' : '';
    return `<div class="item"><div class="itemLine"><span class="box">${box}</span><span class="itemText${done}">${brs(t.texte)}</span></div>${attachmentsHtml(photosOf(t), pdfsOf(t))}</div>`;
  }
  const x = item.texte;
  return `<div class="item"><div class="itemLine"><span class="bullet">&bull;</span><span class="itemText">${brs(x.texte)}</span></div>${attachmentsHtml(photosOf(x), pdfsOf(x))}</div>`;
}

function subSectionHtml(sub: CRSubSection): string {
  if (!sub.items || sub.items.length === 0) return '';
  return `<div class="sub"><div class="subTitle">${esc(sub.titre)}</div>${sub.items.map(itemHtml).join('')}</div>`;
}

function sectionHtml(sec: CRSection): string {
  const subs = (sec.subSections || []).map(subSectionHtml).filter(Boolean).join('');
  const com = sec.commentaire ? `<div class="comment">${brs(sec.commentaire)}</div>` : '';
  if (!subs && !com) return '';
  return `<div class="section"><div class="sectionTitle">${esc(sec.titre || 'Section')}</div>${com}${subs}</div>`;
}

function genererCRHtml(chantier: Chantier, cr: SuiviCR): string {
  const adresse = [chantier.rue || chantier.adresse, chantier.codePostal, chantier.ville].filter(Boolean).join(' ');
  const presents = (cr.personnesPresentes || []).map(p => `<span class="chip">${esc(p.nom)}</span>`).join('');
  const sections = (cr.sections || []).map(sectionHtml).filter(Boolean).join('');
  const statut = cr.statut === 'finalise' ? 'Finalisé' : 'Brouillon';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #2A2622; font-size: 12px; line-height: 1.5; }
  .content { padding: 40px 40px 56px; }
  .brand { font-family: Arial, sans-serif; font-size: 22px; font-weight: 800; letter-spacing: 3px; color: #5C1F2E; }
  .brandSub { font-family: Arial, sans-serif; font-size: 9px; letter-spacing: 2px; color: #8A7B6E; text-transform: uppercase; margin-top: 2px; }
  .rule { height: 3px; background: #5C1F2E; margin: 16px 0 20px; }
  h1 { font-size: 18px; color: #5C1F2E; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .meta { font-family: Arial, sans-serif; font-size: 11px; color: #8A7B6E; margin-bottom: 18px; }
  .infoCard { background: #FBF7F2; border: 1px solid #ECDFCD; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; }
  .infoRow { display: flex; justify-content: space-between; padding: 3px 0; }
  .infoLabel { font-family: Arial, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #8A7B6E; }
  .infoVal { font-weight: 700; color: #2A2622; }
  .blockLabel { font-family: Arial, sans-serif; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #8A7B6E; margin: 4px 0 8px; }
  .chips { margin-bottom: 20px; }
  .chip { display: inline-block; background: #F1E8DC; color: #7A4F2E; font-family: Arial, sans-serif; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin: 0 6px 6px 0; }
  .section { margin-bottom: 18px; page-break-inside: avoid; }
  .sectionTitle { font-family: Arial, sans-serif; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #5C1F2E; padding-bottom: 4px; border-bottom: 1px solid #ECDFCD; margin-bottom: 8px; }
  .comment { background: #FBF7F2; border-left: 3px solid #7A4F2E; padding: 8px 12px; font-style: italic; color: #5f574e; margin-bottom: 10px; border-radius: 0 6px 6px 0; }
  .sub { margin: 8px 0 10px; }
  .subTitle { font-family: Arial, sans-serif; font-size: 11px; font-weight: 700; color: #2A2622; margin-bottom: 5px; }
  .item { margin: 3px 0 7px; }
  .itemLine { display: flex; gap: 7px; align-items: flex-start; }
  .box { color: #5C1F2E; font-size: 13px; line-height: 1.3; }
  .bullet { color: #7A4F2E; font-size: 13px; line-height: 1.2; }
  .itemText { flex: 1; }
  .itemText.done { color: #8A7B6E; }
  .atts { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 4px 21px; }
  .thumb { width: 110px; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #ECDFCD; }
  .pdfList { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pdfChip { font-family: Arial, sans-serif; font-size: 10px; color: #5C1F2E; background: #F1E8DC; padding: 3px 8px; border-radius: 5px; }
  .empty { color: #B0A89E; font-style: italic; }
  .foot { margin-top: 36px; font-family: Arial, sans-serif; font-size: 9px; color: #B0A89E; text-align: center; }
</style></head><body>
<div class="content">
  <div class="brand">SK DECO</div>
  <div class="brandSub">Décoration &amp; agencement</div>
  <div class="rule"></div>

  <h1>Compte-rendu de chantier</h1>
  <div class="meta">${fmtDate(cr.date)} · ${esc(statut)}${cr.auteurNom ? ` · Rédigé par ${esc(cr.auteurNom)}` : ''}</div>

  <div class="infoCard">
    <div class="infoRow"><span class="infoLabel">Chantier</span><span class="infoVal">${esc(chantier.nom)}</span></div>
    ${adresse ? `<div class="infoRow"><span class="infoLabel">Adresse</span><span class="infoVal">${esc(adresse)}</span></div>` : ''}
  </div>

  ${presents ? `<div class="blockLabel">Personnes présentes</div><div class="chips">${presents}</div>` : ''}

  ${sections || '<div class="empty">Aucun point renseigné dans ce compte-rendu.</div>'}

  <div class="foot">SK DECO — Compte-rendu de chantier · ${esc(chantier.nom)} · ${fmtDate(cr.date)}</div>
</div>
</body></html>`;
}

export async function genererCRPdf(chantier: Chantier, cr: SuiviCR): Promise<GenererCRPdfResult> {
  const html = genererCRHtml(chantier, cr);
  const { uri } = await Print.printToFileAsync({ html, base64: false, width: 595, height: 842, margins: { left: 0, right: 0, top: 0, bottom: 0 } });
  return { uri };
}
