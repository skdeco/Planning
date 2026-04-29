import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { close, openHostApp, type InitialProps } from 'expo-share-extension';

import { DS, font, radius, space } from '@/constants/design';
import { loadChantiersCache } from '@/lib/share/chantiersCache';
import {
  addInboxItem,
  extractFilenameFromUri,
  guessMimeType,
} from '@/lib/share/inboxStore';

/**
 * Composant racine de la Share Extension iOS — flow Inbox simplifié.
 *
 * Quand l'utilisateur partage un (ou plusieurs) fichier(s) vers SK Deco
 * depuis Mail, Photos, Files, etc., l'extension :
 *  1. Affiche les fichiers reçus (filename + taille)
 *  2. Au tap "Importer dans SK DECO" : copie chaque fichier dans
 *     AppGroup/inbox/<uuid>.<ext> + ajoute l'entrée au manifest.json
 *  3. Auto-ouvre l'app principale via openHostApp("/")
 *
 * L'extension ne décide PAS de la destination (note / plan / galerie /
 * SAV) — c'est l'app principale qui propose le triage depuis la
 * banner Inbox + écran Inbox (J2.B.2).
 *
 * Vit à la racine du projet (référencé par `index.share.js`).
 */

interface FileEntry {
  uri: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileSize(uri: string): number {
  try {
    const file = new File(uri);
    if (!file.exists) return 0;
    return file.info().size ?? 0;
  } catch {
    return 0;
  }
}

export default function ShareExtension(props: InitialProps): React.ReactElement {
  const { files, images, videos, text, url } = props;

  const fileEntries = useMemo<FileEntry[]>(() => {
    const all: string[] = [
      ...(files ?? []),
      ...(images ?? []),
      ...(videos ?? []),
    ];
    return all.map((uri) => {
      const filename = extractFilenameFromUri(uri);
      const mimeType = guessMimeType(filename);
      const fileSize = getFileSize(uri);
      return { uri, filename, mimeType, fileSize };
    });
  }, [files, images, videos]);

  const hasOnlyTextOrUrl =
    fileEntries.length === 0 && (text !== undefined || url !== undefined);
  const canImport = fileEntries.length > 0;

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = (): void => {
    if (!canImport || importing) return;
    setImporting(true);
    setError(null);

    try {
      const cache = loadChantiersCache();
      const userId = cache.userId;

      const results = fileEntries.map((entry) =>
        addInboxItem({
          sourceUri: entry.uri,
          filename: entry.filename,
          mimeType: entry.mimeType,
          fileSize: entry.fileSize,
          userId,
        }),
      );

      const failed = results.filter((r) => r === null).length;
      if (failed > 0) {
        setError(`${failed} fichier(s) n'ont pas pu être importés.`);
        setImporting(false);
        return;
      }

      openHostApp('/');
    } catch (err) {
      console.warn('[ShareExtension] import failed', err);
      setError("Erreur lors de l'import. Réessayez.");
      setImporting(false);
    }
  };

  const primaryDisabled = !canImport || importing;

  return (
    <View style={{ flex: 1, padding: space.lg, backgroundColor: DS.background }}>
      <Text
        style={{
          fontSize: font.title,
          fontWeight: font.bold,
          color: DS.textStrong,
          marginBottom: space.lg,
        }}
      >
        Importer dans SK DECO Planning
      </Text>

      {fileEntries.length > 0 && (
        <View
          style={{
            padding: space.md,
            backgroundColor: DS.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: DS.border,
            marginBottom: space.md,
          }}
        >
          <Text
            style={{
              color: DS.textSecondary,
              fontSize: font.compact,
              marginBottom: space.sm,
            }}
          >
            Fichier{fileEntries.length > 1 ? 's' : ''} à importer :
          </Text>
          {fileEntries.map((entry, idx) => (
            <Text
              key={`${entry.uri}-${idx}`}
              style={{
                color: DS.text,
                fontSize: font.md,
                marginBottom: 2,
              }}
            >
              • {entry.filename}
              {entry.fileSize > 0 ? ` (${formatBytes(entry.fileSize)})` : ''}
            </Text>
          ))}
        </View>
      )}

      {hasOnlyTextOrUrl && (
        <View
          style={{
            padding: space.md,
            backgroundColor: DS.warningSoft,
            borderRadius: radius.md,
            marginBottom: space.md,
          }}
        >
          <Text style={{ color: DS.text, fontSize: font.md }}>
            Texte/URL pas encore supportés. Partagez un fichier ou une photo.
          </Text>
        </View>
      )}

      {error !== null && (
        <View
          style={{
            padding: space.md,
            backgroundColor: DS.errorSoft,
            borderRadius: radius.md,
            marginBottom: space.md,
          }}
        >
          <Text style={{ color: DS.error, fontSize: font.md }}>{error}</Text>
        </View>
      )}

      <Pressable
        onPress={handleImport}
        disabled={primaryDisabled}
        style={{
          backgroundColor: primaryDisabled ? DS.textMuted : DS.primary,
          padding: space.md,
          borderRadius: radius.md,
          alignItems: 'center',
          marginBottom: space.sm,
        }}
      >
        <Text
          style={{
            color: DS.textInverse,
            fontSize: font.md,
            fontWeight: font.semibold,
          }}
        >
          {importing ? 'Import en cours…' : 'Importer dans SK DECO'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => close()}
        style={{
          backgroundColor: DS.primarySoft,
          padding: space.md,
          borderRadius: radius.md,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: DS.text,
            fontSize: font.md,
            fontWeight: font.semibold,
          }}
        >
          Fermer
        </Text>
      </Pressable>
    </View>
  );
}
