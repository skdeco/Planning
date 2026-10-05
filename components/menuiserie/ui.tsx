/** Petits éléments d'interface partagés par les écrans Menuiserie. */
import React from 'react';
import { View, Text, Pressable, TextInput, type TextInputProps, ActivityIndicator } from 'react-native';
import { DS, radius, shadows } from '@/constants/design';

import { tm } from '@/lib/menuiserie/i18n';
/** Suppléments en attente de réponse du client */
export const BORDEAUX = '#7A1F2B';
export const BORDEAUX_DOUX = '#F6ECEE';

export function Carte({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: DS.surface, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: DS.border }, style]}>{children}</View>;
}

/** Titre de rubrique (au-dessus d'une carte). */
export function Section({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 17, fontFamily: 'Manrope_500Medium', color: DS.text, marginTop: 10, marginLeft: 2 }}>{children}</Text>;
}

/** Carte avec son titre et une action à droite : regroupe une rubrique en un seul bloc lisible. */
export function Bloc({ titre, droite, children, style }: { titre: string; droite?: React.ReactNode; children?: React.ReactNode; style?: object }) {
  return (
    <View style={[{ backgroundColor: DS.surface, borderRadius: 20, borderWidth: 1, borderColor: DS.border, padding: 16, gap: 12 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 17, fontFamily: 'Manrope_500Medium', color: DS.text }}>{titre}</Text>
        {droite}
      </View>
      {children}
    </View>
  );
}

/** Petit bouton d'action en pilule (dans l'en-tête d'un Bloc). */
export function ActionPilule({ label, onPress, charge }: { label: string; onPress: () => void; charge?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={charge} accessibilityRole="button" hitSlop={6}
      style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
      {charge ? <ActivityIndicator size="small" color={DS.textInverse} /> : <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textInverse }}>{label}</Text>}
    </Pressable>
  );
}

/** Chiffre clé mis en avant (montant, avancement…). */
export function Chiffre({ label, valeur, sous, sombre }: { label: string; valeur: string; sous?: string; sombre?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 140, borderRadius: 18, padding: 14, gap: 4, backgroundColor: sombre ? DS.primary : DS.surface, borderWidth: sombre ? 0 : 1, borderColor: DS.border }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: sombre ? 'rgba(255,255,255,0.7)' : DS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 22, fontFamily: 'Manrope_700Bold', color: sombre ? DS.textInverse : DS.text }} numberOfLines={1} adjustsFontSizeToFit>{valeur}</Text>
      {!!sous && <Text style={{ fontSize: 12, color: sombre ? 'rgba(255,255,255,0.7)' : DS.textSecondary }}>{sous}</Text>}
    </View>
  );
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
        minHeight: 50, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
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
        style={[{ borderWidth: 1, borderColor: DS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: DS.text, backgroundColor: DS.surface }, props.style]}
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
      <Text style={{ fontSize: 26, fontFamily: 'Manrope_500Medium', letterSpacing: -0.4, color: DS.text, flex: 1 }} numberOfLines={1}>{titre}</Text>
      {droite}
    </View>
  );
}

export const COULEUR_USINE = '#1F4E79';
export const FOND_USINE = '#DCE6F0';

export function euros(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
