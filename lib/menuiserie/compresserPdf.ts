/**
 * Allège un PDF trop lourd pour l'envoi (> 50 Mo) — version web (ordinateur).
 * Chaque page est redessinée en image JPEG (≈ 150 à 200 points par pouce),
 * puis réassemblée en PDF au même format. À l'écran le rendu est identique ;
 * le texte n'est plus sélectionnable et un très fort zoom est moins net.
 * Sur iPhone / Android, la compression n'est pas possible dans l'app.
 */
import { Platform } from 'react-native';
import { PDFDocument } from 'pdf-lib';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function chargerPdfJs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = PDFJS;
    s.onload = () => { w.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(w.pdfjsLib); };
    s.onerror = () => ko(new Error('Chargement du moteur PDF impossible.'));
    document.head.appendChild(s);
  });
}

function dataUriVersOctets(uri: string): Uint8Array {
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function octetsVersDataUri(octets: Uint8Array): string {
  let bin = '';
  const pas = 0x8000;
  for (let i = 0; i < octets.length; i += pas) bin += String.fromCharCode(...octets.subarray(i, i + pas));
  return `data:application/pdf;base64,${btoa(bin)}`;
}

export const compressionPdfPossible = () => Platform.OS === 'web' && typeof document !== 'undefined';

/**
 * Renvoie un data URI PDF de moins de `cible` octets (ou null si impossible).
 * `progres(page, total)` permet d'afficher l'avancement.
 */
export async function compresserPdf(uri: string, cible: number, progres?: (p: number, n: number) => void): Promise<string | null> {
  if (!compressionPdfPossible()) return null;
  const pdfjs = await chargerPdfJs();
  const source = await pdfjs.getDocument({ data: dataUriVersOctets(uri) }).promise;
  // Réglages de plus en plus forts jusqu'à passer sous la limite
  const essais = [{ dpi: 200, q: 0.82 }, { dpi: 150, q: 0.75 }, { dpi: 120, q: 0.68 }, { dpi: 96, q: 0.6 }];
  for (const e of essais) {
    const sortie = await PDFDocument.create();
    for (let i = 1; i <= source.numPages; i++) {
      progres?.(i, source.numPages);
      const page = await source.getPage(i);
      const base = page.getViewport({ scale: 1 }); // en points (1/72 pouce)
      const vue = page.getViewport({ scale: e.dpi / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vue.width); canvas.height = Math.ceil(vue.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vue }).promise;
      const jpeg = await new Promise<Uint8Array>((ok) => canvas.toBlob(b => b!.arrayBuffer().then(a => ok(new Uint8Array(a))), 'image/jpeg', e.q));
      const img = await sortie.embedJpg(jpeg);
      const p = sortie.addPage([base.width, base.height]);
      p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      canvas.width = 0; canvas.height = 0;
      page.cleanup();
    }
    const octets = await sortie.save();
    if (octets.length <= cible) return octetsVersDataUri(octets);
  }
  return null;
}
