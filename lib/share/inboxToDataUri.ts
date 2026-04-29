// Helper utilitaire pour convertir un InboxItem (fichier dans
// AppGroup/inbox/) en data URI base64 prête à être stockée en DB.
//
// Quand utiliser :
//   - Flows legacy qui stockent des data URIs directement en DB
//     (au lieu d'URLs Supabase Storage) :
//     - ModalNotesChantier (notes par chantier) — bug 2.7 web-only
//     - Messagerie (photos/vidéos messages privés)
//
// Quand NE PAS utiliser :
//   - Tout nouveau code : préférer uploadFileToStorage(uri, folder, id)
//     qui retourne une URL Supabase publique. C'est plus léger en DB,
//     plus robuste (pas de payload base64 dans le JSON), et déjà
//     mobile-compatible.
//
// Format de sortie : `data:<mime>;base64,<base64String>`
// (rappel : une data URI encode le contenu binaire dans l'URL elle-même.)
//
// iOS-only effectif. Sur Android/web, getInboxItemPath retourne null
// donc ce helper retourne null silencieusement.

import { File } from 'expo-file-system';

import { getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';

export async function inboxItemToDataUri(
  item: InboxItem,
): Promise<string | null> {
  const fileURI = getInboxItemPath(item);
  if (!fileURI) {
    console.warn('[inboxToDataUri] file path missing', item.id);
    return null;
  }
  try {
    const file = new File(fileURI);
    if (!file.exists) {
      console.warn('[inboxToDataUri] file does not exist', fileURI);
      return null;
    }
    const base64 = await file.base64();
    return `data:${item.mimeType};base64,${base64}`;
  } catch (err) {
    console.warn('[inboxToDataUri] read failed', err);
    return null;
  }
}
