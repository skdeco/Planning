/**
 * Pointage en 3 gestes : Arrivée → (Changement de chantier) → Départ.
 * - Arrivée / changement : la position choisit le chantier en cours le plus
 *   proche. Au-delà du rayon (300 m par défaut), le pointage est enregistré
 *   SANS chantier : on ne demande rien à l'employé, l'admin et les RH sont
 *   prévenus et le renseignent (alerte sur l'accueil).
 * - Départ : reprend le chantier de l'arrivée, sans attendre le GPS.
 * Le GPS n'est jamais bloquant (position récente ou 8 s maximum).
 * Aucun total d'heures n'est montré à l'employé.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { toast } from 'sonner-native';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import type { Pointage } from '@/app/types';
import { DS, radius } from '@/constants/design';
import { sendPushNotification } from '@/hooks/useNotifications';
import { getAdminPushTokens } from '@/lib/notif/getAdminPushTokens';
import { RAYON_POINTAGE_DEFAUT, chantiersParDistance, formatDistance, getCurrentPosition, positionImmediate, type ChantierProche } from '@/lib/pointage/geo';
import { pointagesDuJour } from '@/lib/pointage/historique';
import { affecterSiBesoin } from '@/lib/pointage/affectation';
import { tm } from '@/lib/menuiserie/i18n';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date) => d.toTimeString().slice(0, 5);
const nouvelId = () => `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

type Action = 'arrivee' | 'changement' | 'depart';

function confirmer(titre: string, message: string, ok: () => void, cancel: string, valider: string) {
  if (Platform.OS === 'web') { if (window.confirm(message)) ok(); return; }
  Alert.alert(titre, message, [{ text: cancel, style: 'cancel' }, { text: valider, onPress: ok }]);
}

export function PointageLibre({ onDepart }: { onDepart?: (chantierId?: string) => void }) {
  const { data, currentUser, addPointage, addAffectation } = useApp();
  const { t } = useLanguage();
  const employeId = currentUser?.employeId || '';
  const aujourdhui = ymd(new Date());
  const duJour = pointagesDuJour(data.pointages, employeId, aujourdhui);
  const tries = [...duJour].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const dernier = tries[tries.length - 1];
  const surPlace = dernier?.type === 'debut';
  const chantierActuel = surPlace ? data.chantiers.find(c => c.id === dernier.chantierId) : undefined;
  const rayon = data.rayonPointageM || RAYON_POINTAGE_DEFAUT;
  // Dans le rayon, un chantier du planning du jour passe avant le plus proche
  const affectesDuJour = data.affectations.filter(a => a.employeId === employeId && a.dateDebut <= aujourdhui && a.dateFin >= aujourdhui).map(a => a.chantierId);

  const [enCours, setEnCours] = useState<Action | null>(null);

  const signalerHorsZone = (p: Pointage, plus?: ChantierProche) => {
    const emp = data.employes.find(e => e.id === employeId);
    const nom = emp ? `${emp.prenom} ${emp.nom}` : '';
    const detail = plus ? `à ${formatDistance(plus.distance)} de ${plus.chantier.nom}` : 'position inconnue';
    const tokens = new Set(getAdminPushTokens(data.employes, data.adminEmployeId));
    data.employes.filter(e => e.isRH && e.pushToken).forEach(e => tokens.add(e.pushToken!));
    sendPushNotification([...tokens], 'Pointage sans chantier', `${nom} : arrivée à ${p.heure}, ${detail}. Chantier à renseigner.`).catch(() => {});
  };

  /** Position + chantier détecté (jamais bloquant). */
  const detecter = async () => {
    let lat: number | null = null;
    let lng: number | null = null;
    let proches: ChantierProche[] = [];
    try {
      const pos = await getCurrentPosition(t.ui.geoIndispo, t.ui.geoRefusee);
      lat = pos.latitude; lng = pos.longitude;
      proches = await chantiersParDistance(data.chantiers, lat, lng, rayon);
    } catch { /* sans position : SK DECO renseignera le chantier */ }
    const plus = proches.find(p => p.distance <= rayon && affectesDuJour.includes(p.chantier.id)) || proches[0];
    const dansZone = !!plus && plus.distance <= rayon;
    return { lat, lng, plus, chantierId: dansZone ? plus!.chantier.id : undefined };
  };

  const creer = (type: 'debut' | 'fin', ts: Date, lat: number | null, lng: number | null, chantierId?: string, horsZone?: { distance?: number }): Pointage => ({
    id: nouvelId(), employeId, type, date: ymd(ts), heure: hm(ts), timestamp: ts.toISOString(),
    latitude: lat, longitude: lng, adresse: lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null,
    chantierId,
    ...(horsZone ? { horsZone: true, ...(horsZone.distance != null ? { distanceChantier: horsZone.distance } : {}) } : {}),
  });

  /** Arrivée (ou arrivée sur le nouveau chantier lors d'un changement). */
  const arriver = async (changement: boolean) => {
    setEnCours(changement ? 'changement' : 'arrivee');
    try {
      const { lat, lng, plus, chantierId } = await detecter();
      if (changement && chantierId && chantierId === dernier?.chantierId) {
        toast(`${tm('Vous êtes toujours sur')} ${plus!.chantier.nom}`);
        return;
      }
      const ts = new Date();
      if (changement) addPointage(creer('fin', ts, null, null, dernier?.chantierId));
      const tsArrivee = changement ? new Date(ts.getTime() + 1000) : ts;
      const p = creer('debut', tsArrivee, lat, lng, chantierId, chantierId ? undefined : { distance: plus ? Math.round(plus.distance) : undefined });
      addPointage(p);
      if (chantierId) affecterSiBesoin(data.affectations, addAffectation, employeId, chantierId, p.date);
      else signalerHorsZone(p, plus);
      toast.success(`${t.pointage.arrivalRecordedAt} ${p.heure}${chantierId ? ` — ${plus!.chantier.nom}` : ''}`);
    } finally {
      setEnCours(null);
    }
  };

  /** Départ : chantier de l'arrivée, position seulement si déjà connue. */
  const partir = async () => {
    setEnCours('depart');
    try {
      const pos = await positionImmediate();
      const p = creer('fin', new Date(), pos?.latitude ?? null, pos?.longitude ?? null, dernier?.chantierId);
      addPointage(p);
      toast.success(`${t.pointage.departureRecordedAt} ${p.heure}`);
      onDepart?.(p.chantierId);
    } finally {
      setEnCours(null);
    }
  };

  const demanderChangement = () => confirmer(tm('Changement de chantier'), tm('Vous arrivez sur un autre chantier ?'), () => arriver(true), t.common.cancel, t.common.confirm);
  const demanderDepart = () => confirmer(t.pointage.departure, `${t.pointage.departurePromptPrefix} ${hm(new Date())} ?`, partir, t.common.cancel, t.common.confirm);

  const occupe = enCours !== null;
  const Bouton = ({ action, libelle, onPress, plein }: { action: Action; libelle: string; onPress: () => void; plein: boolean }) => (
    <Pressable onPress={onPress} disabled={occupe} accessibilityRole="button"
      style={{ minHeight: 58, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
        backgroundColor: plein ? DS.primary : DS.surface, borderWidth: 1.5, borderColor: DS.primary, opacity: occupe && enCours !== action ? 0.5 : 1 }}>
      {enCours === action && <ActivityIndicator color={plein ? DS.textInverse : DS.primary} />}
      <Text style={{ fontSize: 16, fontWeight: '800', color: plein ? DS.textInverse : DS.primary }}>
        {enCours === action && action !== 'depart' ? tm('Localisation…') : libelle}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, gap: 10 }}>
      {surPlace && (
        <Text style={{ fontSize: 15, fontWeight: '600', color: DS.text }}>
          {chantierActuel ? `${tm('Sur le chantier')} ${chantierActuel.nom} ${tm('depuis')} ${dernier.heure}` : `${tm('Arrivée pointée à')} ${dernier.heure}`}
        </Text>
      )}
      {surPlace ? (
        <>
          <Bouton action="changement" libelle={tm('Changement de chantier')} onPress={demanderChangement} plein={false} />
          <Bouton action="depart" libelle={tm('Pointer mon départ')} onPress={demanderDepart} plein />
        </>
      ) : (
        <Bouton action="arrivee" libelle={tm('Pointer mon arrivée')} onPress={() => arriver(false)} plein />
      )}

      {tries.length > 0 && (
        <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 12, gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary }}>{tm("Aujourd'hui")}</Text>
          {tries.map(p => {
            const ch = data.chantiers.find(c => c.id === p.chantierId);
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
                <Text style={{ width: 86, fontSize: 14, fontWeight: '700', color: DS.text }}>{p.type === 'debut' ? '↘ ' : '↗ '}{p.heure}</Text>
                <View style={{ flex: 1, minHeight: 32, borderRadius: radius.full, paddingHorizontal: 12, justifyContent: 'center',
                    backgroundColor: DS.surfaceAlt, borderWidth: 1, borderColor: ch ? (ch.couleur || DS.border) : DS.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: ch ? DS.text : DS.textSecondary }} numberOfLines={1}>{ch ? ch.nom : tm('Chantier à préciser par SK DECO')}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
