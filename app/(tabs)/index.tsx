import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardScreen() {
  const { data, currentUser, isHydrated } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  const isAdmin = currentUser?.role === 'admin';
  const isEmploye = currentUser?.role === 'employe';
  const isST = currentUser?.role === 'soustraitant';

  if (isHydrated && !currentUser) {
    return <Redirect href={'/login' as any} />;
  }
  // Sous-traitants → planning
  if (isHydrated && currentUser && isST) {
    return <Redirect href={'/(tabs)/planning' as any} />;
  }

  const today = toYMD(new Date());

  // ── Météo (Paris par défaut, API Open-Meteo gratuite) ──
  const [weather, setWeather] = useState<{ temp: number; description: string; icon: string } | null>(null);
  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,weather_code&timezone=Europe/Paris')
      .then(r => r.json())
      .then(d => {
        const code = d.current?.weather_code || 0;
        const temp = Math.round(d.current?.temperature_2m || 0);
        const icons: Record<number, [string, string]> = {
          0: ['☀️', 'Ciel dégagé'], 1: ['🌤', 'Peu nuageux'], 2: ['⛅', 'Partiellement nuageux'], 3: ['☁️', 'Nuageux'],
          45: ['🌫', 'Brouillard'], 48: ['🌫', 'Brouillard givrant'],
          51: ['🌦', 'Bruine légère'], 53: ['🌦', 'Bruine'], 55: ['🌦', 'Bruine forte'],
          61: ['🌧', 'Pluie légère'], 63: ['🌧', 'Pluie'], 65: ['🌧', 'Forte pluie'],
          71: ['🌨', 'Neige légère'], 73: ['🌨', 'Neige'], 75: ['🌨', 'Forte neige'],
          80: ['🌦', 'Averses'], 81: ['🌧', 'Averses modérées'], 82: ['⛈', 'Fortes averses'],
          95: ['⛈', 'Orage'], 96: ['⛈', 'Orage + grêle'], 99: ['⛈', 'Orage violent'],
        };
        const [icon, description] = icons[code] || ['🌡', `Code ${code}`];
        setWeather({ temp, description, icon });
      })
      .catch(() => {});
  }, []);

  const stats = useMemo(() => {
    const chantiersActifs = data.chantiers.filter(c => c.statut === 'actif').length;
    const employesTotal = data.employes.length;
    const employesAujourdhui = new Set(
      data.affectations.filter(a => a.dateDebut <= today && a.dateFin >= today).map(a => a.employeId)
    ).size;

    const pointagesAujourdhui = data.pointages.filter(p => p.date === today);
    const nbArrivees = pointagesAujourdhui.filter(p => p.type === 'debut').length;
    const nbDeparts = pointagesAujourdhui.filter(p => p.type === 'fin').length;

    const msgsNonLus = (data.messagesPrive || []).filter(m => !m.lu && m.expediteurRole !== 'admin').length;

    const demandesRH = (
      (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
      (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
      (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length
    );

    const chantiersActifsIds = new Set(data.chantiers.filter(c => c.statut !== 'termine').map(c => c.id));
    const materielNonAchete = (data.listesMateriaux || []).reduce(
      (acc, l) => chantiersActifsIds.has(l.chantierId) ? acc + l.items.filter(i => !i.achete).length : acc, 0
    );

    return { chantiersActifs, employesTotal, employesAujourdhui, nbArrivees, nbDeparts, msgsNonLus, demandesRH, materielNonAchete };
  }, [data, today]);

  const activiteRecente = useMemo(() =>
    (data.activityLog || []).slice(-8).reverse(),
    [data.activityLog]
  );

  // ── Vue "Ma journée" pour les employés ──────────────────────────────────────
  const myId = currentUser?.employeId;
  const myChantiers = useMemo(() => {
    if (!myId) return [];
    return data.chantiers.filter(c =>
      c.statut === 'actif' &&
      data.affectations.some(a => a.chantierId === c.id && a.employeId === myId && a.dateDebut <= today && a.dateFin >= today)
    );
  }, [data.chantiers, data.affectations, myId, today]);

  const myTasks = useMemo(() => {
    if (!myId) return [];
    return data.affectations
      .filter(a => a.employeId === myId && a.dateDebut <= today && a.dateFin >= today)
      .flatMap(a => (a.notes || []).filter(n => n.date === today).flatMap(n => (n.tasks || []).filter(t => !t.fait)));
  }, [data.affectations, myId, today]);

  const myPointagesDuJour = useMemo(() => {
    if (!myId) return { debut: null as string | null, fin: null as string | null };
    const pts = data.pointages.filter(p => p.employeId === myId && p.date === today);
    return {
      debut: pts.find(p => p.type === 'debut')?.heure || null,
      fin: pts.find(p => p.type === 'fin')?.heure || null,
    };
  }, [data.pointages, myId, today]);

  if (isEmploye) {
    const emp = data.employes.find(e => e.id === myId);
    return (
      <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.greeting}>Bonjour {emp?.prenom || ''} 👋</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>

          {/* Pointage du jour */}
          <View style={styles.statCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C', marginBottom: 4 }}>Pointage du jour</Text>
                <Text style={{ fontSize: 13, color: '#687076' }}>
                  {myPointagesDuJour.debut ? `Arrivée : ${myPointagesDuJour.debut}` : 'Pas encore pointé'}
                  {myPointagesDuJour.fin ? ` — Départ : ${myPointagesDuJour.fin}` : ''}
                </Text>
              </View>
              <Pressable
                style={{ backgroundColor: '#1A3A6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
                onPress={() => router.push('/(tabs)/pointage' as any)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Pointer</Text>
              </Pressable>
            </View>
          </View>

          {/* Chantiers du jour */}
          <Text style={styles.sectionTitle}>Mes chantiers aujourd'hui</Text>
          {myChantiers.length === 0 && (
            <View style={styles.statCard}><Text style={{ color: '#687076', textAlign: 'center' }}>Aucun chantier prévu aujourd'hui</Text></View>
          )}
          {myChantiers.map(c => (
            <Pressable key={c.id} style={[styles.statCard, { borderLeftWidth: 4, borderLeftColor: c.couleur || '#1A3A6B' }]}
              onPress={() => router.push('/(tabs)/planning' as any)}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C' }}>{c.nom}</Text>
              {c.adresse ? <Text style={{ fontSize: 12, color: '#687076', marginTop: 2 }}>{c.adresse}</Text> : null}
              {c.fiche && (
                <View style={{ marginTop: 8, gap: 4 }}>
                  {c.fiche.codeAcces ? <Text style={{ fontSize: 12, color: '#1A3A6B' }}>🔑 Code : {c.fiche.codeAcces}</Text> : null}
                  {c.fiche.emplacementCle ? <Text style={{ fontSize: 12, color: '#1A3A6B' }}>🗝 Clé : {c.fiche.emplacementCle}</Text> : null}
                  {c.fiche.codeAlarme ? <Text style={{ fontSize: 12, color: '#1A3A6B' }}>🔔 Alarme : {c.fiche.codeAlarme}</Text> : null}
                </View>
              )}
            </Pressable>
          ))}

          {/* Tâches en cours */}
          {myTasks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Mes tâches du jour ({myTasks.length})</Text>
              <View style={styles.statCard}>
                {myTasks.map(task => (
                  <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8, borderBottomWidth: 0.5, borderBottomColor: '#F2F4F7' }}>
                    <Text style={{ fontSize: 16 }}>☐</Text>
                    <Text style={{ fontSize: 13, color: '#11181C', flex: 1 }}>{task.texte}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Raccourcis */}
          <Text style={styles.sectionTitle}>Accès rapide</Text>
          <View style={styles.shortcutsGrid}>
            <Pressable style={styles.shortcut} onPress={() => router.push('/(tabs)/planning' as any)}>
              <Text style={styles.shortcutIcon}>📅</Text>
              <Text style={styles.shortcutLabel}>Planning</Text>
            </Pressable>
            <Pressable style={styles.shortcut} onPress={() => router.push('/(tabs)/messagerie' as any)}>
              <Text style={styles.shortcutIcon}>💬</Text>
              <Text style={styles.shortcutLabel}>Messages</Text>
            </Pressable>
            <Pressable style={styles.shortcut} onPress={() => router.push('/(tabs)/materiel' as any)}>
              <Text style={styles.shortcutIcon}>🛒</Text>
              <Text style={styles.shortcutLabel}>Matériel</Text>
            </Pressable>
            <Pressable style={styles.shortcut} onPress={() => router.push('/(tabs)/rh' as any)}>
              <Text style={styles.shortcutIcon}>📋</Text>
              <Text style={styles.shortcutLabel}>RH</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (!isAdmin) return null;

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={styles.greeting}>Bonjour 👋</Text>
              <Text style={styles.date}>
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            {weather && (
              <View style={{ alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
                <Text style={{ fontSize: 24 }}>{weather.icon}</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C' }}>{weather.temp}°C</Text>
                <Text style={{ fontSize: 10, color: '#687076' }}>{weather.description}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>Vue d'ensemble</Text>
        <View style={styles.statsGrid}>
          <Pressable style={[styles.statCard, { borderLeftColor: '#1A3A6B' }]} onPress={() => router.push('/(tabs)/chantiers' as any)}>
            <Text style={[styles.statValue, { color: '#1A3A6B' }]}>{stats.chantiersActifs}</Text>
            <Text style={styles.statLabel}>Chantiers actifs</Text>
          </Pressable>
          <Pressable style={[styles.statCard, { borderLeftColor: '#27AE60' }]} onPress={() => router.push('/(tabs)/equipe' as any)}>
            <Text style={[styles.statValue, { color: '#27AE60' }]}>{stats.employesTotal}</Text>
            <Text style={styles.statLabel}>Employés</Text>
          </Pressable>
          <Pressable style={[styles.statCard, { borderLeftColor: '#F59E0B' }]} onPress={() => router.push('/(tabs)/planning' as any)}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.employesAujourdhui}/{stats.employesTotal}</Text>
            <Text style={styles.statLabel}>Affectés aujourd'hui</Text>
          </Pressable>
          <Pressable style={[styles.statCard, { borderLeftColor: '#00BCD4' }]} onPress={() => router.push('/(tabs)/reporting' as any)}>
            <Text style={[styles.statValue, { color: '#00BCD4' }]}>{stats.nbArrivees} / {stats.nbDeparts}</Text>
            <Text style={styles.statLabel}>Arrivées / Départs</Text>
          </Pressable>
        </View>

        {/* Alertes */}
        {(stats.msgsNonLus > 0 || stats.demandesRH > 0 || stats.materielNonAchete > 0) && (
          <>
            <Text style={styles.sectionTitle}>Alertes</Text>
            <View style={styles.alertsContainer}>
              {stats.msgsNonLus > 0 && (
                <Pressable style={styles.alertCard} onPress={() => router.push('/(tabs)/messagerie' as any)}>
                  <Text style={styles.alertIcon}>💬</Text>
                  <Text style={styles.alertText}>{stats.msgsNonLus} message{stats.msgsNonLus > 1 ? 's' : ''} non lu{stats.msgsNonLus > 1 ? 's' : ''}</Text>
                  <Text style={styles.alertArrow}>→</Text>
                </Pressable>
              )}
              {stats.demandesRH > 0 && (
                <Pressable style={styles.alertCard} onPress={() => router.push('/(tabs)/rh' as any)}>
                  <Text style={styles.alertIcon}>📋</Text>
                  <Text style={styles.alertText}>{stats.demandesRH} demande{stats.demandesRH > 1 ? 's' : ''} RH en attente</Text>
                  <Text style={styles.alertArrow}>→</Text>
                </Pressable>
              )}
              {stats.materielNonAchete > 0 && (
                <Pressable style={styles.alertCard} onPress={() => router.push('/(tabs)/materiel' as any)}>
                  <Text style={styles.alertIcon}>🛒</Text>
                  <Text style={styles.alertText}>{stats.materielNonAchete} article{stats.materielNonAchete > 1 ? 's' : ''} à acheter</Text>
                  <Text style={styles.alertArrow}>→</Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        {/* Activité récente */}
        {activiteRecente.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Activité récente</Text>
            <View style={styles.activityContainer}>
              {activiteRecente.map(log => (
                <View key={log.id} style={styles.activityRow}>
                  <View style={styles.activityDot} />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityDesc}>{log.description}</Text>
                    <Text style={styles.activityMeta}>
                      {log.userName} — {new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Raccourcis */}
        <Text style={styles.sectionTitle}>Accès rapide</Text>
        <View style={styles.shortcutsGrid}>
          {[
            { icon: '📅', label: 'Planning', route: '/(tabs)/planning' },
            { icon: '🏗', label: 'Chantiers', route: '/(tabs)/chantiers' },
            { icon: '👷', label: 'Équipe', route: '/(tabs)/equipe' },
            { icon: '📊', label: 'Reporting', route: '/(tabs)/reporting' },
          ].map(s => (
            <Pressable key={s.route} style={styles.shortcut} onPress={() => router.push(s.route as any)}>
              <Text style={styles.shortcutIcon}>{s.icon}</Text>
              <Text style={styles.shortcutLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 20 },
  greeting: { fontSize: 28, fontWeight: '800', color: '#11181C' },
  date: { fontSize: 14, color: '#687076', marginTop: 4, textTransform: 'capitalize' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', marginTop: 20, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '48%' as any,
    borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#687076', marginTop: 4, fontWeight: '500' },
  alertsContainer: { gap: 8 },
  alertCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1',
    borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#FFE082', gap: 10,
  },
  alertIcon: { fontSize: 20 },
  alertText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#E65100' },
  alertArrow: { fontSize: 16, color: '#E65100' },
  activityContainer: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A3A6B', marginTop: 5 },
  activityContent: { flex: 1 },
  activityDesc: { fontSize: 13, color: '#11181C', lineHeight: 18 },
  activityMeta: { fontSize: 11, color: '#687076', marginTop: 2 },
  shortcutsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '48%' as any,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  shortcutIcon: { fontSize: 28, marginBottom: 6 },
  shortcutLabel: { fontSize: 13, fontWeight: '600', color: '#1A3A6B' },
});
