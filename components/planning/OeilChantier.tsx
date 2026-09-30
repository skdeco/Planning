/** Bouton œil (afficher / masquer un chantier du planning) et badge SAV. */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import { basculerAffichage, estAffiche, COULEUR_SAV } from '@/lib/planningAffichage';
import { tm } from '@/lib/menuiserie/i18n';

export function OeilChantier({ chantierId, taille = 16 }: { chantierId: string; taille?: number }) {
  const { data, updateChantier } = useApp();
  // Toujours repartir du chantier enregistré (la liste du planning peut avoir une couleur SAV d'affichage)
  const c = data.chantiers.find(x => x.id === chantierId);
  if (!c) return null;
  const affiche = estAffiche(c);
  return (
    <Pressable onPress={() => updateChantier(basculerAffichage(c))} hitSlop={8} accessibilityRole="button"
      accessibilityLabel={affiche ? tm('Masquer du planning') : tm('Afficher sur le planning')}
      style={{ minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' }}>
      {affiche ? <Eye size={taille} color={DS.textSecondary} strokeWidth={1.9} /> : <EyeOff size={taille} color={DS.textMuted} strokeWidth={1.9} />}
    </Pressable>
  );
}

export function BadgeSav() {
  return (
    <Text style={{ alignSelf: 'flex-start', fontSize: 9.5, fontWeight: '800', color: '#fff', backgroundColor: COULEUR_SAV, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', letterSpacing: 0.3 }}>SAV</Text>
  );
}
