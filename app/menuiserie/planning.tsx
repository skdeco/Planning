/**
 * Planning Menuiserie (admin) : les phases de chaque chantier sur 10 semaines
 * (production, livraison, pose — une phase n'apparaît que si elle est datée)
 * et les RDV chantier.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { chargerAccueilMn, type DonneesAccueilMn } from '@/lib/menuiserie/api';
import { listerRdvMn } from '@/lib/menuiserie/api2';
import type { RdvMn } from '@/lib/menuiserie/types';
import { lireCacheMn, ecrireCacheMn } from '@/lib/menuiserie/cache';
import { Carte, EnTete, Puce, Section } from '@/components/menuiserie/ui';

import { tm } from '@/lib/menuiserie/i18n';
function semaineIso(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const debutAn = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - debutAn.getTime()) / 86400000 + 1) / 7);
}
const semaineDe = (ymd?: string) => (ymd ? semaineIso(new Date(`${ymd}T12:00:00`)) : null);
const semaineTexte = (s?: string) => { const m = (s || '').match(/\d{1,2}/); return m ? parseInt(m[0], 10) : null; };

const COULEURS = { production: '#1F4E79', livraison: '#C9A227', pose: '#5C1F2E' } as const;
const NB = 10;

export default function PlanningMn() {
  const router = useRouter();
  const [d, setD] = useState<DonneesAccueilMn | null>(() => lireCacheMn<{ accueil: DonneesAccueilMn }>('accueil')?.accueil ?? null);
  const [rdvs, setRdvs] = useState<RdvMn[]>(() => lireCacheMn<{ rdvs: RdvMn[] }>('accueil')?.rdvs ?? []);
  const [vue, setVue] = useState<'phases' | 'rdv'>('phases');
  const [decalage, setDecalage] = useState(0);
  useEffect(() => {
    Promise.all([chargerAccueilMn(), listerRdvMn()]).then(([accueil, r]) => { ecrireCacheMn('accueil', { accueil, rdvs: r }); setD(accueil); setRdvs(r); }).catch(() => {});
  }, []);

  const semaines = useMemo(() => {
    const base = semaineIso(new Date()) + decalage;
    return Array.from({ length: NB }, (_, i) => ((base + i - 1 + 52) % 52) + 1);
  }, [decalage]);

  const lignes = useMemo(() => {
    if (!d) return [];
    return d.chantiers.filter(c => c.statut !== 'cloture' && c.statut !== 'archive').map(c => {
      const et = (cle: string) => d.etapes.find(e => e.chantier_id === c.id && e.etape === cle)?.infos || {};
      const prod = et('production'), liv = et('livraison'), pose = et('pose');
      const phases = [
        { cle: 'production' as const, titre: tm("Production"), de: semaineTexte(prod.semaine_debut), a: semaineTexte(prod.semaine_fin) },
        { cle: 'livraison' as const, titre: tm("Livraison"), de: semaineDe(liv.date_depart), a: semaineDe(liv.date_reception || liv.date_depart) },
        { cle: 'pose' as const, titre: tm("Pose"), de: semaineDe(pose.date_debut), a: semaineDe(pose.date_fin || pose.date_debut) },
      ].filter(p => p.de != null);
      return { c, phases };
    }).filter(l => l.phases.length);
  }, [d]);

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 48, gap: 10 }}>
        <EnTete titre={tm("Planning Menuiserie")} />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Puce label={tm("Phases chantiers")} actif={vue === 'phases'} onPress={() => setVue('phases')} />
          <Puce label="RDV" actif={vue === 'rdv'} onPress={() => setVue('rdv')} />
          {vue === 'phases' && <Puce label={tm("‹ Semaines")} onPress={() => setDecalage(x => x - 4)} />}
          {vue === 'phases' && <Puce label={tm("Semaines ›")} onPress={() => setDecalage(x => x + 4)} />}
        </View>

        {vue === 'phases' ? (
          <>
            {lignes.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucune phase datée : renseigne la production (semaines), la livraison ou la pose dans les chantiers.")}</Text>}
            {lignes.map(({ c, phases }) => (
              <Pressable key={c.id} onPress={() => router.push(`/menuiserie/chantier/${c.id}` as any)} accessibilityRole="button">
                <Carte style={{ padding: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{c.nom}</Text>
                  <View style={{ flexDirection: 'row', marginLeft: 76 }}>
                    {semaines.map(s => <Text key={s} style={{ flex: 1, fontSize: 9, fontWeight: '800', color: DS.textSecondary, textAlign: 'center' }}>{tm("S")}{s}</Text>)}
                  </View>
                  {phases.map(p => (
                    <View key={p.cle} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ width: 76, fontSize: 12, fontWeight: '700', color: DS.text }}>{p.titre}</Text>
                      {semaines.map(s => {
                        const dans = p.de != null && s >= p.de && s <= (p.a ?? p.de);
                        return <View key={s} style={{ flex: 1, height: 18, marginHorizontal: 1, borderRadius: 4, backgroundColor: dans ? COULEURS[p.cle] : DS.segment }} />;
                      })}
                    </View>
                  ))}
                </Carte>
              </Pressable>
            ))}
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              {(['production', 'livraison', 'pose'] as const).map(k => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COULEURS[k] }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.text }}>{k === 'production' ? tm("Production (usine)") : k === 'livraison' ? tm("Livraison") : tm("Pose")}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Section>{tm("RDV chantier")}</Section>
            {rdvs.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucun RDV.")}</Text>}
            {rdvs.map(r => (
              <Pressable key={r.id} onPress={() => router.push(`/menuiserie/messagerie/${r.chantier_id}` as any)} accessibilityRole="button">
                <Carte style={{ gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>{r.titre} · {d?.chantiers.find(c => c.id === r.chantier_id)?.nom || ''}</Text>
                  <Text style={{ fontSize: 13, color: DS.textSecondary }}>
                    {formatDateFR(r.date_rdv)} {r.heure_debut} · {tm({ validation_admins: 'à valider', chez_client: 'chez le client', confirme: 'confirmé', refuse: 'refusé' }[r.statut])}
                  </Text>
                </Carte>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
