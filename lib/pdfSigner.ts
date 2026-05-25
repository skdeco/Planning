/**
 * pdfSigner — Appose une signature + date + mention sur la dernière page
 * d'un PDF (devis), dans le cadre "Pour le client" existant.
 *
 * Stratégie de positionnement :
 *   1. L'API serveur /api/find-signature-box détecte la position du label
 *      "Pour le client" sur la dernière page (origine top-left, points PDF).
 *   2. Le cadre est juste EN DESSOUS du label (gap réglé via OFFSETS_BELOW_LABEL).
 *   3. Le client convertit en coordonnées pdf-lib (origine bottom-left)
 *      et passe les coords absolues à apposerSignatureSurPdf().
 *
 * Si le label n'est pas détecté (vieux devis, devis modifié), fallback
 * SIGNATURE_LAYOUT (coords hardcodées qui correspondent au template SK DECO
 * actuel).
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Fallback hardcodé : coords pour le template SK DECO standard (A4 portrait).
 * Utilisé seulement si la détection serveur échoue.
 */
export const SIGNATURE_LAYOUT = {
  mention:   { x: 90,  y: 285, fontSize: 9,  maxWidth: 200 },
  signature: { x: 340, y: 195, width: 160, height: 65 },
  date:      { x: 90,  y: 195, fontSize: 10 },
} as const;

/**
 * Offsets RELATIFS au label "Pour le client" pour placer les 3 éléments.
 * Le label est positionné AU-DESSUS du cadre. Les éléments vont DANS le cadre.
 *
 * Coords en points PDF, exprimées en delta depuis le coin gauche du label :
 * - dx = décalage horizontal (signature à droite, mention/date à gauche)
 * - dy = décalage vertical EN DESCENDANT (top-left origin), car ce qu'on
 *   reçoit du serveur est aussi en top-left origin.
 */
export const OFFSETS_BELOW_LABEL = {
  mention:   { dx: 0,    dy: 20, fontSize: 9,  maxWidth: 230 },
  signature: { dx: 260,  dy: 50, width: 160, height: 65 },
  date:      { dx: 0,    dy: 110, fontSize: 10 },
} as const;

export interface SignatureBoxPosition {
  /** Position du label "Pour le client", origin top-left, unités points PDF. */
  x: number;
  y: number;
  /** Largeur/hauteur de la page (pour convertir en coords pdf-lib). */
  pageWidth: number;
  pageHeight: number;
  /** Numéro de la page (1-indexé). */
  page: number;
}

/**
 * Appelle l'API serveur pour trouver la position du label "Pour le client".
 * Retourne null si non trouvé ou erreur réseau.
 */
export async function findSignatureBoxPosition(pdfUrl: string): Promise<SignatureBoxPosition | null> {
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/api/find-signature-box`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: pdfUrl }),
    });
    if (!res.ok) {
      console.warn('[findSignatureBoxPosition] API error:', res.status);
      return null;
    }
    const data = await res.json();
    if (data.error) {
      console.warn('[findSignatureBoxPosition] no box:', data.error);
      return null;
    }
    return data as SignatureBoxPosition;
  } catch (e) {
    console.warn('[findSignatureBoxPosition] fetch error:', e);
    return null;
  }
}

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) return window.location.origin;
  return 'https://sk-deco-planning.vercel.app';
}

export interface ApposerSignatureOptions {
  /** Bytes du PDF original (Uint8Array). */
  pdfBytes: Uint8Array;
  /** Signature en base64 PNG (avec ou sans préfixe data:image/png;base64,). */
  signatureBase64: string;
  /** Mention manuscrite (texte). */
  mention: string;
  /** Date au format DD/MM/YYYY. */
  date: string;
  /** Position détectée du label (optionnel — fallback SIGNATURE_LAYOUT si absent). */
  boxPosition?: SignatureBoxPosition | null;
}

/**
 * Appose la signature + mention + date sur la page contenant le label
 * "Pour le client" (ou la dernière page en fallback).
 * Retourne les bytes du PDF signé.
 */
export async function apposerSignatureSurPdf(opts: ApposerSignatureOptions): Promise<Uint8Array> {
  const { pdfBytes, signatureBase64, mention, date, boxPosition } = opts;

  // 1. Charger le PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // 2. Page cible : celle du label si détectée, sinon dernière
  const targetPageIndex = boxPosition
    ? Math.min(Math.max(boxPosition.page - 1, 0), pages.length - 1)
    : pages.length - 1;
  const page = pages[targetPageIndex];
  const { height: pageHeight } = page.getSize();

  // 3. Embed signature
  const pngBase64 = signatureBase64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = base64ToBytes(pngBase64);
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 4. Calculer les coordonnées absolues
  // Si boxPosition fourni : on convertit pdfreader (top-left) → pdf-lib (bottom-left)
  // via y_pdfLib = pageHeight - y_topLeft. Puis on applique les offsets.
  // Sinon : SIGNATURE_LAYOUT hardcodé en fallback.
  let mentionX: number, mentionY: number, mentionSize: number, mentionMaxWidth: number;
  let sigX: number, sigY: number, sigW: number, sigH: number;
  let dateX: number, dateY: number, dateSize: number;

  if (boxPosition) {
    // y du label converti en bottom-left
    const labelYBL = pageHeight - boxPosition.y;
    const labelX = boxPosition.x;

    const O = OFFSETS_BELOW_LABEL;
    mentionX = labelX + O.mention.dx;
    mentionY = labelYBL - O.mention.dy;
    mentionSize = O.mention.fontSize;
    mentionMaxWidth = O.mention.maxWidth;

    sigX = labelX + O.signature.dx;
    sigY = labelYBL - O.signature.dy - O.signature.height; // image: y = bas de l'image
    sigW = O.signature.width;
    sigH = O.signature.height;

    dateX = labelX + O.date.dx;
    dateY = labelYBL - O.date.dy;
    dateSize = O.date.fontSize;
  } else {
    const L = SIGNATURE_LAYOUT;
    mentionX = L.mention.x; mentionY = L.mention.y;
    mentionSize = L.mention.fontSize; mentionMaxWidth = L.mention.maxWidth;
    sigX = L.signature.x; sigY = L.signature.y;
    sigW = L.signature.width; sigH = L.signature.height;
    dateX = L.date.x; dateY = L.date.y; dateSize = L.date.fontSize;
  }

  // 5. Dessiner
  page.drawText(mention, {
    x: mentionX, y: mentionY, size: mentionSize, font,
    color: rgb(0, 0, 0), maxWidth: mentionMaxWidth,
  });

  page.drawImage(pngImage, {
    x: sigX, y: sigY, width: sigW, height: sigH,
  });

  page.drawText(date, {
    x: dateX, y: dateY, size: dateSize, font, color: rgb(0, 0, 0),
  });

  // 6. Sauvegarder
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
