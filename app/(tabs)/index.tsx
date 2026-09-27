import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal, Platform, Alert, Linking, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, CircleCheck, Navigation, Check, Camera, Search, ChevronRight, ChevronDown, X, ShoppingCart, ClipboardList, Phone, MapPin, Pencil } from 'lucide-react-native';
import { DS, screenTitle, radius, shadows } from '@/constants/design';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { ScreenContainer } from '@/components/screen-container';
import { ItineraireSheet } from '@/components/ui/ItineraireSheet';
import { ouvrirPosition } from '@/lib/ouvrirCarte';
import { LanguageFlag } from '@/components/LanguageFlag';
import { ImportExcel } from '@/components/ImportExcel';
import { GlobalSearch } from '@/components/GlobalSearch';
import { FadeInView, ScaleButton, StaggeredList, ProgressBar } from '@/components/ui/animated';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { toast } from 'sonner-native';
import { uploadFileToStorage } from '@/lib/supabase';
import { InboxPickerButton } from '@/components/share/InboxPickerButton';
import { getInboxItemPath } from '@/lib/share/inboxStore';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { todayYMD } from '@/lib/date/today';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useRefresh } from '@/hooks/useRefresh';
import { useNotifications } from '@/hooks/useNotifications';
import { Onboarding } from '@/components/Onboarding';
import { DashboardKPI } from '@/components/DashboardKPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDateFR } from '@/lib/date/format';
import { Ico } from '@/components/ui/Ico';

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardScreen() {
  const { data, currentUser, isHydrated, logout, toggleTask, addTaskPhoto, removeTaskPhoto, addRetardPlanifie, updateTicketSAV, upsertNote, updateEmploye, updateApporteur } = useApp();
  const { t, language } = useLanguage();
  const dateLocale = ({ fr: 'fr-FR', en: 'en-GB', es: 'es-ES', pt: 'pt-PT', ru: 'ru-RU', ar: 'ar-EG' } as const)[language] || 'fr-FR';
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
    // Apporteur (client, architecte, contractant, apporteur d'affaires)
    if (currentUser.role === 'apporteur' && currentUser.apporteurId) {
      const ap = (data.apporteurs || []).find(a => a.id === currentUser.apporteurId);
      if (ap && ap.pushToken !== pushToken) {
        updateApporteur({ ...ap, pushToken });
      }
    }
  }, [pushToken, currentUser?.employeId, currentUser?.apporteurId, currentUser?.role]);

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

  const stats = useMemo(() => {
    const chantiersActifs = data.chantiers.filter(c => c.statut === 'actif' && c.categorie !== 'lieuFixe').length;
    const employesTotal = data.employes.length;
    const employesAujourdhui = new Set(
      data.affectations.filter(a => a.dateDebut <= today && a.dateFin >= today).map(a => a.employeId)
    ).size;

    const pointagesAujourdhui = data.pointages.filter(p => p.date === today);
    const nbArrivees = pointagesAujourdhui.filter(p => p.type === 'debut').length;
    const nbDeparts = pointagesAujourdhui.filter(p => p.type === 'fin').length;

    // Messagerie désactivée côté UI (data layer intact). Forcer 0 pour masquer alertes.
    const msgsNonLus = 0;

    const demandesRH = (
      (data.demandesConge || []).filter(d => d.statut === 'en_attente').length +
      (data.arretsMaladie || []).filter(d => d.statut === 'en_attente').length +
      (data.demandesAvance || []).filter(d => d.statut === 'en_attente').length
    );

    const chantiersActifsIds = new Set(data.chantiers.filter(c => c.statut !== 'termine' && c.statut !== 'archive').map(c => c.id));
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

  type NoteJour = {
    texte: string; chantierNom: string; chantierId: string; auteurNom: string;
    savTicketId?: string; photos?: string[]; tasks?: any[];
    affectationId: string; noteId: string; archivee: boolean; note: any;
  };

  const myNotesJour = useMemo(() => {
    if (!myId) return [] as NoteJour[];
    const result: NoteJour[] = [];
    data.affectations
      .filter(a => a.employeId === myId && a.dateDebut <= today && a.dateFin >= today)
      .forEach(a => {
        const ch = data.chantiers.find(c => c.id === a.chantierId);
        (a.notes || []).filter(n => {
          if (!(n.date === today || !n.date)) return false;
          const hasTexte = !!n.texte?.trim();
          const hasTasks = !!(n.tasks && n.tasks.length > 0);
          return hasTexte || hasTasks;
        }).forEach(n => {
          const tachesToutesFaites = !!(n.tasks && n.tasks.length > 0) && (n.tasks || []).every(t => t.fait);
          result.push({
            texte: n.texte, chantierNom: ch?.nom || '', auteurNom: n.auteurNom,
            savTicketId: n.savTicketId, photos: n.photos, tasks: n.tasks,
            affectationId: a.id, noteId: n.id,
            chantierId: a.chantierId,
            // Archivée = rangée à la main, ou toutes les tâches cochées.
            archivee: !!n.archiveeAt || tachesToutesFaites,
            note: n,
          });
        });
      });
    return result;
  }, [data.affectations, data.chantiers, myId, today]);

  const notesJourActives = useMemo(() => myNotesJour.filter(n => !n.archivee), [myNotesJour]);
  const notesJourArchivees = useMemo(() => myNotesJour.filter(n => n.archivee), [myNotesJour]);
  const [notesArchiveesOuvertes, setNotesArchiveesOuvertes] = useState(false);

  // RH (employé avec accès RH) : voit les notes du jour de toute l'équipe, en lecture.
  const estRH = !isAdmin && !!myId && data.employes.find(e => e.id === myId)?.isRH === true;
  const [notesEquipeOuvertes, setNotesEquipeOuvertes] = useState(false);
  const notesEquipeJour = useMemo(() => {
    if (!estRH) return [];
    return data.affectations
      .filter(a => a.employeId !== myId && a.dateDebut <= today && a.dateFin >= today)
      .flatMap(a => (a.notes || [])
        .filter(n => (n.date === today || !n.date) && (!!n.texte?.trim() || !!(n.tasks && n.tasks.length > 0)))
        .map(n => ({
          ...n,
          rangee: !!n.archiveeAt || (!!(n.tasks && n.tasks.length > 0) && (n.tasks || []).every(t => t.fait)),
          chantierNom: data.chantiers.find(c => c.id === a.chantierId)?.nom || '',
          employeNom: data.employes.find(e => e.id === a.employeId)?.prenom || a.employeId,
        })));
  }, [estRH, data.affectations, data.chantiers, data.employes, myId, today]);

  /** Range (ou sort) une consigne des archives, sans jamais la supprimer. */
  const basculerArchiveNote = (noteJour: { affectationId: string; noteId: string }, archiver: boolean) => {
    const aff = data.affectations.find(a => a.id === noteJour.affectationId);
    const existante = aff?.notes.find(n => n.id === noteJour.noteId);
    if (!aff || !existante) return;
    upsertNote({
      chantierId: aff.chantierId,
      employeId: aff.employeId,
      date: existante.date || today,
      note: {
        ...existante,
        archiveeAt: archiver ? new Date().toISOString() : undefined,
        archiveePar: archiver ? (currentUser?.nom || undefined) : undefined,
        updatedAt: new Date().toISOString(),
      },
    });
  };

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
  const [showAlertes, setShowAlertes] = useState(false);
  // Dashboard admin : reporting financier détaillé replié par défaut (allègement du scroll).
  const [showFinancesDetail, setShowFinancesDetail] = useState(false);
  const [showOutils, setShowOutils] = useState(false);
  const [notesRangeesOuvertes, setNotesRangeesOuvertes] = useState(false);
  const [chantierPointageOuvert, setChantierPointageOuvert] = useState<string | null>(null);
  // Recherche globale (modal dédié GlobalSearch)
  const [searchOpen, setSearchOpen] = useState(false);
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

  // Itinéraire : la fenêtre de choix (Waze, Plans, transports) est ItineraireSheet.
  const [itineraireAdresse, setItineraireAdresse] = useState<string | null>(null);

  if (isHydrated && !currentUser) return null;
  if (isHydrated && isST) return null;

  if (isEmploye && currentUser) {
    const emp = data.employes.find(e => e.id === myId);
    if (!emp) return null;
    // Messagerie désactivée côté UI (data layer intact). Forcer 0 pour masquer carte.
    const nbMsgsNonLus = 0;
    const mesSavTickets = (data.ticketsSAV || []).filter(t => t.assigneA === myId && t.statut !== 'clos');
    return (
      <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#5C1F2E']} tintColor="#5C1F2E" />}>
          {/* En-tête : date + salutation (langue et déconnexion sont dans l'écran Plus) */}
          <View style={{ marginTop: 8, marginBottom: 14 }}>
            <Text style={{ fontSize: 14, color: DS.textSecondary, textTransform: 'capitalize' }}>
              {new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <Text style={screenTitle}>{t.home.hello} {emp?.prenom || ''}</Text>
          </View>

          {/* Pointage du jour : arrivée + départ du chantier (l'écran Horaires complet est dans Plus).
              Masqué pour un employé dispensé de pointage (doitPointer === false). */}
          {data.employes.find(e => e.id === myId)?.doitPointer !== false && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {([
              { cle: 'debut', label: t.pointage.arrival, heure: myPointagesDuJour.debut, actif: !myPointagesDuJour.debut },
              { cle: 'fin', label: t.pointage.departure, heure: myPointagesDuJour.fin, actif: !!myPointagesDuJour.debut && !myPointagesDuJour.fin },
            ] as const).map(p => (
              <Pressable
                key={p.cle}
                accessibilityRole="button"
                accessibilityLabel={`${p.label} : ${p.heure || t.home.tapToClock}`}
                onPress={() => router.push('/(tabs)/pointage' as any)}
                style={{ flex: 1, borderRadius: 24, padding: 16, gap: 6, backgroundColor: p.heure ? '#D4EDDA' : p.actif ? DS.primary : DS.surface, ...(p.heure || p.actif ? {} : shadows.sm) }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {p.heure
                    ? <CircleCheck size={18} color="#155724" strokeWidth={2} />
                    : <Clock size={18} color={p.actif ? '#fff' : DS.textSecondary} strokeWidth={2} />}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: p.heure ? '#155724' : p.actif ? 'rgba(255,255,255,0.85)' : DS.textSecondary }}>{p.label}</Text>
                </View>
                <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 26, color: p.heure ? '#155724' : p.actif ? '#fff' : DS.textMuted }}>
                  {p.heure || '—:—'}
                </Text>
                <Text style={{ fontSize: 12, color: p.heure ? '#1E7A3C' : p.actif ? 'rgba(255,255,255,0.8)' : DS.textSecondary }}>
                  {p.heure ? t.home.clockOk : p.actif ? t.home.tapToClock : ' '}
                </Text>
              </Pressable>
            ))}
          </View>
          )}

          {/* Bouton "Je suis en retard" */}
          {!myPointagesDuJour.debut && myChantiers.length > 0 && (
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DS.surface, minHeight: 46, borderRadius: 999, borderWidth: 1, borderColor: DS.border, marginBottom: 8 }}
              onPress={() => {
                const motifs = [t.home.lateReasonTraffic, t.home.lateReasonVehicle, t.home.lateReasonMedical, t.home.lateReasonPersonal, t.home.lateReasonOther];
                const signaler = (motif: string) => {
                  addRetardPlanifie({ id: `ret_${Date.now()}_${Math.random().toString(36).slice(2)}`, employeId: myId || '', date: today, heureArrivee: '', motif, createdAt: new Date().toISOString() });
                  toast.success(t.home.lateReported);
                };
                if (Platform.OS === 'web') {
                  const choix = window.prompt(t.home.lateReasonPrompt + '\n' + motifs.map((m, i) => `${i + 1}. ${m}`).join('\n'), '1');
                  signaler(motifs[parseInt(choix || '1') - 1] || motifs[0]);
                } else {
                  Alert.alert(t.home.imLate, t.home.selectReason, motifs.map(m => ({ text: m, onPress: () => signaler(m) })));
                }
              }}>
              <Clock size={17} color={DS.primary} strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.primary }}>{t.home.imLate}</Text>
            </Pressable>
          )}

          {/* Notes du jour */}
          {myNotesJour.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{t.ui.consignesDuJour} ({notesJourActives.length})</Text>
              {notesJourActives.length === 0 && (
                <Text style={{ fontSize: 13.5, color: DS.textSecondary, paddingHorizontal: 6, marginBottom: 6 }}>
                  {t.ui.toutesConsignesFaites}
                </Text>
              )}
              {notesJourActives.map((note, i) => {
                const empName = emp?.prenom || '';
                return (
                <View key={i} style={[styles.statCard, {}]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {note.savTicketId && <Ico e="🔧" size={14} />}
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#5C1F2E' }}>{note.chantierNom}</Text>
                    <Text style={{ fontSize: 10, color: '#9A8C80' }}>par {note.auteurNom}</Text>
                  </View>
                  {note.texte ? <Text style={{ fontSize: 13, color: '#2B1D14', lineHeight: 18 }}>{note.texte}</Text> : null}

                  {/* Tâches cochables avec bouton photo */}
                  {note.tasks && note.tasks.length > 0 && (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {note.tasks.map((task: any) => (
                        <View key={task.id}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                            <Pressable onPress={() => toggleTask(note.affectationId, note.noteId, task.id, empName)}
                              style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: task.fait ? '#27AE60' : '#5C1F2E', backgroundColor: task.fait ? '#D4EDDA' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                              {task.fait && <Text style={{ color: '#27AE60', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                            </Pressable>
                            <Text style={{ fontSize: 13, color: task.fait ? '#9A8C80' : '#2B1D14', textDecorationLine: task.fait ? 'line-through' : 'none', flex: 1 }}>{task.texte}</Text>
                            {task.fait && task.faitPar && <Text style={{ fontSize: 9, color: '#27AE60', marginRight: 4 }}>{task.faitPar}</Text>}
                            <Pressable style={{ padding: 2 }} onPress={async () => {
                              const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true, compressImages: true });
                              for (const file of files) {
                                const url = await uploadFileToStorage(file.uri, 'tasks/photos', `task_${task.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
                                if (url) addTaskPhoto(note.affectationId, note.noteId, task.id, url);
                              }
                            }}><Ico e="📷" size={20} /></Pressable>
                            <InboxPickerButton
                              label="📥"
                              buttonStyle={{ padding: 2, paddingHorizontal: 4, backgroundColor: 'transparent', borderWidth: 0 }}
                              mimeFilter={(m) => m.startsWith('image/') || m === 'application/pdf'}
                              onPick={async (item) => {
                                const fileURI = getInboxItemPath(item);
                                if (!fileURI) return false;
                                const url = await uploadFileToStorage(fileURI, 'tasks/photos', `task_inbox_${task.id}_${item.id}`);
                                if (!url) return false;
                                addTaskPhoto(note.affectationId, note.noteId, task.id, url);
                                return true;
                              }}
                            />
                          </View>
                          {task.photos && task.photos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 28, marginBottom: 4 }} contentContainerStyle={{ gap: 3 }}>
                              {task.photos.map((uri: string, pi: number) => {
                                const isPdf = uri.startsWith('data:application/pdf') || uri.toLowerCase().endsWith('.pdf');
                                return (
                                  <View key={pi} style={{ marginRight: 3 }}>
                                    <Pressable
                                      onPress={() => openDocPreview(uri)}
                                      accessibilityRole="button"
                                      accessibilityLabel={isPdf ? t.home.openPdf : t.home.openPhoto}
                                    >
                                      {isPdf ? (
                                        <View style={{ width: 44, height: 44, borderRadius: 4, backgroundColor: '#F1E7DC', alignItems: 'center', justifyContent: 'center' }}>
                                          <Ico e="📄" size={18} />
                                        </View>
                                      ) : (
                                        <Image source={{ uri }} style={{ width: 44, height: 44, borderRadius: 4 }} resizeMode="cover" />
                                      )}
                                    </Pressable>
                                    <Pressable
                                      onPress={() => {
                                        const doDelete = () => removeTaskPhoto(note.affectationId, note.noteId, task.id, uri);
                                        if (Platform.OS === 'web') {
                                          if (typeof window !== 'undefined' && window.confirm && window.confirm(t.home.deletePhotoTitle)) doDelete();
                                        } else {
                                          Alert.alert(t.home.deletePhotoTitle, t.home.irreversible, [
                                            { text: t.common.cancel, style: 'cancel' },
                                            { text: t.common.delete, style: 'destructive', onPress: doDelete },
                                          ]);
                                        }
                                      }}
                                      style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: 7, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                                      accessibilityRole="button"
                                      accessibilityLabel={t.common.delete}
                                    >
                                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>✕</Text>
                                    </Pressable>
                                  </View>
                                );
                              })}
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
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: '#F2E4E1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' }}
                    onPress={async () => {
                      const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, multiple: false, compressImages: true });
                      if (!files || files.length === 0) return;
                      const url = await uploadFileToStorage(files[0].uri, 'notes/photos', `note_${note.noteId}_${Date.now()}`);
                      if (!url) return;
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
                    }}>
                    <Ico e="📷" size={14} />
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#5C1F2E' }}>{t.home.addPhoto}</Text>
                  </Pressable>

                  {/* Ranger la consigne : elle part aux archives, jamais à la poubelle */}
                  <Pressable
                    style={{ marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6 }}
                    onPress={() => basculerArchiveNote(note, true)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.textSecondary }}>{t.ui.rangerConsigne}</Text>
                  </Pressable>
                </View>
                );
              })}

              {/* Consignes rangées — dépliant, pour retrouver une note et y ajouter une photo oubliée */}
              {notesJourArchivees.length > 0 && (
                <View style={{ marginTop: 4 }}>
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: DS.segment, borderRadius: 999 }}
                    onPress={() => setNotesArchiveesOuvertes(v => !v)}
                  >
                    <Text style={{ fontSize: 13.5, fontWeight: '500', color: DS.text }}>
                      {t.ui.consignesRangees} ({notesJourArchivees.length})
                    </Text>
                    {notesArchiveesOuvertes
                      ? <ChevronDown size={16} color={DS.textSecondary} />
                      : <ChevronRight size={16} color={DS.textSecondary} />}
                  </Pressable>

                  {notesArchiveesOuvertes && notesJourArchivees.map((note, i) => (
                    <View key={`arch_${i}`} style={[styles.statCard, { marginTop: 8, opacity: 0.85 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#5C1F2E' }}>{note.chantierNom}</Text>
                        <Text style={{ fontSize: 12, color: '#9A8C80' }}>{t.ui.parAuteur} {note.auteurNom}</Text>
                      </View>
                      {note.texte ? <Text style={{ fontSize: 13.5, color: DS.text, lineHeight: 19 }}>{note.texte}</Text> : null}
                      {note.tasks && note.tasks.length > 0 && (
                        <View style={{ marginTop: 6, gap: 3 }}>
                          {note.tasks.map((task: any) => (
                            <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Check size={14} color={task.fait ? '#2E7D32' : '#B5A99E'} strokeWidth={2.4} />
                              <Text style={{ flex: 1, fontSize: 13, color: DS.textSecondary, textDecorationLine: task.fait ? 'line-through' : 'none' }}>
                                {task.texte}
                              </Text>
                              {task.photos && task.photos.length > 0 && (
                                <Text style={{ fontSize: 12, color: '#2E7D32' }}>{task.photos.length} 📷</Text>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                      <Pressable
                        style={{ marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6 }}
                        onPress={() => basculerArchiveNote(note, false)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: DS.primary }}>{t.ui.sortirDesArchives}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* RH : notes du jour de toute l'équipe (lecture) */}
          {estRH && notesEquipeJour.length > 0 && (
            <View style={{ marginTop: 4 }}>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: DS.segment, borderRadius: 999 }}
                onPress={() => setNotesEquipeOuvertes(v => !v)}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '500', color: DS.text }}>
                  {t.ui.notesEquipeJour} ({notesEquipeJour.length})
                </Text>
                {notesEquipeOuvertes
                  ? <ChevronDown size={16} color={DS.textSecondary} />
                  : <ChevronRight size={16} color={DS.textSecondary} />}
              </Pressable>
              {notesEquipeOuvertes && notesEquipeJour.map(n => (
                <View key={`eq_${n.id}`} style={[styles.statCard, { marginTop: 8 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: DS.primary }}>{n.chantierNom}</Text>
                    <Text style={{ fontSize: 12, color: DS.textSecondary }}>→ {n.employeNom}</Text>
                  </View>
                  {n.texte ? <Text style={{ fontSize: 13, color: DS.text }} numberOfLines={3}>{n.texte}</Text> : null}
                  {n.tasks && n.tasks.length > 0 && (
                    <Text style={{ fontSize: 12.5, color: n.rangee ? '#2E7D32' : DS.textSecondary, marginTop: 3 }}>
                      {n.tasks.filter((t: any) => t.fait).length}/{n.tasks.length} {t.ui.taches}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* SAV assignés */}
          {mesSavTickets.length > 0 && (
            <>
            <Text style={styles.sectionTitle}>SAV assignés ({mesSavTickets.length})</Text>
            <View style={{ marginBottom: 8 }}>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: savExpanded ? 12 : 12, borderBottomLeftRadius: savExpanded ? 0 : 12, borderBottomRightRadius: savExpanded ? 0 : 12, padding: 12, borderWidth: 1, borderColor: '#FECACA', gap: 10 }}
                onPress={() => { setSavExpanded(v => !v); setSavDetailId(null); }}
              >
                <Ico e="🔧" size={20} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#DC2626' }}>{t.home.seeDetail}</Text>
                <Text style={{ fontSize: 14, color: '#DC2626' }}>{savExpanded ? '▾' : '▸'}</Text>
              </Pressable>
              {savExpanded && (
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderTopWidth: 0, borderColor: '#FECACA', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, padding: 8 }}>
                  {mesSavTickets.map(ticket => {
                    const ch = data.chantiers.find(c => c.id === ticket.chantierId);
                    const isOpen = savDetailId === ticket.id;
                    const prioColors: Record<string, string> = { basse: '#27AE60', normale: '#5C1F2E', haute: '#F59E0B', urgente: '#E74C3C' };
                    const statutLabel = ticket.statut === 'ouvert' ? '🔴' : ticket.statut === 'en_cours' ? '🟡' : '🟢';
                    return (
                      <View key={ticket.id} style={{ borderBottomWidth: ticket.id !== mesSavTickets[mesSavTickets.length - 1].id ? 0.5 : 0, borderBottomColor: '#F1E7DC' }}>
                        <Pressable style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 8 }}
                          onPress={() => setSavDetailId(isOpen ? null : ticket.id)}>
                          <Ico e={statutLabel} size={12} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2B1D14' }} numberOfLines={1}>{ticket.objet}</Text>
                            <Text style={{ fontSize: 10, color: '#6E5F54' }}>{ch?.nom} · {ticket.priorite}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#9A8C80' }}>{isOpen ? '▾' : '▸'}</Text>
                        </Pressable>

                        {isOpen && (
                          <View style={{ paddingHorizontal: 4, paddingBottom: 10, gap: 6 }}>
                            {ticket.description && <Text style={{ fontSize: 12, color: '#2B1D14', lineHeight: 17 }}>{ticket.description}</Text>}
                            {ticket.photos && ticket.photos.length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                                {ticket.photos.map((uri, i) => <Image key={i} source={{ uri }} style={{ width: 60, height: 60, borderRadius: 6 }} resizeMode="cover" />)}
                              </ScrollView>
                            )}
                            {ticket.fichiers && ticket.fichiers.length > 0 && (
                              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                {ticket.fichiers.map((f, i) => <View key={i} style={{ backgroundColor: '#F2E4E1', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}><Text style={{ fontSize: 10, color: '#5C1F2E' }}>{f.nom}</Text></View>)}
                              </View>
                            )}
                            {/* Photos resolution */}
                            {ticket.photosResolution && ticket.photosResolution.length > 0 && (
                              <View style={{ backgroundColor: '#D4EDDA', borderRadius: 6, padding: 6 }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: '#155724', marginBottom: 4 }}>{t.home.resolutionPhotos}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                                  {ticket.photosResolution.map((uri, i) => <Image key={i} source={{ uri }} style={{ width: 50, height: 50, borderRadius: 4 }} resizeMode="cover" />)}
                                </ScrollView>
                              </View>
                            )}
                            {ticket.resoluPar && <Text style={{ fontSize: 10, color: '#27AE60', fontWeight: '600' }}>Résolu par {ticket.resoluPar} le {formatDateFR(ticket.dateResolution)}</Text>}
                            <Text style={{ fontSize: 9, color: '#9A8C80' }}>Ouvert le {formatDateFR(ticket.dateOuverture)}</Text>

                            {/* Actions employe */}
                            {ticket.statut !== 'resolu' && ticket.statut !== 'clos' && (
                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                <Pressable style={{ flex: 1, backgroundColor: '#D4EDDA', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                                  onPress={async () => {
                                    const userName = currentUser?.nom || emp?.prenom || t.home.employeeLabel;
                                    if (Platform.OS === 'web') {
                                      data.ticketsSAV && updateTicketSAV({ ...ticket, statut: 'resolu', dateResolution: todayYMD(), resoluPar: userName, updatedAt: new Date().toISOString() });
                                    } else {
                                      Alert.alert(t.home.resolveSavTitle, t.home.resolveSavMsg, [
                                        { text: 'Annuler', style: 'cancel' },
                                        { text: t.home.resolveWithoutPhoto, onPress: () => updateTicketSAV({ ...ticket, statut: 'resolu', dateResolution: todayYMD(), resoluPar: userName, updatedAt: new Date().toISOString() }) },
                                        { text: `${t.home.addPhoto}`, onPress: async () => {
                                          const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, multiple: false, compressImages: true });
                                          if (!files || files.length === 0) {
                                            updateTicketSAV({ ...ticket, statut: 'resolu', dateResolution: todayYMD(), resoluPar: userName, updatedAt: new Date().toISOString() });
                                            return;
                                          }
                                          const url = await uploadFileToStorage(files[0].uri, `chantiers/${ticket.chantierId}/sav-resolution`, `res_${ticket.id}_${Date.now()}`);
                                          updateTicketSAV({ ...ticket, statut: 'resolu', dateResolution: todayYMD(), resoluPar: userName, photosResolution: [...(ticket.photosResolution || []), ...(url ? [url] : [])], updatedAt: new Date().toISOString() });
                                        }},
                                      ]);
                                    }
                                  }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <Check size={13} color="#155724" strokeWidth={2.4} />
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#155724' }}>{t.home.markResolved}</Text>
                                  </View>
                                </Pressable>
                                <Pressable style={{ backgroundColor: '#F2E4E1', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' }}
                                  onPress={async () => {
                                    const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, multiple: false, compressImages: true });
                                    if (!files || files.length === 0) return;
                                    const url = await uploadFileToStorage(files[0].uri, `chantiers/${ticket.chantierId}/sav-resolution`, `cr_${ticket.id}_${Date.now()}`);
                                    if (url) updateTicketSAV({ ...ticket, photosResolution: [...(ticket.photosResolution || []), url], updatedAt: new Date().toISOString() });
                                  }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <Camera size={13} color="#5C1F2E" strokeWidth={2} />
                                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#5C1F2E' }}>{t.home.photo}</Text>
                                  </View>
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
          <Text style={styles.sectionTitle}>{t.home.myChantiersToday}</Text>
          {myChantiers.length === 0 && (
            <View style={styles.statCard}><Text style={{ color: '#6E5F54', textAlign: 'center' }}>{t.home.noChantierToday}</Text></View>
          )}
          {myChantiers.map(c => (
            <Pressable key={c.id} style={[styles.statCard, {}]}
              onPress={() => router.push('/(tabs)/planning' as any)}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2B1D14' }}>{c.nom}</Text>
              {c.adresse ? <Text style={{ fontSize: 12, color: '#6E5F54', marginTop: 2 }}>{c.adresse}</Text> : null}
              {c.fiche && (
                <View style={{ marginTop: 8, gap: 4 }}>
                  {c.fiche.codeAcces ? <Text style={{ fontSize: 12, color: '#5C1F2E' }}>Code : {c.fiche.codeAcces}</Text> : null}
                  {c.fiche.emplacementCle ? <Text style={{ fontSize: 12, color: '#5C1F2E' }}>Clé : {c.fiche.emplacementCle}</Text> : null}
                  {c.fiche.codeAlarme ? <Text style={{ fontSize: 12, color: '#5C1F2E' }}>Alarme : {c.fiche.codeAlarme}</Text> : null}
                </View>
              )}
              {/* Boutons actions */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2E4E1', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                  onPress={() => { setGalerieChantierId(c.id); setGalerieVisible(true); }}
                >
                  <Ico e="📸" size={14} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#5C1F2E' }}>Photos ({(data.photosChantier || []).filter(p => p.chantierId === c.id).length})</Text>
                </Pressable>
                {c.adresse && (
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#5C1F2E', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                    onPress={() => setItineraireAdresse(c.adresse || '')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Navigation size={11} color="#fff" strokeWidth={2.2} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>{t.home.goThere}</Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </Pressable>
          ))}

          {/* Tâches en cours */}
          {myTasks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{t.home.myTasksToday} ({myTasks.length})</Text>
              <View style={styles.statCard}>
                {myTasks.map(({ task, affectationId, noteId }) => {
                  const empName = data.employes.find(e => e.id === myId)?.prenom || '';
                  return (
                    <Pressable key={task.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8, borderBottomWidth: 0.5, borderBottomColor: '#F1E7DC' }}
                      onPress={() => toggleTask(affectationId, noteId, task.id, empName)}>
                      <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#5C1F2E', alignItems: 'center', justifyContent: 'center' }}>
                        {task.fait && <Text style={{ color: '#5C1F2E', fontSize: 14, fontWeight: '700' }}>✓</Text>}
                      </View>
                      <Text style={{ fontSize: 14, color: '#2B1D14', flex: 1 }}>{task.texte}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Planning de la semaine */}
          <Text style={styles.sectionTitle}>{t.home.myWeekPlanning}</Text>
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
                <View key={d.dateStr} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F1E7DC', gap: 8 }}>
                  <View style={{ width: 32, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: d.isToday ? '800' : '600', color: d.isToday ? '#5C1F2E' : '#6E5F54' }}>{d.label}</Text>
                    <Text style={{ fontSize: 9, color: d.isToday ? '#5C1F2E' : '#9A8C80' }}>{d.dateStr.slice(8)}</Text>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {d.chantiers.length === 0 ? (
                      <Text style={{ fontSize: 11, color: '#9A8C80', fontStyle: 'italic' }}>—</Text>
                    ) : d.chantiers.map((name, i) => {
                      const ch = data.chantiers.find(c => c.nom === name);
                      return (
                        <View key={i} style={{ backgroundColor: (ch?.couleur || '#5C1F2E') + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: ch?.couleur || '#5C1F2E' }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#2B1D14' }}>{name}</Text>
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
                <Text style={styles.sectionTitle}>{t.home.myPendingRequests} ({total})</Text>
                <View style={styles.statCard}>
                  {mesConges.map(d => (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F1E7DC' }}>
                      <Ico e="🏖" size={16} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2B1D14' }}>Congé {formatDateFR(d.dateDebut)} → {formatDateFR(d.dateFin)}</Text>
                        <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '600' }}>{t.home.pending}</Text>
                      </View>
                    </View>
                  ))}
                  {mesAvances.map(d => (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F1E7DC' }}>
                      <Ico e="💰" size={16} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2B1D14' }}>Avance de {d.montant} €</Text>
                        <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '600' }}>{t.home.pending}</Text>
                      </View>
                    </View>
                  ))}
                  {mesMaladies.map(d => (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                      <Ico e="🏥" size={16} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2B1D14' }}>Arrêt maladie {formatDateFR(d.dateDebut)}</Text>
                        <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '600' }}>{t.home.pending}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}

          {/* Pense-bête par chantier */}
          <Text style={styles.sectionTitle}>{t.home.reminder}</Text>
          <View style={styles.statCard}>
            {/* Notes existantes */}
            {(emp?.penseBetes || []).map(pb => {
              const ch = pb.chantierId ? data.chantiers.find(c => c.id === pb.chantierId) : null;
              return (
                <View key={pb.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F1E7DC' }}>
                  {ch && <View style={{ backgroundColor: (ch.couleur || '#5C1F2E') + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 }}><Text style={{ fontSize: 9, fontWeight: '700', color: ch.couleur || '#5C1F2E' }}>{ch.nom}</Text></View>}
                  {!ch && <Text style={{ fontSize: 9, color: '#9A8C80', marginTop: 2 }}>{t.home.general}</Text>}
                  <Text style={{ fontSize: 13, color: '#2B1D14', flex: 1 }}>{pb.texte}</Text>
                  <Pressable onPress={() => {
                    if (!emp) return;
                    updateEmploye({ ...emp, penseBetes: (emp.penseBetes || []).filter(p => p.id !== pb.id) });
                  }}><Text style={{ fontSize: 11, color: '#E74C3C' }}>✕</Text></Pressable>
                </View>
              );
            })}
            {(emp?.penseBetes || []).length === 0 && <Text style={{ fontSize: 12, color: '#9A8C80', fontStyle: 'italic', marginBottom: 6 }}>{t.home.noNote}</Text>}

            {/* Formulaire ajout */}
            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#F1E7DC', paddingTop: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 4 }}>
                <Pressable style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: !penseBeteChantierId ? '#5C1F2E' : '#F1E7DC' }}
                  onPress={() => setPenseBeteChantierId(null)}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: !penseBeteChantierId ? '#fff' : '#6E5F54' }}>{t.home.general}</Text>
                </Pressable>
                {myTousChantiers.map(c => (
                  <Pressable key={c.id} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: penseBeteChantierId === c.id ? (c.couleur || '#5C1F2E') : '#F1E7DC' }}
                    onPress={() => setPenseBeteChantierId(c.id)}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: penseBeteChantierId === c.id ? '#fff' : '#6E5F54' }}>{c.nom}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#FAF5EF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#2B1D14', borderWidth: 1, borderColor: '#EDE2D6' }}
                  value={penseBeteText}
                  onChangeText={setPenseBeteText}
                  placeholder={t.home.reminderPlaceholder}
                  placeholderTextColor="#9A8C80"
                />
                <Pressable style={{ backgroundColor: '#5C1F2E', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', opacity: penseBeteText.trim() ? 1 : 0.5 }}
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
          role={(currentUser?.role === 'apporteur' || currentUser?.role === 'menuiserie' ? 'employe' : currentUser?.role) || 'employe'}
          onComplete={() => {
            setShowOnboarding(false);
            AsyncStorage.setItem(onboardingKey, 'true');
          }}
        />
        <ItineraireSheet adresse={itineraireAdresse} onClose={() => setItineraireAdresse(null)} />
    </ScreenContainer>
    );
  }

  if (!isAdmin) return null;

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* En-tête : date + salutation (langue et déconnexion sont dans l'écran Plus) */}
        <FadeInView duration={400}>
          <View style={{ marginTop: 2, marginBottom: 6 }}>
            <Text style={{ fontSize: 14, color: DS.textSecondary, textTransform: 'capitalize' }}>
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
        </FadeInView>

        {/* À traiter — ce qui attend une action de l'admin */}
        {(stats.demandesRH > 0 || stats.materielNonAchete > 0) && (
          <>
            <Text style={styles.sectionTitle}>À traiter</Text>
            <View style={styles.listCard}>
              {stats.demandesRH > 0 && (
                <Pressable style={styles.listRow} onPress={() => router.push('/(tabs)/rh' as any)}>
                  <View style={styles.listIcon}><ClipboardList size={18} color={DS.primary} strokeWidth={1.9} /></View>
                  <View style={[styles.listInner, stats.materielNonAchete > 0 && styles.listSeparator]}>
                    <Text style={styles.listTitle}>Demandes RH en attente</Text>
                    <View style={styles.countBadge}><Text style={styles.countBadgeText}>{stats.demandesRH}</Text></View>
                    <ChevronRight size={16} color={DS.textSecondary} />
                  </View>
                </Pressable>
              )}
              {stats.materielNonAchete > 0 && (
                <Pressable style={styles.listRow} onPress={() => router.push('/(tabs)/materiel' as any)}>
                  <View style={styles.listIcon}><ShoppingCart size={18} color={DS.primary} strokeWidth={1.9} /></View>
                  <View style={styles.listInner}>
                    <Text style={styles.listTitle}>{t.dash.itemsToBuyLabel.charAt(0).toUpperCase() + t.dash.itemsToBuyLabel.slice(1)}</Text>
                    <View style={styles.countBadge}><Text style={styles.countBadgeText}>{stats.materielNonAchete}</Text></View>
                    <ChevronRight size={16} color={DS.textSecondary} />
                  </View>
                </Pressable>
              )}
            </View>
          </>
        )}

        {/* Planning direction du jour */}
        {(() => {
          const rdvJour = (data.agendaEvents || []).filter(e => e.date === today).sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
          if (rdvJour.length === 0) return null;
          return (
            <>
              <Text style={styles.sectionTitle}>Agenda du jour ({rdvJour.length})</Text>
              {rdvJour.map(evt => {
                const ch = evt.chantierId ? data.chantiers.find(c => c.id === evt.chantierId) : null;
                return (
                  <Pressable key={evt.id} style={[styles.statCard, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
                    onPress={() => router.push('/(tabs)/planning' as any)}>
                    <View style={{ backgroundColor: (evt.couleur || '#5C1F2E') + '15', width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: evt.couleur || '#5C1F2E' }}>{evt.heureDebut}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#2B1D14' }}>{evt.titre}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {evt.heureFin ? <Text style={{ fontSize: 11, color: '#6E5F54' }}>{evt.heureDebut} → {evt.heureFin}</Text> : null}
                        {evt.lieu ? <Text style={{ fontSize: 11, color: '#6E5F54' }}>· {evt.lieu}</Text> : null}
                        {ch ? <Text style={{ fontSize: 11, color: ch.couleur, fontWeight: '600' }}>· {ch.nom}</Text> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </>
          );
        })()}

        {/* Aujourd'hui — synthèse + pointage par chantier */}
        <Text style={styles.sectionTitle}>Aujourd'hui</Text>
        <View style={styles.listCard}>
          <Pressable style={[styles.listRow, { minHeight: 60 }]} onPress={() => router.push('/(tabs)/planning' as any)}>
            <View style={[styles.listInner, styles.listSeparator, { paddingLeft: 2 }]}>
              <View style={{ flex: 1, flexDirection: 'row', paddingVertical: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bigNumber}>{stats.chantiersActifs}</Text>
                  <Text style={styles.statCaption} numberOfLines={1}>{t.dash.activeChantiers}</Text>
                </View>
                <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: DS.border, marginHorizontal: 14 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bigNumber}>{stats.employesAujourdhui}</Text>
                  <Text style={styles.statCaption} numberOfLines={1}>{t.dash.assignedPeople}</Text>
                </View>
              </View>
              <ChevronRight size={16} color={DS.primary} />
            </View>
          </Pressable>
          {data.chantiers.filter(c => c.statut === 'actif').map(c => {
            const nbAffectes = new Set(
              data.affectations.filter(a => a.chantierId === c.id && a.dateDebut <= today && a.dateFin >= today).map(a => a.employeId)
            ).size;
            if (nbAffectes === 0) return null;
            const nbPointes = data.pointages.filter(p =>
              p.date === today && p.type === 'debut' &&
              data.affectations.some(a => a.chantierId === c.id && a.employeId === p.employeId && a.dateDebut <= today && a.dateFin >= today)
            ).length;
            const color = nbPointes >= nbAffectes ? DS.success : nbPointes > 0 ? DS.warning : DS.error;
            const ouvert = chantierPointageOuvert === c.id;

            // Détail par personne : heure d'arrivée, de départ, écart et position
            const detail = Array.from(new Set(
              data.affectations
                .filter(a => a.chantierId === c.id && a.dateDebut <= today && a.dateFin >= today && !a.soustraitantId)
                .map(a => a.employeId)
            )).map(empId => {
              const employe = data.employes.find(e => e.id === empId);
              const pts = data.pointages.filter(p => p.employeId === empId && p.date === today);
              const debut = pts.find(p => p.type === 'debut');
              const fin = [...pts].reverse().find(p => p.type === 'fin');
              // Écart avec l'horaire théorique du jour, s'il est renseigné
              let ecartMin: number | null = null;
              const horaire = employe?.horaires?.[new Date(today + 'T12:00:00').getDay()];
              if (debut && horaire?.actif && horaire.debut) {
                const [hp, mp] = horaire.debut.split(':').map(Number);
                const [hr, mr] = debut.heure.split(':').map(Number);
                ecartMin = (hr * 60 + mr) - (hp * 60 + mp);
              }
              return { empId, employe, debut, fin, ecartMin };
            }).sort((x, y) => (x.employe?.prenom || '').localeCompare(y.employe?.prenom || '', 'fr'));

            return (
              <View key={c.id}>
                <Pressable style={styles.listRow} onPress={() => setChantierPointageOuvert(ouvert ? null : c.id)}>
                  <View style={[styles.listIcon, { backgroundColor: 'transparent' }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.couleur || DS.primary }} />
                  </View>
                  <View style={[styles.listInner, styles.listSeparator]}>
                    <Text style={styles.listTitle} numberOfLines={1}>{c.nom}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color }}>{nbPointes}/{nbAffectes} {t.dash.clocked}</Text>
                    {ouvert ? <ChevronDown size={16} color={DS.textSecondary} /> : <ChevronRight size={16} color={DS.textSecondary} />}
                  </View>
                </Pressable>

                {ouvert && (
                  <View style={{ paddingLeft: 42, paddingRight: 14, paddingBottom: 10, gap: 8 }}>
                    {detail.map(({ empId, employe, debut, fin, ecartMin }) => {
                      const aPointe = !!debut;
                      return (
                        <View key={empId} style={{ backgroundColor: DS.surfaceAlt, borderRadius: 14, padding: 12, gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: aPointe ? DS.success : DS.error }} />
                            <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: DS.text }} numberOfLines={1}>
                              {employe ? `${employe.prenom} ${employe.nom}` : empId}
                            </Text>
                            <Pressable
                              hitSlop={8}
                              onPress={() => router.push({ pathname: '/(tabs)/reporting', params: { editEmp: empId, editDate: today } })}
                              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' }}
                              accessibilityLabel={t.reporting.editPointage}
                            >
                              <Pencil size={14} color={DS.primary} strokeWidth={2} />
                            </Pressable>
                            {!aPointe && !!employe?.telephone && (
                              <Pressable
                                hitSlop={8}
                                onPress={() => Linking.openURL(`tel:${employe.telephone}`)}
                                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' }}
                                accessibilityLabel={`${t.ui.appeler} ${employe.prenom}`}
                              >
                                <Phone size={15} color={DS.primary} strokeWidth={2} />
                              </Pressable>
                            )}
                          </View>

                          <View style={{ flexDirection: 'row', gap: 16 }}>
                            <View>
                              <Text style={{ fontSize: 12, color: DS.textSecondary }}>{t.pointage.arrival}</Text>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: aPointe ? DS.text : DS.textMuted }}>
                                {debut ? debut.heure : '—'}
                              </Text>
                            </View>
                            <View>
                              <Text style={{ fontSize: 12, color: DS.textSecondary }}>{t.pointage.departure}</Text>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: fin ? DS.text : DS.textMuted }}>
                                {fin ? fin.heure : '—'}
                              </Text>
                            </View>
                            {ecartMin !== null && ecartMin > 5 && (
                              <View>
                                <Text style={{ fontSize: 12, color: DS.textSecondary }}>{t.pointage.late}</Text>
                                <Text style={{ fontSize: 15, fontWeight: '600', color: ecartMin > 15 ? DS.error : DS.warning }}>
                                  +{ecartMin} min
                                </Text>
                              </View>
                            )}
                          </View>

                          {(debut?.latitude != null || fin?.latitude != null) && (
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                              {debut?.latitude != null && (
                                <Pressable
                                  onPress={() => ouvrirPosition(debut.latitude, debut.longitude)}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: DS.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
                                >
                                  <MapPin size={13} color={DS.primary} strokeWidth={2} />
                                  <Text style={{ fontSize: 12.5, color: DS.primary, fontWeight: '600' }}>
                                    {t.ui.positionArrivee}
                                  </Text>
                                </Pressable>
                              )}
                              {fin?.latitude != null && (
                                <Pressable
                                  onPress={() => ouvrirPosition(fin.latitude, fin.longitude)}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: DS.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
                                >
                                  <MapPin size={13} color={DS.primary} strokeWidth={2} />
                                  <Text style={{ fontSize: 12.5, color: DS.primary, fontWeight: '600' }}>
                                    {t.ui.positionDepart}
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          )}

                          {!!debut?.adresse && (
                            <Text style={{ fontSize: 12.5, color: DS.textSecondary }} numberOfLines={1}>{debut.adresse}</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
          <Pressable style={styles.listRow} onPress={() => router.push('/(tabs)/reporting' as any)}>
            <View style={styles.listIcon}><Clock size={18} color={DS.primary} strokeWidth={1.9} /></View>
            <View style={styles.listInner}>
              <Text style={styles.listTitle}>{t.dash.delaysWeek}</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: recapHebdo.nbRetards > 0 ? DS.error : DS.success }}>{recapHebdo.nbRetards}</Text>
              <ChevronRight size={16} color={DS.textSecondary} />
            </View>
          </Pressable>
        </View>

        {/* Tableau de bord financier admin (CA signé / en cours / encaissé). */}
        {isAdmin && (
          <FadeInView delay={50} style={{ marginTop: 8 }}>
            <DashboardKPI />
          </FadeInView>
        )}

        {/* Reporting financier détaillé — repliable pour alléger le dashboard (Rentabilité + CA). */}
        <Pressable onPress={() => setShowFinancesDetail(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4, marginTop: 4 }}>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>{t.dash.financesDetail}</Text>
          <View style={styles.toggleChip}>{showFinancesDetail ? <ChevronDown size={16} color={DS.primary} /> : <ChevronRight size={16} color={DS.primary} />}</View>
        </Pressable>
        {showFinancesDetail && (<>
        {/* Rentabilité par chantier */}
        {(() => {
          const chantiersActifs = data.chantiers.filter(c => c.statut !== 'termine' && c.statut !== 'archive');
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
              <Text style={styles.sectionTitle}>{t.dash.profitabilityByChantier}</Text>
              {rentaCards.map((item, idx) => {
                const margeColor = item.marge >= 0 ? '#27AE60' : '#E74C3C';
                return (
                  <FadeInView key={item.chantier.id} delay={idx * 80}>
                    <View style={[styles.statCard, { marginBottom: 6 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.chantier.couleur || '#5C1F2E' }} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#2B1D14', flex: 1 }} numberOfLines={1}>{item.chantier.nom}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, color: '#6E5F54' }}>{t.dash.revenue}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#27AE60' }}>{fmt(item.recettes)}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 10, color: '#6E5F54' }}>{t.dash.expenses}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#E74C3C' }}>{fmt(item.depenses)}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 10, color: '#6E5F54' }}>{t.dash.margin}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: margeColor }}>{fmt(item.marge)}</Text>
                        </View>
                      </View>
                      {item.pctConsomme !== null && (
                        <View style={{ marginTop: 4 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={{ fontSize: 10, color: '#6E5F54' }}>{t.dash.budgetUsed}</Text>
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
              <Text style={styles.sectionTitle}>{t.dash.turnover}</Text>
              <View style={[styles.statCard, { borderWidth: 1.5, borderColor: '#5C1F2E', marginBottom: 8 }]}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#2B1D14' }}>{fmtCA(caMonth)} <Text style={{ fontSize: 13, fontWeight: '500', color: '#6E5F54' }}>{t.dash.thisMonth}</Text></Text>
                <Text style={{ fontSize: 12, color: '#6E5F54', marginTop: 2 }}>vs {fmtCA(caPrev)} le mois dernier</Text>
                {(caMonth > 0 || caPrev > 0) && (
                  <View style={{ marginTop: 8, height: 8, backgroundColor: '#F0EBE3', borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${caPrev > 0 ? Math.min((caMonth / caPrev) * 100, 100) : (caMonth > 0 ? 100 : 0)}%`, backgroundColor: isUp ? '#27AE60' : '#E74C3C', borderRadius: 4 }} />
                  </View>
                )}
              </View>
            </FadeInView>
          );
        })()}
        </>)}

        {/* Outils & historique — repliés par défaut pour alléger l'accueil */}
        <Pressable onPress={() => setShowOutils(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4, marginTop: 12 }}>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>{t.ui.outilsActivite}</Text>
          <View style={styles.toggleChip}>{showOutils ? <ChevronDown size={16} color={DS.primary} /> : <ChevronRight size={16} color={DS.primary} />}</View>
        </Pressable>
        {showOutils && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Pressable
            style={[styles.statCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
            onPress={() => router.push('/(tabs)/reporting' as any)}
          >
            <Ico e="📄" size={18} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#5C1F2E' }}>{t.dash.exportReport}</Text>
          </Pressable>
          <Pressable
            style={[styles.statCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
            onPress={() => setShowImport(true)}
          >
            <Ico e="📥" size={18} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#27AE60' }}>{t.dash.importExcel}</Text>
          </Pressable>
        </View>
        )}

        {/* Toutes les notes du jour */}
        {(() => {
          const toutes = data.affectations.filter(a => a.dateDebut <= today && a.dateFin >= today)
            .flatMap(a => (a.notes || []).filter(n => {
              if (!(n.date === today || !n.date)) return false;
              const hasTexte = !!n.texte?.trim();
              const hasTasks = !!(n.tasks && n.tasks.length > 0);
              return hasTexte || hasTasks;
            })
              .map(n => {
                const tachesToutesFaites = !!(n.tasks && n.tasks.length > 0) && (n.tasks || []).every(t => t.fait);
                return {
                  ...n,
                  rangee: !!n.archiveeAt || tachesToutesFaites,
                  chantierNom: data.chantiers.find(c => c.id === a.chantierId)?.nom || '',
                  employeNom: data.employes.find(e => e.id === a.employeId)?.prenom || a.employeId,
                };
              }));
          // En cours d'abord ; les consignes traitées restent consultables plus bas.
          const allNotesJour = toutes.filter(n => !n.rangee);
          const notesRangees = toutes.filter(n => n.rangee);
          if (toutes.length === 0) return null;
          return (
            <>
              <Text style={styles.sectionTitle}>{t.ui.notesDuJour} ({allNotesJour.length})</Text>
              {allNotesJour.length === 0 && (
                <Text style={{ fontSize: 13.5, color: DS.textSecondary, paddingHorizontal: 6, marginBottom: 6 }}>
                  {t.ui.toutesConsignesFaites}
                </Text>
              )}
              {allNotesJour.map(n => (
                <View key={n.id} style={[styles.statCard, {}]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#5C1F2E' }}>{n.chantierNom}</Text>
                    <Text style={{ fontSize: 10, color: '#6E5F54' }}>→ {n.employeNom}</Text>
                    <Text style={{ fontSize: 10, color: '#9A8C80' }}>par {n.auteurNom}</Text>
                  </View>
                  {n.texte ? <Text style={{ fontSize: 12, color: '#2B1D14' }} numberOfLines={2}>{n.texte}</Text> : null}
                  {n.tasks && n.tasks.length > 0 && (
                    <Text style={{ fontSize: 12.5, color: '#6E5F54', marginTop: 3 }}>
                      {n.tasks.filter((t: any) => t.fait).length}/{n.tasks.length} {t.ui.taches}
                    </Text>
                  )}
                </View>
              ))}

              {/* Consignes traitées — repliées, pour vérifier les photos après coup */}
              {notesRangees.length > 0 && (
                <View style={{ marginTop: 4 }}>
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: DS.segment, borderRadius: 999 }}
                    onPress={() => setNotesRangeesOuvertes(v => !v)}
                  >
                    <Text style={{ fontSize: 13.5, fontWeight: '500', color: DS.text }}>
                      {t.ui.consignesRangees} ({notesRangees.length})
                    </Text>
                    {notesRangeesOuvertes
                      ? <ChevronDown size={16} color={DS.textSecondary} />
                      : <ChevronRight size={16} color={DS.textSecondary} />}
                  </Pressable>
                  {notesRangeesOuvertes && notesRangees.map(n => (
                    <View key={`r_${n.id}`} style={[styles.statCard, { marginTop: 8, opacity: 0.85 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#5C1F2E' }}>{n.chantierNom}</Text>
                        <Text style={{ fontSize: 12, color: '#6E5F54' }}>→ {n.employeNom}</Text>
                      </View>
                      {n.texte ? <Text style={{ fontSize: 13, color: DS.text }} numberOfLines={2}>{n.texte}</Text> : null}
                      {n.tasks && n.tasks.length > 0 && (
                        <Text style={{ fontSize: 12.5, color: '#2E7D32', marginTop: 3 }}>
                          {n.tasks.filter((t: any) => t.fait).length}/{n.tasks.length} {t.ui.taches}
                          {(() => {
                            const nbPhotos = (n.tasks || []).reduce((acc: number, tk: any) => acc + (tk.photos?.length || 0), 0);
                            return nbPhotos > 0 ? ` · ${nbPhotos} 📷` : '';
                          })()}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          );
        })()}

        {/* Alertes système — rappels automatiques (en bas de page, demande Kev) */}
        <View style={{ height: 12 }} />
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

          // 1b. Pointages hors zone du jour (contrôle GPS silencieux — visible admin uniquement,
          // l'ouvrier n'est ni bloqué ni averti).
          data.pointages
            .filter(p => p.date === today && p.horsZone)
            .forEach(p => {
              const emp = data.employes.find(e => e.id === p.employeId);
              const ch = data.chantiers.find(c => c.id === p.chantierId);
              const label = p.type === 'debut' ? t.dash.arrivalLc : t.dash.departureLc;
              alertes.push({
                id: `horszone_${p.id}`,
                icon: '📍',
                text: `${emp?.prenom || t.home.employeeLabel} ${t.dash.clockedHis} ${label} ${t.dash.outOfZone}${p.distanceChantier ? ` (${p.distanceChantier} m)` : ''}${ch ? ` — ${ch.nom}` : ''}`,
                color: '#E67E22',
                onPress: () => router.push('/(tabs)/reporting' as any),
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
                // Raccourci "Encaisser" : ouvre directement le modal Marchés du chantier (au lieu de la liste).
                onPress: () => router.push({ pathname: '/(tabs)/chantiers', params: { action: 'marches', chantierId: m.chantierId } } as any),
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

          // 5. Chantiers en retard (actifs dont la date de fin est dépassée)
          data.chantiers.forEach(c => {
            if (c.statut !== 'actif' || !c.dateFin || c.dateFin >= today) return;
            const jRetard = Math.floor((todayDate.getTime() - new Date(c.dateFin).getTime()) / 86400000);
            alertes.push({
              id: `chretard_${c.id}_${c.dateFin}`,
              icon: '⏰',
              text: `${c.nom} : fin dépassée de ${jRetard}j`,
              color: '#E74C3C',
              onPress: () => router.push('/(tabs)/chantiers' as any),
            });
          });

          // 6. SAV ouverts non assignés
          (data.ticketsSAV || []).forEach(t => {
            if ((t.statut !== 'ouvert' && t.statut !== 'en_cours') || t.assigneA) return;
            const ch = data.chantiers.find(c => c.id === t.chantierId);
            alertes.push({
              id: `savna_${t.id}`,
              icon: '🔧',
              text: `SAV non assigné : ${t.objet}${ch ? ` — ${ch.nom}` : ''}`,
              color: '#E5A840',
              onPress: () => router.push('/(tabs)/chantiers' as any),
            });
          });

          // 7. Devis sous-traitant à signer (devis reçu mais pas encore signé)
          (data.devis || []).forEach(d => {
            if (!d.devisFichier || d.devisSigne) return;
            const st = data.sousTraitants.find(s => s.id === d.soustraitantId);
            const ch = data.chantiers.find(c => c.id === d.chantierId);
            alertes.push({
              id: `devsign_${d.id}`,
              icon: '✍️',
              text: `Devis à signer : ${st?.societe || st?.nom || 'ST'}${ch ? ` — ${ch.nom}` : ''} (${d.objet})`,
              color: '#6B8EBF',
              onPress: () => router.push('/(tabs)/financier-st' as any),
            });
          });

          // 8. Documents société expirant (<=30j) ou expirés
          (data.documentsSociete || []).forEach(doc => {
            if (!doc.dateExpiration) return;
            const jRestants = Math.floor((new Date(doc.dateExpiration).getTime() - todayDate.getTime()) / 86400000);
            if (jRestants < 0) {
              alertes.push({
                id: `docsoc_exp_${doc.id}`,
                icon: '🚨',
                text: `Société : ${doc.nom} EXPIRÉ`,
                color: '#E74C3C',
                onPress: () => router.push('/(tabs)/societe' as any),
              });
            } else if (jRestants <= 30) {
              alertes.push({
                id: `docsoc_${doc.id}`,
                icon: '📑',
                text: `Société : ${doc.nom} expire dans ${jRestants}j`,
                color: '#F59E0B',
                onPress: () => router.push('/(tabs)/societe' as any),
              });
            }
          });

          const visibleAlertes = alertes.filter(a => !dismissedAlertes.has(a.id));
          const hiddenCount = dismissedAlertes.size;
          // Si toutes les alertes sont masquées, on affiche quand même un petit bouton "restaurer"
          if (visibleAlertes.length === 0) {
            if (hiddenCount === 0) return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Pressable onPress={() => setDismissedAlertes(new Set())}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6E5F54' }}>{t.ui.alertesMasquees} ({hiddenCount})</Text>
                </Pressable>
              </View>
            );
          }
          return (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => setShowAlertes(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Text style={styles.sectionTitle}>{t.dash.alerts} ({visibleAlertes.length})</Text>
                  <View style={{ marginTop: 12 }}>{showAlertes ? <ChevronDown size={16} color={DS.textSecondary} /> : <ChevronRight size={16} color={DS.textSecondary} />}</View>
                </Pressable>
                {showAlertes && (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {hiddenCount > 0 && (
                      <Pressable onPress={() => setDismissedAlertes(new Set())}
                        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: '#6E5F54' }}>Afficher masquées ({hiddenCount})</Text>
                      </Pressable>
                    )}
                    {visibleAlertes.length > 1 && (
                      <Pressable onPress={() => setDismissedAlertes(new Set([...dismissedAlertes, ...visibleAlertes.map(a => a.id)]))}
                        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: '#6E5F54' }}>{t.dash.hideAll}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              {showAlertes && (
              <View style={[styles.listCard, { marginBottom: 8 }]}>
                {visibleAlertes.slice(0, 15).map((a, idx, arr) => (
                  <Pressable key={a.id} style={[styles.listRow, { minHeight: 56 }]} onPress={a.onPress}>
                    <View style={[styles.listIcon, { backgroundColor: a.color + '1A' }]}>
                      <Ico e={a.icon} size={16} color={a.color} />
                    </View>
                    <View style={[styles.listInner, idx < arr.length - 1 && styles.listSeparator, { paddingVertical: 10 }]}>
                      <Text style={{ fontSize: 14, lineHeight: 19, color: DS.text, flex: 1 }} numberOfLines={2}>{a.text}</Text>
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); setDismissedAlertes(new Set([...dismissedAlertes, a.id])); }}
                        hitSlop={10}
                        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: DS.segment, alignItems: 'center', justifyContent: 'center' }}>
                        <X size={13} color={DS.textSecondary} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </View>
              )}
            </>
          );
        })()}

        {/* Activité récente — tout en bas */}
        {showOutils && activiteRecente.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2B1D14' }}>{t.dash.recentActivity}</Text>
              <Pressable onPress={() => setShowHistorique(true)}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#5C1F2E' }}>{t.dash.seeAll}</Text>
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
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 20, fontFamily: 'Fraunces_600SemiBold', color: '#2B1D14' }}>{t.dash.fullHistory}</Text>
                <Pressable onPress={() => setShowHistorique(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1E7DC', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, color: '#6E5F54', fontWeight: '700' }}>✕</Text>
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
                    <View key={log.id} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F1E7DC', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#5C1F2E', marginTop: 5 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#2B1D14' }}>{log.description}</Text>
                        <Text style={{ fontSize: 11, color: '#6E5F54', marginTop: 2 }}>
                          {log.userName} — {dateStr} {heureStr}
                        </Text>
                        {isMyEntry && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {lectures.length === 0 ? (
                              <Text style={{ fontSize: 10, color: '#9A8C80', fontStyle: 'italic' }}>{t.dash.notReadYet}</Text>
                            ) : (
                              lectures.map(l => {
                                const emp = data.employes.find(e => e.id === l.userId);
                                const nom = emp ? emp.prenom : l.userId;
                                const lDate = new Date(l.lu);
                                return (
                                  <View key={l.userId} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#D4EDDA', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 10, color: '#155724', fontWeight: '600' }}>{nom} {lDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {lDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
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
                  <Text style={{ textAlign: 'center', color: '#6E5F54', paddingVertical: 32 }}>{t.dash.noActivity}</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
      <ImportExcel visible={showImport} onClose={() => setShowImport(false)} />
      <GlobalSearch visible={searchOpen} onClose={() => setSearchOpen(false)} />
      <Onboarding
        visible={showOnboarding}
        role={(currentUser?.role === 'apporteur' || currentUser?.role === 'menuiserie' ? 'employe' : currentUser?.role) || 'employe'}
        onComplete={() => {
          setShowOnboarding(false);
          AsyncStorage.setItem(onboardingKey, 'true');
        }}
      />
      <ItineraireSheet adresse={itineraireAdresse} onClose={() => setItineraireAdresse(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 28, fontWeight: '800', color: '#2B1D14', letterSpacing: -0.5 },
  date: { fontSize: 14, color: '#6E5F54', marginTop: 4, textTransform: 'capitalize', fontWeight: '400' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6E5F54', marginTop: 20, marginBottom: 8, paddingHorizontal: 6, letterSpacing: 0.4, textTransform: 'uppercase' },
  searchPill: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: DS.surface, ...shadows.sm },
  listCard: { backgroundColor: DS.surface, borderRadius: radius.xl, ...shadows.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingLeft: 14 },
  listIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  listInner: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  listSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.border },
  listTitle: { flex: 1, fontSize: 16, color: DS.text },
  statCaption: { fontSize: 13, color: DS.textSecondary, marginTop: 2 },
  toggleChip: { width: 30, height: 30, borderRadius: 15, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  listTitleInline: { fontSize: 15, color: DS.text },
  bigNumber: { fontFamily: 'Fraunces_600SemiBold', fontSize: 26, color: DS.primary },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    marginBottom: 6,
    shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: '#6E5F54', marginTop: 4, fontWeight: '500' },
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
    shadowColor: '#5C1F2E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5C1F2E', marginTop: 5 },
  activityContent: { flex: 1 },
  activityDesc: { fontSize: 13, color: '#2B1D14', lineHeight: 18, fontWeight: '400' },
  activityMeta: { fontSize: 11, color: '#9A8C80', marginTop: 2, fontWeight: '400' },
  shortcutsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '48%' as any,
    alignItems: 'center',
    shadowColor: '#5C1F2E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  shortcutIcon: { fontSize: 28, marginBottom: 6 },
  shortcutLabel: { fontSize: 13, fontWeight: '600', color: '#5C1F2E' },
});
