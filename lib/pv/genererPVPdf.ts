import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import type {
  Chantier,
  Apporteur,
  MarcheChantier,
  SupplementMarche,
} from '@/app/types';
import type { PVReception, PVPiece } from '@/app/types';
import { genererPVHtml } from '@/lib/pv/genererPVHtml';

/**
 * Génère le PDF du PV de réception.
 *
 * Pipeline :
 * 1. Charge le logo SK DECO en base64 (via expo-asset)
 * 2. Fetch toutes les photos Supabase en base64 (max 5 en parallèle)
 *    → photo cassée (404, timeout, ...) = absente du map → placeholder ⚠️ côté HTML
 * 3. Génère le HTML complet (genererPVHtml — pur, synchrone)
 * 4. Print.printToFileAsync({ html }) → file:// URI du PDF
 *
 * Retourne l'URI du PDF généré (pas le base64).
 *
 * ⚠️ Note expo-file-system : on utilise l'import /legacy car cohérent avec
 * lib/supabase.ts (uploadFileToStorage utilise FileSystem.uploadAsync legacy).
 * Si le projet migre vers la nouvelle API FileSystem.File, adapter ce fichier
 * ET lib/supabase.ts ensemble.
 */

interface GenererPVPdfParams {
  pv: PVReception;
  chantier: Chantier;
  apporteurs: Apporteur[];
  marchesChantier: MarcheChantier[];
  supplementsMarche: SupplementMarche[];
}

interface GenererPVPdfResult {
  uri: string;          // file:// URI du PDF généré
  numPhotos: number;    // total photos identifiées dans le PV
  numLoaded: number;    // photos effectivement chargées (le reste = ⚠️)
}

/* ────────────────────────────────────────────────────────────────────
 * Chargement du logo SK DECO en base64
 * ──────────────────────────────────────────────────────────────────── */

let _logoCache: string | null = null;

async function chargerLogoBase64(): Promise<string> {
  if (_logoCache) return _logoCache;
  try {
    // Note : require statique → bundlé par Metro, pas de dépendance runtime
    const asset = Asset.fromModule(require('../../assets/images/sk_deco_logo.png'));
    await asset.downloadAsync();
    const localUri = asset.localUri || asset.uri;
    if (!localUri) {
      console.warn('[genererPVPdf] Logo asset sans localUri');
      return '';
    }
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    _logoCache = `data:image/png;base64,${base64}`;
    return _logoCache;
  } catch (err) {
    console.warn('[genererPVPdf] Échec chargement logo, fallback texte', err);
    return ''; // genererPVHtml affichera "SK DECO" en texte stylé
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Collecte toutes les URLs de photos du PV (constat + levée)
 * ──────────────────────────────────────────────────────────────────── */

function collectAllPhotoUrls(pieces: PVPiece[] | undefined): string[] {
  const urls = new Set<string>();
  for (const piece of (pieces || [])) {
    for (const reserve of (piece.reserves || [])) {
      for (const url of (reserve.photos || [])) {
        if (url) urls.add(url);
      }
      for (const url of (reserve.levee?.photos || [])) {
        if (url) urls.add(url);
      }
    }
  }
  return Array.from(urls);
}

/* ────────────────────────────────────────────────────────────────────
 * Fetch photo Supabase → data URI base64 (avec timeout + gestion erreur)
 * ──────────────────────────────────────────────────────────────────── */

const FETCH_TIMEOUT_MS = 15000;

function deviner_mime(url: string): string {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg'; // défaut sûr
}

async function fetchPhotoBase64(url: string, idx: number): Promise<string | null> {
  const localUri = `${FileSystem.cacheDirectory}pv_photo_${Date.now()}_${idx}.tmp`;
  try {
    // downloadAsync n'a pas de timeout natif → on le wrap
    const downloadPromise = FileSystem.downloadAsync(url, localUri);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS)
    );
    const result = await Promise.race([downloadPromise, timeoutPromise]);

    if (!result || result.status !== 200) {
      console.warn(`[genererPVPdf] Photo HTTP ${result?.status} : ${url}`);
      return null;
    }

    const base64 = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:${deviner_mime(url)};base64,${base64}`;
  } catch (err) {
    console.warn(`[genererPVPdf] Échec photo ${url}`, err);
    return null;
  } finally {
    // cleanup silencieux (pas critique si ça échoue)
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch { /* ignore */ }
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Fetch en parallèle avec concurrence limitée
 * ──────────────────────────────────────────────────────────────────── */

const CONCURRENCE = 5;

async function fetchPhotosWithConcurrency(
  urls: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let idx = 0;

  async function worker() {
    while (idx < urls.length) {
      const myIdx = idx++;
      const url = urls[myIdx];
      const dataUri = await fetchPhotoBase64(url, myIdx);
      if (dataUri) result[url] = dataUri;
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCE, urls.length) }, () => worker());
  await Promise.all(workers);
  return result;
}

/* ────────────────────────────────────────────────────────────────────
 * Export principal
 * ──────────────────────────────────────────────────────────────────── */

export async function genererPVPdf(
  params: GenererPVPdfParams,
): Promise<GenererPVPdfResult> {
  const { pv, chantier, apporteurs, marchesChantier, supplementsMarche } = params;

  // 1. Logo SK DECO en base64 (cache après 1ère génération)
  const logoDataUri = await chargerLogoBase64();

  // 2. Toutes les URLs de photos du PV → fetch en parallèle
  const allUrls = collectAllPhotoUrls(pv.pieces);
  const photosResolved = allUrls.length > 0
    ? await fetchPhotosWithConcurrency(allUrls)
    : {};

  const numLoaded = Object.keys(photosResolved).length;

  // 3. Génération HTML pure (synchrone)
  const html = genererPVHtml({
    pv,
    chantier,
    apporteurs,
    marchesChantier,
    supplementsMarche,
    logoDataUri,
    photosResolved,
  });

  // 4. Conversion HTML → PDF via expo-print
  // Pas de base64: true → on récupère l'URI du fichier directement (plus économe)
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    // width/height en points (1pt = 1/72 inch). A4 = 595 × 842 pt.
    width: 595,
    height: 842,
    // margins gérées via @page CSS dans genererPVHtml
  });

  return {
    uri,
    numPhotos: allUrls.length,
    numLoaded,
  };
}
