/**
 * En-tête de l'accueil employé (style graphite) : dégradé gris, salutation,
 * chantier du jour et deux grandes tuiles « Pointage » et « Photos ».
 * Aucun total d'heures n'est montré.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Clock, Camera, CircleCheck } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { tm } from '@/lib/menuiserie/i18n';
import { LanguageFlag } from '@/components/LanguageFlag';

export const DEGRADE_GRAPHITE = ['#2F2F2F', '#5C5C5B', '#ADADAB'] as const;
const TITRE = { fontFamily: 'Manrope_500Medium', fontSize: 28, lineHeight: 34, letterSpacing: -0.5 } as const;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function HeroEmploye({ prenom, dateLabel, montrerPointage }: { prenom: string; dateLabel: string; montrerPointage: boolean }) {
  const { data, currentUser } = useApp();
  const router = useRouter();
  const myId = currentUser?.employeId || '';
  const today = ymd(new Date());
  const pts = data.pointages.filter(p => p.employeId === myId && p.date === today).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const dernier = pts[pts.length - 1];
  const surPlace = dernier?.type === 'debut';
  const derniereArrivee = [...pts].reverse().find(p => p.type === 'debut');
  const affectation = data.affectations.find(a => a.employeId === myId && !a.soustraitantId && a.dateDebut <= today && a.dateFin >= today);
  const chantierId = derniereArrivee?.chantierId || affectation?.chantierId;
  const chantier = data.chantiers.find(c => c.id === chantierId);

  const pointage = !dernier
    ? { titre: tm('Pointer mon arrivée'), sous: '', fait: false }
    : surPlace
      ? { titre: `${tm('Sur place depuis')} ${derniereArrivee?.heure || dernier.heure}`, sous: tm('Pointer mon départ'), fait: false }
      : { titre: `${tm('Journée terminée')} · ${dernier.heure}`, sous: '', fait: true };

  const tuile = { flex: 1, minHeight: 104, borderRadius: 20, padding: 14, justifyContent: 'space-between' as const, backgroundColor: 'rgba(20,20,20,0.5)' };

  return (
    <LinearGradient colors={DEGRADE_GRAPHITE} style={{ borderRadius: 28, padding: 18, paddingTop: 22, marginBottom: 16, gap: 18 }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}>{dateLabel}</Text>
          {/* Langue de l'application */}
          <LanguageFlag />
        </View>
        <Text style={[TITRE, { color: '#FFFFFF' }]}>{tm('Bonjour')} {prenom}.</Text>
        <Text style={[TITRE, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={2}>
          {chantier ? `${tm("Aujourd'hui")} : ${chantier.nom}.` : tm('Pas de chantier prévu.')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {montrerPointage && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/pointage' as any)} style={tuile}>
            {pointage.fait ? <CircleCheck size={22} color="#FFFFFF" strokeWidth={1.8} /> : <Clock size={22} color="#FFFFFF" strokeWidth={1.8} />}
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{pointage.titre}</Text>
              {!!pointage.sous && <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{pointage.sous}</Text>}
            </View>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/photos' as any)} style={tuile}>
          <Camera size={22} color="#FFFFFF" strokeWidth={1.8} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{tm('Photos du chantier')}</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
