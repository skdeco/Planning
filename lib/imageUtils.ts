import { Platform } from 'react-native';

/**
 * Compresse une image URI à une taille raisonnable pour upload + OCR.
 * - Resize : max 1200px sur le plus grand côté
 * - JPEG quality 70%
 * - Retourne :
 *   - Sur web : data URI base64
 *   - Sur native : URI fichier compressé (file://)
 *
 * Si la compression échoue, retourne l'URI d'origine (best-effort).
 */
export async function compressImage(uri: string, maxSize = 1200): Promise<string> {
  // Skip si pas une URI valide ou si déjà une URL distante
  if (!uri || uri.startsWith('http')) return uri;

  try {
    if (Platform.OS === 'web') {
      return await compressImageWeb(uri, maxSize);
    }

    // Native (iOS/Android) via expo-image-manipulator
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxSize } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    return result.uri;
  } catch (err) {
    // Fallback : si compression échoue, retourner l'URI d'origine
    console.warn('[compressImage] failed, returning original uri', err);
    return uri;
  }
}

/**
 * Compression web via Canvas API (pas de dep native).
 * Retourne un data URI base64.
 */
function compressImageWeb(uri: string, maxSize: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else {
          width = (width / height) * maxSize;
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(uri);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUri = canvas.toDataURL('image/jpeg', 0.7);
      resolve(dataUri);
    };
    img.onerror = () => resolve(uri); // fallback
    img.src = uri;
  });
}
