/**
 * Extraction de texte depuis un PDF via l'API serveur /api/extract-pdf.
 * Fonctionne sur mobile ET web (la lib pdfjs tourne côté serveur Vercel).
 */
import { Platform } from 'react-native';

// URL de base de l'API (web = même origine, mobile = URL absolue)
function getApiBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  // Sur mobile : URL de production Vercel
  return 'https://sk-deco-planning.vercel.app';
}

/**
 * Extrait le texte d'un PDF via l'API serveur.
 * @param url URL absolue du PDF (Supabase Storage)
 * @returns Le texte extrait, ou null si échec.
 */
export async function extractTextFromPdfUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const apiUrl = `${getApiBaseUrl()}/api/extract-pdf`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      console.warn('[pdfExtract] API error:', res.status);
      return null;
    }
    const data = await res.json();
    return data?.text || null;
  } catch (e) {
    console.warn('[pdfExtract] Erreur appel API:', e);
    return null;
  }
}
