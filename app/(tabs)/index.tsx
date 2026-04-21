import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal, Platform, Alert, Linking, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { ScreenContainer } from '@/components/screen-container';
import { LanguageFlag } from '@/components/LanguageFlag';
import { ImportExcel } from '@/components/ImportExcel';
import { FadeInView, ScaleButton, StaggeredList, ProgressBar } from '@/components/ui/animated';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '@/lib/imageUtils';
import { BADGE_TYPES } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useRefresh } from '@/hooks/useRefresh';
import { useNotifications } from '@/hooks/useNotifications';
import { Onboarding } from '@/components/Onboarding';
import { DashboardKPI } from '@/components/DashboardKPI';
import AsyncStorage from '@react-native-async-storage/async-storage';

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardScreen() {
  const { data, currentUser, isHydrated, logout, toggleTask, addTaskPhoto, addRetardPlanifie, updateTicketSAV, upsertNote, updateEmploye, addBadgeEmploye } = useApp();
  const { t } = useLanguage();
  const router = useRouter();
  const { pushToken } = useNotifications();

  // Enregistrer le push token de l'utilisateur connecté (employé ou admin)
  useEffect(() => {
    if (!pushToken || !currentUser) return;
    // Admin avec un employeId lié
    if (currentUser.role === 'admin' && currentUser.employeId) {
      const emp = data.employes.find(e => e.id === currentUser.employeId);
      if (emp && emp.pushToken !== pushToken) {
        updateEmploye({ ...emp, pushToken });
      }
    }
    // Admin sans employeId : chercher un employé admin pour y stocker le token
    if (currentUser.role === 'admin' && !currentUser.employeId) {
      const adminEmp = data.employes.find(e => e.role === 'admin');
      if (adminEmp && adminEmp.pushToken !== pushToken) {
        updateEmploye({ ...adminEmp, pushToken });
      }
    }
    // Employé classique
    if (currentUser.employeId && currentUser.role !== 'admin') {
      const emp = data.employes.find(e => e.id === currentUser.employeId);
      if (emp && emp.pushToken !== pushToken) {
        updateEmploye({ ...emp, pushToken });
      }
    }
  }, [pushToken, currentUser?.employeId, currentUser?.role]);

  const { refreshing, onRefresh } = useRefresh();
  const isAdmin = currentUser?.role === 'admin';
  const isEmploye = currentUser?.role === 'employe';
  const isST = currentUser?.role === 'soustraitant';

  // ── Onboarding premier lancement ──
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingKey = `sk_onboarding_done_${currentUser?.employeId || currentUser?.soustraitantId || 'admin'}`;

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
    else if (isHydrated && currentUser && isST) router.replace('/(tabs)/planning' as any);

    // Check if first launch (per user)
    if (isHydrated && currentUser) {
      AsyncStorage.getItem(onboardingKey).then(done => {
        if (!done) setShowOnboarding(true);
      });
    }
  }, [isHydrated, currentUser, isST, router]);

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

  // Tous les chantiers actifs de l'employé (pour pense-bête)
  const myTousChantiers = useMemo(() => {
    if (!myId) return [];
    const chantierIds = new Set(data.affectations.filter(a => a.employeId === myId).map(a => a.chantierId));
    return data.chantiers.filter(c => chantierIds.has(c.id) && c.statut !== 'termine');
  }, [data.chantiers, data.affectations, myId]);

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

  const myNotesJour = useMemo(() => {
    if (!myId) return [] as { texte: string; chantierNom: string; auteurNom: string; savTicketId?: string; photos?: string[]; tasks?: any[]; affectationId: string; noteId: string }[];
    const result: { texte: string; chantierNom: string; auteurNom: string; savTicketId?: string; photos?: string[]; tasks?: any[]; affectationId: string; noteId: string }[] = [];
    data.affectations
      .filter(a => a.employeId === myId && a.dateDebut <= today && a.dateFin >= today)
      .forEach(a => {
        const ch = data.chantiers.find(c => c.id === a.chantierId);
        (a.notes || []).filter(n => (n.date === today || !n.date) && (n.texte?.trim() || (n.tasks && n.tasks.length > 0))).forEach(n => {
          result.push({ texte: n.texte, chantierNom: ch?.nom || '', auteurNom: n.auteurNom, savTicketId: n.savTicketId, photos: n.photos, tasks: n.tasks, affectationId: a.id, noteId: n.id });
        });
      });
    return result;
  }, [data.affectations, data.chantiers, myId, today]);

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
  // Alertes masquées (clé = texte de l'alerte)
  const [dismissedAlertes, setDismissedAlertes] = useState<Set<string>>(new Set());
  // Recherche globale
  const [searchGlobal, setSearchGlobal] = useState('');
  const searchResults = useMemo(() => {
    if (!searchGlobal.trim() || searchGlobal.length < 2) return null;
    const q = searchGlobal.toLowerCase().trim();
    const results: { type: string; icon: string; label: string; sub: string; route?: string }[] = [];
    data.chantiers.forEach(c => {
      if (c.nom.toLowerCase().includes(q) || (c.adresse || '').toLowerCase().includes(q))
        results.push({ type: 'chantier', icon: '🏗', label: c.nom, sub: c.adresse || c.statut, route: '/(tabs)/chantiers' });
    });
    data.employes.forEach(e => {
      if (`${e.prenom} ${e.nom}`.toLowerCase().includes(q) || e.identifiant.toLowerCase().includes(q))
        results.push({ type: 'employe', icon: '👷', label: `${e.prenom} ${e.nom}`, sub: e.metier, route: '/(tabs)/equipe' });
    });
    data.sousTraitants.forEach(s => {
      if (`${s.prenom} ${s.nom} ${s.societe}`.toLowerCase().includes(q))
        results.push({ type: 'st', icon: '🔧', label: s.societe || `${s.prenom} ${s.nom}`, sub: 'Sous-traitant' });
    });
    (data.catalogueArticles || []).forEach(a => {
      if (a.nom.toLowerCase().includes(q) || (a.reference || '').toLowerCase().includes(q))
        results.push({ type: 'article', icon: '📦', label: a.nom, sub: a.categorie + (a.fournisseur ? ` · ${a.fournisseur}` : ''), route: '/(tabs)/materiel' });
    });
    return results.slice(0, 10);
  }, [searchGlobal, data]);
  // Pense-bête
  const [penseBeteText, setPenseBeteText] = useState('');
  const [penseBeteChantierId, setPenseBeteChantierId] = useState<string | null>(null);
  // SAV depliable employe
  const [savExpanded, setSavExpanded] = useState(false);
  const [savDetailId, setSavDetailId] = useState<string | null>(null);
  // Galerie photos state
  const [galerieVisible, setGalerieVisible] = useState(false);
  const [galerieChantierId, setGalerieChantierId] = useState<string | undefined>(undefined);
  // Résumé fin de journée
  const [resumeTexte, setResumeTexte] = useState('');
  const [resumePhoto, setResumePhoto] = useState<string | null>(null);
  const [resumeEnvoye, setResumeEnvoye] = useState(false);

  // Itinéraire vers chantier (Waze prioritaire)
  const openDirections = (adresse: string) => {
    if (!adresse) return;
    const encoded = encodeURIComponent(adresse);
    if (Platform.OS === 'web') {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
    } else {
      Linking.canOpenURL('waze://').then(canOpen => {
        if (canOpen) Linking.openURL(`waze://?q=${encoded}&navigate=yes`);
        else Linking.openURL(Platform.OS === 'ios' ? `maps:?daddr=${encoded}` : `google.navigation:q=${encoded}`);
      });
    }
  };

  if (isHydrated && !currentUser) return null;
  if (isHydrated && isST) return null;

  if (isEmploye && currentUser) {
    const emp = data.employes.find(e => e.id === myId);
    if (!emp) return null;
    const nbMsgsNonLus = (data.messagesPrive || []).filter(m => !m.lu && m.expediteurRole !== 'employe').length;
    const mesSavTickets = (data.ticketsSAV || []).filter(t => t.assigneA === myId && t.statut !== 'clos');
    return (
      <ScreenContainer containerClassName="bg-[#F5EDE3]" edges={['top', 'left', 'right']}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C2C2C']} tintColor="#2C2C2C" />}>
          {/* Header compact */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#11181C' }}>Bonjour {emp?.prenom || ''} 👋</Text>
              <Text style={{ fontSize: 12, color: '#687076', textTransform: 'capitalize' }}>
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <LanguageFlag />
              <Pressable style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' }}
                onPress={() => { if (Platform.OS === 'web') { if (window.confirm('Se déconnecter ?')) logout(); } else Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Se déconnecter', style: 'destructive', onPress: logout }]); }}>
                <Text style={{ fontSize: 14, color: '#EF4444' }}>⏻</Text>
              </Pressable>
            </View>
          </View>

          {/* Badges motivationnels */}
          {(() => {
            const mesBadges = (data.badgesEmployes || []).filter(b => b.employeId === myId).slice(-5).reverse();
            if (mesBadges.length === 0) return null;
            return (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 }}>🏆 Mes badges</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {mesBadges.map(b => {
                    const bt = BADGE_TYPES[b.type];
                    return (
                      <View key={b.id} style={{ backgroundColor: '#FFF9F0', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#C9A96E', minWidth: 120 }}>
                        <Text style={{ fontSize: 22, textAlign: 'center' }}>{bt?.emoji || '🏆'}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#C9A96E', textAlign: 'center', marginTop: 2 }}>{bt?.label || b.type}</Text>
                        {b.message ? <Text style={{ fontSize: 10, color: '#687076', textAlign: 'center', marginTop: 2 }} numberOfLines={2}>{b.message}</Text> : null}
                        <Text style={{ fontSize: 9, color: '#B0BEC5', textAlign: 'center', marginTop: 4 }}>par {b.envoyePar} · {b.createdAt.slice(0, 10)}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}

          {/* Pointage + statut rapide */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Pressable style={{ flex: 2, backgroundColor: myPointagesDuJour.debut ? '#D4EDDA' : '#2C2C2C', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              onPress={() => router.push('/(tabs)/pointage' as any)}>
              <Text style={{ fontSize: 24 }}>{myPointagesDuJour.debut ? '✅' : '🕐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: myPointagesDuJour.debut ? '#155724' : '#fff' }}>
                  {myPointagesDuJour.debut ? `${myPointagesDuJour.debut}${myPointagesDuJour.fin ? ` → ${myPointagesDuJour.fin}` : ' (en cours)'}` : 'Pointer mon arrivée'}
                </Text>
                <Text style={{ fontSize: 10, color: myPointagesDuJour.debut ? '#27AE60' : 'rgba(255,255,255,0.7)' }}>
                  {myPointagesDuJour.debut ? 'Pointage OK' : 'Appuyez pour pointer'}
                </Text>
              </View>
            </Pressable>
            {nbMsgsNonLus > 0 && (
              <Pressable style={{ flex: 1, backgroundColor: '#EBF0FF', borderRadius: 14, padding: 14, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => router.push('/(tabs)/messagerie' as any)}>
                <Text style={{ fontSize: 20 }}>💬</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#2C2C2C' }}>{nbMsgsNonLus}</Text>
                <Text style={{ fontSize: 9, color: '#687076' }}>messages</Text>
              </Pressable>
            )}
          </View>

          {/* Bouton "Je suis en retard" */}
          {!myPointagesDuJour.debut && myChantiers.length > 0 && (
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF3E0', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFE082', marginBottom: 8 }}
              onPress={() => {
                const motifs = ['Bouchons / Transport', 'Problème véhicule', 'Rendez-vous médical', 'Raison personnelle', 'Autre'];
                if (Platform.OS === 'web') {
                  const choix = window.prompt('Motif du retard :\n' + motifs.map((m, i) => `${i + 1}. ${m}`).join('\n'), '1');
                  const motif = motifs[parseInt(choix || '1') - 1] || motifs[0];
                  addRetardPlanifie({ id: `ret_${Date.now()}_${Math.random().toString(36).slice(2)}`, employeId: myId || '', date: today, heureArrivee: '', motif, createdAt: new Date().toISOString() });
                } else {
                  Alert.alert('Je suis en retard', 'Sélectionnez le motif', motifs.map(m => ({ text: m, onPress: () => addRetardPlanifie({ id: `ret_${Date.now()}_${Math.random().toString(36).slice(2)}`, employeId: myId || '', date: today, heureArrivee: '', motif: m, createdAt: new Date().toISOString() }) })));
                }
              }}>
              <Text style={{ fontSize: 14 }}>⚠️</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#E65100' }}>Je suis en retard</Text>
            </Pressable>
          )}

          {/* Notes du jour */}
          {myNotesJour.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>📋 Consignes du jour ({myNotesJour.length})</Text>
              {myNotesJour.map((note, i) => {
                const empName = emp?.prenom || '';
                return (
                <View key={i} style={[styles.statCard, { borderLeftWidth: 4, borderLeftColor: note.savTicketId ? '#E74C3C' : '#2C2C2C' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {note.savTicketId && <Text style={{ fontSize: 12 }}>🔧</Text>}
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#2C2C2C' }}>{note.chantierNom}</Text>
                    <Text style={{ fontSize: 10, color: '#B0BEC5' }}>par {note.auteurNom}</Text>
                  </View>
                  {note.texte ? <Text style={{ fontSize: 13, color: '#11181C', lineHeight: 18 }}>{note.texte}</Text> : null}

                  {/* Tâches cochables avec bouton photo */}
                  {note.tasks && note.tasks.length > 0 && (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {note.tasks.map((task: any) => (
                        <View key={task.id}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                            <Pressable onPress={() => toggleTask(note.affectationId, note.noteId, task.id, empName)}
                              style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: task.fait ? '#27AE60' : '#2C2C2C', backgroundColor: task.fait ? '#D4EDDA' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                              {task.fait && <Text style={{ color: '#27AE60', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                            </Pressable>
                            <Text style={{ fontSize: 13, color: task.fait ? '#B0BEC5' : '#11181C', textDecorationLine: task.fait ? 'line-through' : 'none', flex: 1 }}>{task.texte}</Text>
                            {task.fait && task.faitPar && <Text style={{ fontSize: 9, color: '#27AE60', marginRight: 4 }}>{task.faitPar}</Text>}
                            <Pressable style={{ padding: 2 }} onPress={async () => {
                              Alert.alert('Photo', 'Source ?', [
                                { text: 'Annuler', style: 'cancel' },
                                { text: '📷 Galerie', onPress: async () => {
                                  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, allowsMultipleSelection: true });
                                  if (!result.canceled) { const { uploadFileToStorage } = require('@/lib/supabase'); for (const asset of result.assets) { const compressed = await compressImage(asset.uri); const url = await uploadFileToStorage(compressed, 'tasks/photos', `task_${task.id}_${Date.now()}`); if (url) addTaskPhoto(note.affectationId, note.noteId, task.id, url); } }
                                }},
                                { text: '📸 Appareil', onPress: async () => {
                                  const { status } = await ImagePicker.requestCameraPermissionsAsync(); if (status !== 'granted') return;
                                  const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
                                  if (!result.canceled && result.assets[0]) { const { uploadFileToStorage } = require('@/lib/supabase'); const compressed = await compressImage(result.assets[0].uri); const url = await uploadFileToStorage(compressed, 'tasks/photos', `task_${task.id}_${Date.now()}`); if (url) addTaskPhoto(note.affectationId, note.noteId, task.id, url); }
                                }},
                              ]);
                            }}><Text style={{ fontSize: 14 }}>📷</Text></Pressable>
                          </View>
                          {task.photos && task.photos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 28, marginBottom: 4 }} contentContainerStyle={{ gap: 3 }}>
                              {task.photos.map((uri: string, pi: number) => (
                                <Image key={pi} source={{ uri }} style={{ width: 44, height: 44, borderRadius: 4 }} resizeMode="cover" />
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Photos de la note */}
                  {note.photos && note.photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 4 }}>
                      {note.photos.map((uri: string, j: number) => (
                        <Image key={j} source={{ uri }} style={{ width: 50, height: 50, borderRadius: 6 }} resizeMode="cover" />
                      ))}
                    </ScrollView>
                  )}

                  {/* Bouton ajouter photo */}
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: '#EBF0FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' }}
                    onPress={async () => {
                      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
                      if (!result.canceled && result.assets[0]) {
                        const { uploadFileToStorage } = require('@/lib/supabase');
                        const compressed = await compressImage(result.assets[0].uri);
                        const url = await uploadFileToStorage(compressed, 'notes/photos', `note_${note.noteId}_${Date.now()}`);
                        if (url) {
                          const aff = data.affectations.find(a => a.id === note.affectationId);
                          const existingNote = aff?.notes.find(n => n.id === note.noteId);
                          if (existingNote && aff) {
                            upsertNote({
                              chantierId: aff.chantierId,
                              employeId: aff.employeId,
                              date: existingNote.date || today,
                              note: { ...existingNote, photos: [...(existingNote.photos || []), url], updatedAt: new Date().toISOString() },
                            });
                          }
                        }
                      }
                    }}>
                    <Text style={{ fontSize: 12 }}>📷</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#2C2C2C' }}>Ajouter photo</Text>
                  </Pressable>
                </View>
                );
              })}
            </>
          )}

          {/* SAV assignés */}
          {mesSavTickets.length > 0 && (
            <>
            <Text style={styles.sectionTitle}>🔧 SAV assignés ({mesSavTickets.length})</Text>
            <View style={{ marginBottom: 8 }}>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: savExpanded ? 12 : 12, borderBottomLeftRadius: savExpanded ? 0 : 12, borderBottomRightRadius: savExpanded ? 0 : 12, padding: 12, borderWidth: 1, borderColor: '#FECACA', gap: 10 }}
                onPress={() => { setSavExpanded(v => !v); setSavDetailId(null); }}
              >
                <Text style={{ fontSize: 18 }}>🔧</Text>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#DC2626' }}>Voir le détail</Text>
                <Text style={{ fontSize: 14, color: '#DC2626' }}>{savExpanded ? '▾' : '▸'}</Text>
              </Pressable>
              {savExpanded && (
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderTopWidth: 0, borderColor: '#FECACA', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, padding: 8 }}>
                  {mesSavTickets.map(t => {
                    const ch = data.chantiers.find(c => c.id === t.chantierId);
                    const isOpen = savDetailId === t.id;
                    const prioColors: Record<string, string> = { basse: '#27AE60', normale: '#2C2C2C', haute: '#F59E0B', urgente: '#E74C3C' };
                    const statutLabel = t.statut === 'ouvert' ? '🔴' : t.statut === 'en_cours' ? '🟡' : '🟢';
                    return (
                      <View key={t.id} style={{ borderBottomWidth: t.id !== mesSavTickets[mesSavTickets.length - 1].id ? 0.5 : 0, borderBottomColor: '#F5EDE3' }}>
                        <Pressable style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 8 }}
                          onPress={() => setSavDetailId(isOpen ? null : t.id)}>
                          <Text style={{ fontSize: 12 }}>{statutLabel}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C' }} numberOfLines={1}>{t.objet}</Text>
                            <Text style={{ fontSize: 10, color: '#687076' }}>{ch?.nom} · {t.priorite}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#B0BEC5' }}>{isOpen ? '▾' : '▸'}</Text>
                        </Pressable>

                        {isOpen && (
                          <View style={{ paddingHorizontal: 4, paddingBottom: 10, gap: 6 }}>
                            {t.description && <Text style={{ fontSize: 12, color: '#11181C', lineHeight: 17 }}>{t.description}</Text>}
                            {t.photos && t.photos.length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                                {t.photos.map((uri, i) => <Image key={i} source={{ uri }} style={{ width: 60, height: 60, borderRadius: 6 }} resizeMode="cover" />)}
                              </ScrollView>
                            )}
                            {t.fichiers && t.fichiers.length > 0 && (
                              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                {t.fichiers.map((f, i) => <View key={i} style={{ backgroundColor: '#EBF0FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}><Text style={{ fontSize: 10, color: '#2C2C2C' }}>📄 {f.nom}</Text></View>)}
                              </View>
                            )}
                            {/* Photos resolution */}
                            {t.photosResolution && t.photosResolution.length > 0 && (
                              <View style={{ backgroundColor: '#D4EDDA', borderRadius: 6, padding: 6 }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: '#155724', marginBottom: 4 }}>✓ Photos résolution :</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                                  {t.photosResolution.map((uri, i) => <Image key={i} source={{ uri }} style={{ width: 50, height: 50, borderRadius: 4 }} resizeMode="cover" />)}
                                </ScrollView>
                              </View>
                            )}
                            {t.resoluPar && <Text style={{ fontSize: 10, color: '#27AE60', fontWeight: '600' }}>✓ Résolu par {t.resoluPar} le {t.dateResolution}</Text>}
                            <Text style={{ fontSize: 9, color: '#B0BEC5' }}>Ouvert le {t.dateOuverture}</Text>

                            {/* Actions employe */}
                            {t.statut !== 'resolu' && t.statut !== 'clos' && (
                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                <Pressable style={{ flex: 1, backgroundColor: '#D4EDDA', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                                  onPress={async () => {
                                    const userName = currentUser?.nom || emp?.prenom || 'Employé';
                                    if (Platform.OS === 'web') {
                                      data.ticketsSAV && updateTicketSAV({ ...t, statut: 'resolu', dateResolution: new Date().toISOString().slice(0, 10), resoluPar: userName, updatedAt: new Date().toISOString() });
                                    } else {
                                      Alert.alert('Résoudre le SAV', 'Ajouter une photo/document ?', [
                                        { text: 'Annuler', style: 'cancel' },
                                        { text: 'Résoudre sans photo', onPress: () => updateTicketSAV({ ...t, statut: 'resolu', dateResolution: new Date().toISOString().slice(0, 10), resoluPar: userName, updatedAt: new Date().toISOString() }) },
                                        { text: '📷 Ajouter photo', onPress: async () => {
                                          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
                                          if (!result.canceled && result.assets[0]) {
                                            const { uploadFileToStorage } = require('@/lib/supabase');
                                            const compressed = await compressImage(result.assets[0].uri);
                                            const url = await uploadFileToStorage(compressed, `chantiers/${t.chantierId}/sav-resolution`, `res_${t.id}_${Date.now()}`);
                                            updateTicketSAV({ ...t, statut: 'resolu', dateResolution: new Date().toISOString().slice(0, 10), resoluPar: userName, photosResolution: [...(t.photosResolution || []), ...(url ? [url] : [])], updatedAt: new Date().toISOString() });
                                          }
                                        }},
                                      ]);
                                    }
                                  }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#155724' }}>✓ Marquer résolu</Text>
                                </Pressable>
                                <Pressable style={{ backgroundColor: '#EBF0FF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' }}
                                  onPress={async () => {
                                    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
                                    if (!result.canceled && result.assets[0]) {
                                      const { uploadFileToStorage } = require('@/lib/supabase');
                                      const compressed = await compressImage(result.assets[0].uri);
                                      const url = await uploadFileToStorage(compressed, `chantiers/${t.chantierId}/sav-resolution`, `cr_${t.id}_${Date.now()}`);
                                      if (url) updateTicketSAV({ ...t, photosResolution: [...(t.photosResolution || []), url], updatedAt: new Date().toISOString() });
                                    }
                                  }}>
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#2C2C2C' }}>📷 Photo</Text>
                                </Pressable>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            </>
          )}

          {/* Chantiers du jour */}
          <Text style={styles.sectionTitle}>Mes chantiers aujourd'hui</Text>
          {myChantiers.length === 0 && (
            <View style={styles.statCard}><Text style={{ color: '#687076', textAlign: 'center' }}>Aucun chantier prévu aujourd'hui</Text></View>
          )}
          {myChantiers.map(c => (
            <Pressable key={c.id} style={[styles.statCard, { borderLeftWidth: 4, borderLeftColor: c.couleur || '#2C2C2C' }]}
              onPress={() => router.push('/(tabs)/planning' as any)}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C' }}>{c.nom}</Text>
              {c.adresse ? <Text style={{ fontSize: 12, color: '#687076', marginTop: 2 }}>{c.adresse}</Text> : null}
              {c.fiche && (
                <View style={{ marginTop: 8, gap: 4 }}>
                  {c.fiche.codeAcces ? <Text style={{ fontSize: 12, color: '#2C2C2C' }}>🔑 Code : {c.fiche.codeAcces}</Text> : null}
                  {c.fiche.emplacementCle ? <Text style={{ fontSize: 12, color: '#2C2C2C' }}>🗝 Clé : {c.fiche.emplacementCle}</Text> : null}
                  {c.fiche.codeAlarme ? <Text style={{ fontSize: 12, color: '#2C2C2C' }}>🔔 Alarme : {c.fiche.codeAlarme}</Text> : null}
                </View>
              )}
              {/* Boutons actions */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF0FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                  onPress={() => { setGalerieChantierId(c.id); setGalerieVisible(true); }}
                >
                  <Text style={{ fontSize: 12 }}>📸</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#2C2C2C' }}>Photos ({(data.photosChantier || []).filter(p => p.chantierId === c.id).length})</Text>
                </Pressable>
                {c.adresse && (
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2C2C2C', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                    onPress={() => openDirections(c.adresse || '')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>📍 Y aller</Text>
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
                    <Pressable key={task.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}
                      onPress={() => toggleTask(affectationId, noteId, task.id, empName)}>
                      <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#2C2C2C', alignItems: 'center', justifyContent: 'center' }}>
                        {task.fait && <Text style={{ color: '#2C2C2C', fontSize: 14, fontWeight: '700' }}>✓</Text>}
                      </View>
                      <Text style={{ fontSize: 14, color: '#11181C', flex: 1 }}>{task.texte}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Planning de la semaine */}
          <Text style={styles.sectionTitle}>Mon planning de la semaine</Text>
          <View style={styles.statCard}>
            {(() => {
              const now = new Date();
              const dow = now.getDay();
              const mondayOff = dow === 0 ? -6 : 1 - dow;
              const days: { label: string; dateStr: string; chantiers: string[]; isToday: boolean }[] = [];
              for (let i = 0; i < 6; i++) { // Lun-Sam
                const d = new Date(now);
                d.setDate(now.getDate() + mondayOff + i);
                const ds = toYMD(d);
                const chIds = data.affectations
                  .filter(a => a.employeId === myId && a.dateDebut <= ds && a.dateFin >= ds)
                  .map(a => data.chantiers.find(c => c.id === a.chantierId)?.nom || '');
                days.push({
                  label: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][i],
                  dateStr: ds,
                  chantiers: chIds.filter(Boolean),
                  isToday: ds === today,
                });
              }
              return days.map(d => (
                <View key={d.dateStr} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3', gap: 8 }}>
                  <View style={{ width: 32, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: d.isToday ? '800' : '600', color: d.isToday ? '#2C2C2C' : '#687076' }}>{d.label}</Text>
                    <Text style={{ fontSize: 9, color: d.isToday ? '#2C2C2C' : '#B0BEC5' }}>{d.dateStr.slice(8)}</Text>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {d.chantiers.length === 0 ? (
                      <Text style={{ fontSize: 11, color: '#B0BEC5', fontStyle: 'italic' }}>—</Text>
                    ) : d.chantiers.map((name, i) => {
                      const ch = data.chantiers.find(c => c.nom === name);
                      return (
                        <View key={i} style={{ backgroundColor: (ch?.couleur || '#2C2C2C') + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: ch?.couleur || '#2C2C2C' }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#11181C' }}>{name}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ));
            })()}
          </View>

          {/* Mes demandes RH en cours */}
          {myId && (() => {
            const mesConges = data.demandesConge.filter(d => d.employeId === myId && d.statut === 'en_attente');
            const mesAvances = data.demandesAvance.filter(d => d.employeId === myId && d.statut === 'en_attente');
            const mesMaladies = data.arretsMaladie.filter(d => d.employeId === myId && d.statut === 'en_attente');
            const total = mesConges.length + mesAvances.length + mesMaladies.length;
            if (total === 0) return null;
            return (
              <>
                <Text style={styles.sectionTitle}>Mes demandes en cours ({total})</Text>
                <View style={styles.statCard}>
                  {mesConges.map(d => (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}>
                      <Text style={{ fontSize: 14 }}>🏖</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#11181C' }}>Congé {d.dateDebut} → {d.dateFin}</Text>
                        <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '600' }}>⏳ En attente</Text>
                      </View>
                    </View>
                  ))}
                  {mesAvances.map(d => (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}>
                      <Text style={{ fontSize: 14 }}>💰</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#11181C' }}>Avance de {d.montant} €</Text>
                        <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '600' }}>⏳ En attente</Text>
                      </View>
                    </View>
                  ))}
                  {mesMaladies.map(d => (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 14 }}>🏥</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#11181C' }}>Arrêt maladie {d.dateDebut}</Text>
                        <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '600' }}>⏳ En attente</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}

          {/* Pense-bête par chantier */}
          <Text style={styles.sectionTitle}>📌 Pense-bête</Text>
          <View style={styles.statCard}>
            {/* Notes existantes */}
            {(emp?.penseBetes || []).map(pb => {
              const ch = pb.chantierId ? data.chantiers.find(c => c.id === pb.chantierId) : null;
              return (
                <View key={pb.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3' }}>
                  {ch && <View style={{ backgroundColor: (ch.couleur || '#2C2C2C') + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: ch.couleur || '#2C2C2C' }}>{ch.nom}</Text></View>}
                  {!ch && <Text style={{ fontSize: 9, color: '#B0BEC5', marginTop: 2 }}>Général</Text>}
                  <Text style={{ fontSize: 13, color: '#11181C', flex: 1 }}>{pb.texte}</Text>
                  <Pressable onPress={() => {
                    if (!emp) return;
                    updateEmploye({ ...emp, penseBetes: (emp.penseBetes || []).filter(p => p.id !== pb.id) });
                  }}><Text style={{ fontSize: 11, color: '#E74C3C' }}>✕</Text></Pressable>
                </View>
              );
            })}
            {(emp?.penseBetes || []).length === 0 && <Text style={{ fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', marginBottom: 6 }}>Aucune note</Text>}

            {/* Formulaire ajout */}
            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#F5EDE3', paddingTop: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 4 }}>
                <Pressable style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: !penseBeteChantierId ? '#2C2C2C' : '#F5EDE3' }}
                  onPress={() => setPenseBeteChantierId(null)}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: !penseBeteChantierId ? '#fff' : '#687076' }}>Général</Text>
                </Pressable>
                {myTousChantiers.map(c => (
                  <Pressable key={c.id} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: penseBeteChantierId === c.id ? (c.couleur || '#2C2C2C') : '#F5EDE3' }}
                    onPress={() => setPenseBeteChantierId(c.id)}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: penseBeteChantierId === c.id ? '#fff' : '#687076' }}>{c.nom}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#F5EDE3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA' }}
                  value={penseBeteText}
                  onChangeText={setPenseBeteText}
                  placeholder="À ne pas oublier..."
                  placeholderTextColor="#B0BEC5"
                />
                <Pressable style={{ backgroundColor: '#2C2C2C', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', opacity: penseBeteText.trim() ? 1 : 0.5 }}
                  disabled={!penseBeteText.trim()}
                  onPress={() => {
                    if (!emp || !penseBeteText.trim()) return;
                    const newPb = { id: `pb_${Date.now()}`, chantierId: penseBeteChantierId || undefined, texte: penseBeteText.trim(), createdAt: new Date().toISOString() };
                    updateEmploye({ ...emp, penseBetes: [...(emp.penseBetes || []), newPb] });
                    setPenseBeteText('');
                  }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
        <GaleriePhotos visible={galerieVisible} onClose={() => setGalerieVisible(false)} chantierId={galerieChantierId} />
        <Onboarding
          visible={showOnboarding}
          role={(currentUser?.role === 'apporteur' ? 'employe' : currentUser?.role) || 'employe'}
          onComplete={() => {
            setShowOnboarding(false);
            AsyncStorage.setItem(onboardingKey, 'true');
          }}
        />
      </ScreenContainer>
    );
  }

  if (!isAdmin) return null;

  return (
    <ScreenContainer containerClassName="bg-[#F5EDE3]" edges={['top', 'left', 'right']}>
      {/* Bannière achats FIXE en haut, hors du scroll */}
      {stats.materielNonAchete > 0 && (
        <Pressable
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}
          onPress={() => router.push('/(tabs)/materiel' as any)}
        >
          <Text style={{ fontSize: 18 }}>🛒</Text>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#fff' }}>{stats.materielNonAchete} article{stats.materielNonAchete > 1 ? 's' : ''} à acheter</Text>
          <Text style={{ fontSize: 14, color: '#fff', fontWeight: '700' }}>Voir →</Text>
        </Pressable>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header avec dégradé */}
        <FadeInView duration={500}>
          <View
            style={{ borderRadius: 20, padding: 20, marginBottom: 16, backgroundColor: '#2C2C2C', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 }}>Bonjour 👋</Text>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, textTransform: 'capitalize', fontWeight: '400' }}>
                  {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {weather && (
                  <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 8 }}>
                    <Text style={{ fontSize: 18 }}>{weather.icon}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{weather.temp}°C</Text>
                  </View>
                )}
                <LanguageFlag />
                <Pressable
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => {
                    if (Platform.OS === 'web') { if (window.confirm('Se déconnecter ?')) logout(); }
                    else Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Se déconnecter', style: 'destructive', onPress: logout }]);
                  }}
                >
                  <Text style={{ fontSize: 16, color: '#fff' }}>⏻</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </FadeInView>

        {/* Tableau de bord admin */}
        {isAdmin && (
          <FadeInView delay={50}>
            <DashboardKPI />
          </FadeInView>
        )}

        {/* Recherche globale */}
        <FadeInView delay={100}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E8DDD0', paddingHorizontal: 14, marginBottom: 12, shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
          <Text style={{ fontSize: 14, color: '#B0A89E', marginRight: 8 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, paddingVertical: 12, fontSize: 14, color: '#1A1A1A' }}
            placeholder="Rechercher chantier, employé, article..."
            placeholderTextColor="#B0A89E"
            value={searchGlobal}
            onChangeText={setSearchGlobal}
          />
          {searchGlobal.length > 0 && (
            <Pressable onPress={() => setSearchGlobal('')}><Text style={{ fontSize: 14, color: '#B0A89E' }}>✕</Text></Pressable>
          )}
        </View>
        </FadeInView>
        {searchResults && searchResults.length > 0 && (
          <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 12, overflow: 'hidden' }}>
            {searchResults.map((r, i) => (
              <Pressable key={`${r.type}_${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < searchResults.length - 1 ? 0.5 : 0, borderBottomColor: '#F5EDE3' }}
                onPress={() => { if (r.route) router.push(r.route as any); setSearchGlobal(''); }}>
                <Text style={{ fontSize: 18 }}>{r.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C' }}>{r.label}</Text>
                  <Text style={{ fontSize: 10, color: '#687076' }}>{r.sub}</Text>
                </View>
                <Text style={{ fontSize: 12, color: '#B0BEC5' }}>→</Text>
              </Pressable>
            ))}
          </View>
        )}
        {searchResults && searchResults.length === 0 && searchGlobal.length >= 2 && (
          <View style={{ backgroundColor: '#F5EDE3', borderRadius: 10, padding: 16, marginBottom: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#687076' }}>Aucun résultat pour "{searchGlobal}"</Text>
          </View>
        )}

        {/* Alertes système — rappels automatiques */}
        {(() => {
          // Chaque alerte a un id STABLE (type + entité + date) pour que "masquer"
          // fonctionne même quand le texte change (minutes de retard qui évoluent...)
          const alertes: { id: string; icon: string; text: string; color: string; onPress?: () => void }[] = [];
          const todayDate = new Date();

          // 1. Employés non pointés après 15min du début théorique
          const heureActuelle = todayDate.getHours() * 60 + todayDate.getMinutes();
          data.employes.forEach(emp => {
            if (emp.doitPointer === false) return;
            const dow = todayDate.getDay();
            const horaire = emp.horaires?.[dow];
            if (!horaire?.actif) return;
            const [hh, mm] = horaire.debut.split(':').map(Number);
            const debutTheo = hh * 60 + mm;
            if (heureActuelle < debutTheo + 15) return;
            const aPointe = data.pointages.some(p => p.employeId === emp.id && p.date === today && p.type === 'debut');
            const minutesRetard = heureActuelle - debutTheo;
            if (!aPointe) alertes.push({
              id: `pointage_${emp.id}_${today}`,
              icon: '⚠️',
              text: `${emp.prenom} n'a pas pointé (+${minutesRetard}min)`,
              color: '#E74C3C',
            });
          });

          // 2. Relances paiement (reste > 0 et dernier paiement > 30j ou aucun paiement)
          (data.marchesChantier || []).forEach(m => {
            const totalRecu = m.paiements.reduce((s, p) => s + p.montant, 0);
            const reste = m.montantTTC - totalRecu;
            if (reste <= 0) return;
            const lastPay = m.paiements.length > 0 ? new Date(m.paiements[m.paiements.length - 1].date) : null;
            const daysSince = lastPay ? Math.floor((todayDate.getTime() - lastPay.getTime()) / 86400000) : 999;
            if (daysSince > 30) {
              const ch = data.chantiers.find(c => c.id === m.chantierId);
              const resteFormatted = reste.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
              alertes.push({
                id: `relance_${m.id}`,
                icon: '💸',
                text: `Relance : ${ch?.nom || ''} — ${resteFormatted}€ restant (${daysSince === 999 ? 'aucun paiement' : `${daysSince}j sans paiement`})`,
                color: '#E5A840',
                onPress: () => router.push('/(tabs)/chantiers' as any),
              });
            }
          });

          // 3. Documents ST expirant bientôt (dans 30j)
          data.sousTraitants.forEach(st => {
            (st.documents || []).forEach(doc => {
              if (!doc.expirationDate) return;
              const exp = new Date(doc.expirationDate);
              const jRestants = Math.floor((exp.getTime() - todayDate.getTime()) / 86400000);
              if (jRestants <= 30 && jRestants >= 0) {
                alertes.push({
                  id: `doc_${st.id}_${doc.id || doc.libelle}`,
                  icon: '📄',
                  text: `${st.societe || st.nom} : ${doc.libelle} expire dans ${jRestants}j`,
                  color: '#F59E0B',
                });
              } else if (jRestants < 0) {
                alertes.push({
                  id: `doc_exp_${st.id}_${doc.id || doc.libelle}`,
                  icon: '🚨',
                  text: `${st.societe || st.nom} : ${doc.libelle} EXPIRÉ`,
                  color: '#E74C3C',
                });
              }
            });
          });

          // 4. Trous planning — chantier actif sans personne affectée sur les 7 prochains jours
          (() => {
            const joursSemaine = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
            let trouCount = 0;
            for (let d = 0; d < 7 && trouCount < 5; d++) {
              const jour = new Date(todayDate);
              jour.setDate(jour.getDate() + d);
              const jourStr = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;
              const dow = jour.getDay();
              // Skip weekends (samedi=6, dimanche=0)
              if (dow === 0 || dow === 6) continue;
              const dayLabel = `${joursSemaine[dow]} ${String(jour.getDate()).padStart(2, '0')}/${String(jour.getMonth() + 1).padStart(2, '0')}`;
              data.chantiers.filter(c => c.statut === 'actif').forEach(c => {
                if (trouCount >= 5) return;
                const hasAffectation = data.affectations.some(a => a.chantierId === c.id && a.dateDebut <= jourStr && a.dateFin >= jourStr);
                if (!hasAffectation) {
                  alertes.push({
                    id: `trou_${c.id}_${jourStr}`,
                    icon: '📅',
                    text: `${c.nom} : personne le ${dayLabel}`,
                    color: '#6B8EBF',
                  });
                  trouCount++;
                }
              });
            }
          })();

          const visibleAlertes = alertes.filter(a => !dismissedAlertes.has(a.id));
          const hiddenCount = dismissedAlertes.size;
          // Si toutes les alertes sont masquées, on affiche quand même un petit bouton "restaurer"
          if (visibleAlertes.length === 0) {
            if (hiddenCount === 0) return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Pressable onPress={() => setDismissedAlertes(new Set())}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#8C8077' }}>🔔 Afficher les alertes masquées ({hiddenCount})</Text>
                </Pressable>
              </View>
            );
          }
          return (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.sectionTitle}>⚠️ Alertes ({visibleAlertes.length})</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {hiddenCount > 0 && (
                    <Pressable onPress={() => setDismissedAlertes(new Set())}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: '#8C8077' }}>🔔 Afficher masquées ({hiddenCount})</Text>
                    </Pressable>
                  )}
                  {visibleAlertes.length > 1 && (
                    <Pressable onPress={() => setDismissedAlertes(new Set([...dismissedAlertes, ...visibleAlertes.map(a => a.id)]))}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: '#687076' }}>Tout masquer</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              <View style={{ gap: 4, marginBottom: 8 }}>
                {visibleAlertes.slice(0, 8).map((a) => (
                  <Pressable key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: a.color + '12', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: a.color }}
                    onPress={a.onPress}>
                    <Text style={{ fontSize: 14 }}>{a.icon}</Text>
                    <Text style={{ fontSize: 12, color: '#11181C', flex: 1 }} numberOfLines={2}>{a.text}</Text>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); setDismissedAlertes(new Set([...dismissedAlertes, a.id])); }}
                      hitSlop={10}
                      style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, color: '#687076', lineHeight: 16, fontWeight: '700' }}>✕</Text>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </>
          );
        })()}

        {/* Planning direction du jour */}
        {(() => {
          const rdvJour = (data.agendaEvents || []).filter(e => e.date === today).sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
          if (rdvJour.length === 0) return null;
          return (
            <>
              <Text style={styles.sectionTitle}>📅 Agenda du jour ({rdvJour.length})</Text>
              {rdvJour.map(evt => {
                const ch = evt.chantierId ? data.chantiers.find(c => c.id === evt.chantierId) : null;
                return (
                  <Pressable key={evt.id} style={[styles.statCard, { borderLeftWidth: 4, borderLeftColor: evt.couleur || '#2C2C2C', flexDirection: 'row', alignItems: 'center', gap: 10 }]}
                    onPress={() => router.push('/(tabs)/planning' as any)}>
                    <View style={{ backgroundColor: (evt.couleur || '#2C2C2C') + '15', width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: evt.couleur || '#2C2C2C' }}>{evt.heureDebut}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C' }}>{evt.titre}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {evt.heureFin ? <Text style={{ fontSize: 11, color: '#687076' }}>{evt.heureDebut} → {evt.heureFin}</Text> : null}
                        {evt.lieu ? <Text style={{ fontSize: 11, color: '#687076' }}>· 📍 {evt.lieu}</Text> : null}
                        {ch ? <Text style={{ fontSize: 11, color: ch.couleur, fontWeight: '600' }}>· {ch.nom}</Text> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </>
          );
        })()}

        <Text style={styles.sectionTitle}>Vue d'ensemble</Text>
        <View style={styles.statsGrid}>
          <Pressable style={[styles.statCard, { borderLeftColor: '#2C2C2C', width: '48%' as any }]} onPress={() => router.push('/(tabs)/chantiers' as any)}>
            <Text style={[styles.statValue, { color: '#2C2C2C' }]}>{stats.chantiersActifs}</Text>
            <Text style={styles.statLabel}>Chantiers actifs</Text>
          </Pressable>
          <Pressable style={[styles.statCard, { borderLeftColor: '#27AE60', width: '48%' as any }]} onPress={() => router.push('/(tabs)/equipe' as any)}>
            <Text style={[styles.statValue, { color: '#27AE60' }]}>{stats.employesTotal}</Text>
            <Text style={styles.statLabel}>Employés</Text>
          </Pressable>
          <Pressable style={[styles.statCard, { borderLeftColor: '#F59E0B', width: '48%' as any }]} onPress={() => router.push('/(tabs)/planning' as any)}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.employesAujourdhui}/{stats.employesTotal}</Text>
            <Text style={styles.statLabel}>Affectés aujourd'hui</Text>
          </Pressable>
          <Pressable style={[styles.statCard, { borderLeftColor: '#00BCD4', width: '48%' as any }]} onPress={() => router.push('/(tabs)/reporting' as any)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={[styles.statValue, { color: '#00BCD4' }]}>{stats.nbArrivees} / {stats.nbDeparts}</Text>
                <Text style={styles.statLabel}>Arrivées / Départs</Text>
              </View>
              <Pressable
                style={{ backgroundColor: '#2C2C2C', borderRadius: 8, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => router.push('/(tabs)/planning' as any)}
              >
                <Text style={{ fontSize: 16 }}>✏️</Text>
              </Pressable>
            </View>
          </Pressable>
        </View>

        {/* Récap semaine */}
        <Text style={styles.sectionTitle}>Résumé de la semaine</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={[styles.statCard, { flex: 1, alignItems: 'center', paddingVertical: 10 }]}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#2C2C2C' }}>{recapHebdo.totalHeures}h</Text>
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

        {/* Rentabilité par chantier */}
        {(() => {
          const chantiersActifs = data.chantiers.filter(c => c.statut !== 'termine');
          const rentaCards = chantiersActifs.map(c => {
            const recettes =
              (data.marchesChantier || []).filter(m => m.chantierId === c.id).reduce((s, m) => s + (m.montantTTC || 0), 0) +
              (data.supplementsMarche || []).filter(s => s.chantierId === c.id && s.statut === 'accepte').reduce((s, m) => s + (m.montantTTC || 0), 0);
            const depenses = (data.depenses || data.depensesChantier || []).filter((d: any) => d.chantierId === c.id).reduce((s: number, d: any) => s + (d.montant || 0), 0);
            if (recettes === 0 && depenses === 0) return null;
            const marge = recettes - depenses;
            const budget = (data.budgetsChantier || {} as Record<string, number>)[c.id];
            const pctConsomme = budget && budget > 0 ? Math.min((depenses / budget) * 100, 100) : null;
            return { chantier: c, recettes, depenses, marge, budget, pctConsomme };
          }).filter(Boolean) as { chantier: typeof data.chantiers[0]; recettes: number; depenses: number; marge: number; budget: number | undefined; pctConsomme: number | null }[];

          if (rentaCards.length === 0) return null;

          const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';

          return (
            <>
              <Text style={styles.sectionTitle}>💰 Rentabilité par chantier</Text>
              {rentaCards.map((item, idx) => {
                const margeColor = item.marge >= 0 ? '#27AE60' : '#E74C3C';
                return (
                  <FadeInView key={item.chantier.id} delay={idx * 80}>
                    <View style={[styles.statCard, { borderLeftWidth: 4, borderLeftColor: item.chantier.couleur || '#2C2C2C', marginBottom: 6 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.chantier.couleur || '#2C2C2C' }} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#11181C', flex: 1 }} numberOfLines={1}>{item.chantier.nom}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, color: '#687076' }}>Recettes</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#27AE60' }}>{fmt(item.recettes)}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 10, color: '#687076' }}>Dépenses</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#E74C3C' }}>{fmt(item.depenses)}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 10, color: '#687076' }}>Marge</Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: margeColor }}>{fmt(item.marge)}</Text>
                        </View>
                      </View>
                      {item.pctConsomme !== null && (
                        <View style={{ marginTop: 4 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={{ fontSize: 10, color: '#687076' }}>Budget consommé</Text>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: item.pctConsomme > 90 ? '#E74C3C' : item.pctConsomme > 70 ? '#F59E0B' : '#27AE60' }}>{item.pctConsomme.toFixed(0)}%</Text>
                          </View>
                          <ProgressBar progress={item.pctConsomme / 100} color={item.pctConsomme > 90 ? '#E74C3C' : item.pctConsomme > 70 ? '#F59E0B' : '#27AE60'} />
                        </View>
                      )}
                    </View>
                  </FadeInView>
                );
              })}
            </>
          );
        })()}

        {/* CA mensuel */}
        {(() => {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const prevMonth = now.getMonth() === 0
            ? `${now.getFullYear() - 1}-12`
            : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

          const caMonth = (data.marchesChantier || []).reduce((total, m) =>
            total + m.paiements.filter(p => p.date.startsWith(currentMonth)).reduce((s, p) => s + p.montant, 0), 0)
            + (data.supplementsMarche || []).filter(s => s.statut === 'accepte').reduce((total, s) =>
            total + (s.paiements || []).filter(p => p.date.startsWith(currentMonth)).reduce((sum, p) => sum + p.montant, 0), 0);

          const caPrev = (data.marchesChantier || []).reduce((total, m) =>
            total + m.paiements.filter(p => p.date.startsWith(prevMonth)).reduce((s, p) => s + p.montant, 0), 0)
            + (data.supplementsMarche || []).filter(s => s.statut === 'accepte').reduce((total, s) =>
            total + (s.paiements || []).filter(p => p.date.startsWith(prevMonth)).reduce((sum, p) => sum + p.montant, 0), 0);

          const isUp = caMonth >= caPrev;
          const fmtCA = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';

          return (
            <FadeInView delay={100}>
              <Text style={styles.sectionTitle}>📊 Chiffre d'affaires</Text>
              <View style={[styles.statCard, { borderWidth: 1.5, borderColor: '#C9A96E', marginBottom: 8 }]}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#11181C' }}>{fmtCA(caMonth)} <Text style={{ fontSize: 13, fontWeight: '500', color: '#687076' }}>ce mois</Text></Text>
                <Text style={{ fontSize: 12, color: '#687076', marginTop: 2 }}>vs {fmtCA(caPrev)} le mois dernier</Text>
                {(caMonth > 0 || caPrev > 0) && (
                  <View style={{ marginTop: 8, height: 8, backgroundColor: '#F0EBE3', borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${caPrev > 0 ? Math.min((caMonth / caPrev) * 100, 100) : (caMonth > 0 ? 100 : 0)}%`, backgroundColor: isUp ? '#27AE60' : '#E74C3C', borderRadius: 4 }} />
                  </View>
                )}
              </View>
            </FadeInView>
          );
        })()}

        {/* Alertes (messages + RH, sans matériel qui est déjà en haut) */}
        {(stats.msgsNonLus > 0 || stats.demandesRH > 0) && (
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
            </View>
          </>
        )}

        {/* Export rapide */}
        {/* Export + Import */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          <Pressable
            style={[styles.statCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderLeftWidth: 4, borderLeftColor: '#2C2C2C' }]}
            onPress={() => router.push('/(tabs)/reporting' as any)}
          >
            <Text style={{ fontSize: 16 }}>📄</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2C' }}>Export rapport</Text>
          </Pressable>
          <Pressable
            style={[styles.statCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderLeftWidth: 4, borderLeftColor: '#27AE60' }]}
            onPress={() => setShowImport(true)}
          >
            <Text style={{ fontSize: 16 }}>📥</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#27AE60' }}>Import Excel</Text>
          </Pressable>
        </View>

        {/* Toutes les notes du jour */}
        {(() => {
          const allNotesJour = data.affectations.filter(a => a.dateDebut <= today && a.dateFin >= today)
            .flatMap(a => (a.notes || []).filter(n => (n.date === today || !n.date) && (n.texte?.trim() || (n.tasks && n.tasks.length > 0)))
              .map(n => ({ ...n, chantierNom: data.chantiers.find(c => c.id === a.chantierId)?.nom || '', employeNom: data.employes.find(e => e.id === a.employeId)?.prenom || a.employeId })));
          if (allNotesJour.length === 0) return null;
          return (
            <>
              <Text style={styles.sectionTitle}>📝 Notes du jour ({allNotesJour.length})</Text>
              {allNotesJour.map(n => (
                <View key={n.id} style={[styles.statCard, { borderLeftWidth: 3, borderLeftColor: n.savTicketId ? '#E74C3C' : '#687076' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#2C2C2C' }}>{n.chantierNom}</Text>
                    <Text style={{ fontSize: 10, color: '#687076' }}>→ {n.employeNom}</Text>
                    <Text style={{ fontSize: 10, color: '#B0BEC5' }}>par {n.auteurNom}</Text>
                  </View>
                  {n.texte ? <Text style={{ fontSize: 12, color: '#11181C' }} numberOfLines={2}>{n.texte}</Text> : null}
                  {n.tasks && n.tasks.length > 0 && (
                    <Text style={{ fontSize: 10, color: '#687076', marginTop: 2 }}>
                      ✓ {n.tasks.filter((t: any) => t.fait).length}/{n.tasks.length} tâches
                    </Text>
                  )}
                </View>
              ))}
            </>
          );
        })()}

        {/* Activité récente — tout en bas */}
        {activiteRecente.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#11181C' }}>Activité récente</Text>
              <Pressable onPress={() => setShowHistorique(true)}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C' }}>Voir tout →</Text>
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
                <Pressable onPress={() => setShowHistorique(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EDE3', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, color: '#687076', fontWeight: '700' }}>✕</Text>
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {(data.activityLog || []).slice().reverse().map(log => {
                  const d = new Date(log.timestamp);
                  const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                  const heureStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  // Si l'admin est l'auteur : afficher qui a lu
                  const isMyEntry = isAdmin && log.userId === 'admin';
                  const lectures = log.lecturesPar || [];
                  return (
                    <View key={log.id} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F5EDE3', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2C2C2C', marginTop: 5 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#11181C' }}>{log.description}</Text>
                        <Text style={{ fontSize: 11, color: '#687076', marginTop: 2 }}>
                          {log.userName} — {dateStr} {heureStr}
                        </Text>
                        {isMyEntry && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {lectures.length === 0 ? (
                              <Text style={{ fontSize: 10, color: '#B0BEC5', fontStyle: 'italic' }}>👁 Pas encore lu</Text>
                            ) : (
                              lectures.map(l => {
                                const emp = data.employes.find(e => e.id === l.userId);
                                const nom = emp ? emp.prenom : l.userId;
                                const lDate = new Date(l.lu);
                                return (
                                  <View key={l.userId} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#D4EDDA', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 10, color: '#155724', fontWeight: '600' }}>✓ {nom} {lDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {lDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                                  </View>
                                );
                              })
                            )}
                          </View>
                        )}
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
      <Onboarding
        visible={showOnboarding}
        role={(currentUser?.role === 'apporteur' ? 'employe' : currentUser?.role) || 'employe'}
        onComplete={() => {
          setShowOnboarding(false);
          AsyncStorage.setItem(onboardingKey, 'true');
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },
  date: { fontSize: 14, color: '#8C8077', marginTop: 4, textTransform: 'capitalize', fontWeight: '400' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginTop: 24, marginBottom: 10, letterSpacing: -0.2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    marginBottom: 6,
  },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: '#8C8077', marginTop: 4, fontWeight: '500' },
  alertsContainer: { gap: 8 },
  alertCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A', gap: 10,
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1,
  },
  alertIcon: { fontSize: 20 },
  alertText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#92400E' },
  alertArrow: { fontSize: 16, color: '#D97706' },
  activityContainer: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10,
    shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A96E', marginTop: 5 },
  activityContent: { flex: 1 },
  activityDesc: { fontSize: 13, color: '#1A1A1A', lineHeight: 18, fontWeight: '400' },
  activityMeta: { fontSize: 11, color: '#B0A89E', marginTop: 2, fontWeight: '400' },
  shortcutsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '48%' as any,
    alignItems: 'center',
    shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  shortcutIcon: { fontSize: 28, marginBottom: 6 },
  shortcutLabel: { fontSize: 13, fontWeight: '600', color: '#2C2C2C' },
});
