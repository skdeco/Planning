/**
 * Helper unifié d'aperçu de fichier (PDF, image, doc) cross-platform.
 *
 * Factorise le pattern dupliqué dans equipe.tsx (commit 63e9f71),
 * rh.tsx (9368878) et messagerie.tsx (bcd431b).
 *
 * Comportement :
 * - Web + http(s) : window.open(uri, '_blank')
 * - Web + data:/blob: : window.open() + iframe (PDF) ou <img> (image),
 *   auto-détection via le mime du data URI ou l'extension
 * - Mobile + data: URI : Alert "format ancien" (Linking ne sait pas ouvrir
 *   les data: sur iOS — la migration vers Supabase Storage résout ce cas)
 * - Mobile + http(s) : expo-web-browser (Quick Look natif iOS pour PDF)
 *   avec fallback Linking.openURL si la lib n'est pas disponible
 * - Mobile + autre (file://, etc.) : Linking.canOpenURL + openURL
 *
 * @returns true si l'aperçu a été ouvert, false sinon (uri vide, data: sur
 *          mobile, ou erreur).
 */
import { Platform, Alert, Linking } from 'react-native';

function isImageUri(uri: string): boolean {
  if (uri.startsWith('data:image/')) return true;
  const lower = uri.toLowerCase();
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp)(\?|$)/.test(lower);
}

export async function openDocPreview(
  uri: string | undefined | null,
): Promise<boolean> {
  if (!uri) return false;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return false;
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      window.open(uri, '_blank');
      return true;
    }
    const w = window.open();
    if (!w) return false;
    if (isImageUri(uri)) {
      w.document.write(`<img src="${uri}" style="max-width:100%;height:auto">`);
    } else {
      w.document.write(`<iframe src="${uri}" style="width:100%;height:100%;border:none;"/>`);
    }
    return true;
  }

  if (uri.startsWith('data:')) {
    Alert.alert(
      'Aperçu indisponible',
      "Format ancien : ouvrez ce document depuis la version web de l'application.",
    );
    return false;
  }

  try {
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const WebBrowser = require('expo-web-browser');
        await WebBrowser.openBrowserAsync(uri);
        return true;
      } catch {
        // expo-web-browser indisponible ou échec → fallback Linking
      }
    }
    const ok = await Linking.canOpenURL(uri);
    if (ok) {
      await Linking.openURL(uri);
      return true;
    }
    Alert.alert('Impossible', "Impossible d'ouvrir ce document.");
    return false;
  } catch (err) {
    console.warn('openDocPreview:', err);
    Alert.alert('Erreur', "Impossible d'ouvrir ce document.");
    return false;
  }
}
