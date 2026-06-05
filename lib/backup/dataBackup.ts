/**
 * Sauvegarde / restauration des données de l'app.
 *
 * Export : sérialise l'intégralité des données (`AppData`) dans un fichier JSON
 * partagé via la feuille de partage native (ou téléchargé sur web). Les photos
 * y figurent sous forme d'URL Supabase Storage (stockage cloud persistant), ce
 * qui rend la sauvegarde récupérable : restaurer le JSON restaure toutes les
 * références aux photos.
 *
 * Restauration : lit un fichier JSON de sauvegarde et valide sa structure.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { AppData } from '@/app/types';

const BACKUP_VERSION = 1;

interface BackupEnvelope {
  app: 'sk-deco-planning';
  version: number;
  exportedAt: string;
  data: AppData;
}

function buildFilename(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `sauvegarde-skdeco-${ymd}-${hm}.json`;
}

export interface ExportResult {
  ok: boolean;
  uri?: string;
  error?: string;
}

/** Exporte toutes les données dans un fichier JSON et ouvre le partage. */
export async function exportDataBackup(data: AppData): Promise<ExportResult> {
  try {
    const envelope: BackupEnvelope = {
      app: 'sk-deco-planning',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };
    const json = JSON.stringify(envelope);
    const filename = buildFilename();

    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    }

    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });

    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: 'Sauvegarde des données SK DECO',
        UTI: 'public.json',
      });
    }
    return { ok: true, uri };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Analyse un texte JSON de sauvegarde. Accepte l'enveloppe complète ou un objet
 * de données brut. Retourne les données validées ou `null` si invalide.
 */
export function parseBackup(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const candidate = (parsed && typeof parsed === 'object' && 'data' in parsed
      ? (parsed as { data: unknown }).data
      : parsed) as Record<string, unknown> | null;
    if (!candidate || typeof candidate !== 'object') return null;
    // Garde-fou minimal : une sauvegarde valide contient au moins ces tableaux.
    if (!Array.isArray(candidate.chantiers) || !Array.isArray(candidate.employes)) return null;
    return candidate;
  } catch {
    return null;
  }
}

/** Compte rapide d'entités pour confirmation avant restauration. */
export function summarizeBackup(raw: Record<string, unknown>): string {
  const n = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : 0);
  return `${n('chantiers')} chantiers · ${n('employes')} employés · ${n('sousTraitants')} sous-traitants`;
}
