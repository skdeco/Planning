import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal, Platform, Alert, Linking } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { ScreenContainer } from '@/components/screen-container';
import { LanguageFlag } from '@/components/LanguageFlag';
import { ImportExcel } from '@/components/ImportExcel';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useRefresh } from '@/hooks/useRefresh';

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardScreen() {
  const { data, currentUser, isHydrated, logout, toggleTask, addRetardPlanifie } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  const { refreshing, onRefresh } = useRefresh();
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

  // Récap hebdo (lundi à dimanche courant)
  const recapHebdo = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const mondayOff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now); monday.setDate(now.getDate() + mondayOff);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const start = toYMD(monday); const end = toYMD(sunday);

    const ptsSemaine = data.pointages.filter(p => p.date >= start && p.date <= end);
    const nbJoursPointes = new Set(ptsSemaine.map(p => `${p.employeId}_${p.date}`)).size;
    let totalMinutes = 0;
    const parJour = new Map<string, { debut?: string; fin?: string }>();
    ptsSemaine.forEach(p => {
      const key = `${p.employeId}_${p.date}`;
      if (!parJour.has(key)) parJour.set(key, {});
      const entry = parJour.get(key)!;
      if (p.type === 'debut') entry.debut = p.heure;
      if (p.type === 'fin') entry.fin = p.heure;
    });
    parJour.forEach(v => {
      if (v.debut && v.fin) {
        const [dh, dm] = v.debut.split(':').map(Number);
        const [fh, fm] = v.fin.split(':').map(Number);
        totalMinutes += (fh * 60 + fm) - (dh * 60 + dm);
      }
    });
    const totalHeures = Math.floor(totalMinutes / 60);
    const nbRetards = ptsSemaine.filter(p => {
      if (p.type !== 'debut') return false;
      const emp = data.employes.find(e => e.id === p.employeId);
      const d = new Date(p.date + 'T12:00:00');
      const horaire = emp?.horaires?.[d.getDay()];
      if (!horaire?.actif || !horaire.debut) return false;
      const [h, m] = horaire.debut.split(':').map(Number);
      const [ph, pm] = p.heure.split(':').map(Number);
      return (ph * 60 + pm) > (h * 60 + m) + 5;
    }).length;

    return { nbJoursPointes, totalHeures, nbRetards, start, end };
  }, [data.pointages, data.employes]);

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
    if (!myId) return [] as { task: any; affectationId: string; noteId: string }[];
    const result: { task: any; affectationId: string; noteId: string }[] = [];
    data.affectations
      .filter(a => a.employeId === myId && a.dateDebut <= today && a.dateFin >= today)
      .forEach(a => (a.notes || []).filter(n => n.date === today).forEach(n =>
        (n.tasks || []).filter(t => !t.fait).forEach(t => result.push({ task: t, affectationId: a.id, noteId: n.id }))
      ));
    return result;
  }, [data.affectations, myId, today]);

  const myPointagesDuJour = useMemo(() => {
    if (!myId) return { debut: null as string | null, fin: null as string | null };
    const pts = data.pointages.filter(p => p.employeId === myId && p.date === today);
    return {
      debut: pts.find(p => p.type === 'debut')?.heure || null,
      fin: pts.find(p => p.type === 'fin')?.heure || null,
    };
  }, [data.pointages, myId, today]);

  // Historique complet
  const [showHistorique, setShowHistorique] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Galerie photos state
  const [galerieVisible, setGalerieVisible] = useState(false);
  const [galerieChantierId, setGalerieChantierId] = useState<string | undefined>(undefined);

  if (isEmploye) {
    const emp = data.employes.find(e => e.id === myId);
    return (
      <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1A3A6B']} tintColor="#1A3A6B" />}>
          <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Bonjour {emp?.prenom || ''} 👋</Text>
              <Text style={styles.date}>
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <LanguageFlag />
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

          {/* Bouton "Je suis en retard" */}
          {!myPointagesDuJour.debut && myChantiers.length > 0 && (
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF3E0', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFE082', marginTop: 8 }}
              onPress={() => {
                const motifs = ['Bouchons / Transport', 'Problème véhicule', 'Rendez-vous médical', 'Raison personnelle', 'Autre'];
                if (Platform.OS === 'web') {
                  const choix = window.prompt('Motif du retard :\n' + motifs.map((m, i) => `${i + 1}. ${m}`).join('\n'), '1');
                  const motif = motifs[parseInt(choix || '1') - 1] || motifs[0];
                  addRetardPlanifie({
                    id: `ret_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    employeId: myId || '',
                    date: today,
                    heureArrivee: '',
                    motif,
                    createdAt: new Date().toISOString(),
                  });
                } else {
                  Alert.alert('Je suis en retard', 'Sélectionnez le motif', motifs.map(m => ({
                    text: m,
                    onPress: () => addRetardPlanifie({
                      id: `ret_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                      employeId: myId || '',
                      date: today,
                      heureArrivee: '',
                      motif: m,
                      createdAt: new Date().toISOString(),
                    }),
                  })));
                }
              }}>
              <Text style={{ fontSize: 16 }}>⚠️</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#E65100' }}>Je suis en retard</Text>
            </Pressable>
          )}

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
              {/* Boutons actions */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF0FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                  onPress={() => { setGalerieChantierId(c.id); setGalerieVisible(true); }}
                >
                  <Text style={{ fontSize: 12 }}>📸</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#1A3A6B' }}>Photos ({(data.photosChantier || []).filter(p => p.chantierId === c.id).length})</Text>
                </Pressable>
                {c.adresse && (
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                    onPress={() => {
                      const addr = encodeURIComponent(c.adresse || '');
                      if (Platform.OS === 'web') {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${addr}`, '_blank');
                      } else {
                        Alert.alert('Itinéraire', 'Ouvrir avec :', [
                          { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${addr}`) },
                          { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?q=${addr}&navigate=yes`) },
                          { text: 'Annuler', style: 'cancel' },
                        ]);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 12 }}>🗺</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#2E7D32' }}>Itinéraire</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          ))}

          {/* Tâches en cours */}
          {myTasks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Mes tâches du jour ({myTasks.length})</Text>
              <View style={styles.statCard}>
                {myTasks.map(({ task, affectationId, noteId }) => {
                  const empName = data.employes.find(e => e.id === myId)?.prenom || '';
                  return (
                    <Pressable key={task.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8, borderBottomWidth: 0.5, borderBottomColor: '#F2F4F7' }}
                      onPress={() => toggleTask(affectationId, noteId, task.id, empName)}>
                      <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#1A3A6B', alignItems: 'center', justifyContent: 'center' }}>
                        {task.fait && <Text style={{ color: '#1A3A6B', fontSize: 14, fontWeight: '700' }}>✓</Text>}
                      </View>
                      <Text style={{ fontSize: 14, color: '#11181C', flex: 1 }}>{task.texte}</Text>
                    </Pressable>
                  );
                })}
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
        <GaleriePhotos visible={galerieVisible} onClose={() => setGalerieVisible(false)} chantierId={galerieChantierId} />
      </ScreenContainer>
    );
  }

  if (!isAdmin) return null;

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Bonjour 👋</Text>
              <Text style={styles.date}>
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {weather && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{weather.icon}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#11181C' }}>{weather.temp}°C</Text>
                </View>
              )}
              <LanguageFlag />
              <Pressable
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' }}
                onPress={logout}
              >
                <Text style={{ fontSize: 16, color: '#EF4444' }}>⏻</Text>
              </Pressable>
            </View>
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

        {/* Récap semaine */}
        <Text style={styles.sectionTitle}>Résumé de la semaine</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={[styles.statCard, { flex: 1, alignItems: 'center', paddingVertical: 10 }]}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A3A6B' }}>{recapHebdo.totalHeures}h</Text>
            <Text style={{ fontSize: 10, color: '#687076' }}>Heures travaillées</Text>
          </View>
          <View style={[styles.statCard, { flex: 1, alignItems: 'center', paddingVertical: 10 }]}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#27AE60' }}>{recapHebdo.nbJoursPointes}</Text>
            <Text style={{ fontSize: 10, color: '#687076' }}>Pointages</Text>
          </View>
          <View style={[styles.statCard, { flex: 1, alignItems: 'center', paddingVertical: 10 }]}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: recapHebdo.nbRetards > 0 ? '#E74C3C' : '#27AE60' }}>{recapHebdo.nbRetards}</Text>
            <Text style={{ fontSize: 10, color: '#687076' }}>Retards</Text>
          </View>
        </View>

        {/* Couverture chantiers — 2 colonnes */}
        <Text style={styles.sectionTitle}>Couverture du jour</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {data.chantiers.filter(c => c.statut === 'actif').map(c => {
            const nbAffectes = new Set(
              data.affectations.filter(a => a.chantierId === c.id && a.dateDebut <= today && a.dateFin >= today).map(a => a.employeId)
            ).size;
            const nbPointes = data.pointages.filter(p =>
              p.date === today && p.type === 'debut' &&
              data.affectations.some(a => a.chantierId === c.id && a.employeId === p.employeId && a.dateDebut <= today && a.dateFin >= today)
            ).length;
            const color = nbAffectes === 0 ? '#E2E6EA' : nbPointes >= nbAffectes ? '#27AE60' : nbPointes > 0 ? '#F59E0B' : '#EF4444';
            return (
              <View key={c.id} style={[styles.statCard, { width: '48%' as any, borderLeftWidth: 4, borderLeftColor: color, paddingVertical: 8, paddingHorizontal: 10 }]}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#11181C' }} numberOfLines={1}>{c.nom}</Text>
                <Text style={{ fontSize: 11, color, fontWeight: '700', marginTop: 2 }}>{nbPointes}/{nbAffectes} pointés</Text>
              </View>
            );
          })}
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

        {/* Export rapide */}
        {/* Export + Import */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          <Pressable
            style={[styles.statCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderLeftWidth: 4, borderLeftColor: '#1A3A6B' }]}
            onPress={() => router.push('/(tabs)/reporting' as any)}
          >
            <Text style={{ fontSize: 16 }}>📄</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A3A6B' }}>Export rapport</Text>
          </Pressable>
          <Pressable
            style={[styles.statCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderLeftWidth: 4, borderLeftColor: '#27AE60' }]}
            onPress={() => setShowImport(true)}
          >
            <Text style={{ fontSize: 16 }}>📥</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#27AE60' }}>Import Excel</Text>
          </Pressable>
        </View>

        {/* Activité récente — tout en bas */}
        {activiteRecente.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C' }}>Activité récente</Text>
              <Pressable onPress={() => setShowHistorique(true)}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A3A6B' }}>Voir tout →</Text>
              </Pressable>
            </View>
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

        {/* Modal historique complet */}
        <Modal visible={showHistorique} transparent animationType="slide" onRequestClose={() => setShowHistorique(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#11181C' }}>📋 Historique complet</Text>
                <Pressable onPress={() => setShowHistorique(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, color: '#687076', fontWeight: '700' }}>✕</Text>
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {(data.activityLog || []).slice().reverse().map(log => {
                  const d = new Date(log.timestamp);
                  const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                  const heureStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <View key={log.id} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F2F4F7', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A3A6B', marginTop: 5 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#11181C' }}>{log.description}</Text>
                        <Text style={{ fontSize: 11, color: '#687076', marginTop: 2 }}>
                          {log.userName} — {dateStr} {heureStr}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                {(data.activityLog || []).length === 0 && (
                  <Text style={{ textAlign: 'center', color: '#687076', paddingVertical: 32 }}>Aucune activité enregistrée</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
      <ImportExcel visible={showImport} onClose={() => setShowImport(false)} />
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
