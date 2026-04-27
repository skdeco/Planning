import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useShareIntent as useExpoShareIntent } from 'expo-share-intent';

/**
 * Hook qui intercepte les events de partage iOS/Android (depuis Mail,
 * Photos, Files, etc.) et affiche un debug alert.
 *
 * **J1 — hello world** : se contente d'afficher les infos du fichier
 * partagé (chemin, mimeType, taille) dans une `Alert.alert`. Aucune
 * logique métier (upload, persistance, navigation) à ce stade.
 *
 * À enrichir en J2 avec un `ShareIntakeModal` qui présente un sélecteur
 * de destination (chantier × note/plan/galerie/SAV).
 *
 * Doit être monté UNE seule fois au niveau racine de l'app (dans
 * `app/_layout.tsx`), idéalement à l'intérieur du provider d'auth pour
 * que `currentUser` soit disponible quand le partage arrive.
 *
 * Nécessite un EAS Build dev (Share Extensions = code natif iOS,
 * intent filter Android). Pas testable en Expo Go.
 */
export function useShareIntent(): void {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useExpoShareIntent();

  useEffect(() => {
    if (hasShareIntent && shareIntent) {
      Alert.alert(
        'Share reçu (J1 hello world)',
        JSON.stringify(
          {
            text: shareIntent.text,
            files: shareIntent.files?.map(f => ({
              path:     f.path,
              mimeType: f.mimeType,
              fileName: f.fileName,
              size:     f.size,
            })),
          },
          null,
          2,
        ),
        [{ text: 'OK', onPress: () => resetShareIntent() }],
      );
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    if (error) {
      Alert.alert('Share error', String(error));
    }
  }, [error]);
}
