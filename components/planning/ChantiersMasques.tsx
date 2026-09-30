/**
 * Bas du planning (admin / RH) : « ▸ N chantiers masqués ». Déplié, chaque chantier
 * masqué (terminés compris) a un bouton « Réafficher » qui le remet en un tap.
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { basculerAffichage, estAffiche } from '@/lib/planningAffichage';
import { chantierDansPlanning, usePlanningFiltre } from '@/lib/planningFiltre';
import { tm } from '@/lib/menuiserie/i18n';

export function ChantiersMasques() {
  const { data, updateChantier } = useApp();
  const planning = usePlanningFiltre();
  const [ouvert, setOuvert] = useState(false);
  const masques = data.chantiers
    .filter(c => c.statut !== 'archive' && !estAffiche(c) && chantierDansPlanning(c, planning))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  if (!masques.length) return null;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: '#EDE2D6' }}>
      <Pressable onPress={() => setOuvert(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: ouvert }}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 13, color: DS.textSecondary }}>{ouvert ? '▾' : '▸'}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: DS.textSecondary }}>{tm('{0} chantier(s) masqué(s)', masques.length)}</Text>
      </Pressable>
      {ouvert && masques.map(c => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderTopWidth: 0.5, borderTopColor: '#EDE2D6', backgroundColor: '#FAF7F3' }}>
          <View style={{ width: 4, height: 22, borderRadius: 2, backgroundColor: c.couleur || DS.border, opacity: 0.5 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: DS.textSecondary }} numberOfLines={1}>{c.nom}</Text>
            {c.statut === 'termine' && <Text style={{ fontSize: 11, color: DS.textMuted }}>{tm('Terminé')}</Text>}
          </View>
          <Pressable onPress={() => updateChantier(basculerAffichage(c))} accessibilityRole="button"
            style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: DS.primarySoft, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: DS.primary }}>{tm('Réafficher')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
