/**
 * pdfSigner — Ajoute une page "Bon pour accord" à la fin d'un PDF de devis.
 *
 * Approche : au lieu de tenter de positionner la signature dans un cadre
 * existant (dont la position varie selon le contenu du devis), on AJOUTE
 * une nouvelle page propre à la fin avec :
 *   - En-tête SKDECO (société + référence devis)
 *   - Bloc client (nom + adresse)
 *   - Récapitulatif financier (HT remisé / TVA / TTC remisé)
 *   - Cadre signature : mention manuscrite + date + signature image
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';

// ─── Constantes design ────────────────────────────────────────────────────

const PAGE_WIDTH = 595;   // A4 portrait, pts
const PAGE_HEIGHT = 842;
const MARGIN_X = 50;
const COLOR_BORDEAUX = rgb(0.36, 0.12, 0.18);   // #5C1F2E
const COLOR_SOMBRE = rgb(0.11, 0.11, 0.11);     // #1c1c1c
const COLOR_GRIS = rgb(0.4, 0.4, 0.4);
const COLOR_LIGNE = rgb(0.8, 0.8, 0.8);
const COLOR_ORANGE = rgb(0.85, 0.58, 0.28);     // ~#D9954B (NET À PAYER bar)

// ─── Données société (en dur — change ici si SK DECO déménage) ────────────

const ENTETE_SOCIETE = {
  nom: 'SKDECO',
  adresse1: '34 Rue du Commandant René Mouchotte',
  adresse2: '94160 Saint-Mandé',
  tel: '07 63 62 84 10',
  email: 'contact@skdeco.fr',
  siret: 'RCS Créteil 813 532 876 00022',
  capital: 'SAS au capital de 1000 €',
};

// ─── Types d'entrée ──────────────────────────────────────────────────────

export interface ClientInfo {
  nom: string;        // "M. Dupont" ou "Société X"
  adresse?: string;   // adresse complète multi-lignes
}

export interface DevisInfo {
  reference?: string;   // ex: "D-2024-0114"
  libelle?: string;     // ex: "Marché initial"
  dateDevis?: string;   // ex: "13/05/2026"
}

export interface MontantsRecap {
  totalHT: number;      // HT après remise
  tva: number;
  totalTTC: number;     // TTC après remise
}

export interface AjouterPageSignatureOptions {
  /** Bytes du PDF original (Uint8Array). */
  pdfBytes: Uint8Array;
  /** Signature en base64 PNG. */
  signatureBase64: string;
  /** Mention manuscrite (texte). */
  mention: string;
  /** Date au format DD/MM/YYYY. */
  date: string;
  /** Infos client (nom + adresse). */
  client: ClientInfo;
  /** Référence et libellé du devis. */
  devis: DevisInfo;
  /** Montants HT/TVA/TTC (après remise). */
  montants: MontantsRecap;
}

// ─── Fonction principale ──────────────────────────────────────────────────

/**
 * Ajoute une nouvelle page "Bon pour accord" à la fin du PDF passé en bytes.
 * Retourne les bytes du PDF modifié.
 */
export async function ajouterPageSignature(
  opts: AjouterPageSignatureOptions
): Promise<Uint8Array> {
  const { pdfBytes, signatureBase64, mention, date, client, devis, montants } = opts;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed signature
  const pngBase64 = signatureBase64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = base64ToBytes(pngBase64);
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Créer nouvelle page A4
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // ─── EN-TÊTE ────────────────────────────────────────────────────────
  let y = PAGE_HEIGHT - 60;

  // Société à gauche
  page.drawText(ENTETE_SOCIETE.nom, {
    x: MARGIN_X, y, size: 18, font: fontBold, color: COLOR_BORDEAUX,
  });
  page.drawText(ENTETE_SOCIETE.adresse1, {
    x: MARGIN_X, y: y - 20, size: 9, font: fontReg, color: COLOR_SOMBRE,
  });
  page.drawText(ENTETE_SOCIETE.adresse2, {
    x: MARGIN_X, y: y - 32, size: 9, font: fontReg, color: COLOR_SOMBRE,
  });
  page.drawText(`Tél : ${ENTETE_SOCIETE.tel}`, {
    x: MARGIN_X, y: y - 46, size: 9, font: fontReg, color: COLOR_SOMBRE,
  });
  page.drawText(`Email : ${ENTETE_SOCIETE.email}`, {
    x: MARGIN_X, y: y - 58, size: 9, font: fontReg, color: COLOR_SOMBRE,
  });

  // Référence devis à droite
  const refX = PAGE_WIDTH - MARGIN_X - 200;
  if (devis.reference) {
    page.drawText(`Devis N° ${devis.reference}`, {
      x: refX, y, size: 12, font: fontBold, color: COLOR_SOMBRE,
    });
  } else if (devis.libelle) {
    page.drawText(devis.libelle, {
      x: refX, y, size: 12, font: fontBold, color: COLOR_SOMBRE,
    });
  }
  if (devis.dateDevis) {
    page.drawText(`Date : ${devis.dateDevis}`, {
      x: refX, y: y - 20, size: 10, font: fontReg, color: COLOR_SOMBRE,
    });
  }

  // Ligne séparation
  y = y - 80;
  drawHLine(page, MARGIN_X, PAGE_WIDTH - MARGIN_X, y, COLOR_LIGNE);
  y -= 30;

  // ─── BLOC CLIENT ────────────────────────────────────────────────────
  page.drawText('Adressé à :', {
    x: MARGIN_X, y, size: 10, font: fontBold, color: COLOR_GRIS,
  });
  y -= 18;
  page.drawText(client.nom || '—', {
    x: MARGIN_X, y, size: 12, font: fontBold, color: COLOR_SOMBRE,
  });
  if (client.adresse) {
    const lines = client.adresse.split('\n').slice(0, 3);
    for (const line of lines) {
      y -= 14;
      page.drawText(line, {
        x: MARGIN_X, y, size: 10, font: fontReg, color: COLOR_SOMBRE,
      });
    }
  }

  // ─── RÉCAPITULATIF FINANCIER ─────────────────────────────────────────
  y -= 50;
  drawHLine(page, MARGIN_X, PAGE_WIDTH - MARGIN_X, y, COLOR_LIGNE);
  y -= 25;

  page.drawText('Récapitulatif du devis', {
    x: MARGIN_X, y, size: 12, font: fontBold, color: COLOR_BORDEAUX,
  });
  y -= 25;

  const labelX = MARGIN_X + 10;
  const valueX = PAGE_WIDTH - MARGIN_X - 10;
  const drawMontantRow = (label: string, valueEUR: number, bold: boolean) => {
    const font = bold ? fontBold : fontReg;
    const size = bold ? 12 : 11;
    page.drawText(label, {
      x: labelX, y, size, font, color: COLOR_SOMBRE,
    });
    const valueStr = `${fmtEUR(valueEUR)} €`;
    const valueW = font.widthOfTextAtSize(valueStr, size);
    page.drawText(valueStr, {
      x: valueX - valueW, y, size, font, color: COLOR_SOMBRE,
    });
  };

  drawMontantRow('Total HT remisé', montants.totalHT, false);
  y -= 22;
  drawMontantRow('TVA', montants.tva, false);
  y -= 22;

  // Bandeau orange "Total TTC remisé / Net à payer"
  const bandY = y - 5;
  page.drawRectangle({
    x: MARGIN_X, y: bandY - 20, width: PAGE_WIDTH - 2 * MARGIN_X, height: 30,
    color: COLOR_ORANGE,
  });
  const labelTTC = 'NET À PAYER (Total TTC remisé)';
  page.drawText(labelTTC, {
    x: labelX, y: bandY - 12, size: 11, font: fontBold, color: rgb(1, 1, 1),
  });
  const ttcStr = `${fmtEUR(montants.totalTTC)} €`;
  const ttcW = fontBold.widthOfTextAtSize(ttcStr, 12);
  page.drawText(ttcStr, {
    x: valueX - ttcW, y: bandY - 12, size: 12, font: fontBold, color: rgb(1, 1, 1),
  });
  y = bandY - 40;

  // ─── CADRE SIGNATURE ─────────────────────────────────────────────────
  y -= 30;
  page.drawText('Pour le client', {
    x: MARGIN_X, y, size: 12, font: fontBold, color: COLOR_BORDEAUX,
  });
  y -= 15;

  // Encadré
  const boxTop = y;
  const boxBottom = MARGIN_X + 20; // marge bas
  const boxHeight = boxTop - boxBottom;
  page.drawRectangle({
    x: MARGIN_X, y: boxBottom, width: PAGE_WIDTH - 2 * MARGIN_X, height: boxHeight,
    borderWidth: 0.8, borderColor: COLOR_LIGNE,
  });

  // Mention manuscrite (à gauche, haut du cadre)
  const mentionX = MARGIN_X + 14;
  let mentionY = boxTop - 24;
  page.drawText('Mention manuscrite :', {
    x: mentionX, y: mentionY, size: 9, font: fontBold, color: COLOR_GRIS,
  });
  mentionY -= 16;
  drawWrappedText(page, mention, {
    x: mentionX, y: mentionY, maxWidth: 240,
    font: fontReg, size: 11, color: COLOR_SOMBRE, lineHeight: 14,
  });

  // Date + signature côté droit
  const rightColX = PAGE_WIDTH / 2 + 20;
  page.drawText('Date :', {
    x: rightColX, y: boxTop - 24, size: 9, font: fontBold, color: COLOR_GRIS,
  });
  page.drawText(date, {
    x: rightColX + 38, y: boxTop - 24, size: 11, font: fontReg, color: COLOR_SOMBRE,
  });

  page.drawText('Signature :', {
    x: rightColX, y: boxTop - 56, size: 9, font: fontBold, color: COLOR_GRIS,
  });
  // Image signature : on cale en bas droite du cadre
  const sigW = 180;
  const sigH = 70;
  const sigX = rightColX;
  const sigY = boxBottom + 18;
  page.drawImage(pngImage, { x: sigX, y: sigY, width: sigW, height: sigH });

  // Footer minimal
  const footerY = 30;
  page.drawText(
    `${ENTETE_SOCIETE.nom} — ${ENTETE_SOCIETE.adresse1}, ${ENTETE_SOCIETE.adresse2} — ${ENTETE_SOCIETE.siret} — ${ENTETE_SOCIETE.capital}`,
    { x: MARGIN_X, y: footerY, size: 7, font: fontReg, color: COLOR_GRIS }
  );

  return await pdfDoc.save();
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function drawHLine(page: PDFPage, x1: number, x2: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color });
}

function fmtEUR(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface DrawWrappedTextOpts {
  x: number;
  y: number;
  maxWidth: number;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
  lineHeight: number;
}

function drawWrappedText(page: PDFPage, text: string, opts: DrawWrappedTextOpts) {
  const { x, y, maxWidth, font, size, color, lineHeight } = opts;
  const words = text.split(/\s+/);
  let line = '';
  let curY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const w = font.widthOfTextAtSize(candidate, size);
    if (w > maxWidth && line) {
      page.drawText(line, { x, y: curY, size, font, color });
      line = word;
      curY -= lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) page.drawText(line, { x, y: curY, size, font, color });
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const cleaned = base64.replace(/[^A-Za-z0-9+/]/g, '');
  let len = cleaned.length;
  if (cleaned.endsWith('==')) len -= 2;
  else if (cleaned.endsWith('=')) len -= 1;
  const byteLen = (len * 3) >> 2;
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = lookup[cleaned.charCodeAt(i)];
    const b = lookup[cleaned.charCodeAt(i + 1)];
    const c = lookup[cleaned.charCodeAt(i + 2)];
    const d = lookup[cleaned.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLen) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < byteLen) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

export async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossible de télécharger le PDF (HTTP ${res.status})`);
  const arrayBuf = await res.arrayBuffer();
  return new Uint8Array(arrayBuf);
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    result += chars[(n >> 18) & 63];
    result += chars[(n >> 12) & 63];
    result += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? chars[n & 63] : '=';
  }
  return result;
}
