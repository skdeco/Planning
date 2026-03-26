import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import type { Pointage } from '@/app/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('@/assets/images/sk_deco_logo.png') as number;
import { Image } from 'react-native';

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const JOURS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toHM(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${JOURS_LONG[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Récupère la position GPS via l'API navigateur (web) ou Expo Location (natif) */
async function getPosition(): Promise<{ latitude: number; longitude: number; adresse: string } | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          // Reverse geocoding via nominatim (gratuit, pas de clé)
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
              { headers: { 'Accept-Language': 'fr' } }
            );
            const json = await res.json();
            const adresse = json.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            resolve({ latitude: lat, longitude: lon, adresse });
          } catch {
            resolve({ latitude: lat, longitude: lon, adresse: `${lat.toFixed(5)}, ${lon.toFixed(5)}` });
          }
        },
        () => resolve(null),
        { timeout: 3000, enableHighAccuracy: false, maximumAge: 60000 }
      );
    });
  }
  return null;
}

export default function PointageScreen() {
  const { data, currentUser, isHydrated, addPointage } = useApp();
  const { t } = useLanguage();
  const isAdmin = currentUser?.role === 'admin';
  const router = useRouter();

  // Rediriger vers /login quand currentUser devient null (après logout)
  // IMPORTANT : attendre l'hydratation pour éviter une redirection prématurée
  useEffect(() => {
    if (isHydrated && !currentUser) {
      router.replace('/login' as any);
    }
  }, [isHydrated, currentUser, router]);

  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<'debut' | 'fin' | null>(null);
  // Géolocalisation désactivée temporairement
  // const [geoError, setGeoError] = useState(false);

  // Mise à jour de l'heure toutes les secondes
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const todayStr = toYMD(now);
  const employeId = currentUser?.employeId || '';

  // Pointages du jour courant pour cet employé
  const pointagesAujourdhui = data.pointages.filter(
    p => p.employeId === employeId && p.date === todayStr
  );

  const debutAujourdhui = pointagesAujourdhui.find(p => p.type === 'debut');
  const finAujourdhui = pointagesAujourdhui.find(p => p.type === 'fin');

  // Historique des 30 derniers jours (groupé par date)
  const historique = useCallback(() => {
    const myPointages = data.pointages
      .filter(p => p.employeId === employeId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const byDate: Record<string, { debut?: Pointage; fin?: Pointage }> = {};
    myPointages.forEach(p => {
      if (!byDate[p.date]) byDate[p.date] = {};
      byDate[p.date][p.type] = p;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30);
  }, [data.pointages, employeId]);

  const handlePointage = (type: 'debut' | 'fin') => {
    const label = type === 'debut' ? 'Début de journée' : 'Fin de journée';
    const heure = toHM(new Date());
    const doPointage = () => {
      const ts = new Date();
      const pointage: Pointage = {
        id: `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        employeId,
        type,
        date: toYMD(ts),
        heure: toHM(ts),
        timestamp: ts.toISOString(),
        latitude: null,
        longitude: null,
        adresse: null,
      };
      addPointage(pointage);
      setLastAction(type);
    };
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(`Confirmer : ${label} à ${heure} ?`) : true)) doPointage();
    } else {
      Alert.alert(
        `Confirmer le pointage`,
        `${label} à ${heure} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', onPress: doPointage },
        ]
      );
    }
  };

  const emp = data.employes.find(e => e.id === employeId);
  const empNom = emp ? `${emp.prenom} ${emp.nom}` : '';

  if (isAdmin) {
    return (
      <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerSub}>{t.pointage.title}</Text>
        </View>
        <View style={styles.adminMsg}>
          <Text style={styles.adminMsgText}>
            L'onglet Horaires est réservé aux employés.{'\'n'}
            Consultez le reporting dans l'onglet Reporting.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const hist = historique();

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerSub}>{t.pointage.title}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Carte du jour */}
        <View style={styles.todayCard}>
          <Text style={styles.todayDate}>
            {JOURS_LONG[now.getDay()]} {now.getDate()} {MOIS[now.getMonth()]} {now.getFullYear()}
          </Text>
          <Text style={styles.todayClock}>
            {now.toTimeString().slice(0, 8)}
          </Text>
          <Text style={styles.todayName}>{empNom}</Text>

          {/* Statut du jour */}
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, debutAujourdhui ? styles.statusDone : styles.statusPending]}>
              <Text style={styles.statusIcon}>{debutAujourdhui ? '✓' : '○'}</Text>
              <View>
                <Text style={styles.statusLabel}>Début de journée</Text>
                {debutAujourdhui && (
                  <Text style={styles.statusTime}>{debutAujourdhui.heure}</Text>
                )}
              </View>
            </View>
            <View style={[styles.statusBadge, finAujourdhui ? styles.statusDone : styles.statusPending]}>
              <Text style={styles.statusIcon}>{finAujourdhui ? '✓' : '○'}</Text>
              <View>
                <Text style={styles.statusLabel}>Fin de journée</Text>
                {finAujourdhui && (
                  <Text style={styles.statusTime}>{finAujourdhui.heure}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Message de confirmation */}
          {lastAction && (
            <View style={styles.confirmBanner}>
              <Text style={styles.confirmText}>
                {lastAction === 'debut' ? '✓ Début de journée enregistré' : '✓ Fin de journée enregistrée'}
              </Text>
            </View>
          )}

          {/* Avertissement géolocalisation désactivé temporairement */}
        </View>

        {/* Boutons de pointage */}
        <View style={styles.buttonsRow}>
          <Pressable
            style={[
              styles.pointageBtn,
              styles.debutBtn,
              debutAujourdhui && styles.btnDisabled,
            ]}
            onPress={() => handlePointage('debut')}
            disabled={!!debutAujourdhui || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.btnIcon}>🌅</Text>
                <Text style={styles.btnLabel}>Début de journée</Text>
                {debutAujourdhui && (
                  <Text style={styles.btnSubLabel}>Enregistré à {debutAujourdhui.heure}</Text>
                )}
              </>
            )}
          </Pressable>

          <Pressable
            style={[
              styles.pointageBtn,
              styles.finBtn,
              (!debutAujourdhui || finAujourdhui) && styles.btnDisabled,
            ]}
            onPress={() => handlePointage('fin')}
            disabled={!debutAujourdhui || !!finAujourdhui || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.btnIcon}>🌇</Text>
                <Text style={styles.btnLabel}>Fin de journée</Text>
                {finAujourdhui && (
                  <Text style={styles.btnSubLabel}>Enregistré à {finAujourdhui.heure}</Text>
                )}
                {!debutAujourdhui && (
                  <Text style={styles.btnSubLabel}>Pointez d'abord le début</Text>
                )}
              </>
            )}
          </Pressable>
        </View>

        {/* Historique */}
        {hist.length > 0 && (
          <View style={styles.histSection}>
            <Text style={styles.histTitle}>Historique</Text>
            {hist.map(([date, { debut, fin }]) => (
              <View key={date} style={styles.histCard}>
                <Text style={styles.histDate}>{formatDateFr(date)}</Text>
                <View style={styles.histRow}>
                  <View style={styles.histItem}>
                    <Text style={styles.histLabel}>Arrivée</Text>
                    <Text style={styles.histTime}>{debut ? debut.heure : '—'}</Text>
                    {debut?.adresse && (
                      <Text style={styles.histAddr} numberOfLines={2}>{debut.adresse}</Text>
                    )}
                  </View>
                  <View style={styles.histSep} />
                  <View style={styles.histItem}>
                    <Text style={styles.histLabel}>Départ</Text>
                    <Text style={styles.histTime}>{fin ? fin.heure : '—'}</Text>
                    {fin?.adresse && (
                      <Text style={styles.histAddr} numberOfLines={2}>{fin.adresse}</Text>
                    )}
                  </View>
                  {debut && fin && (
                    <>
                      <View style={styles.histSep} />
                      <View style={styles.histItem}>
                        <Text style={styles.histLabel}>Durée</Text>
                        <Text style={styles.histTime}>
                          {(() => {
                            const [dh, dm] = debut.heure.split(':').map(Number);
                            const [fh, fm] = fin.heure.split(':').map(Number);
                            const diff = (fh * 60 + fm) - (dh * 60 + dm);
                            if (diff <= 0) return '—';
                            return `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`;
                          })()}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#F2F4F7',
    gap: 8,
  },
  headerLogo: { width: 72, height: 36 },
  headerSub: { fontSize: 12, color: '#687076', marginBottom: 2 },
  adminMsg: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  adminMsgText: {
    fontSize: 16, color: '#687076', textAlign: 'center', lineHeight: 24,
  },
  todayCard: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  todayDate: { fontSize: 14, color: '#687076', marginBottom: 4 },
  todayClock: { fontSize: 40, fontWeight: '700', color: '#1A3A6B', letterSpacing: 2 },
  todayName: { fontSize: 16, color: '#11181C', fontWeight: '600', marginTop: 4, marginBottom: 16 },
  statusRow: { flexDirection: 'row', gap: 12 },
  statusBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, padding: 12,
  },
  statusDone: { backgroundColor: '#D4EDDA' },
  statusPending: { backgroundColor: '#F2F4F7' },
  statusIcon: { fontSize: 18 },
  statusLabel: { fontSize: 12, color: '#11181C', fontWeight: '600' },
  statusTime: { fontSize: 16, color: '#1A3A6B', fontWeight: '700', marginTop: 2 },
  confirmBanner: {
    marginTop: 12, backgroundColor: '#D4EDDA', borderRadius: 8, padding: 10,
  },
  confirmText: { color: '#155724', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  geoBanner: {
    marginTop: 8, backgroundColor: '#FFF3CD', borderRadius: 8, padding: 10,
  },
  geoText: { color: '#856404', fontSize: 12, textAlign: 'center' },
  buttonsRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 8,
  },
  pointageBtn: {
    flex: 1, borderRadius: 16, padding: 20,
    alignItems: 'center', justifyContent: 'center', minHeight: 120,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  debutBtn: { backgroundColor: '#1A3A6B' },
  finBtn: { backgroundColor: '#E74C3C' },
  btnDisabled: { opacity: 0.5 },
  btnIcon: { fontSize: 32, marginBottom: 8 },
  btnLabel: { fontSize: 14, color: '#fff', fontWeight: '700', textAlign: 'center' },
  btnSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' },
  histSection: { paddingHorizontal: 16 },
  histTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', marginBottom: 12 },
  histCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  histDate: { fontSize: 13, fontWeight: '700', color: '#1A3A6B', marginBottom: 10 },
  histRow: { flexDirection: 'row', alignItems: 'flex-start' },
  histItem: { flex: 1, alignItems: 'center' },
  histSep: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 8, alignSelf: 'stretch' },
  histLabel: { fontSize: 11, color: '#687076', marginBottom: 4 },
  histTime: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  histAddr: { fontSize: 10, color: '#687076', textAlign: 'center', marginTop: 4 },
});
