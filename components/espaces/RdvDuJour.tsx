/**
 * Accueil : mes RDV du jour (Planning direction) — heure, titre, chantier.
 * Un RDV passé (heure de fin dépassée) est barré. Rien n'est affiché s'il n'y a aucun RDV.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { cleUtilisateur } from '@/lib/espaces';
import { aujourdhuiYMD, mesRdv } from '@/lib/agenda';
import { tm } from '@/lib/menuiserie/i18n';
import { useLanguage } from '@/app/context/LanguageContext';

const minutes = (h: string) => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0); };

export function RdvDuJour({ marge = 16 }: { marge?: number }) {
  useLanguage();
  const { data, currentUser } = useApp();
  const router = useRouter();
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 60_000); return () => clearInterval(t); }, []);

  const jour = aujourdhuiYMD();
  const liste = mesRdv(data.agendaEvents || [], cleUtilisateur(currentUser), jour, jour);
  if (!liste.length) return null;
  const minNow = maintenant.getHours() * 60 + maintenant.getMinutes();

  return (
    <Pressable onPress={() => router.navigate('/direction' as any)} accessibilityRole="button"
      style={{ marginHorizontal: marge, marginVertical: 6, backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 12, gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary }}>{tm('RDV du jour')}</Text>
      {liste.map(({ evt }) => {
        const fin = evt.heureFin ? minutes(evt.heureFin) : minutes(evt.heureDebut) + 60;
        const passe = minNow >= fin;
        const ch = evt.chantierId ? data.chantiers.find(c => c.id === evt.chantierId) : undefined;
        const barre = passe ? { textDecorationLine: 'line-through' as const, color: DS.textMuted } : null;
        return (
          <View key={evt.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
            <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: passe ? DS.border : evt.couleur }} />
            <View style={{ width: 52 }}>
              <Text style={[{ fontSize: 14, fontWeight: '800', color: DS.text }, barre]}>{evt.heureDebut}</Text>
              {!!evt.heureFin && <Text style={[{ fontSize: 11, color: DS.textSecondary }, barre]}>{evt.heureFin}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: DS.text }, barre]} numberOfLines={1}>{evt.titre}</Text>
              {!!(ch || evt.lieu) && <Text style={[{ fontSize: 12, color: DS.textSecondary }, barre]} numberOfLines={1}>{[ch?.nom, evt.lieu].filter(Boolean).join(' · ')}</Text>}
            </View>
          </View>
        );
      })}
    </Pressable>
  );
}
