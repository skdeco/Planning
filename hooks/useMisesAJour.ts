/**
 * Mises à jour de l'app appliquées tout de suite.
 *
 * Par défaut, expo-updates télécharge la mise à jour en arrière-plan et ne l'applique
 * qu'au prochain démarrage « à froid ». Sur iPhone, l'app reste souvent ouverte en
 * arrière-plan pendant des jours : certains employés restaient donc sur une ancienne
 * version. Ici, au lancement et à chaque retour dans l'app (au plus toutes les 10 min),
 * on vérifie, on télécharge et on redémarre l'app sur la nouvelle version.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

const INTERVALLE_MS = 10 * 60 * 1000;

export function useMisesAJour(): void {
  const derniere = useRef(0);
  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return;
    const verifier = async () => {
      if (Date.now() - derniere.current < INTERVALLE_MS) return;
      derniere.current = Date.now();
      try {
        const r = await Updates.checkForUpdateAsync();
        if (!r.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch { /* hors ligne : on réessaiera au prochain retour dans l'app */ }
    };
    verifier();
    const abo = AppState.addEventListener('change', s => { if (s === 'active') verifier(); });
    return () => abo.remove();
  }, []);
}

/** Libellé de version affiché dans « Plus » (canal + date de la mise à jour). */
export function libelleVersion(): string {
  if (Platform.OS === 'web') return 'web';
  try {
    const canal = Updates.channel || '—';
    const date = Updates.createdAt ? `${Updates.createdAt.toLocaleDateString('fr-FR')} ${Updates.createdAt.toTimeString().slice(0, 5)}` : 'intégrée';
    return `${canal} · ${date}`;
  } catch { return '—'; }
}
