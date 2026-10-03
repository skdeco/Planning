/**
 * Accueil admin / RH : qui a pointé aujourd'hui, où, et sa position en un tap.
 * Une ligne par employé : arrivée, départ éventuel, chantier détecté (ou
 * « Hors chantier » en rouge) et bouton position (dernier pointage localisé).
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { ouvrirPosition } from '@/lib/ouvrirCarte';
import { COULEUR_HORS_CHANTIER } from '@/lib/planningAffichage';
import { tm } from '@/lib/menuiserie/i18n';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function PointagesDuJourAdmin() {
  const { data } = useApp();
  const today = ymd(new Date());
  const parEmploye = new Map<string, typeof data.pointages>();
  data.pointages.filter(p => p.date === today).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).forEach(p => {
    parEmploye.set(p.employeId, [...(parEmploye.get(p.employeId) || []), p]);
  });
  if (parEmploye.size === 0) return null;

  const lignes = [...parEmploye.entries()].map(([empId, pts]) => {
    const emp = data.employes.find(e => e.id === empId);
    const arrivee = pts.find(p => p.type === 'debut');
    const dernier = pts[pts.length - 1];
    const depart = dernier.type === 'fin' ? dernier : undefined;
    const enCours = [...pts].reverse().find(p => p.type === 'debut');
    const chantier = data.chantiers.find(c => c.id === (enCours || dernier).chantierId);
    const localise = [...pts].reverse().find(p => p.latitude != null && p.longitude != null);
    return { empId, nom: emp ? `${emp.prenom} ${emp.nom}` : empId, arrivee, depart, chantier, localise };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 18, fontFamily: 'Manrope_500Medium', color: DS.text, marginBottom: 8, marginLeft: 4 }}>{tm('Pointages du jour')}</Text>
      <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border }}>
        {lignes.map((l, i) => (
          <View key={l.empId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14,
              borderTopWidth: i ? 1 : 0, borderTopColor: DS.border }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: DS.text }} numberOfLines={1}>{l.nom}</Text>
              <Text style={{ fontSize: 13, color: DS.textSecondary }} numberOfLines={1}>
                {l.arrivee ? `↘ ${l.arrivee.heure}` : ''}{l.depart ? `  ↗ ${l.depart.heure}` : ''}{'  · '}
                <Text style={{ color: l.chantier ? DS.text : COULEUR_HORS_CHANTIER, fontWeight: '600' }}>
                  {l.chantier ? l.chantier.nom : tm('Hors chantier')}
                </Text>
              </Text>
            </View>
            {l.localise ? (
              <Pressable onPress={() => ouvrirPosition(l.localise!.latitude, l.localise!.longitude)} accessibilityRole="button"
                accessibilityLabel={`${tm('Position')} ${l.nom}`} hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: radius.full, borderWidth: 1, borderColor: DS.primary }}>
                <MapPin size={14} color={DS.primary} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.primary }}>{tm('Position')}</Text>
              </Pressable>
            ) : (
              <Text style={{ fontSize: 12, color: DS.textMuted }}>{tm('Sans position')}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
