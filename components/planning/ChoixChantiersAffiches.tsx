/**
 * Choisir rapidement les chantiers affichés dans le planning :
 *  - recherche, un interrupteur par chantier (affiché / masqué) ;
 *  - « Garder ceux de la semaine » : n'affiche que les chantiers où quelqu'un
 *    est prévu ou a pointé pendant la semaine affichée ;
 *  - « Tout masquer » pour repartir de zéro.
 * Les chantiers masqués restent accessibles ici, et un pointage sur un chantier
 * masqué le réaffiche tout seul.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Switch } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { DS, radius } from '@/constants/design';
import { basculerAffichage, estAffiche } from '@/lib/planningAffichage';
import { chantierDansPlanning, usePlanningFiltre } from '@/lib/planningFiltre';
import { tm } from '@/lib/menuiserie/i18n';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function ChoixChantiersAffiches({ visible, onClose, days }: { visible: boolean; onClose: () => void; days: Date[] }) {
  const { data, updateChantier } = useApp();
  const planning = usePlanningFiltre();
  const [recherche, setRecherche] = useState('');
  const debut = days.length ? ymd(days[0]) : '';
  const fin = days.length ? ymd(days[days.length - 1]) : '';

  const candidats = useMemo(() => data.chantiers
    .filter(c => c.statut !== 'archive' && chantierDansPlanning(c, planning))
    .sort((a, b) => Number(estAffiche(b)) - Number(estAffiche(a)) || a.nom.localeCompare(b.nom, 'fr')),
  [data.chantiers, planning]);

  const actifsSemaine = useMemo(() => new Set([
    ...data.affectations.filter(a => a.dateDebut <= fin && a.dateFin >= debut).map(a => a.chantierId),
    ...data.pointages.filter(p => p.date >= debut && p.date <= fin && p.chantierId).map(p => p.chantierId!),
  ]), [data.affectations, data.pointages, debut, fin]);

  const q = recherche.trim().toLowerCase();
  const liste = q ? candidats.filter(c => `${c.nom} ${c.adresse || ''}`.toLowerCase().includes(q)) : candidats;
  const nbAffiches = candidats.filter(estAffiche).length;

  const regler = (c: Chantier, afficher: boolean) => { if (estAffiche(c) !== afficher) updateChantier(basculerAffichage(c)); };
  const garderSemaine = () => candidats.forEach(c => regler(c, actifsSemaine.has(c.id)));
  const toutMasquer = () => candidats.forEach(c => regler(c, false));

  const bouton = { flex: 1, minHeight: 42, borderRadius: radius.full, borderWidth: 1, borderColor: DS.primary, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 10 };

  return (
    <ModalKeyboard visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: DS.background }}>
        <PanelHeader title={tm('Chantiers affichés')} sub={tm('{0} affiché(s) sur {1}', nbAffiches, candidats.length)} onClose={onClose} />
        <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={garderSemaine} style={[bouton, { backgroundColor: DS.primary }]} accessibilityRole="button">
              <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textInverse }} numberOfLines={1}>{tm('Garder ceux de la semaine')}</Text>
            </Pressable>
            <Pressable onPress={toutMasquer} style={bouton} accessibilityRole="button">
              <Text style={{ fontSize: 13, fontWeight: '700', color: DS.primary }}>{tm('Tout masquer')}</Text>
            </Pressable>
          </View>
          <TextInput value={recherche} onChangeText={setRecherche} placeholder={tm('Rechercher un chantier…')} placeholderTextColor={DS.textMuted}
            style={{ minHeight: 44, borderRadius: radius.full, backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 16, fontSize: 15, color: DS.text }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border }}>
            {liste.map((c, i) => {
              const on = estAffiche(c);
              return (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: DS.border }}>
                  <View style={{ width: 4, height: 26, borderRadius: 2, backgroundColor: c.couleur || DS.border, opacity: on ? 1 : 0.4 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: on ? DS.text : DS.textSecondary }} numberOfLines={1}>{c.nom}</Text>
                    <Text style={{ fontSize: 12, color: DS.textMuted }} numberOfLines={1}>
                      {[actifsSemaine.has(c.id) ? tm('Prévu cette semaine') : '', c.statut === 'termine' ? tm('Terminé') : c.statut === 'sav' ? 'SAV' : ''].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Switch value={on} onValueChange={v => regler(c, v)} />
                </View>
              );
            })}
            {liste.length === 0 && <Text style={{ padding: 16, fontSize: 14, color: DS.textSecondary }}>{tm('Aucun chantier trouvé.')}</Text>}
          </View>
        </ScrollView>
      </View>
    </ModalKeyboard>
  );
}
