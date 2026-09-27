/** Chiffre d'affaires par usine, calculé sur les montants « achat usine ». */
import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { DS } from '@/constants/design';
import type { ChantierMn, MontantMn, UsineMn } from '@/lib/menuiserie/types';
import { Carte, Puce, euros } from './ui';

export function CaParUsine({ montants, chantiers, usines }: { montants: MontantMn[]; chantiers: ChantierMn[]; usines: UsineMn[] }) {
  const [annee, setAnnee] = useState<'annee' | 'tout'>('annee');
  const lignes = useMemo(() => {
    const an = String(new Date().getFullYear());
    const parUsine = new Map<string, number>();
    montants.filter(m => m.type === 'achat_usine').forEach(m => {
      const date = m.date_montant || m.created_at;
      if (annee === 'annee' && !date.startsWith(an)) return;
      const usineId = m.usine_id || chantiers.find(c => c.id === m.chantier_id)?.usine_id || 'sans';
      parUsine.set(usineId, (parUsine.get(usineId) || 0) + Number(m.montant_ht));
    });
    return Array.from(parUsine.entries())
      .map(([id, total]) => ({ id, nom: usines.find(u => u.id === id)?.nom || 'Sans usine', total }))
      .sort((a, b) => b.total - a.total);
  }, [montants, chantiers, usines, annee]);

  const total = lignes.reduce((s, l) => s + l.total, 0);
  const max = Math.max(1, ...lignes.map(l => l.total));

  return (
    <Carte>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary }}>CA par usine (achat HT)</Text>
        <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{euros(total)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Puce label={String(new Date().getFullYear())} actif={annee === 'annee'} onPress={() => setAnnee('annee')} />
        <Puce label="Depuis le début" actif={annee === 'tout'} onPress={() => setAnnee('tout')} />
      </View>
      {lignes.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>Aucun devis usine saisi pour l'instant.</Text>}
      {lignes.map(l => (
        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ width: 90, fontSize: 13, fontWeight: '700', color: DS.text }} numberOfLines={1}>{l.nom}</Text>
          <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: DS.segment }}>
            <View style={{ width: `${(l.total / max) * 100}%`, height: 10, borderRadius: 5, backgroundColor: DS.primary }} />
          </View>
          <Text style={{ width: 80, textAlign: 'right', fontSize: 13, fontWeight: '800', color: DS.text }}>{euros(l.total)}</Text>
        </View>
      ))}
    </Carte>
  );
}
