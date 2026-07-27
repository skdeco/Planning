import React from 'react';
import type { ViewStyle } from 'react-native';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { getInboxItemPath } from '@/lib/share/inboxStore';
import { uploadFileToStorage } from '@/lib/supabase';

/**
 * Bouton « depuis la boîte de réception » réutilisable, à poser à CÔTÉ de
 * n'importe quel bouton d'upload de document. Il n'apparaît que si l'inbox
 * contient au moins un fichier (iOS-only) — sinon rien, zéro encombrement.
 *
 * Il gère l'upload vers Storage puis appelle `onUploaded` avec l'URL finale
 * et le nom/mime, à charge de l'appelant de rattacher au module métier.
 */
export interface DocInboxButtonProps {
  /** Dossier Storage cible, ex: `chantiers/<id>/prescriptions`. */
  folder: string;
  /** Appelé après upload réussi. Retourne true pour retirer l'item de l'inbox. */
  onUploaded: (doc: { url: string; nom: string; mime: string }) => void | Promise<void>;
  /** Filtre de type (défaut : PDF + images). */
  mimeFilter?: (mimeType: string) => boolean;
  label?: string;
  buttonStyle?: ViewStyle;
}

const defaultMime = (m: string) => m === 'application/pdf' || m.startsWith('image/');

export function DocInboxButton({ folder, onUploaded, mimeFilter, label, buttonStyle }: DocInboxButtonProps) {
  return (
    <InboxPickerButton
      label={label ?? 'Depuis la boîte de réception'}
      mimeFilter={mimeFilter ?? defaultMime}
      buttonStyle={buttonStyle}
      onPick={async (item) => {
        const path = getInboxItemPath(item);
        if (!path) return false;
        const id = `${folder.split('/').pop() || 'doc'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const url = await uploadFileToStorage(path, folder, id);
        if (!url) return false;
        await onUploaded({ url, nom: item.filename, mime: item.mimeType });
        return true;
      }}
    />
  );
}
