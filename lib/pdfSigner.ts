/**
 * pdfSigner — Appose une signature + date + mention sur la dernière page
 * d'un PDF (devis), dans le cadre "Pour le client" existant.
 *
 * Position des éléments : voir SIGNATURE_LAYOUT ci-dessous. Si Kevin
 * change le template du devis, ajuster ces constantes (coordonnées en
 * points PDF, origine bottom-left).
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Coordonnées dans le cadre "Pour le client" en bas de la dernière page
 * du template devis SK DECO. À ajuster si le template change.
 *
 * Page A4 portrait = 595.28 x 841.89 pts. Origine = bottom-left.
 * Le cadre observé est dans le quart inférieur (y ≈ 30 → 240 from bottom).
 */
export const SIGNATURE_LAYOUT = {
  // Texte de la mention (manuscrite normalement, ici typée)
  mention: {
    x: 90,
    y: 180,           // ligne haute du cadre
    fontSize: 9,
    maxWidth: 200,    // pour wrap éventuel
  },
  // Signature image (PNG transparent)
  signature: {
    x: 320,
    y: 100,
    width: 180,
    height: 70,
  },
  // Date (format DD/MM/YYYY)
  date: {
    x: 90,
    y: 80,            // ligne pointillée date
    fontSize: 10,
  },
} as const;

export interface ApposerSignatureOptions {
  /** Bytes du PDF original (Uint8Array). */
  pdfBytes: Uint8Array;
  /** Signature en base64 PNG (avec ou sans préfixe data:image/png;base64,). */
  signatureBase64: string;
  /** Mention manuscrite (texte). */
  mention: string;
  /** Date au format DD/MM/YYYY. */
  date: string;
}

/**
 * Appose la signature + mention + date sur la dernière page du PDF
 * et retourne les bytes du PDF signé.
 */
export async function apposerSignatureSurPdf(opts: ApposerSignatureOptions): Promise<Uint8Array> {
  const { pdfBytes, signatureBase64, mention, date } = opts;

  // 1. Charger le PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];

  // 2. Embed signature (clean base64 prefix si présent)
  const pngBase64 = signatureBase64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = base64ToBytes(pngBase64);
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // 3. Police standard pour mention + date
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 4. Dessiner la mention (texte typé)
  lastPage.drawText(mention, {
    x: SIGNATURE_LAYOUT.mention.x,
    y: SIGNATURE_LAYOUT.mention.y,
    size: SIGNATURE_LAYOUT.mention.fontSize,
    font,
    color: rgb(0, 0, 0),
    maxWidth: SIGNATURE_LAYOUT.mention.maxWidth,
  });

  // 5. Dessiner la signature
  lastPage.drawImage(pngImage, {
    x: SIGNATURE_LAYOUT.signature.x,
    y: SIGNATURE_LAYOUT.signature.y,
    width: SIGNATURE_LAYOUT.signature.width,
    height: SIGNATURE_LAYOUT.signature.height,
  });

  // 6. Dessiner la date
  lastPage.drawText(date, {
    x: SIGNATURE_LAYOUT.date.x,
    y: SIGNATURE_LAYOUT.date.y,
    size: SIGNATURE_LAYOUT.date.fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  // 7. Sauvegarder
  return await pdfDoc.save();
}

/**
 * Convertit une string base64 en Uint8Array (compatible RN + web).
 */
function base64ToBytes(base64: string): Uint8Array {
  // RN n'a pas atob — fallback Buffer si dispo, sinon polyfill manuel
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Fallback : decodage manuel base64 → bytes
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

/**
 * Fetch un PDF depuis une URL et retourne ses bytes.
 */
export async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossible de télécharger le PDF (HTTP ${res.status})`);
  const arrayBuf = await res.arrayBuffer();
  return new Uint8Array(arrayBuf);
}

/**
 * Convertit Uint8Array → base64 (pour upload en Storage si besoin).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
  }
  // Fallback minimal
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
