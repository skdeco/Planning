// Écran liste des fichiers en attente d'import dans l'Inbox AppGroup
// (manifest écrit par la share extension iOS).
//
// J2.B.2 = consultation + suppression seulement.
// J2.B.3 ajoutera l'action "Placer dans..." pour assigner à un chantier
// + destination (note / plan / galerie / SAV).

import React, { useCallback } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Stack } from 'expo-router';

import { DS, font, radius, space } from '@/constants/design';
import { notifyInboxChanged, useInbox } from '@/hooks/useInbox';
import { removeInboxItem, type InboxItem } from '@/lib/share/inboxStore';

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

export default function InboxScreen(): React.ReactElement {
  const { items, refresh } = useInbox();

  const handleDelete = useCallback(
    (item: InboxItem): void => {
      Alert.alert('Supprimer ce fichier ?', item.filename, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            removeInboxItem(item.id);
            notifyInboxChanged();
            refresh();
          },
        },
      ]);
    },
    [refresh],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<InboxItem>) => {
      const subtitle = [
        formatBytes(item.fileSize),
        formatRelativeDate(item.createdAt),
      ]
        .filter((s) => s.length > 0)
        .join(' · ');

      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: DS.surface,
            borderWidth: 1,
            borderColor: DS.border,
            borderRadius: radius.md,
            padding: space.md,
            marginBottom: space.sm,
            gap: space.md,
          }}
        >
          <Text style={{ fontSize: 28 }}>{getFileIcon(item.mimeType)}</Text>
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
              {subtitle}
            </Text>
          </View>
          <Pressable
            onPress={() => handleDelete(item)}
            hitSlop={8}
            style={{
              paddingVertical: space.xs,
              paddingHorizontal: space.sm,
              borderRadius: radius.sm,
            }}
          >
            <Text
              style={{
                color: DS.error,
                fontSize: font.compact,
                fontWeight: font.semibold,
              }}
            >
              Supprimer
            </Text>
          </Pressable>
        </View>
      );
    },
    [handleDelete],
  );

  return (
    <View style={{ flex: 1, backgroundColor: DS.background }}>
      <Stack.Screen
        options={{ headerShown: true, title: 'Boîte de réception' }}
      />

      {items.length === 0 ? (
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
              color: DS.text,
              fontSize: font.title,
              fontWeight: font.semibold,
              marginBottom: space.sm,
              textAlign: 'center',
            }}
          >
            Aucun fichier en attente
          </Text>
          <Text
            style={{
              color: DS.textSecondary,
              fontSize: font.md,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            Partagez un fichier vers SK DECO depuis Mail, Photos ou Files
            pour le voir ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: space.lg }}
        />
      )}
    </View>
  );
}
