/**
 * Reporting « Par jour » : une ligne compacte par employé.
 *  Ligne 1 : initiale · nom · métier et chantier · durée (ou Abs. / Prés.)
 *  Ligne 2 : arrivée (retard) → départ (temps en plus) · bilan de la journée
 * Toucher la ligne ouvre la fiche du jour (heures, chantier, présence) ; « € » ajoute un acompte.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Acompte, Employe, Pointage } from '@/app/types';
import { DS, radius } from '@/constants/design';
import { ouvrirPosition } from '@/lib/ouvrirCarte';
import { couleurEcart, ecartJourMinutes, formatEcartHeures, minutesTravailleesJour } from '@/lib/pointage/bilan';
import { tm } from '@/lib/menuiserie/i18n';

const min = (h: string) => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const duree = (m: number) => (m >= 60 ? formatEcartHeures(m).replace(/^[+−]/, '') : `${m} min`);

interface Props {
  emp: Employe;
  date: string;
  pointages: Pointage[];              // pointages du jour, triés
  chantiers: { id: string; nom: string; couleur?: string }[];
  metier: { label: string; couleur: string };
  presenceForcee: boolean;
  voitBilan: boolean;
  peutModifier: boolean;
  acomptes: Acompte[];
  onModifier: () => void;
  onAcompte: () => void;
  onSupprimerAcompte: (a: Acompte) => void;
  onBasculerPresence: () => void;
}

export function LigneReportingJour(p: Props) {
  const { emp, date, pointages, presenceForcee, voitBilan } = p;
  const h = emp.horaires?.[new Date(date + 'T12:00:00').getDay()];
  const arrivee = pointages.find(x => x.type === 'debut');
  const depart = [...pointages].reverse().find(x => x.type === 'fin');
  const travaille = minutesTravailleesJour(pointages);
  const absent = pointages.length === 0 && !presenceForcee && !!h?.actif;
  const bilan = voitBilan ? ecartJourMinutes(emp, pointages, date, presenceForcee) : null;
  const retard = arrivee && h?.actif ? min(arrivee.heure) - min(h.debut) : null;
  const apresFin = depart && h?.actif ? min(depart.heure) - min(h.fin) : null;

  const heure = (pt: Pointage | undefined, fleche: string) => (
    <Pressable disabled={!pt?.latitude} onPress={() => pt && ouvrirPosition(pt.latitude, pt.longitude)} hitSlop={6}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: pt ? DS.text : DS.textMuted }}>
        {fleche} {pt ? pt.heure : '—'}{pt?.latitude ? ' 📍' : ''}
        {pt?.horsZone ? <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>{'  '}{tm('hors zone')}{pt.distanceChantier ? ` ${pt.distanceChantier > 999 ? `${(pt.distanceChantier / 1000).toFixed(1)} km` : `${pt.distanceChantier} m`}` : ''}</Text> : null}
      </Text>
    </Pressable>
  );

  return (
    <Pressable onPress={p.peutModifier ? p.onModifier : undefined} accessibilityRole="button" accessibilityLabel={tm('Modifier')}
      style={{ backgroundColor: DS.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, gap: 6,
        borderLeftWidth: 4, borderLeftColor: absent ? DS.error : presenceForcee && !pointages.length ? '#2E7D32' : p.metier.couleur }}>
      {/* Ligne 1 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }} numberOfLines={1}>{emp.prenom} {emp.nom}</Text>
          <Text style={{ fontSize: 12, color: DS.textSecondary }} numberOfLines={1}>
            <Text style={{ color: p.metier.couleur, fontWeight: '700' }}>{p.metier.label}</Text>
            {h?.actif ? `  ·  ${h.debut}–${h.fin}` : ''}
            {p.chantiers.length ? `  ·  ${p.chantiers.map(c => c.nom).join(', ')}` : ''}
          </Text>
        </View>
        {travaille > 0 ? (
          <Text style={{ fontSize: 14, fontWeight: '800', color: DS.primary, backgroundColor: DS.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' }}>{duree(travaille)}</Text>
        ) : absent || (presenceForcee && !pointages.length) ? (
          <Pressable onPress={p.peutModifier ? p.onBasculerPresence : undefined} hitSlop={6}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: absent ? DS.error : '#2E7D32', backgroundColor: absent ? DS.errorSoft : '#F0FFF4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' }}>
              {absent ? tm('Abs.') : tm('Prés. ✓')}
            </Text>
          </Pressable>
        ) : null}
        {p.peutModifier && (
          <Pressable onPress={p.onAcompte} hitSlop={8} accessibilityRole="button" accessibilityLabel={tm('Acompte')}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.warningSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#B45309' }}>€</Text>
          </Pressable>
        )}
      </View>

      {/* Ligne 2 : heures et écarts */}
      {pointages.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            {heure(arrivee, '↘')}
            {voitBilan && retard !== null && retard !== 0 && (
              <Text style={{ fontSize: 12, fontWeight: '700', color: retard > 0 ? (retard > 15 ? DS.error : '#E67E22') : '#2E7D32' }}>
                {retard > 0 ? `+${duree(retard)}` : `−${duree(-retard)}`}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            {heure(depart, '↗')}
            {voitBilan && apresFin !== null && apresFin !== 0 && (
              <Text style={{ fontSize: 12, fontWeight: '700', color: apresFin > 0 ? '#2E7D32' : DS.error }}>
                {apresFin > 0 ? `+${duree(apresFin)}` : `−${duree(-apresFin)}`}
              </Text>
            )}
          </View>
          {pointages.length > 2 && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm('{0} pointages', pointages.length)}</Text>}
          {bilan !== null && (
            <Text style={{ marginLeft: 'auto', fontSize: 13, fontWeight: '800', color: couleurEcart(bilan) }}>
              {tm('Bilan')} {bilan === 0 ? '0h00' : formatEcartHeures(bilan)}
            </Text>
          )}
        </View>
      )}

      {/* Acomptes du jour */}
      {p.acomptes.map(ac => (
        <View key={ac.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#B45309' }}>€ {ac.montant} €</Text>
          {!!ac.commentaire && <Text style={{ flex: 1, fontSize: 12, color: DS.textSecondary }} numberOfLines={1}>{ac.commentaire}</Text>}
          {p.peutModifier && (
            <Pressable onPress={() => p.onSupprimerAcompte(ac)} hitSlop={8} accessibilityLabel={tm('Supprimer')} style={{ marginLeft: 'auto' }}>
              <Text style={{ fontSize: 14, color: DS.error }}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}
    </Pressable>
  );
}
