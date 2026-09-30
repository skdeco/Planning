/**
 * Lien discret sous l'en-tête du planning (admin / RH) : montrer ou cacher les
 * chantiers masqués (terminés compris), pour pouvoir les réactiver avec l'œil.
 * Rien n'est affiché s'il n'y a aucun chantier masqué.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { EyeOff } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import { estAffiche, setFiltreStatutPlanning, useFiltreStatutPlanning } from '@/lib/planningAffichage';
import { chantierDansPlanning, usePlanningFiltre } from '@/lib/planningFiltre';
import { tm } from '@/lib/menuiserie/i18n';

export function FiltreStatutPlanning() {
  const { data } = useApp();
  const filtre = useFiltreStatutPlanning();
  const planning = usePlanningFiltre();
  const nbMasques = data.chantiers.filter(c => c.statut !== 'archive' && !estAffiche(c) && chantierDansPlanning(c, planning)).length;
  if (nbMasques === 0 && filtre === 'actifs') return null;
  const ouvert = filtre === 'avecMasques';
  return (
    <Pressable onPress={() => setFiltreStatutPlanning(ouvert ? 'actifs' : 'avecMasques')} accessibilityRole="button" hitSlop={6}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginVertical: 4, minHeight: 32 }}>
      <EyeOff size={14} color={DS.textSecondary} strokeWidth={1.9} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.textSecondary }}>
        {ouvert ? tm('Cacher les chantiers masqués') : tm('Chantiers masqués ({0})', nbMasques)}
      </Text>
    </Pressable>
  );
}
