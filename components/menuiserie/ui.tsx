/** Petits éléments d'interface partagés par les écrans Menuiserie. */
import React from 'react';
import { View, Text, Pressable, TextInput, type TextInputProps, ActivityIndicator } from 'react-native';
import { DS, radius, shadows } from '@/constants/design';

import { tm } from '@/lib/menuiserie/i18n';
export function Carte({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: DS.surface, borderRadius: radius.xl, padding: 16, gap: 8, ...shadows.md }, style]}>{children}</View>;
}

export function Section({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary, marginTop: 6 }}>{children}</Text>;
}

export function Bouton({ label, onPress, variante = 'plein', disabled, charge }: {
  label: string; onPress: () => void; variante?: 'plein' | 'contour' | 'discret'; disabled?: boolean; charge?: boolean;
}) {
  const plein = variante === 'plein';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || charge}
      accessibilityRole="button"
      style={{
        minHeight: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
        backgroundColor: plein ? DS.primary : 'transparent',
        borderWidth: variante === 'contour' ? 1.5 : 0, borderColor: DS.primary, opacity: disabled ? 0.5 : 1,
      }}
    >
      {charge ? <ActivityIndicator color={plein ? DS.textInverse : DS.primary} />
        : <Text style={{ fontSize: 15, fontWeight: '800', color: plein ? DS.textInverse : DS.primary }}>{label}</Text>}
    </Pressable>
  );
}

export function Champ({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{label}</Text>
      <TextInput
        placeholderTextColor={DS.textMuted}
        accessibilityLabel={label}
        {...props}
        style={[{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.background }, props.style]}
      />
    </View>
  );
}

export function Puce({ label, actif, onPress, couleur }: { label: string; actif?: boolean; onPress?: () => void; couleur?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!actif } : undefined}
      style={{
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, minHeight: 36, justifyContent: 'center',
        backgroundColor: actif ? (couleur || DS.sombre) : DS.surface, borderWidth: 1, borderColor: actif ? (couleur || DS.sombre) : DS.border,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: actif ? DS.textInverse : DS.text }}>{label}</Text>
    </Pressable>
  );
}

export function Pastille({ label, fond, texte }: { label: string; fond: string; texte: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: fond }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: texte }}>{label}</Text>
    </View>
  );
}

export function EnTete({ titre, retour, droite }: { titre: string; retour?: () => void; droite?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      {retour && (
        <Pressable onPress={retour} accessibilityRole="button" accessibilityLabel={tm("Retour")} style={{ minHeight: 44, justifyContent: 'center', paddingRight: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: DS.primary }}>{tm("‹ Retour")}</Text>
        </Pressable>
      )}
      <Text style={{ fontSize: 20, fontWeight: '800', color: DS.text, flex: 1 }} numberOfLines={1}>{titre}</Text>
      {droite}
    </View>
  );
}

export const COULEUR_USINE = '#1F4E79';
export const FOND_USINE = '#DCE6F0';

export function euros(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
