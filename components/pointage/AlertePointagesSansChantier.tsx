/**
 * Accueil admin / RH : pointages enregistrés sans chantier (hors zone ou sans position).
 * Un appui ouvre la fiche des pointages du jour pour renseigner le chantier (admin et RH).
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { EditionPointagesJour } from './EditionPointagesJour';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { tm } from '@/lib/menuiserie/i18n';

const JOURS = 30;
const dateFR = (ymd: string) => ymd.split('-').reverse().slice(0, 2).join('/');

export function AlertePointagesSansChantier({ marge = 0 }: { marge?: number }) {
  const { data } = useApp();
  const [edition, setEdition] = useState<{ employeId: string; date: string } | null>(null);
  const [tout, setTout] = useState(false);
  const limite = new Date(); limite.setDate(limite.getDate() - JOURS);
  const depuis = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
  const liste = data.pointages
    .filter(p => !p.chantierId && p.date >= depuis)
    .sort((a, b) => (b.date + b.heure).localeCompare(a.date + a.heure));
  if (!liste.length) return null;
  const affiches = tout ? liste : liste.slice(0, 4);
  return (
    <View style={{ marginHorizontal: marge, marginVertical: 6, backgroundColor: DS.warningSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: '#F5D48A', padding: 12, gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#7A5200' }}>⚠ {tm('Pointages sans chantier ({0})', liste.length)}</Text>
      <Text style={{ fontSize: 12, color: '#7A5200' }}>{tm('Position trop loin de tout chantier : touche une ligne pour indiquer le chantier.')}</Text>
      {affiches.map(p => {
        const e = data.employes.find(x => x.id === p.employeId);
        return (
          <Pressable key={p.id} accessibilityRole="button"
            onPress={() => setEdition({ employeId: p.employeId, date: p.date })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, backgroundColor: DS.surface, borderRadius: radius.sm, paddingHorizontal: 10 }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: DS.text }} numberOfLines={1}>{e ? `${e.prenom} ${e.nom}` : '—'}</Text>
            <Text style={{ fontSize: 13, color: DS.textSecondary }}>{dateFR(p.date)} · {p.type === 'debut' ? '↘' : '↗'} {p.heure}</Text>
            <Text style={{ fontSize: 14, color: DS.textSecondary }}>›</Text>
          </Pressable>
        );
      })}
      {liste.length > 4 && (
        <Pressable onPress={() => setTout(v => !v)} hitSlop={6}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#7A5200' }}>{tout ? tm('Réduire') : tm('Voir les {0}', liste.length)}</Text>
        </Pressable>
      )}
      <EditionPointagesJour visible={!!edition} employeId={edition?.employeId || null} date={edition?.date || ''} onFermer={() => setEdition(null)} />
    </View>
  );
}
