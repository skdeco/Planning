import React from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet } from 'react-native';
import {
  MapPin,
  Lock,
  Bell,
  Key,
  Users,
  FileText,
} from 'lucide-react-native';
import { DS } from '@/constants/design';
import { InfoTile } from './InfoTile';
import type { FicheChantier, Chantier } from '@/app/types';

/**
 * InfosUtilesPanel — Section "Infos utiles" de la fiche chantier (palette V10).
 * Remplace le rendu inline historique de chantiers.tsx (lignes 1907-2068).
 *
 * Layout :
 * - Adresse (wide) avec bouton "Y aller →"
 * - Code accès + Code alarme (2 colonnes)
 * - Emplacement clés (wide, avec texte + photo + pickers admin)
 * - Contacts utiles (wide, textarea)
 * - Notes libres (wide, textarea)
 *
 * Les pickers photo (NativeFilePickerButton, InboxPickerButton) sont passés
 * en prop `renderPhotoClePickers` pour découpler ce composant des helpers
 * externes (typage et logique métier restent dans chantiers.tsx).
 */
export interface InfosUtilesPanelProps {
  fiche: FicheChantier;
  /** Chantier source pour adresse / CP / ville (non stockés dans fiche) */
  chantier: Pick<Chantier, 'adresse' | 'codePostal' | 'ville'> | null;
  isAdmin: boolean;
  /** Mise à jour partielle du state local `fiche` (codeAcces, codeAlarme, etc.) */
  onChangeFiche: (patch: Partial<FicheChantier>) => void;
  /** Mise à jour partielle de l'adresse chantier (form ou updateChantier direct) */
  onChangeAdresse: (value: string) => void;
  onChangeCodePostal: (value: string) => void;
  onChangeVille: (value: string) => void;
  /** Action "Y aller →" (ouvre Maps/Waze) */
  onPressYAller: () => void;
  /** Tap sur la photo cachette pour ouvrir le viewer */
  onOpenPhotoCle: (uri: string) => void;
  /** Supprimer la photo cachette (admin) */
  onRemovePhotoCle: () => void;
  /** Boutons d'upload photo cachette (NativeFilePickerButton + InboxPickerButton) — admin only */
  renderPhotoClePickers?: () => React.ReactNode;
}

export function InfosUtilesPanel({
  fiche,
  chantier,
  isAdmin,
  onChangeFiche,
  onChangeAdresse,
  onChangeCodePostal,
  onChangeVille,
  onPressYAller,
  onOpenPhotoCle,
  onRemovePhotoCle,
  renderPhotoClePickers,
}: InfosUtilesPanelProps) {
  const adresse = chantier?.adresse ?? '';
  const codePostal = chantier?.codePostal ?? '';
  const ville = chantier?.ville ?? '';

  // ─── Rendus de valeurs (read-only ou editable selon isAdmin) ───
  const renderAdresse = (): React.ReactNode => {
    if (!isAdmin) {
      const parts = [adresse, [codePostal, ville].filter(Boolean).join(' ')].filter(Boolean);
      return <Text style={styles.valueText}>{parts.join(' · ') || '—'}</Text>;
    }
    return (
      <View style={styles.adresseEditWrap}>
        <TextInput
          style={styles.input}
          value={adresse}
          onChangeText={onChangeAdresse}
          placeholder="Rue"
          placeholderTextColor={DS.textSecondary}
        />
        <View style={styles.adresseRow}>
          <TextInput
            style={[styles.input, styles.inputCP]}
            value={codePostal}
            onChangeText={onChangeCodePostal}
            placeholder="CP"
            placeholderTextColor={DS.textSecondary}
            keyboardType="number-pad"
          />
          <TextInput
            style={[styles.input, styles.inputVille]}
            value={ville}
            onChangeText={onChangeVille}
            placeholder="Ville"
            placeholderTextColor={DS.textSecondary}
          />
        </View>
      </View>
    );
  };

  const renderEditableField = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    multiline = false
  ): React.ReactNode => {
    if (!isAdmin) {
      return <Text style={styles.valueText}>{value || '—'}</Text>;
    }
    return (
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={DS.textSecondary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'auto'}
      />
    );
  };

  const renderEmplacementCle = (): React.ReactNode => {
    return (
      <View style={styles.cleWrap}>
        {renderEditableField(
          fiche.emplacementCle,
          v => onChangeFiche({ emplacementCle: v }),
          'Ex: Boîte à clé sous le compteur, code 5678',
          true
        )}
        {fiche.photoEmplacementCle && (
          <View style={styles.cleThumbWrap}>
            <Pressable
              onPress={() => onOpenPhotoCle(fiche.photoEmplacementCle!)}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir la photo cachette"
            >
              <Image
                source={{ uri: fiche.photoEmplacementCle }}
                style={styles.cleThumb}
                resizeMode="cover"
              />
            </Pressable>
            {isAdmin && (
              <Pressable
                style={styles.cleRemove}
                onPress={onRemovePhotoCle}
                accessibilityRole="button"
                accessibilityLabel="Supprimer la photo cachette"
              >
                <Text style={styles.cleRemoveText}>✕</Text>
              </Pressable>
            )}
          </View>
        )}
        {isAdmin && renderPhotoClePickers && (
          <View style={styles.clePickersWrap}>{renderPhotoClePickers()}</View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {/* Adresse (wide) */}
        <InfoTile
          icon={MapPin}
          label="Adresse"
          value={renderAdresse()}
          action={
            adresse || codePostal || ville
              ? { label: 'Y aller →', onPress: onPressYAller }
              : undefined
          }
          wide
        />

        {/* Code accès */}
        <InfoTile
          icon={Lock}
          label="Code accès"
          value={renderEditableField(
            fiche.codeAcces,
            v => onChangeFiche({ codeAcces: v }),
            'Ex: 1234A'
          )}
        />

        {/* Code alarme */}
        <InfoTile
          icon={Bell}
          label="Code alarme"
          value={renderEditableField(
            fiche.codeAlarme,
            v => onChangeFiche({ codeAlarme: v }),
            'Ex: 9876'
          )}
        />

        {/* Emplacement clés (wide) */}
        <InfoTile
          icon={Key}
          label="Emplacement clés"
          value={renderEmplacementCle()}
          wide
        />

        {/* Contacts utiles (wide) */}
        <InfoTile
          icon={Users}
          label="Contacts utiles"
          value={renderEditableField(
            fiche.contacts,
            v => onChangeFiche({ contacts: v }),
            'Ex: Gardien : M. Dupont — 06 12 34 56 78',
            true
          )}
          wide
        />

        {/* Notes libres (wide) */}
        <InfoTile
          icon={FileText}
          label="Notes libres"
          value={renderEditableField(
            fiche.notes,
            v => onChangeFiche({ notes: v }),
            "Ex: Ascenseur en panne, parking réservé devant l'entrée.",
            true
          )}
          wide
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '500',
    color: DS.sombre,
    lineHeight: 18.9,
  },
  input: {
    fontSize: 14,
    color: DS.sombre,
    backgroundColor: DS.cremeFond,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputMultiline: {
    minHeight: 72,
  },
  adresseEditWrap: {
    gap: 6,
  },
  adresseRow: {
    flexDirection: 'row',
    gap: 6,
  },
  inputCP: {
    width: 80,
  },
  inputVille: {
    flex: 1,
  },
  cleWrap: {
    gap: 8,
  },
  cleThumbWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  cleThumb: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: DS.cremeNude,
  },
  cleRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: DS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleRemoveText: {
    color: DS.cremeFond,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
  },
  clePickersWrap: {
    gap: 4,
  },
});
