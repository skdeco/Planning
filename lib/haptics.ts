/**
 * Retours haptiques centralisés (Lot 9 — finitions).
 *
 * Enveloppe fine autour d'`expo-haptics` :
 * - tout est encapsulé dans un try/catch (no-op silencieux si indisponible) ;
 * - aucun retour sur le web (les vibrations n'y ont pas de sens) ;
 * - une seule source de vérité pour le « ressenti » des interactions.
 *
 * @example
 * import { hapticSuccess } from '@/lib/haptics';
 * hapticSuccess(); // après une sauvegarde réussie
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Sélection légère : navigation, ouverture d'un panneau, choix dans une liste. */
export function hapticSelection(): void {
  if (!enabled) return;
  try { Haptics.selectionAsync(); } catch { /* no-op */ }
}

/** Impact léger : appui sur un bouton secondaire. */
export function hapticLight(): void {
  if (!enabled) return;
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* no-op */ }
}

/** Impact moyen : action principale (créer, valider). */
export function hapticMedium(): void {
  if (!enabled) return;
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* no-op */ }
}

/** Notification de succès : sauvegarde, envoi, opération réussie. */
export function hapticSuccess(): void {
  if (!enabled) return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* no-op */ }
}

/** Notification d'avertissement : demande de confirmation, action sensible. */
export function hapticWarning(): void {
  if (!enabled) return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { /* no-op */ }
}

/** Notification d'erreur : échec d'une opération. */
export function hapticError(): void {
  if (!enabled) return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch { /* no-op */ }
}
