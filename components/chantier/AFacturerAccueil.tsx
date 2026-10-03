/**
 * Accueil : dépannages avec des travaux pas encore facturés (admin et
 * personnes ayant l'accès). Un tap ouvre « Travaux et prix ».
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Receipt, ChevronRight } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { depannagesAFacturer, formatEuro } from '@/lib/depannage/facturation';
import { FacturationDepannage } from './FacturationDepannage';
import { tm } from '@/lib/menuiserie/i18n';

export function AFacturerAccueil() {
  const { data, currentUser } = useApp();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const liste = depannagesAFacturer(data, currentUser);
  return (
    <>
      {liste.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontFamily: 'Manrope_500Medium', color: DS.text, marginBottom: 8, marginLeft: 4 }}>{tm('Dépannages à facturer')}</Text>
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border }}>
            {liste.map(({ chantier, nb, total }, i) => (
              <Pressable key={chantier.id} onPress={() => setOuvert(chantier.id)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: DS.border }}>
                <Receipt size={18} color={DS.primary} strokeWidth={1.9} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: DS.text }} numberOfLines={1}>{chantier.nom}</Text>
                  <Text style={{ fontSize: 13, color: DS.textSecondary }}>{nb} {nb > 1 ? tm('lignes') : tm('ligne')}</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{formatEuro(total)}</Text>
                <ChevronRight size={16} color={DS.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <FacturationDepannage chantierId={ouvert} onClose={() => setOuvert(null)} />
    </>
  );
}
