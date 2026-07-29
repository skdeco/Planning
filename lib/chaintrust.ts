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

/**
 * @param localUri   chemin local de la pièce (capture caméra) si disponible
 * @param fichierUrl URL Supabase de secours — téléchargée en cache avant l'envoi
 * @param libelle    libellé de l'achat (sujet du mail)
 */
export async function envoyerFactureChaintrust(
  localUri: string | null,
  fichierUrl: string | undefined,
  libelle: string,
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
    let attachmentUri = localUri;
    if (!attachmentUri && fichierUrl) {
      const ext = (fichierUrl.split('?')[0].split('.').pop() || 'jpg').slice(0, 5);
      const dest = `${FileSystem.cacheDirectory}chaintrust_${Date.now()}.${ext}`;
      const dl = await FileSystem.downloadAsync(fichierUrl, dest);
      attachmentUri = dl.uri;
    }
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
