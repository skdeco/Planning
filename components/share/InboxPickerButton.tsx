// Bouton réutilisable + bottom sheet picker pour importer un fichier
// depuis l'Inbox AppGroup vers n'importe quelle destination capable
// d'accepter une URI (notes, plans, galerie, etc.).
//
// API minimale : passer une callback `onPick(item)` qui s'occupe
// d'uploader/persister selon la destination métier. Le composant
// gère lui-même la suppression de l'item après upload réussi
// (removeInboxItem + notifyInboxChanged).
//
// iOS-only effectif. Sur Android/web, useInbox() retourne count=0
// donc le bouton ne s'affiche pas.

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DS, font, radius, space } from '@/constants/design';
import { notifyInboxChanged, useInbox } from '@/hooks/useInbox';
import { removeInboxItem, type InboxItem } from '@/lib/share/inboxStore';

export interface InboxPickerButtonProps {
  onPick: (item: InboxItem) => Promise<boolean>;
  mimeFilter?: (mimeType: string) => boolean;
  label?: string;
  buttonStyle?: ViewStyle;
}

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  return '📎';
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatRelativeDate(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

export function InboxPickerButton({
  onPick,
  mimeFilter,
  label,
  buttonStyle,
}: InboxPickerButtonProps): React.ReactElement | null {
  const { items } = useInbox();
  const [isOpen, setIsOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const filtered = useMemo<InboxItem[]>(() => {
    const list = mimeFilter ? items.filter((it) => mimeFilter(it.mimeType)) : items;
    return [...list].reverse();
  }, [items, mimeFilter]);

  // Reste monté tant que le picker est ouvert (cas où la liste se vide
  // mid-flow → on affiche l'empty state avant fermeture). Sinon return null.
  if (filtered.length === 0 && !isOpen) return null;

  const buttonLabel = label ?? `📥 Importer depuis Inbox (${filtered.length})`;

  const handleClose = (): void => {
    if (loadingId !== null) return;
    setIsOpen(false);
    setError(null);
  };

  const handleSelect = async (item: InboxItem): Promise<void> => {
    if (loadingId !== null) return;
    setLoadingId(item.id);
    setError(null);
    try {
      const ok = await onPick(item);
      if (ok) {
        removeInboxItem(item.id);
        notifyInboxChanged();
        setIsOpen(false);
      } else {
        setError("Échec de l'import. Réessayez.");
      }
    } catch (err) {
      console.warn('[InboxPickerButton] onPick threw', err);
      setError("Échec de l'import. Réessayez.");
    } finally {
      setLoadingId(null);
    }
  };

  const renderItem = ({
    item,
  }: ListRenderItemInfo<InboxItem>): React.ReactElement => {
    const subtitle = [formatBytes(item.fileSize), formatRelativeDate(item.createdAt)]
      .filter((s) => s.length > 0)
      .join(' · ');
    const isLoading = loadingId === item.id;
    const dimmed = loadingId !== null && !isLoading;

    return (
      <Pressable
        onPress={() => handleSelect(item)}
        disabled={loadingId !== null}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isLoading ? DS.surfaceHover : DS.surface,
          borderWidth: 1,
          borderColor: DS.border,
          borderRadius: radius.md,
          padding: space.md,
          marginBottom: space.sm,
          gap: space.md,
          opacity: dimmed ? 0.4 : 1,
        }}
      >
        <Text style={{ fontSize: 24 }}>{getFileIcon(item.mimeType)}</Text>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: DS.text,
              fontSize: font.md,
              fontWeight: font.semibold,
            }}
          >
            {item.filename}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: DS.textSecondary,
              fontSize: font.compact,
              marginTop: 2,
            }}
          >
            {isLoading ? 'Import en cours…' : subtitle}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      {filtered.length > 0 && (
        <Pressable
          onPress={() => setIsOpen(true)}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.sm,
              backgroundColor: DS.primarySoft,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: DS.border,
            },
            buttonStyle,
          ]}
        >
          <Text
            style={{
              color: DS.text,
              fontSize: font.md,
              fontWeight: font.semibold,
            }}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      )}

      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <View style={{ flex: 1, backgroundColor: DS.background }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderBottomWidth: 1,
              borderBottomColor: DS.border,
            }}
          >
            <Text
              style={{
                color: DS.textStrong,
                fontSize: font.title,
                fontWeight: font.bold,
              }}
            >
              Importer un fichier
            </Text>
            <Pressable onPress={handleClose} disabled={loadingId !== null}>
              <Text
                style={{
                  color: loadingId !== null ? DS.textMuted : DS.textSecondary,
                  fontSize: font.md,
                  fontWeight: font.semibold,
                }}
              >
                Annuler
              </Text>
            </Pressable>
          </View>

          {error !== null && (
            <View
              style={{
                marginHorizontal: space.lg,
                marginTop: space.md,
                padding: space.md,
                backgroundColor: DS.errorSoft,
                borderRadius: radius.md,
              }}
            >
              <Text style={{ color: DS.error, fontSize: font.md }}>{error}</Text>
            </View>
          )}

          {filtered.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: space.xxxl,
              }}
            >
              <Text style={{ fontSize: 48, marginBottom: space.md }}>📥</Text>
              <Text
                style={{
                  color: DS.textSecondary,
                  fontSize: font.md,
                  textAlign: 'center',
                }}
              >
                Aucun fichier compatible dans la boîte de réception.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={{
                padding: space.lg,
                paddingBottom: insets.bottom + space.lg,
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}
