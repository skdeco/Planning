/**
 * Bouton réutilisable qui ouvre `pickNativeFile` puis itère sur les
 * fichiers sélectionnés en appelant `onPick` pour chaque fichier
 * (typiquement upload vers Supabase Storage).
 *
 * Complémentaire à InboxPickerButton (Share Extension) — peut coexister
 * dans le même formulaire pour offrir 3 voies : web input / native picker /
 * Inbox iOS.
 *
 * UI alignée sur InboxPickerButton (même look : pressable arrondi sur fond
 * `DS.primarySoft`).
 */
import React, { useState } from 'react';
import { Pressable, Text, type ViewStyle } from 'react-native';

import { DS, font, radius, space } from '@/constants/design';
import {
  pickNativeFile,
  type PickedFile,
  type PickNativeFileOptions,
} from '@/lib/share/pickNativeFile';

export interface NativeFilePickerButtonProps {
  /**
   * Callback appelée pour chaque fichier sélectionné. Doit retourner
   * `true` si l'upload a réussi, `false` sinon. Le composant continue
   * d'itérer sur les fichiers restants même en cas d'échec d'un fichier.
   */
  onPick: (file: PickedFile) => Promise<boolean>;
  acceptImages?: boolean;
  acceptPdf?: boolean;
  multiple?: boolean;
  compressImages?: boolean;
  /** Label personnalisé. Default: '📷 Ajouter photo / PDF'. */
  label?: string;
  buttonStyle?: ViewStyle;
  disabled?: boolean;
}

function defaultLabel(opts: Pick<NativeFilePickerButtonProps, 'acceptImages' | 'acceptPdf'>): string {
  if (opts.acceptImages && !opts.acceptPdf) return '📷 Ajouter une photo';
  if (opts.acceptPdf && !opts.acceptImages) return '📄 Ajouter un PDF';
  return '📷 Ajouter photo / PDF';
}

export function NativeFilePickerButton({
  onPick,
  acceptImages = true,
  acceptPdf = true,
  multiple = true,
  compressImages = false,
  label,
  buttonStyle,
  disabled = false,
}: NativeFilePickerButtonProps): React.ReactElement {
  const [busy, setBusy] = useState(false);

  const handlePress = async (): Promise<void> => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const opts: PickNativeFileOptions = { acceptImages, acceptPdf, multiple, compressImages };
      const files = await pickNativeFile(opts);
      for (const file of files) {
        try {
          await onPick(file);
        } catch (err) {
          console.warn('NativeFilePickerButton.onPick threw', err);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;
  const text = busy ? 'Importation…' : (label ?? defaultLabel({ acceptImages, acceptPdf }));

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
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
          opacity: isDisabled ? 0.5 : 1,
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
        {text}
      </Text>
    </Pressable>
  );
}
