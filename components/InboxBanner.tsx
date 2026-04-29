// Banner sticky affiché en haut de l'app quand des fichiers sont en
// attente d'import dans l'Inbox (manifest AppGroup, écrit par la
// share extension iOS).
//
// - Visible uniquement si count > 0 (sinon retourne null)
// - Tap → navigation vers /inbox
// - Le banner gère sa propre visibilité ; pas de logique conditionnelle
//   à ajouter côté layout.

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DS, font, space } from '@/constants/design';
import { useInbox } from '@/hooks/useInbox';

export function InboxBanner(): React.ReactElement | null {
  const { count } = useInbox();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (count === 0) return null;

  const label =
    count === 1
      ? "1 fichier en attente d'import"
      : `${count} fichiers en attente d'import`;

  return (
    <Pressable
      onPress={() => router.push('/inbox')}
      style={{
        paddingTop: insets.top + space.sm,
        paddingBottom: space.sm,
        paddingHorizontal: space.lg,
        backgroundColor: DS.primarySoft,
        borderBottomWidth: 1,
        borderBottomColor: DS.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
      }}
    >
      <Text style={{ fontSize: font.md }}>📥</Text>
      <Text
        style={{
          flex: 1,
          color: DS.text,
          fontSize: font.md,
          fontWeight: font.semibold,
        }}
      >
        {label}
      </Text>
      <View>
        <Text style={{ color: DS.textSecondary, fontSize: font.lg }}>›</Text>
      </View>
    </Pressable>
  );
}
