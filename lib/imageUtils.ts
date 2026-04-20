import { Platform } from 'react-native';

/**
 * Compresses an image URI to a smaller size while maintaining good display quality.
 * - Resizes to max 1200px on the longest side
 * - Compresses to 70% JPEG quality
 * - Returns base64 data URI
 *
 * NOTE: On native (iOS/Android), expo-image-manipulator is required but not installed.
 * Install it with: npx expo install expo-image-manipulator
 * Then uncomment the native implementation below.
 */
export async function compressImage(uri: string, maxSize = 1200): Promise<string> {
  // Skip if already small or not a local file
  if (!uri || uri.startsWith('http')) return uri;

  try {
    if (Platform.OS === 'web') {
      // Web: use canvas for compression
      return await compressImageWeb(uri, maxSize);
    }

    // Native: expo-image-manipulator not installed — return unchanged.
    // To enable native compression, install expo-image-manipulator and use:
    //
    // import * as ImageManipulator from 'expo-image-manipulator';
    // const result = await ImageManipulator.manipulateAsync(
    //   uri,
    //   [{ resize: { width: maxSize } }],
    //   { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    // );
    // return result.base64 ? `data:image/jpeg;base64,${result.base64}` : result.uri;
    return uri;
  } catch {
    return uri; // fallback: return original
  }
}

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
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(uri);
    img.src = uri;
  });
}
