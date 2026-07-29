/**
 * Envoi d'une facture vers Chaintrust (réception automatique des factures).
 * Ouvre l'app Mail iOS pré-remplie vers l'email de capture avec la facture jointe.
 *
 * L'expéditeur doit être contact@skdeco.fr (compte autorisé côté Chaintrust) :
 * expo-mail-composer n'impose pas le "From", il faut donc que ce compte soit
 * configuré dans l'app Mail de l'iPhone (champ « De : » sélectionnable à l'envoi).
 */
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';

export const CHAINTRUST_CAPTURE_EMAIL = 'avoda_skdeco_e0ec380e@capture.chaintrust.io';

/** Détecte l'extension réelle d'après les octets d'en-tête (magic numbers). */
function extFromBase64Header(head: string): string | null {
  if (head.startsWith('JVBER')) return 'pdf';   // %PDF
  if (head.startsWith('/9j/')) return 'jpg';     // JPEG FF D8 FF
  if (head.startsWith('iVBOR')) return 'png';    // PNG 89 50 4E 47
  if (head.startsWith('UklGR')) return 'webp';   // RIFF (webp)
  return null;
}

/** Nettoie un nom pour en faire un nom de fichier lisible (sans extension). */
function baseName(nom: string): string {
  const sansExt = (nom || 'facture').replace(/\.[a-z0-9]{2,5}$/i, '');
  const clean = sansExt.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean || 'facture';
}

/**
 * Prépare la pièce jointe : détecte le vrai type via le contenu et copie le
 * fichier sous un nom lisible avec la BONNE extension (immunise contre les URL
 * de stockage mal nommées, ex: un PDF servi en .jpg).
 */
async function preparerPieceJointe(uri: string, nomSouhaite: string): Promise<string> {
  try {
    const head = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 12,
      position: 0,
    });
    const ext = extFromBase64Header(head)
      ?? (uri.toLowerCase().split('?')[0].match(/\.([a-z0-9]{2,5})$/)?.[1]) // fallback : extension de l'URI
      ?? 'pdf';
    const dest = `${FileSystem.cacheDirectory}${baseName(nomSouhaite)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri; // en cas d'échec, on joint tel quel
  }
}

/**
 * @param localUri   chemin local de la pièce (capture caméra) si disponible
 * @param fichierUrl URL Supabase de secours — téléchargée en cache avant l'envoi
 * @param libelle    libellé de l'achat (sujet du mail + nom de secours de la pièce)
 * @param filename   nom d'origine du fichier (ex: "Facture Point P.pdf") si connu
 */
export async function envoyerFactureChaintrust(
  localUri: string | null,
  fichierUrl: string | undefined,
  libelle: string,
  filename?: string,
): Promise<void> {
  // Garde anti-crash : le module natif ExpoMailComposer n'existe que dans un
  // build natif récent. requireOptionalNativeModule renvoie null (sans crasher)
  // s'il est absent — on teste sa présence AVANT de charger expo-mail-composer,
  // dont le require() déclencherait sinon un crash natif non rattrapable.
  if (!requireOptionalNativeModule('ExpoMailComposer')) {
    Alert.alert(
      'Envoi Chaintrust indisponible',
      "L'envoi automatique vers Chaintrust nécessite la dernière version de l'app (build natif en attente). L'achat est bien enregistré.",
    );
    return;
  }
  try {
    const MailComposer = require('expo-mail-composer') as typeof import('expo-mail-composer');
    const dispo = await MailComposer.isAvailableAsync();
    if (!dispo) {
      Alert.alert(
        'Mail indisponible',
        "Aucune app Mail n'est configurée. Ajoute le compte contact@skdeco.fr dans Réglages → Mail pour envoyer vers Chaintrust.",
      );
      return;
    }
    // Récupère le fichier localement (téléchargement si on n'a que l'URL).
    let sourceUri = localUri;
    if (!sourceUri && fichierUrl) {
      const tmp = `${FileSystem.cacheDirectory}dl_${Date.now()}`;
      const dl = await FileSystem.downloadAsync(fichierUrl, tmp);
      sourceUri = dl.uri;
    }

    // Nom + extension corrects (basés sur le CONTENU réel).
    const nomSouhaite = filename || libelle || 'facture';
    const attachmentUri = sourceUri ? await preparerPieceJointe(sourceUri, nomSouhaite) : undefined;

    await MailComposer.composeAsync({
      recipients: [CHAINTRUST_CAPTURE_EMAIL],
      subject: `Facture - ${libelle}`,
      body: `Facture transmise depuis SK DECO Planning.\n\n${libelle}`,
      attachments: attachmentUri ? [attachmentUri] : undefined,
    });
  } catch (err) {
    console.error('Envoi Chaintrust échoué', err);
    Alert.alert('Erreur', "Impossible d'ouvrir l'email vers Chaintrust.");
  }
}
