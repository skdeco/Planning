/** Réglage admin : rayon au-delà duquel un pointage est « hors zone ». */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { RAYON_POINTAGE_DEFAUT } from '@/lib/pointage/geo';
import { tm } from '@/lib/menuiserie/i18n';

export function ReglageRayon() {
  const { data, updateRayonPointage } = useApp();
  const actuel = data.rayonPointageM || RAYON_POINTAGE_DEFAUT;
  const [valeur, setValeur] = useState(String(actuel));
  const n = parseInt(valeur, 10);
  const valide = !isNaN(n) && n >= 50 && n <= 5000;
  return (
    <View style={{ margin: 16, padding: 14, gap: 8, backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{tm('Rayon de pointage')}</Text>
      <Text style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 18 }}>
        {tm("Le pointage est rattaché au chantier en cours le plus proche. Au-delà de ce rayon, il est marqué « hors zone », l'employé choisit le chantier et tu es prévenu.")}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={valeur} onChangeText={setValeur} keyboardType="number-pad" accessibilityLabel={tm('Rayon de pointage')}
          style={{ width: 90, borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, color: DS.text }} />
        <Text style={{ fontSize: 15, color: DS.text }}>m</Text>
        <Pressable disabled={!valide || n === actuel} onPress={() => updateRayonPointage(n)} accessibilityRole="button"
          style={{ marginLeft: 'auto', minHeight: 40, paddingHorizontal: 14, borderRadius: radius.sm, justifyContent: 'center', backgroundColor: valide && n !== actuel ? DS.primary : DS.border }}>
          <Text style={{ color: DS.textInverse, fontWeight: '800' }}>{tm('Enregistrer')}</Text>
        </Pressable>
      </View>
      {!valide && <Text style={{ fontSize: 12, color: DS.error }}>{tm('Entre 50 et 5000 m.')}</Text>}
    </View>
  );
}
