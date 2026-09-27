/**
 * Pointage géolocalisé (arrivée / départ). Pour un employé d'usine, la position
 * est comparée à celle de l'usine : hors de la zone, le pointage est accepté mais signalé.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { DS, radius } from '@/constants/design';
import { listerPointagesMn, monUsineMn, pointerMn } from '@/lib/menuiserie/api2';
import type { CompteMn, PointageMn, UsineMn } from '@/lib/menuiserie/types';

import { tm, localeMn } from '@/lib/menuiserie/i18n';
const heure = (iso: string) => new Date(iso).toLocaleTimeString(localeMn(), { hour: '2-digit', minute: '2-digit' });

export function PointageCarte({ moi, chantierId }: { moi: CompteMn; chantierId?: string | null }) {
  const [usine, setUsine] = useState<UsineMn | null>(null);
  const [jour, setJour] = useState<PointageMn[]>([]);
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);

  const charger = useCallback(async () => {
    const debut = new Date(); debut.setHours(0, 0, 0, 0);
    setJour(await listerPointagesMn({ compteId: moi.id, depuis: debut.toISOString() }));
  }, [moi.id]);
  useEffect(() => { charger().catch(() => {}); monUsineMn(moi).then(setUsine).catch(() => {}); }, [charger, moi]);

  const dernier = jour[0];
  const prochain: 'arrivee' | 'depart' = dernier?.type === 'arrivee' ? 'depart' : 'arrivee';

  const pointer = async () => {
    setCharge(true); setMessage('');
    let position: { lat: number; lng: number } | null = null;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        position = { lat: p.coords.latitude, lng: p.coords.longitude };
      }
    } catch { /* position indisponible : pointage quand même, signalé */ }
    try {
      const r = await pointerMn(moi, { type: prochain, position, usine: moi.role === 'employe_usine' ? usine : null, chantierId });
      setMessage(tm("{0} enregistré{1}{2}.", prochain === 'arrivee' ? tm('Arrivée') : tm('Départ'), r.distance != null ? tm(" ({0} m de l'usine)", r.distance) : '', r.horsZone ? tm(' — hors zone, signalé') : ''));
      await charger();
    } catch (e) { setMessage((e as Error).message); } finally { setCharge(false); }
  };

  return (
    <View style={{ backgroundColor: DS.primary, borderRadius: radius.xl, padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#F1DCE1' }}>
        {moi.role === 'employe_usine' ? (usine?.latitude != null ? tm("Pointage à l'usine {0}", usine.nom) : tm("Position de l'usine pas encore définie")) : tm("Pointage")}
      </Text>
      <Pressable onPress={pointer} disabled={charge} accessibilityRole="button"
        style={{ minHeight: 54, borderRadius: radius.lg, backgroundColor: DS.surface, alignItems: 'center', justifyContent: 'center' }}>
        {charge ? <ActivityIndicator color={DS.primary} />
          : <Text style={{ fontSize: 17, fontWeight: '800', color: DS.primary }}>{prochain === 'arrivee' ? tm("Pointer mon arrivée") : tm("Pointer mon départ")}</Text>}
      </Pressable>
      {jour.slice().reverse().map(p => (
        <Text key={p.id} style={{ fontSize: 13, color: DS.textInverse }}>
          {p.type === 'arrivee' ? tm("Arrivée") : tm("Départ")} {heure(p.horodatage)}{p.hors_zone ? tm(" · hors zone") : ''}
        </Text>
      ))}
      {!!message && <Text style={{ fontSize: 13, fontWeight: '700', color: DS.textInverse }}>{message}</Text>}
    </View>
  );
}
