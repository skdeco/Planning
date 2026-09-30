/**
 * Choix du chantier d'un pointage : chantiers les plus proches d'abord (avec la distance),
 * puis les autres chantiers en cours, par ordre alphabétique.
 */
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { DS, radius } from '@/constants/design';
import type { Chantier } from '@/app/types';
import { chantiersPointables, formatDistance, type ChantierProche } from '@/lib/pointage/geo';
import { tm } from '@/lib/menuiserie/i18n';

interface Props {
  visible: boolean;
  titre: string;
  message?: string;
  chantiers: Chantier[];
  proches: ChantierProche[];
  selectionId?: string;
  onChoisir: (chantierId: string) => void;
  onFermer: () => void;
}

export function ChoixChantierModal({ visible, titre, message, chantiers, proches, selectionId, onChoisir, onFermer }: Props) {
  const [recherche, setRecherche] = useState('');
  const liste = useMemo(() => {
    const dist = new Map(proches.map(p => [p.chantier.id, p.distance]));
    const tous = chantiersPointables(chantiers);
    const tries = [
      ...proches.map(p => p.chantier).filter(c => tous.some(x => x.id === c.id)),
      ...tous.filter(c => !dist.has(c.id)).sort((a, b) => a.nom.localeCompare(b.nom)),
    ];
    const q = recherche.trim().toLowerCase();
    return tries
      .filter(c => !q || `${c.nom} ${c.ville || ''} ${c.adresse || ''}`.toLowerCase().includes(q))
      .map(c => ({ c, d: dist.get(c.id) }));
  }, [chantiers, proches, recherche]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onFermer}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onFermer} accessibilityLabel={tm('Fermer')} />
        <View style={{ backgroundColor: DS.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 16, paddingBottom: 32, maxHeight: '80%', gap: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: DS.text }}>{titre}</Text>
          {!!message && <Text style={{ fontSize: 14, color: DS.textSecondary, lineHeight: 19 }}>{message}</Text>}
          {chantiersPointables(chantiers).length > 8 && (
            <TextInput
              value={recherche} onChangeText={setRecherche} placeholder={tm('Rechercher un chantier')} placeholderTextColor={DS.textMuted}
              style={{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.surface }}
            />
          )}
          <ScrollView contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
            {liste.map(({ c, d }) => {
              const actif = c.id === selectionId;
              return (
                <Pressable key={c.id} onPress={() => onChoisir(c.id)} accessibilityRole="button" accessibilityState={{ selected: actif }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: radius.md,
                    backgroundColor: actif ? DS.primarySoft : DS.surface, borderWidth: 1, borderColor: actif ? DS.primary : DS.border }}>
                  <View style={{ width: 6, alignSelf: 'stretch', marginVertical: 10, borderRadius: 3, backgroundColor: c.couleur || DS.primary }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }} numberOfLines={1}>{c.nom}</Text>
                    {!!(c.ville || c.adresse) && <Text style={{ fontSize: 12, color: DS.textSecondary }} numberOfLines={1}>{c.ville || c.adresse}</Text>}
                  </View>
                  {d != null && <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{formatDistance(d)}</Text>}
                  {c.statut === 'sav' && <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', backgroundColor: '#C2410C', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>SAV</Text>}
                </Pressable>
              );
            })}
            {liste.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm('Aucun chantier en cours.')}</Text>}
          </ScrollView>
          <Pressable onPress={onFermer} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: DS.textSecondary }}>{tm('Plus tard')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
