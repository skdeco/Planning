/**
 * Modifier qui peut voir un plan déjà ajouté (sans le supprimer ni le
 * réimporter). Panneau en surimpression à placer DANS la fenêtre des plans
 * (évite l'empilement de deux Modal sur iOS).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch, Platform } from 'react-native';
import type { PlanChantier } from '@/app/types';
import { DS, radius } from '@/constants/design';
import { tm } from '@/lib/menuiserie/i18n';

export type VisibilitePlan = PlanChantier['visiblePar'];
export interface ParticipantPlan { id: string; label: string; kind: 'employe' | 'soustraitant' }
export interface AccesPlanValeurs { visiblePar: VisibilitePlan; visibleIds?: string[]; partageExterne?: boolean }

const OPTIONS: { v: VisibilitePlan; label: string }[] = [
  { v: 'tous', label: 'Tous' },
  { v: 'employes', label: 'Employés' },
  { v: 'soustraitants', label: 'Sous-traitants' },
  { v: 'specifique', label: 'Par personne' },
  { v: 'admin', label: 'Admin seulement' },
];

/** Libellé court de l'accès d'un plan (affiché sous son nom). */
export function libelleAcces(p: { visiblePar?: VisibilitePlan; visibleIds?: string[] }): string {
  const o = OPTIONS.find(x => x.v === (p.visiblePar || 'tous'));
  const n = p.visiblePar === 'specifique' ? ` (${(p.visibleIds || []).length})` : '';
  return `${tm(o?.label || 'Tous')}${n}`;
}

export function AccesPlan({ plan, participants, onEnregistrer, onFermer }: {
  plan: { nom: string; visiblePar?: VisibilitePlan; visibleIds?: string[]; partageExterne?: boolean } | null;
  participants: ParticipantPlan[];
  onEnregistrer: (v: AccesPlanValeurs) => void;
  onFermer: () => void;
}) {
  const [visiblePar, setVisiblePar] = useState<VisibilitePlan>('tous');
  const [ids, setIds] = useState<string[]>([]);
  const [externe, setExterne] = useState(true);

  useEffect(() => {
    if (!plan) return;
    setVisiblePar(plan.visiblePar || 'tous');
    setIds(plan.visibleIds || []);
    setExterne(plan.partageExterne !== false);
  }, [plan]);

  if (!plan) return null;
  const valide = visiblePar !== 'specifique' || ids.length > 0;

  const chip = (on: boolean) => ({
    minHeight: 36, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: 'center' as const,
    backgroundColor: on ? DS.primary : DS.surface, borderWidth: 1, borderColor: on ? DS.primary : DS.border,
  });

  return (
    <Pressable onPress={onFermer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', zIndex: 1000 }}>
      <Pressable onPress={() => {}} style={{ backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '85%', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 20, color: DS.text }}>{tm('Qui peut voir ce plan ?')}</Text>
            <Text style={{ fontSize: 13, color: DS.textSecondary }} numberOfLines={1}>{plan.nom}</Text>
          </View>
          <Pressable onPress={onFermer} accessibilityRole="button" accessibilityLabel={tm('Fermer')} hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: DS.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, color: DS.text }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {OPTIONS.map(o => (
              <Pressable key={o.v} onPress={() => setVisiblePar(o.v)} accessibilityRole="button" accessibilityState={{ selected: visiblePar === o.v }} style={chip(visiblePar === o.v)}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: visiblePar === o.v ? DS.textInverse : DS.text }}>{tm(o.label)}</Text>
              </Pressable>
            ))}
          </View>
          {visiblePar === 'specifique' && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm('Choisissez les personnes')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {participants.map(p => {
                  const on = ids.includes(p.id);
                  return (
                    <Pressable key={p.id} onPress={() => setIds(prev => on ? prev.filter(x => x !== p.id) : [...prev, p.id])} style={chip(on)}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: on ? DS.textInverse : DS.text }}>{p.label}{p.kind === 'soustraitant' ? ' (ST)' : ''}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
            <Text style={{ flex: 1, fontSize: 15, color: DS.text }}>{tm('Visible aussi par le client et l’architecte')}</Text>
            <Switch value={externe} onValueChange={setExterne} />
          </View>
        </ScrollView>
        <Pressable disabled={!valide} accessibilityRole="button"
          onPress={() => onEnregistrer({ visiblePar, visibleIds: visiblePar === 'specifique' ? ids : undefined, partageExterne: externe })}
          style={{ minHeight: 54, borderRadius: radius.full, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center', opacity: valide ? 1 : 0.4 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: DS.textInverse }}>{tm('Enregistrer')}</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}
