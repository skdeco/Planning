/**
 * Enveloppe un bouton d'ajout de fichiers : sur ordinateur, des fichiers lâchés
 * dessus (ou à proximité) déclenchent la même action que le bouton.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useZoneDepot, type TypesDepot } from '@/lib/share/depotFichiers';

export function ZoneDepot({ onDepot, actif = true, types = 'tout', style, children }: {
  onDepot: () => void | Promise<unknown>; actif?: boolean; types?: TypesDepot;
  style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const ref = useZoneDepot(onDepot, actif, types);
  return <View ref={ref} style={style}>{children}</View>;
}
