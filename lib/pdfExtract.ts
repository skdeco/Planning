/**
 * Extraction de texte depuis un PDF via l'API serveur /api/extract-pdf.
 * Fonctionne sur mobile ET web (la lib pdfjs tourne côté serveur Vercel).
 */
import { Platform } from 'react-native';

const PROD_API = 'https://sk-deco-planning.vercel.app';

/**
 * Bases d'API à essayer, dans l'ordre.
 * - Web en production : même origine.
 * - Web hors production (localhost, aperçu Vercel, autre domaine) : même origine
 *   PUIS la production en secours — en local, /api/extract-pdf n'existe pas
 *   (fonction Vercel), ce qui rendait l'auto-remplissage muet sur ordinateur.
 * - iOS / Android : production.
 */
function getApiBaseUrls(): string[] {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = window.location.origin;
    return origin === PROD_API ? [origin] : [origin, PROD_API];
  }
  return [PROD_API];
}

/**
 * Extrait le texte d'un PDF via l'API serveur.
 * @param url URL absolue du PDF (Supabase Storage)
 * @returns Le texte extrait, ou null si échec.
 */
export async function extractTextFromPdfUrl(url: string): Promise<string | null> {
  if (!url) return null;
  for (const base of getApiBaseUrls()) {
    try {
      const res = await fetch(`${base}/api/extract-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        console.warn('[pdfExtract] API error:', base, res.status);
        continue;
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue; // ex. page HTML renvoyée par le serveur de dev
      const data = await res.json();
      if (data?.text) return data.text;
    } catch (e) {
      console.warn('[pdfExtract] Erreur appel API:', base, e);
    }
  }
  return null;
}
