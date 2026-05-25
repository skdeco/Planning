/**
 * pdfSigner — Appose un encadré "Bon pour accord" en bas de la dernière
 * page d'un PDF de devis.
 *
 * Approche : on dessine un encadré à coordonnées fixes en bas de la
 * dernière page, AVEC un fond blanc opaque qui masque tout contenu
 * existant en dessous (si superposition).
 *
 * L'encadré contient : mention manuscrite à gauche, date + signature
 * à droite. Header "Pour le client — Bon pour accord" en haut.
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';

// ─── Constantes design ────────────────────────────────────────────────────

const COLOR_BORDEAUX = rgb(0.36, 0.12, 0.18);  // #5C1F2E
const COLOR_SOMBRE = rgb(0.11, 0.11, 0.11);
const COLOR_GRIS = rgb(0.45, 0.45, 0.45);
const COLOR_LIGNE = rgb(0.7, 0.7, 0.7);
const COLOR_BLANC = rgb(1, 1, 1);

/**
 * Géométrie de l'encadré, en points PDF (origine bottom-left). Ajustable
 * si Kevin veut le déplacer/agrandir.
 */
const BOX = {
  marginX: 40,           // marge gauche/droite
  marginBottom: 20,      // marge depuis le bas de la page
  height: 150,           // hauteur de l'encadré
  paddingX: 12,
  paddingTop: 14,
};

// ─── Types ────────────────────────────────────────────────────────────────

export interface ApposerEncadreOptions {
  /** Bytes du PDF original. */
  pdfBytes: Uint8Array;
  /** Signature en base64 PNG. */
  signatureBase64: string;
  /** Mention manuscrite (typée par l'utilisateur). */
  mention: string;
  /** Date au format DD/MM/YYYY. */
  date: string;
}

// ─── Fonction principale ──────────────────────────────────────────────────

/**
 * Dessine un encadré "Bon pour accord" en bas de la dernière page existante.
 * Le fond blanc masque tout contenu sous-jacent. Retourne les bytes du PDF.
 */
export async function apposerEncadreSignature(opts: ApposerEncadreOptions): Promise<Uint8Array> {
  const { pdfBytes, signatureBase64, mention, date } = opts;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1];
  const { width, height } = page.getSize();

  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pngBase64 = signatureBase64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = base64ToBytes(pngBase64);
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // ─── Géométrie de l'encadré (origine bottom-left) ─────────────────────
  const boxLeft = BOX.marginX;
  const boxBottom = BOX.marginBottom;
  const boxWidth = width - 2 * BOX.marginX;
  const boxHeight = BOX.height;
  const boxTop = boxBottom + boxHeight;
  const boxRight = boxLeft + boxWidth;

  // ─── 1. Fond blanc opaque (masque tout dessous) ──────────────────────
  page.drawRectangle({
    x: boxLeft - 1, y: boxBottom - 1,
    width: boxWidth + 2, height: boxHeight + 2,
    color: COLOR_BLANC,
  });

  // ─── 2. Bordure de l'encadré ──────────────────────────────────────────
  page.drawRectangle({
    x: boxLeft, y: boxBottom,
    width: boxWidth, height: boxHeight,
    borderWidth: 0.8, borderColor: COLOR_LIGNE,
    color: COLOR_BLANC,
  });

  // ─── 3. Header "Pour le client — Bon pour accord" ────────────────────
  const titleY = boxTop - BOX.paddingTop;
  page.drawText('Pour le client — Bon pour accord', {
    x: boxLeft + BOX.paddingX, y: titleY,
    size: 11, font: fontBold, color: COLOR_BORDEAUX,
  });

  // Séparateur sous le titre
  const sepY = titleY - 6;
  page.drawLine({
    start: { x: boxLeft + BOX.paddingX, y: sepY },
    end: { x: boxRight - BOX.paddingX, y: sepY },
    thickness: 0.5, color: COLOR_LIGNE,
  });

  // ─── 4. Colonne GAUCHE : mention manuscrite ──────────────────────────
  const colLeftX = boxLeft + BOX.paddingX;
  let lY = sepY - 16;
  page.drawText('Mention manuscrite :', {
    x: colLeftX, y: lY, size: 8, font: fontBold, color: COLOR_GRIS,
  });
  lY -= 14;
  drawWrappedText(page, mention, {
    x: colLeftX, y: lY,
    maxWidth: boxWidth / 2 - BOX.paddingX - 6,
    font: fontReg, size: 10, color: COLOR_SOMBRE, lineHeight: 12,
  });

  // ─── 5. Colonne DROITE : date + signature ────────────────────────────
  const colRightX = boxLeft + boxWidth / 2 + 6;

  // Date
  let rY = sepY - 16;
  page.drawText('Date :', {
    x: colRightX, y: rY, size: 8, font: fontBold, color: COLOR_GRIS,
  });
  page.drawText(date, {
    x: colRightX + 32, y: rY, size: 10, font: fontReg, color: COLOR_SOMBRE,
  });
  rY -= 18;

  // Signature
  page.drawText('Signature :', {
    x: colRightX, y: rY, size: 8, font: fontBold, color: COLOR_GRIS,
  });

  // Image signature, alignée en bas de la colonne droite
  const sigMaxW = (boxWidth / 2) - BOX.paddingX - 6;
  const sigW = Math.min(170, sigMaxW);
  const sigH = 60;
  const sigX = colRightX;
  const sigY = boxBottom + 10;
  page.drawImage(pngImage, { x: sigX, y: sigY, width: sigW, height: sigH });

  return await pdfDoc.save();
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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
