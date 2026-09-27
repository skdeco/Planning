/** Demandes de matériel et problèmes signalés par le poseur (vue admin). */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS, radius } from '@/constants/design';
import { formatDateHeureFR } from '@/lib/date/format';
import { listerSignalementsMn, traiterSignalementMn } from '@/lib/menuiserie/api2';
import type { SignalementMn } from '@/lib/menuiserie/types';
import { Carte, Pastille, Section } from './ui';

export function SignalementsListe({ chantierId }: { chantierId: string }) {
  const [liste, setListe] = useState<SignalementMn[]>([]);
  const charger = () => listerSignalementsMn(chantierId).then(setListe).catch(() => {});
  useEffect(() => { charger(); }, [chantierId]);
  if (!liste.length) return null;
  return (
    <>
      <Section>Demandes du poseur</Section>
      <Carte>
        {liste.map(s => (
          <View key={s.id} style={{ gap: 4, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Pastille label={s.type === 'materiel' ? 'Matériel' : 'Problème meuble'} fond={s.type === 'materiel' ? '#DCE6F0' : '#F6DCDA'} texte={s.type === 'materiel' ? '#1F4E79' : '#7A1F18'} />
              <Text style={{ fontSize: 12, color: DS.textSecondary, flex: 1 }}>{s.par_nom} · {formatDateHeureFR(s.created_at)}</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }}>{s.meuble ? `${s.meuble} · ` : ''}{s.texte}</Text>
            {!!s.nouvelle_cote && <Text style={{ fontSize: 13, color: DS.text }}>Nouvelle cote : {s.nouvelle_cote}</Text>}
            {s.statut === 'ouvert'
              ? <Pressable onPress={async () => { await traiterSignalementMn(s.id); charger(); }} accessibilityRole="button"><Text style={{ fontWeight: '800', color: DS.primary }}>Marquer traité</Text></Pressable>
              : <Text style={{ fontSize: 12, color: '#1F4D36', fontWeight: '700' }}>Traité</Text>}
          </View>
        ))}
      </Carte>
    </>
  );
}
