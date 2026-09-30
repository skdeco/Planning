/**
 * Pointage sans affectation : un seul bouton Arrivée / Départ.
 * La position choisit le chantier en cours le plus proche ; au-delà du rayon
 * (300 m par défaut), le pointage est « hors zone » : l'employé choisit le chantier
 * et l'administrateur est prévenu. Chaque pointage du jour peut être réaffecté en un tap.
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
import { RAYON_POINTAGE_DEFAUT, chantiersParDistance, formatDistance, getCurrentPosition, type ChantierProche } from '@/lib/pointage/geo';
import { auteurCourant, modifierPointage, pointagesDuJour } from '@/lib/pointage/historique';
import { ChoixChantierModal } from './ChoixChantierModal';
import { tm } from '@/lib/menuiserie/i18n';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date) => d.toTimeString().slice(0, 5);

export function PointageLibre({ onDepart }: { onDepart?: (chantierId?: string) => void }) {
  const { data, currentUser, addPointage, updatePointage } = useApp();
  const { t } = useLanguage();
  const employeId = currentUser?.employeId || '';
  const aujourdhui = ymd(new Date());
  const duJour = pointagesDuJour(data.pointages, employeId, aujourdhui);
  const dernier = [...duJour].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).pop();
  const prochain: 'debut' | 'fin' = dernier?.type === 'debut' ? 'fin' : 'debut';
  const rayon = data.rayonPointageM || RAYON_POINTAGE_DEFAUT;
  // Affectations du jour (le planning reste utilisable) : proposées en premier dans la liste
  const affectesDuJour = data.affectations.filter(a => a.employeId === employeId && a.dateDebut <= aujourdhui && a.dateFin >= aujourdhui).map(a => a.chantierId);

  const [charge, setCharge] = useState(false);
  const [choix, setChoix] = useState<{ id: string; proches: ChantierProche[]; message?: string; apresDepart?: boolean } | null>(null);

  const signalerHorsZone = (p: Pointage, plus?: ChantierProche) => {
    const emp = data.employes.find(e => e.id === employeId);
    const nom = emp ? `${emp.prenom} ${emp.nom}` : '';
    const lib = p.type === 'debut' ? 'arrivée' : 'départ';
    const detail = plus ? `à ${formatDistance(plus.distance)} de ${plus.chantier.nom}` : 'position inconnue';
    sendPushNotification(getAdminPushTokens(data.employes, data.adminEmployeId), 'Pointage hors zone', `${nom} : ${lib} à ${p.heure}, ${detail}`).catch(() => {});
  };

  const pointer = async () => {
    setCharge(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let proches: ChantierProche[] = [];
      try {
        const pos = await getCurrentPosition(t.ui.geoIndispo, t.ui.geoRefusee);
        lat = pos.latitude; lng = pos.longitude;
        proches = await chantiersParDistance(data.chantiers, lat, lng, rayon);
      } catch { /* sans position : le chantier sera choisi à la main */ }
      // Dans le rayon, un chantier où l'employé est affecté aujourd'hui passe avant le plus proche
      const plus = proches.find(p => p.distance <= rayon && affectesDuJour.includes(p.chantier.id)) || proches[0];
      const dansZone = !!plus && plus.distance <= rayon;
      const ts = new Date();
      const p: Pointage = {
        id: `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        employeId, type: prochain, date: ymd(ts), heure: hm(ts), timestamp: ts.toISOString(),
        latitude: lat, longitude: lng, adresse: lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null,
        chantierId: dansZone ? plus!.chantier.id : undefined,
        ...(dansZone ? {} : { horsZone: true, ...(plus ? { distanceChantier: Math.round(plus.distance) } : {}) }),
      };
      addPointage(p);
      toast.success(`${prochain === 'debut' ? t.pointage.arrivalRecordedAt : t.pointage.departureRecordedAt} ${p.heure}${dansZone ? ` — ${plus!.chantier.nom}` : ''}`);
      if (dansZone) {
        if (prochain === 'fin') onDepart?.(p.chantierId);
      } else {
        signalerHorsZone(p, plus);
        setChoix({
          id: p.id, proches, apresDepart: prochain === 'fin',
          message: lat == null
            ? tm('Position indisponible : choisis le chantier sur lequel tu te trouves.')
            : tm('Tu es à plus de {0} m d’un chantier en cours. Choisis le chantier concerné : SK DECO en est informé.', rayon),
        });
      }
    } finally {
      setCharge(false);
    }
  };

  const demanderPointage = () => {
    if (prochain === 'debut') { pointer(); return; }
    const msg = `${t.pointage.departurePromptPrefix} ${hm(new Date())} ?`;
    if (Platform.OS === 'web') { if (window.confirm(msg)) pointer(); return; }
    Alert.alert(t.pointage.departure, msg, [{ text: t.common.cancel, style: 'cancel' }, { text: t.common.confirm, onPress: pointer }]);
  };

  const ouvrirCorrection = async (p: Pointage) => {
    let proches: ChantierProche[] = [];
    if (p.latitude != null && p.longitude != null) {
      try { proches = await chantiersParDistance(data.chantiers, p.latitude, p.longitude, rayon, 0); } catch {}
    }
    setChoix({ id: p.id, proches });
  };

  const choisir = (chantierId: string) => {
    if (!choix) return;
    const p = data.pointages.find(x => x.id === choix.id);
    if (p) updatePointage(modifierPointage(p, { chantierId }, auteurCourant(currentUser, data.employes), data.chantiers, false));
    if (choix.apresDepart) onDepart?.(chantierId);
    setChoix(null);
  };

  const enCours = choix ? data.pointages.find(x => x.id === choix.id) : undefined;

  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, gap: 10 }}>
      <Pressable onPress={demanderPointage} disabled={charge} accessibilityRole="button"
        style={{ minHeight: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
          backgroundColor: prochain === 'debut' ? DS.primary : DS.surface, borderWidth: 2, borderColor: DS.primary, opacity: charge ? 0.7 : 1 }}>
        {charge && <ActivityIndicator color={prochain === 'debut' ? DS.textInverse : DS.primary} />}
        <Text style={{ fontSize: 18, fontWeight: '800', color: prochain === 'debut' ? DS.textInverse : DS.primary }}>
          {charge ? tm('Localisation…') : prochain === 'debut' ? tm('Pointer mon arrivée') : tm('Pointer mon départ')}
        </Text>
      </Pressable>

      {duJour.length > 0 && (
        <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 12, gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary }}>{tm("Aujourd'hui")}</Text>
          {duJour.map(p => {
            const ch = data.chantiers.find(c => c.id === p.chantierId);
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
                <Text style={{ width: 86, fontSize: 14, fontWeight: '700', color: DS.text }}>{p.type === 'debut' ? '↘ ' : '↗ '}{p.heure}</Text>
                <Pressable onPress={() => ouvrirCorrection(p)} accessibilityRole="button" accessibilityLabel={tm('Changer le chantier')}
                  style={{ flex: 1, minHeight: 36, borderRadius: radius.full, paddingHorizontal: 12, justifyContent: 'center',
                    backgroundColor: ch ? DS.surfaceAlt : DS.warningSoft, borderWidth: 1, borderColor: ch ? (ch.couleur || DS.border) : DS.warning }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text }} numberOfLines={1}>{ch ? `${ch.nom}  ▾` : tm('Choisir le chantier  ▾')}</Text>
                </Pressable>
                {p.horsZone && <Text style={{ fontSize: 11, fontWeight: '700', color: DS.warning }}>{tm('hors zone')}</Text>}
              </View>
            );
          })}
        </View>
      )}

      <ChoixChantierModal
        visible={!!choix}
        titre={enCours?.type === 'fin' ? tm('Chantier du départ') : tm("Chantier de l'arrivée")}
        message={choix?.message}
        chantiers={data.chantiers}
        proches={choix?.proches || []}
        prioritaires={affectesDuJour}
        selectionId={enCours?.chantierId}
        onChoisir={choisir}
        onFermer={() => { if (choix?.apresDepart) onDepart?.(enCours?.chantierId); setChoix(null); }}
      />
    </View>
  );
}
