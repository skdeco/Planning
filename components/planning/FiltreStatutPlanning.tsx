/** Filtre rapide du planning équipe (admin / RH) : Actifs · SAV · Terminés · Masqués. */
import React from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { dansFiltreStatut, setFiltreStatutPlanning, useFiltreStatutPlanning, COULEUR_SAV, type FiltreStatutPlanning as Filtre } from '@/lib/planningAffichage';
import { chantierDansPlanning, usePlanningFiltre } from '@/lib/planningFiltre';
import { tm } from '@/lib/menuiserie/i18n';

const FILTRES: { cle: Filtre; label: string }[] = [
  { cle: 'actifs', label: 'Actifs' }, { cle: 'sav', label: 'SAV' }, { cle: 'termines', label: 'Terminés' }, { cle: 'masques', label: 'Masqués' },
];

export function FiltreStatutPlanning() {
  const { data } = useApp();
  const actif = useFiltreStatutPlanning();
  const planning = usePlanningFiltre();
  const nb = (f: Filtre) => data.chantiers.filter(c => dansFiltreStatut(c, f) && chantierDansPlanning(c, planning)).length;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}>
      {FILTRES.map(f => {
        const on = f.cle === actif;
        const couleur = f.cle === 'sav' ? COULEUR_SAV : DS.primary;
        return (
          <Pressable key={f.cle} onPress={() => setFiltreStatutPlanning(f.cle)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: radius.full, justifyContent: 'center', backgroundColor: on ? couleur : DS.surface, borderWidth: 1, borderColor: on ? couleur : DS.border }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: on ? DS.textInverse : DS.text }}>{tm(f.label)} ({nb(f.cle)})</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
