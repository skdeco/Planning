/**
 * Filtres des chantiers Menuiserie : statut, usine, architecte, client, apporteur, responsable.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { DS, radius } from '@/constants/design';
import type { ChantierMn, IntervenantMn, RoleIntervenantMn, StatutChantierMn, UsineMn } from '@/lib/menuiserie/types';
import { ROLE_INTERVENANT_MN_LABELS, STATUT_CHANTIER_MN_LABELS } from '@/lib/menuiserie/types';
import { Puce } from './ui';

export interface FiltresMn {
  statut: StatutChantierMn | 'tous';
  usineId: string | null;
  intervenant: { role: RoleIntervenantMn; nom: string } | null;
}

export const FILTRES_MN_DEFAUT: FiltresMn = { statut: 'en_cours', usineId: null, intervenant: null };

export function filtrerChantiers(chantiers: ChantierMn[], intervenants: IntervenantMn[], f: FiltresMn): ChantierMn[] {
  return chantiers.filter(c =>
    (f.statut === 'tous' || c.statut === f.statut)
    && (!f.usineId || c.usine_id === f.usineId)
    && (!f.intervenant || intervenants.some(i => i.chantier_id === c.id && i.role === f.intervenant!.role && i.nom === f.intervenant!.nom)));
}

const ROLES_FILTRE: RoleIntervenantMn[] = ['architecte', 'client', 'apporteur', 'responsable'];

export function FiltresChantiers({ valeur, onChange, usines, intervenants }: {
  valeur: FiltresMn; onChange: (f: FiltresMn) => void; usines: UsineMn[]; intervenants: IntervenantMn[];
}) {
  const [choix, setChoix] = useState<RoleIntervenantMn | 'usine' | null>(null);
  const options = useMemo(() => {
    if (!choix) return [];
    if (choix === 'usine') return usines.map(u => ({ cle: u.id, label: u.nom }));
    const noms = Array.from(new Set(intervenants.filter(i => i.role === choix).map(i => i.nom))).sort();
    return noms.map(n => ({ cle: n, label: n }));
  }, [choix, usines, intervenants]);

  const usineNom = usines.find(u => u.id === valeur.usineId)?.nom;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {(['en_cours', 'cloture', 'sav', 'tous'] as const).map(s => (
          <Puce key={s} label={s === 'tous' ? 'Tous' : STATUT_CHANTIER_MN_LABELS[s]} actif={valeur.statut === s} onPress={() => onChange({ ...valeur, statut: s })} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Puce label={usineNom ? `Usine : ${usineNom}` : 'Usine ▾'} actif={!!usineNom} onPress={() => setChoix('usine')} />
        {ROLES_FILTRE.map(r => {
          const actif = valeur.intervenant?.role === r;
          return <Puce key={r} label={actif ? `${ROLE_INTERVENANT_MN_LABELS[r]} : ${valeur.intervenant!.nom}` : `${ROLE_INTERVENANT_MN_LABELS[r]} ▾`} actif={actif} onPress={() => setChoix(r)} />;
        })}
      </View>

      <Modal visible={!!choix} transparent animationType="fade" onRequestClose={() => setChoix(null)}>
        <Pressable onPress={() => setChoix(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.xxl, padding: 12, maxHeight: 420 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text, padding: 8 }}>
              {choix === 'usine' ? 'Usine' : choix ? ROLE_INTERVENANT_MN_LABELS[choix] : ''}
            </Text>
            <ScrollView>
              <Pressable
                style={{ padding: 12 }}
                accessibilityRole="button"
                onPress={() => { onChange(choix === 'usine' ? { ...valeur, usineId: null } : { ...valeur, intervenant: null }); setChoix(null); }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: DS.primary }}>Tous</Text>
              </Pressable>
              {options.length === 0 && <Text style={{ padding: 12, color: DS.textSecondary }}>Aucun pour le moment.</Text>}
              {options.map(o => (
                <Pressable
                  key={o.cle}
                  style={{ padding: 12 }}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(choix === 'usine' ? { ...valeur, usineId: o.cle } : { ...valeur, intervenant: { role: choix as RoleIntervenantMn, nom: o.cle } });
                    setChoix(null);
                  }}
                >
                  <Text style={{ fontSize: 15, color: DS.text }}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
