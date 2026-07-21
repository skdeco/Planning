import * as Print from 'expo-print';
import type { Chantier, PVAvenant } from '@/app/types';

/**
 * Génère le PDF d'un avenant / annexe complémentaire au PV de réception.
 * Document autonome au thème bordeaux (aligné sur le PV), produit à la demande.
 */
export interface GenererAvenantPdfParams {
  chantier: Chantier;
  avenant: PVAvenant;
}
export interface GenererAvenantPdfResult { uri: string }

const esc = (s: string): string =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brs = (s: string): string => esc(s).replace(/\n/g, '<br/>');
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

function genererAvenantHtml(chantier: Chantier, avenant: PVAvenant): string {
  const adresse = [chantier.rue || chantier.adresse, chantier.codePostal, chantier.ville].filter(Boolean).join(' ');
  const numeroPvSource = chantier.pvReception?.numeroPV;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #2A2622; font-size: 12.5px; line-height: 1.55; }
  .content { padding: 48px 44px; }
  .brand { font-family: Arial, sans-serif; font-size: 22px; font-weight: 800; letter-spacing: 3px; color: #5C1F2E; }
  .brandSub { font-family: Arial, sans-serif; font-size: 9px; letter-spacing: 2px; color: #8A7B6E; text-transform: uppercase; margin-top: 2px; }
  .rule { height: 3px; background: #5C1F2E; margin: 18px 0 24px; }
  h1 { font-size: 19px; color: #5C1F2E; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .meta { font-family: Arial, sans-serif; font-size: 11px; color: #8A7B6E; margin-bottom: 22px; }
  .infoCard { background: #FBF7F2; border: 1px solid #ECDFCD; border-radius: 8px; padding: 14px 16px; margin-bottom: 22px; }
  .infoRow { display: flex; justify-content: space-between; padding: 3px 0; }
  .infoLabel { font-family: Arial, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #8A7B6E; }
  .infoVal { font-weight: 700; color: #2A2622; }
  .sectionTitle { font-family: Arial, sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #5C1F2E; margin: 8px 0 8px; }
  .contenu { background: #FFFFFF; border: 1px solid #ECDFCD; border-radius: 8px; padding: 16px 18px; min-height: 180px; white-space: pre-wrap; }
  .signRow { display: flex; gap: 40px; margin-top: 48px; }
  .signBox { flex: 1; }
  .signLabel { font-family: Arial, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #8A7B6E; margin-bottom: 40px; }
  .signLine { border-top: 1px solid #2A2622; padding-top: 4px; font-family: Arial, sans-serif; font-size: 10px; color: #8A7B6E; }
  .foot { margin-top: 40px; font-family: Arial, sans-serif; font-size: 9px; color: #B0A89E; text-align: center; }
</style></head><body>
<div class="content">
  <div class="brand">SK DECO</div>
  <div class="brandSub">Décoration &amp; agencement</div>
  <div class="rule"></div>

  <h1>${esc(avenant.numero || 'Avenant')} au procès-verbal de réception</h1>
  <div class="meta">${numeroPvSource ? `Annexe complémentaire au PV ${esc(numeroPvSource)} · ` : ''}Établi le ${fmtDate(avenant.date)}</div>

  <div class="infoCard">
    <div class="infoRow"><span class="infoLabel">Chantier</span><span class="infoVal">${esc(chantier.nom)}</span></div>
    ${adresse ? `<div class="infoRow"><span class="infoLabel">Adresse</span><span class="infoVal">${esc(adresse)}</span></div>` : ''}
    <div class="infoRow"><span class="infoLabel">Objet de l'avenant</span><span class="infoVal">${esc(avenant.objet)}</span></div>
  </div>

  <div class="sectionTitle">Contenu de l'avenant</div>
  <div class="contenu">${brs(avenant.contenu) || '<span style="color:#B0A89E;">(aucun contenu)</span>'}</div>

  <div class="signRow">
    <div class="signBox"><div class="signLabel">L'entreprise</div><div class="signLine">Nom, date &amp; signature</div></div>
    <div class="signBox"><div class="signLabel">Le client</div><div class="signLine">Nom, date &amp; signature</div></div>
  </div>

  <div class="foot">SK DECO — Avenant complémentaire au procès-verbal de réception de chantier</div>
</div>
</body></html>`;
}

export async function genererAvenantPdf(params: GenererAvenantPdfParams): Promise<GenererAvenantPdfResult> {
  const html = genererAvenantHtml(params.chantier, params.avenant);
  const { uri } = await Print.printToFileAsync({ html, base64: false, width: 595, height: 842, margins: { left: 0, right: 0, top: 0, bottom: 0 } });
  return { uri };
}
