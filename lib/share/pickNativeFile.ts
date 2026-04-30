/**
 * Helper bas-niveau pour ouvrir un sélecteur de fichier natif.
 *
 * Sur iOS / Android : ActionSheet dynamique selon les options activées :
 * "Photothèque" (acceptImages), "Appareil photo" (acceptCamera),
 * "Fichiers" (acceptPdf), "Annuler". Dispatche vers `expo-image-picker`
 * (Photothèque/Caméra) ou `expo-document-picker` (Fichiers).
 *
 * Sur web : `<input type="file">` dynamique avec lecture en data URI.
 * `acceptCamera` est ignoré sur web (input file ne supporte pas la
 * caméra de manière fiable cross-browser).
 *
 * Complément à InboxPickerButton (Share Extension iOS) : trois voies
 * d'upload coexistent (web input / native ActionSheet / Inbox).
 *
 * Permission UX : si l'utilisateur refuse l'accès photothèque ou
 * appareil photo, Alert explicite avec bouton "Ouvrir les Réglages"
 * via `Linking.openSettings()`.
 */
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export interface PickedFile {
  /** file:// stable (cacheDirectory mobile) ou data: URI (web). */
  uri: string;
  /** MIME type du fichier (ex: image/jpeg, application/pdf). */
  mimeType: string;
  /** Nom de fichier d'origine si disponible. */
  filename?: string;
  /** Taille en octets si disponible. */
  size?: number;
}

export interface PickNativeFileOptions {
  /** Autoriser les images. Default: true. */
  acceptImages?: boolean;
  /** Autoriser les PDF. Default: true. */
  acceptPdf?: boolean;
  /**
   * Autoriser la prise de photo via la caméra (iOS/Android only).
   * Ajoute "Appareil photo" à l'ActionSheet. Ignoré sur web.
   * Default: false.
   */
  acceptCamera?: boolean;
  /** Autoriser la sélection multiple. Default: true. */
  multiple?: boolean;
  /** Compresser les images via lib/imageUtils. Default: false (opt-in). */
  compressImages?: boolean;
}

type Source = 'photos' | 'camera' | 'files';

function inferMimeFromUri(uri: string, fallback = 'application/octet-stream'): string {
  const lower = uri.toLowerCase().split('?')[0];
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

function buildAcceptString(acceptImages: boolean, acceptPdf: boolean): string {
  const parts: string[] = [];
  if (acceptImages) parts.push('image/*');
  if (acceptPdf) parts.push('application/pdf');
  return parts.join(',');
}

async function pickFromPhotos(opts: Required<PickNativeFileOptions>): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Accès photos requis',
      "SK DECO Planning a besoin d'accéder à votre photothèque pour importer des images. Vous pouvez l'autoriser dans les Réglages.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Ouvrir les Réglages', onPress: () => { Linking.openSettings().catch(() => {}); } },
      ],
    );
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: opts.multiple,
    quality: opts.compressImages ? 0.7 : 1,
  });
  if (result.canceled) return [];

  const out: PickedFile[] = [];
  for (const asset of result.assets) {
    let uri = asset.uri;
    if (opts.compressImages) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { compressImage } = require('@/lib/imageUtils');
        uri = await compressImage(uri);
      } catch {
        // compressImage indisponible → URI brut
      }
    }
    out.push({
      uri,
      mimeType: asset.mimeType ?? inferMimeFromUri(uri, 'image/jpeg'),
      filename: asset.fileName ?? undefined,
      size: asset.fileSize ?? undefined,
    });
  }
  return out;
}

async function pickFromCamera(opts: Required<PickNativeFileOptions>): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Accès appareil photo requis',
      "SK DECO Planning a besoin d'accéder à votre appareil photo pour prendre des photos. Vous pouvez l'autoriser dans les Réglages.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Ouvrir les Réglages', onPress: () => { Linking.openSettings().catch(() => {}); } },
      ],
    );
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: opts.compressImages ? 0.7 : 1,
  });
  if (result.canceled) return [];

  const out: PickedFile[] = [];
  for (const asset of result.assets) {
    let uri = asset.uri;
    if (opts.compressImages) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { compressImage } = require('@/lib/imageUtils');
        uri = await compressImage(uri);
      } catch {
        // compressImage indisponible → URI brut
      }
    }
    out.push({
      uri,
      mimeType: asset.mimeType ?? inferMimeFromUri(uri, 'image/jpeg'),
      filename: asset.fileName ?? 'photo.jpg',
      size: asset.fileSize ?? undefined,
    });
  }
  return out;
}

async function pickFromFiles(opts: Required<PickNativeFileOptions>): Promise<PickedFile[]> {
  // Construit le filtre type — DocumentPicker accepte string[] ou string
  const types: string[] = [];
  if (opts.acceptPdf) types.push('application/pdf');
  if (opts.acceptImages) types.push('image/*');
  const result = await DocumentPicker.getDocumentAsync({
    type: types.length > 0 ? types : '*/*',
    multiple: opts.multiple,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    mimeType: asset.mimeType ?? inferMimeFromUri(asset.uri),
    filename: asset.name,
    size: asset.size ?? undefined,
  }));
}

function pickFromWeb(opts: Required<PickNativeFileOptions>): Promise<PickedFile[]> {
  if (typeof document === 'undefined') return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = buildAcceptString(opts.acceptImages, opts.acceptPdf);
    input.multiple = opts.multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const finalize = (result: PickedFile[]): void => {
      if (settled) return;
      settled = true;
      try { document.body.removeChild(input); } catch { /* déjà retiré */ }
      resolve(result);
    };
    input.onchange = (e: Event) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) { finalize([]); return; }
      const collected: PickedFile[] = [];
      let pending = files.length;
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          collected.push({
            uri: reader.result as string,
            mimeType: file.type || inferMimeFromUri(file.name),
            filename: file.name,
            size: file.size,
          });
          pending -= 1;
          if (pending === 0) finalize(collected);
        };
        reader.onerror = () => {
          pending -= 1;
          if (pending === 0) finalize(collected);
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
    setTimeout(() => finalize([]), 60_000);
  });
}

async function chooseSource(opts: Required<PickNativeFileOptions>): Promise<Source | null> {
  // Construit dynamiquement la liste des sources autorisées dans l'ordre :
  // Photothèque, Appareil photo, Fichiers.
  const labels: string[] = [];
  const sources: Source[] = [];
  if (opts.acceptImages) { labels.push('Photothèque'); sources.push('photos'); }
  if (opts.acceptCamera) { labels.push('Appareil photo'); sources.push('camera'); }
  if (opts.acceptPdf) { labels.push('Fichiers'); sources.push('files'); }

  // Aucune ou une seule source : pas de choix.
  if (sources.length === 0) return null;
  if (sources.length === 1) return sources[0];

  if (Platform.OS === 'ios') {
    const options = [...labels, 'Annuler'];
    const cancelButtonIndex = options.length - 1;
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Ajouter un fichier', options, cancelButtonIndex },
        (buttonIndex) => {
          if (buttonIndex === cancelButtonIndex) resolve(null);
          else resolve(sources[buttonIndex] ?? null);
        },
      );
    });
  }

  // Android : Alert avec n+1 boutons (pas d'ActionSheet natif disponible sans lib tierce).
  return new Promise((resolve) => {
    const buttons = labels.map((label, idx) => ({
      text: label,
      onPress: () => resolve(sources[idx]),
    }));
    Alert.alert(
      'Ajouter un fichier',
      'Choisissez une source',
      [
        ...buttons,
        { text: 'Annuler', style: 'cancel' as const, onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export async function pickNativeFile(
  opts: PickNativeFileOptions = {},
): Promise<PickedFile[]> {
  const resolved: Required<PickNativeFileOptions> = {
    acceptImages: opts.acceptImages ?? true,
    acceptPdf: opts.acceptPdf ?? true,
    acceptCamera: opts.acceptCamera ?? false,
    multiple: opts.multiple ?? true,
    compressImages: opts.compressImages ?? false,
  };

  if (!resolved.acceptImages && !resolved.acceptPdf && !resolved.acceptCamera) {
    console.warn('pickNativeFile: at least one of acceptImages/acceptPdf/acceptCamera must be true');
    return [];
  }

  try {
    if (Platform.OS === 'web') return await pickFromWeb(resolved);

    const source = await chooseSource(resolved);
    if (source === null) return [];
    if (source === 'photos') return await pickFromPhotos(resolved);
    if (source === 'camera') return await pickFromCamera(resolved);
    return await pickFromFiles(resolved);
  } catch (err) {
    console.warn('pickNativeFile:', err);
    return [];
  }
}
