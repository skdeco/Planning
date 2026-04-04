import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, Platform, Alert, FlatList, KeyboardAvoidingView,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useRouter } from 'expo-router';
import type { MessagePrive } from '@/app/types/messages';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId() { return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function now() { return new Date().toISOString(); }

function formatHeure(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateMsg(iso: string, today_label = "Aujourd'hui", yesterday_label = "Hier") {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return today_label;
  if (d.toDateString() === yesterday.toDateString()) return yesterday_label;
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function MessagerieScreen() {
  const {
    data, currentUser, isHydrated,
    addMessagePrive, updateMessagePrive, deleteMessagePrive, marquerMessagesLus,
  } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
  }, [isHydrated, currentUser, router]);

  const isAdmin = currentUser?.role === 'admin';
  const isEmploye = currentUser?.role === 'employe';
  const isST = currentUser?.role === 'soustraitant';

  // ID de l'utilisateur courant pour la conversation
  const myConvId = isAdmin ? 'admin' : (currentUser?.employeId || currentUser?.soustraitantId || '');
  const myRole = currentUser?.role || 'employe';

  // Conversation sélectionnée (pour admin : ID de l'interlocuteur)
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [selectedChantierId, setSelectedChantierId] = useState<string | null>(null);
  const [contextMsg, setContextMsg] = useState<MessagePrive | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterExpId, setFilterExpId] = useState<string | 'all'>('all');
  const [filterType, setFilterType] = useState<'all' | 'photo' | 'pdf' | 'text'>('all');
  const scrollRef = useRef<ScrollView>(null);

  // Chantiers de l'employé : tous les chantiers actifs où il est affecté (pas seulement aujourd'hui)
  const todayStr = new Date().toISOString().slice(0, 10);
  const mesChantiers = useMemo(() => {
    const empId = currentUser?.employeId || currentUser?.soustraitantId;
    if (!empId || isAdmin) return data.chantiers.filter(c => c.statut === 'actif');
    return data.chantiers.filter(c =>
      c.statut === 'actif' &&
      data.affectations.some(a => a.chantierId === c.id && a.employeId === empId)
    );
  }, [data.chantiers, data.affectations, currentUser, isAdmin]);

  // Auto-sélectionner le chantier du jour si possible, sinon le premier
  useEffect(() => {
    if (selectedChantierId) return;
    const empId = currentUser?.employeId || currentUser?.soustraitantId;
    const chantierDuJour = mesChantiers.find(c =>
      data.affectations.some(a =>
        a.chantierId === c.id && a.employeId === empId &&
        a.dateDebut <= todayStr && a.dateFin >= todayStr
      )
    );
    if (chantierDuJour) setSelectedChantierId(chantierDuJour.id);
    else if (mesChantiers.length > 0) setSelectedChantierId(mesChantiers[0].id);
  }, [mesChantiers]);

  // ─── Liste des conversations (admin voit toutes, employé/ST voit la sienne) ──
  const conversations = useMemo(() => {
    const msgs = data.messagesPrive || [];
    if (!isAdmin) {
      // Employé ou ST : une seule conversation avec l'admin
      const convId = currentUser?.employeId || currentUser?.soustraitantId || '';
      const convMsgs = msgs.filter(m => m.conversationId === convId);
      const nbNonLus = convMsgs.filter(m => !m.lu && m.expediteurRole === 'admin').length;
      const last = convMsgs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return [{
        id: convId,
        type: isEmploye ? 'employe' : 'soustraitant' as 'employe' | 'soustraitant',
        nom: t.messagerie.administration,
        dernierMessage: last?.contenu,
        dernierMessageAt: last?.createdAt,
        nbNonLus,
      }];
    }

    // Admin : une conversation par employé/ST actif
    const convMap = new Map<string, { nom: string; type: 'employe' | 'soustraitant'; nbNonLus: number; dernierMessage?: string; dernierMessageAt?: string }>();

    // Initialiser avec tous les employés et ST
    data.employes.forEach(e => {
      convMap.set(e.id, { nom: `${e.prenom} ${e.nom}`, type: 'employe', nbNonLus: 0 });
    });
    data.sousTraitants.forEach(st => {
      const nom = st.societe || `${st.prenom || ''} ${st.nom || ''}`.trim();
      convMap.set(st.id, { nom, type: 'soustraitant', nbNonLus: 0 });
    });

    // Calculer les non-lus et le dernier message
    msgs.forEach(m => {
      const conv = convMap.get(m.conversationId);
      if (!conv) return;
      if (!m.lu && m.expediteurRole !== 'admin') conv.nbNonLus++;
      if (!conv.dernierMessageAt || m.createdAt > conv.dernierMessageAt) {
        conv.dernierMessage = m.contenu;
        conv.dernierMessageAt = m.createdAt;
      }
    });

    // Trier : conversations avec messages en premier (par date), puis sans messages
    return Array.from(convMap.entries())
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => {
        if (a.dernierMessageAt && b.dernierMessageAt) return b.dernierMessageAt.localeCompare(a.dernierMessageAt);
        if (a.dernierMessageAt) return -1;
        if (b.dernierMessageAt) return 1;
        return a.nom.localeCompare(b.nom);
      });
  }, [data.messagesPrive, data.employes, data.sousTraitants, isAdmin, isEmploye, currentUser]);

  // ─── Messages de la conversation sélectionnée ──────────────────────────────
  const convId = isAdmin ? selectedConvId : (currentUser?.employeId || currentUser?.soustraitantId || '');

  const messages = useMemo(() => {
    if (!convId) return [];
    return (data.messagesPrive || [])
      .filter(m => {
        if (m.conversationId !== convId) return false;
        // Archive
        if (selectedChantierId) {
          if (showArchive) { if (!m.archive || m.chantierId !== selectedChantierId) return false; }
          else { if (m.archive || m.chantierId !== selectedChantierId) return false; }
        } else {
          if (showArchive) { if (!m.archive) return false; }
          else { if (m.archive || m.chantierId) return false; }
        }
        // Filtre date
        if (filterDateFrom && m.createdAt.slice(0, 10) < filterDateFrom) return false;
        if (filterDateTo && m.createdAt.slice(0, 10) > filterDateTo) return false;
        // Filtre expéditeur
        if (filterExpId !== 'all' && m.expediteurId !== filterExpId) return false;
        // Filtre type de contenu
        if (filterType === 'photo' && !(m.fichiers?.some(f => f.startsWith('data:image') || f.includes('/image')))) return false;
        if (filterType === 'pdf' && !(m.fichiers?.some(f => f.includes('pdf')))) return false;
        if (filterType === 'text' && m.fichiers && m.fichiers.length > 0) return false;
        // Messages différés : visibles seulement après scheduledAt (sauf admin qui voit tout)
        if (m.scheduledAt && !isAdmin && new Date(m.scheduledAt) > new Date()) return false;
        return true;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [data.messagesPrive, convId, showArchive, selectedChantierId, filterDateFrom, filterDateTo, filterExpId, filterType]);

  // Marquer les messages comme lus quand on ouvre une conversation
  useEffect(() => {
    if (convId) {
      marquerMessagesLus(convId, myRole as 'admin' | 'employe' | 'soustraitant');
    }
  }, [convId]);

  // Scroll vers le bas quand de nouveaux messages arrivent
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ─── Envoi d'un message ────────────────────────────────────────────────────
  const handleSend = () => {
    const texte = messageText.trim();
    if (!texte || !convId) return;

    let expediteurNom = 'Admin';
    if (isEmploye) {
      const emp = data.employes.find(e => e.id === currentUser?.employeId);
      expediteurNom = emp ? `${emp.prenom} ${emp.nom}` : t.messagerie.employee;
    } else if (isST) {
      const st = data.sousTraitants.find(s => s.id === currentUser?.soustraitantId);
      expediteurNom = st ? (st.societe || `${st.prenom} ${st.nom}`) : t.messagerie.subcontractor;
    }

    // Construire le scheduledAt si programmé
    let scheduledAt: string | undefined;
    if (showSchedule && scheduleDate && scheduleTime) {
      scheduledAt = `${scheduleDate}T${scheduleTime}:00.000Z`;
    }

    const msg: MessagePrive = {
      id: genId(),
      conversationId: convId,
      expediteurRole: myRole as 'admin' | 'employe' | 'soustraitant',
      expediteurId: myConvId,
      expediteurNom,
      contenu: texte,
      chantierId: selectedChantierId || undefined,
      scheduledAt,
      createdAt: now(),
      lu: false,
      archive: false,
    };
    addMessagePrive(msg);
    setMessageText('');
    setShowSchedule(false);
    setScheduleDate('');
    setScheduleTime('');
  };

  // ─── Upload photo ──────────────────────────────────────────────────────────
  const handleUploadPhoto = () => {
    if (Platform.OS !== 'web' || !convId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { document.body.removeChild(input); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const uri = ev.target?.result as string;
        let expediteurNom = 'Admin';
        if (isEmploye) {
          const emp = data.employes.find(e => e.id === currentUser?.employeId);
          expediteurNom = emp ? `${emp.prenom} ${emp.nom}` : t.messagerie.employee;
        } else if (isST) {
          const st = data.sousTraitants.find(s => s.id === currentUser?.soustraitantId);
          expediteurNom = st ? (st.societe || `${st.prenom} ${st.nom}`) : t.messagerie.subcontractor;
        }
        const msg: MessagePrive = {
          id: genId(),
          conversationId: convId,
          expediteurRole: myRole as 'admin' | 'employe' | 'soustraitant',
          expediteurId: myConvId,
          expediteurNom,
          contenu: file.type.startsWith('video/') ? '🎥 Vidéo' : '📷 Photo',
          chantierId: selectedChantierId || undefined,
          fichiers: [uri],
          createdAt: now(),
          lu: false,
          archive: false,
        };
        addMessagePrive(msg);
      };
      reader.readAsDataURL(file);
      document.body.removeChild(input);
    };
    input.click();
  };

  // ─── Archiver toute la discussion d'un chantier ─────────────────────────────
  const handleArchiveDiscussion = () => {
    if (!convId || !selectedChantierId) return;
    const msgsToArchive = (data.messagesPrive || []).filter(
      m => m.conversationId === convId && m.chantierId === selectedChantierId && !m.archive
    );
    if (msgsToArchive.length === 0) return;
    msgsToArchive.forEach(m => updateMessagePrive({ ...m, archive: true }));
  };

  // ─── Désarchiver toute la discussion d'un chantier ─────────────────────────
  const handleUnarchiveDiscussion = () => {
    if (!convId || !selectedChantierId) return;
    const msgsToUnarchive = (data.messagesPrive || []).filter(
      m => m.conversationId === convId && m.chantierId === selectedChantierId && m.archive
    );
    if (msgsToUnarchive.length === 0) return;
    msgsToUnarchive.forEach(m => updateMessagePrive({ ...m, archive: false }));
  };

  // ─── Archiver un message individuel ───────────────────────────────────────
  const handleArchive = (msg: MessagePrive) => {
    updateMessagePrive({ ...msg, archive: !msg.archive });
  };

  // ─── Supprimer un message ──────────────────────────────────────────────────
  const handleDelete = (msg: MessagePrive) => {
    const doDelete = () => deleteMessagePrive(msg.id);
    if (Platform.OS === 'web') {
      if ((typeof window !== 'undefined' && window.confirm ? window.confirm(t.messagerie.deleteMsg) : true)) doDelete();
    } else {
      Alert.alert(t.common.delete, '', [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ─── Grouper les messages par date ────────────────────────────────────────
  const messagesGroupes = useMemo(() => {
    const groups: Array<{ date: string; msgs: MessagePrive[] }> = [];
    messages.forEach(m => {
      const dateLabel = formatDateMsg(m.createdAt, t.common.today, t.common.yesterday ?? 'Hier');
      const last = groups[groups.length - 1];
      if (last && last.date === dateLabel) {
        last.msgs.push(m);
      } else {
        groups.push({ date: dateLabel, msgs: [m] });
      }
    });
    return groups;
  }, [messages]);

  // ─── Badge total non lus ───────────────────────────────────────────────────
  const totalNonLus = useMemo(() =>
    conversations.reduce((acc, c) => acc + c.nbNonLus, 0),
    [conversations]
  );

  // ─── Filtres page d'accueil admin ──────────────────────────────────────────
  const [listFilterChantier, setListFilterChantier] = useState<string | 'all'>('all');
  const [listFilterWho, setListFilterWho] = useState<string | 'all'>('all');
  const [listFilterDateFrom, setListFilterDateFrom] = useState('');
  const [listFilterDateTo, setListFilterDateTo] = useState('');
  const [listFilterType, setListFilterType] = useState<'all' | 'photo' | 'pdf' | 'text'>('all');

  // Conversations filtrées et triées par chantier
  const filteredConversations = useMemo(() => {
    if (!isAdmin) return conversations;
    const allMsgs = data.messagesPrive || [];
    return conversations.map(conv => {
      // Compter les messages qui matchent les filtres pour cette conversation
      const convMsgs = allMsgs.filter(m => {
        if (m.conversationId !== conv.id) return false;
        if (listFilterChantier !== 'all' && m.chantierId !== listFilterChantier) return false;
        if (listFilterDateFrom && m.createdAt.slice(0, 10) < listFilterDateFrom) return false;
        if (listFilterDateTo && m.createdAt.slice(0, 10) > listFilterDateTo) return false;
        if (listFilterType === 'photo' && !(m.fichiers?.some(f => f.startsWith('data:image') || f.includes('/image')))) return false;
        if (listFilterType === 'pdf' && !(m.fichiers?.some(f => f.includes('pdf')))) return false;
        if (listFilterType === 'text' && m.fichiers && m.fichiers.length > 0) return false;
        return true;
      });
      // Chantier principal de cette conversation (le plus fréquent)
      const chantierCounts = new Map<string, number>();
      convMsgs.forEach(m => { if (m.chantierId) chantierCounts.set(m.chantierId, (chantierCounts.get(m.chantierId) || 0) + 1); });
      const topChantierId = [...chantierCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      return { ...conv, matchCount: convMsgs.length, topChantierId };
    })
    .filter(c => {
      if (listFilterWho !== 'all' && c.id !== listFilterWho) return false;
      if (listFilterChantier !== 'all' && c.matchCount === 0) return false;
      if (listFilterDateFrom && c.matchCount === 0) return false;
      if (listFilterType !== 'all' && c.matchCount === 0) return false;
      return true;
    })
    .sort((a, b) => {
      // Tri par chantier par défaut
      const chA = a.topChantierId || 'zzz';
      const chB = b.topChantierId || 'zzz';
      if (chA !== chB) return chA.localeCompare(chB);
      if (a.dernierMessageAt && b.dernierMessageAt) return b.dernierMessageAt.localeCompare(a.dernierMessageAt);
      return a.nom.localeCompare(b.nom);
    });
  }, [conversations, data.messagesPrive, isAdmin, listFilterChantier, listFilterWho, listFilterDateFrom, listFilterDateTo, listFilterType]);

  // ─── Vue liste des conversations (admin) ──────────────────────────────────
  if (isAdmin && !selectedConvId) {
    // Grouper par chantier
    const chantierGroups = new Map<string, Array<(typeof filteredConversations)[0]>>();
    filteredConversations.forEach(c => {
      const chId = (c as any).topChantierId || '__none__';
      if (!chantierGroups.has(chId)) chantierGroups.set(chId, []);
      chantierGroups.get(chId)!.push(c);
    });

    return (
      <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💬 {t.messagerie.title}</Text>
          {totalNonLus > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{totalNonLus} {t.messagerie.unread}</Text>
            </View>
          )}
        </View>

        {/* Filtres — toujours visibles */}
        <View style={styles.filterPanel}>
          {/* Chantiers */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Chantier</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              <Pressable style={[styles.filterChip, listFilterChantier === 'all' && styles.filterChipActive]} onPress={() => setListFilterChantier('all')}>
                <Text style={[styles.filterChipText, listFilterChantier === 'all' && styles.filterChipTextActive]}>Tous</Text>
              </Pressable>
              {data.chantiers.filter(c => c.statut === 'actif').map(c => (
                <Pressable key={c.id} style={[styles.filterChip, listFilterChantier === c.id && { backgroundColor: c.couleur || '#1A3A6B', borderColor: c.couleur || '#1A3A6B' }]}
                  onPress={() => setListFilterChantier(listFilterChantier === c.id ? 'all' : c.id)}>
                  <Text style={[styles.filterChipText, listFilterChantier === c.id && { color: '#fff' }]} numberOfLines={1}>{c.nom}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {/* Qui */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Qui</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              <Pressable style={[styles.filterChip, listFilterWho === 'all' && styles.filterChipActive]} onPress={() => setListFilterWho('all')}>
                <Text style={[styles.filterChipText, listFilterWho === 'all' && styles.filterChipTextActive]}>Tous</Text>
              </Pressable>
              {data.employes.map(e => (
                <Pressable key={e.id} style={[styles.filterChip, listFilterWho === e.id && styles.filterChipActive]}
                  onPress={() => setListFilterWho(listFilterWho === e.id ? 'all' : e.id)}>
                  <Text style={[styles.filterChipText, listFilterWho === e.id && styles.filterChipTextActive]}>{e.prenom}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {/* Date + Type */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Du</Text>
            <TextInput style={styles.filterInput} placeholder="AAAA-MM-JJ" value={listFilterDateFrom} onChangeText={setListFilterDateFrom} maxLength={10} />
            <Text style={styles.filterLabel}>au</Text>
            <TextInput style={styles.filterInput} placeholder="AAAA-MM-JJ" value={listFilterDateTo} onChangeText={setListFilterDateTo} maxLength={10} />
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Type</Text>
            {(['all', 'text', 'photo', 'pdf'] as const).map(tp => (
              <Pressable key={tp} style={[styles.filterChip, listFilterType === tp && styles.filterChipActive]}
                onPress={() => setListFilterType(listFilterType === tp ? 'all' : tp)}>
                <Text style={[styles.filterChipText, listFilterType === tp && styles.filterChipTextActive]}>
                  {tp === 'all' ? 'Tout' : tp === 'text' ? '💬' : tp === 'photo' ? '📷' : '📄'}
                </Text>
              </Pressable>
            ))}
            <Pressable style={{ marginLeft: 'auto', paddingVertical: 4, paddingHorizontal: 8 }} onPress={() => {
              setListFilterChantier('all'); setListFilterWho('all'); setListFilterDateFrom(''); setListFilterDateTo(''); setListFilterType('all');
            }}>
              <Text style={{ fontSize: 11, color: '#E74C3C', fontWeight: '600' }}>Réinitialiser</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {[...chantierGroups.entries()].map(([chId, convs]) => {
            const chantier = data.chantiers.find(c => c.id === chId);
            return (
              <View key={chId}>
                {chantier && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: chantier.couleur || '#1A3A6B' }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A3A6B' }}>{chantier.nom}</Text>
                  </View>
                )}
                {!chantier && chId === '__none__' && convs.length > 0 && (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#687076', marginTop: 12, marginBottom: 6 }}>Sans chantier</Text>
                )}
                {convs.map(conv => (
                  <Pressable
                    key={conv.id}
                    style={[styles.convCard, conv.nbNonLus > 0 && styles.convCardUnread]}
                    onPress={() => setSelectedConvId(conv.id)}
                  >
                    <View style={[styles.convAvatar, { backgroundColor: conv.type === 'employe' ? '#1A3A6B' : '#00BCD4' }]}>
                      <Text style={styles.convAvatarText}>{conv.nom[0].toUpperCase()}</Text>
                    </View>
                    <View style={styles.convInfo}>
                      <View style={styles.convRow}>
                        <Text style={styles.convNom} numberOfLines={1}>{conv.nom}</Text>
                        {conv.dernierMessageAt && (
                          <Text style={styles.convHeure}>{formatHeure(conv.dernierMessageAt)}</Text>
                        )}
                      </View>
                      <View style={styles.convRow}>
                        <Text style={styles.convDernier} numberOfLines={1}>
                          {conv.dernierMessage || t.messagerie.noMessage}
                        </Text>
                        {conv.nbNonLus > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{conv.nbNonLus}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            );
          })}
          {filteredConversations.length === 0 && (
            <Text style={styles.emptyText}>{t.messagerie.noConversation}</Text>
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ─── Vue conversation ──────────────────────────────────────────────────────
  const convNom = isAdmin
    ? conversations.find(c => c.id === selectedConvId)?.nom || t.messagerie.conversation
    : t.messagerie.administration;

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        {isAdmin && (
          <Pressable onPress={() => setSelectedConvId(null)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← {t.common.back}</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>💬 {convNom}</Text>
        {isAdmin && (
          <Pressable
            style={[styles.archiveToggle, showArchive && styles.archiveToggleActive]}
            onPress={() => setShowArchive(v => !v)}
          >
            <Text style={[styles.archiveToggleText, showArchive && styles.archiveToggleTextActive]}>
              {showArchive ? `📂 ${t.messagerie.archived}` : `📁 ${t.messagerie.archives}`}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Barre de filtres */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, alignItems: 'center' }}>
          {/* Chantiers */}
          {mesChantiers.map(c => (
            <Pressable
              key={c.id}
              style={[styles.chantierChip, selectedChantierId === c.id && { backgroundColor: c.couleur || '#1A3A6B', borderColor: c.couleur || '#1A3A6B' }]}
              onPress={() => setSelectedChantierId(selectedChantierId === c.id ? null : c.id)}
            >
              <Text style={[styles.chantierChipText, selectedChantierId === c.id && { color: '#fff' }]} numberOfLines={1}>{c.nom}</Text>
            </Pressable>
          ))}
          {/* Bouton filtres avancés — admin seulement */}
          {isAdmin && (
            <Pressable
              style={[styles.chantierChip, showFilters && { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' }]}
              onPress={() => setShowFilters(v => !v)}
            >
              <Text style={[styles.chantierChipText, showFilters && { color: '#fff' }]}>🔍 Filtres</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Panneau filtres avancés */}
      {showFilters && (
        <View style={styles.filterPanel}>
          {/* Date */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Du</Text>
            <TextInput style={styles.filterInput} placeholder="AAAA-MM-JJ" value={filterDateFrom} onChangeText={setFilterDateFrom} maxLength={10} />
            <Text style={styles.filterLabel}>au</Text>
            <TextInput style={styles.filterInput} placeholder="AAAA-MM-JJ" value={filterDateTo} onChangeText={setFilterDateTo} maxLength={10} />
          </View>
          {/* Qui */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>De</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              <Pressable style={[styles.filterChip, filterExpId === 'all' && styles.filterChipActive]} onPress={() => setFilterExpId('all')}>
                <Text style={[styles.filterChipText, filterExpId === 'all' && styles.filterChipTextActive]}>Tous</Text>
              </Pressable>
              <Pressable style={[styles.filterChip, filterExpId === 'admin' && styles.filterChipActive]} onPress={() => setFilterExpId(filterExpId === 'admin' ? 'all' : 'admin')}>
                <Text style={[styles.filterChipText, filterExpId === 'admin' && styles.filterChipTextActive]}>Admin</Text>
              </Pressable>
              {data.employes.slice(0, 8).map(e => (
                <Pressable key={e.id} style={[styles.filterChip, filterExpId === e.id && styles.filterChipActive]} onPress={() => setFilterExpId(filterExpId === e.id ? 'all' : e.id)}>
                  <Text style={[styles.filterChipText, filterExpId === e.id && styles.filterChipTextActive]}>{e.prenom}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {/* Type */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Type</Text>
            {(['all', 'text', 'photo', 'pdf'] as const).map(t => (
              <Pressable key={t} style={[styles.filterChip, filterType === t && styles.filterChipActive]} onPress={() => setFilterType(filterType === t ? 'all' : t)}>
                <Text style={[styles.filterChipText, filterType === t && styles.filterChipTextActive]}>
                  {t === 'all' ? 'Tout' : t === 'text' ? '💬 Texte' : t === 'photo' ? '📷 Photos' : '📄 PDF'}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* Reset */}
          <Pressable style={{ alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 10 }} onPress={() => {
            setFilterDateFrom(''); setFilterDateTo(''); setFilterExpId('all'); setFilterType('all');
          }}>
            <Text style={{ fontSize: 12, color: '#E74C3C', fontWeight: '600' }}>Réinitialiser</Text>
          </Pressable>
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.msgScroll}
          contentContainerStyle={styles.msgScrollContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messagesGroupes.length === 0 && (
            <Text style={styles.emptyText}>
              {showArchive ? t.messagerie.noArchived : t.messagerie.startConversation}
            </Text>
          )}
          {messagesGroupes.map(group => (
            <View key={group.date}>
              <View style={styles.dateSeparator}>
                <Text style={styles.dateSeparatorText}>{group.date}</Text>
              </View>
              {group.msgs.map(msg => {
                const isMine = msg.expediteurRole === myRole && (
                  isAdmin ? msg.expediteurRole === 'admin' : msg.expediteurId === myConvId
                );
                return (
                  <Pressable
                    key={msg.id}
                    style={[styles.msgBubbleWrap, isMine && styles.msgBubbleWrapMine]}
                    onLongPress={() => setContextMsg(msg)}
                  >
                    <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleOther]}>
                      {!isMine && (
                        <Text style={styles.msgExpéditeur}>{msg.expediteurNom}</Text>
                      )}
                      {msg.chantierId && (() => {
                        const ch = data.chantiers.find(c => c.id === msg.chantierId);
                        return ch ? (
                          <View style={[styles.msgChantierTag, { backgroundColor: (ch.couleur || '#1A3A6B') + '20', borderColor: ch.couleur || '#1A3A6B' }]}>
                            <Text style={[styles.msgChantierTagText, { color: ch.couleur || '#1A3A6B' }]}>📍 {ch.nom}</Text>
                          </View>
                        ) : null;
                      })()}
                      {msg.fichiers && msg.fichiers.length > 0 && (
                        <Pressable onPress={() => {
                          if (Platform.OS === 'web') {
                            const win = window.open();
                            if (win) win.document.write(`<img src="${msg.fichiers![0]}" style="max-width:100%;"/>`);
                          }
                        }}>
                          <View style={styles.msgMedia}>
                            <Text style={styles.msgMediaText}>{msg.contenu}</Text>
                            <Text style={styles.msgMediaHint}>{t.messagerie.tapToView}</Text>
                          </View>
                        </Pressable>
                      )}
                      {(!msg.fichiers || msg.fichiers.length === 0) && (
                        <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{msg.contenu}</Text>
                      )}
                      <View style={styles.msgMeta}>
                        <Text style={[styles.msgHeure, isMine && styles.msgHeureMine]}>{formatHeure(msg.createdAt)}</Text>
                        {isMine && (
                          <Text style={styles.msgLu}>{msg.lu ? '✓✓' : '✓'}</Text>
                        )}
                        {msg.archive && <Text style={styles.msgArchiveBadge}>📁</Text>}
                        {msg.scheduledAt && new Date(msg.scheduledAt) > new Date() && (
                          <Text style={{ fontSize: 9, color: '#F59E0B', fontWeight: '600' }}>⏰ {msg.scheduledAt.slice(0, 16).replace('T', ' ')}</Text>
                        )}
                      </View>
                      {/* Actions rapides */}
                      <View style={styles.msgQuickActions}>
                        <Pressable onPress={() => handleArchive(msg)} style={styles.msgQuickBtn}>
                          <Text style={{ fontSize: 11 }}>{msg.archive ? '📂' : '📁'}</Text>
                        </Pressable>
                        <Pressable onPress={() => handleDelete(msg)} style={styles.msgQuickBtn}>
                          <Text style={{ fontSize: 11 }}>🗑</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* Bouton archiver la discussion */}
        {!showArchive && selectedChantierId && messages.length > 0 && (
          <Pressable style={styles.archiveDiscussionBtn} onPress={() => {
            const chNom = data.chantiers.find(c => c.id === selectedChantierId)?.nom || 'ce chantier';
            if (Platform.OS === 'web') {
              if (window.confirm(`Archiver toute la discussion "${chNom}" ?\nLes messages seront visibles dans les archives.`)) handleArchiveDiscussion();
            } else {
              Alert.alert('Archiver la discussion', `Archiver tous les messages de "${chNom}" ?`, [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Archiver', onPress: handleArchiveDiscussion },
              ]);
            }
          }}>
            <Text style={styles.archiveDiscussionBtnText}>📁 Clore et archiver cette discussion</Text>
          </Pressable>
        )}

        {/* Bouton désarchiver */}
        {showArchive && selectedChantierId && messages.length > 0 && (
          <Pressable style={[styles.archiveDiscussionBtn, { backgroundColor: '#EEF2F8' }]} onPress={handleUnarchiveDiscussion}>
            <Text style={[styles.archiveDiscussionBtnText, { color: '#1A3A6B' }]}>📂 Restaurer cette discussion</Text>
          </Pressable>
        )}

        {/* Panneau programmation (admin) */}
        {showSchedule && isAdmin && (() => {
          const todayYmd = new Date().toISOString().slice(0, 10);
          const demainYmd = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
          const apresDemainYmd = (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })();
          const lundiYmd = (() => { const d = new Date(); const dow = d.getDay(); d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow)); return d.toISOString().slice(0, 10); })();
          const formatFr = (ymd: string) => { const d = new Date(ymd + 'T12:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; };
          const heures = ['06:00', '07:00', '08:00', '09:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
          return (
          <View style={styles.scheduleBar}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#1A3A6B' }}>⏰ Programmer l'envoi</Text>
              <Pressable onPress={() => { setShowSchedule(false); setScheduleDate(''); setScheduleTime(''); }} style={{ padding: 4 }}>
                <Text style={{ color: '#E74C3C', fontSize: 14, fontWeight: '600' }}>✕</Text>
              </Pressable>
            </View>
            {/* Date rapide */}
            <Text style={{ fontSize: 11, color: '#687076', marginTop: 6, marginBottom: 4 }}>Date :</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {[
                { label: `Aujourd'hui (${formatFr(todayYmd)})`, value: todayYmd },
                { label: `Demain (${formatFr(demainYmd)})`, value: demainYmd },
                { label: `Après-demain (${formatFr(apresDemainYmd)})`, value: apresDemainYmd },
                { label: `Lundi (${formatFr(lundiYmd)})`, value: lundiYmd },
              ].map(opt => (
                <Pressable key={opt.value}
                  style={[styles.scheduleChip, scheduleDate === opt.value && styles.scheduleChipActive]}
                  onPress={() => setScheduleDate(opt.value)}>
                  <Text style={[styles.scheduleChipText, scheduleDate === opt.value && { color: '#fff' }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {/* Heure */}
            <Text style={{ fontSize: 11, color: '#687076', marginTop: 8, marginBottom: 4 }}>Heure :</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {heures.map(h => (
                <Pressable key={h}
                  style={[styles.scheduleChip, scheduleTime === h && styles.scheduleChipActive]}
                  onPress={() => setScheduleTime(h)}>
                  <Text style={[styles.scheduleChipText, scheduleTime === h && { color: '#fff' }]}>{h}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {scheduleDate && scheduleTime && (
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#27AE60', marginTop: 6 }}>
                Envoi prévu le {scheduleDate.split('-').reverse().join('/')} à {scheduleTime}
              </Text>
            )}
          </View>
          );
        })()}

        {/* Zone de saisie */}
        {!showArchive && (
          <View style={styles.inputZone}>
            <Pressable style={styles.photoBtn} onPress={handleUploadPhoto}>
              <Text style={styles.photoBtnText}>📎</Text>
            </Pressable>
            {isAdmin && (
              <Pressable style={[styles.photoBtn, showSchedule && { backgroundColor: '#EBF0FF' }]} onPress={() => setShowSchedule(v => !v)}>
                <Text style={styles.photoBtnText}>⏰</Text>
              </Pressable>
            )}
            <TextInput
              style={styles.msgInput}
              placeholder={showSchedule && scheduleDate ? `Programmé le ${scheduleDate}...` : t.messagerie.messagePlaceholder}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={2000}
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled, showSchedule && scheduleDate && { backgroundColor: '#F59E0B' }]}
              onPress={handleSend}
              disabled={!messageText.trim()}
            >
              <Text style={styles.sendBtnText}>{showSchedule && scheduleDate ? '⏰' : '➤'}</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Menu contextuel message */}
      {contextMsg && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setContextMsg(null)}>
          <Pressable style={styles.contextOverlay} onPress={() => setContextMsg(null)}>
            <View style={styles.contextMenu}>
              <Text style={styles.contextTitle} numberOfLines={1}>
                {contextMsg.contenu.slice(0, 50)}{contextMsg.contenu.length > 50 ? '…' : ''}
              </Text>
              <Pressable
                style={styles.contextBtn}
                onPress={() => { handleArchive(contextMsg); setContextMsg(null); }}
              >
                <Text style={styles.contextBtnText}>
                  {contextMsg.archive ? '📂 Désarchiver' : '📁 Archiver'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.contextBtn, styles.contextBtnDanger]}
                onPress={() => { handleDelete(contextMsg); setContextMsg(null); }}
              >
                <Text style={[styles.contextBtnText, { color: '#EF4444' }]}>🗑 Supprimer</Text>
              </Pressable>
              <Pressable style={styles.contextBtn} onPress={() => setContextMsg(null)}>
                <Text style={[styles.contextBtnText, { color: '#687076' }]}>Annuler</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E6EA', gap: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1A3A6B' },
  headerBadge: { backgroundColor: '#E74C3C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  backBtn: { paddingRight: 4 },
  backBtnText: { color: '#1A3A6B', fontWeight: '600', fontSize: 14 },
  archiveToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E2E6EA', backgroundColor: '#F2F4F7' },
  archiveToggleActive: { backgroundColor: '#EEF2F8', borderColor: '#1A3A6B' },
  archiveToggleText: { fontSize: 11, color: '#687076', fontWeight: '600' },
  archiveToggleTextActive: { color: '#1A3A6B' },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 24 },
  // Liste conversations
  convCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, alignItems: 'center', gap: 12 },
  convCardUnread: { borderLeftWidth: 3, borderLeftColor: '#1A3A6B' },
  convAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  convAvatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  convInfo: { flex: 1 },
  convRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convNom: { fontSize: 15, fontWeight: '700', color: '#11181C', flex: 1 },
  convHeure: { fontSize: 11, color: '#687076' },
  convDernier: { fontSize: 13, color: '#687076', flex: 1 },
  convType: { fontSize: 11, color: '#B0BEC5', marginTop: 2 },
  unreadBadge: { backgroundColor: '#1A3A6B', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  emptyText: { textAlign: 'center', color: '#687076', fontSize: 14, marginTop: 48 },
  // Messages
  msgScroll: { flex: 1, backgroundColor: '#F2F4F7' },
  msgScrollContent: { padding: 12, paddingBottom: 8 },
  dateSeparator: { alignItems: 'center', marginVertical: 12 },
  dateSeparatorText: { fontSize: 12, color: '#687076', backgroundColor: '#E2E6EA', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  msgBubbleWrap: { alignItems: 'flex-start', marginBottom: 6 },
  msgBubbleWrapMine: { alignItems: 'flex-end' },
  msgBubble: { maxWidth: '78%', borderRadius: 16, padding: 10, paddingHorizontal: 14 },
  msgBubbleMine: { backgroundColor: '#1A3A6B', borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  msgExpéditeur: { fontSize: 11, fontWeight: '700', color: '#1A3A6B', marginBottom: 3 },
  msgText: { fontSize: 15, color: '#11181C', lineHeight: 21 },
  msgTextMine: { color: '#fff' },
  msgMedia: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 10, alignItems: 'center' },
  msgMediaText: { fontSize: 24, marginBottom: 4 },
  msgMediaHint: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: 'flex-end' },
  msgHeure: { fontSize: 10, color: '#687076' },
  msgHeureMine: { color: 'rgba(255,255,255,0.6)' },
  msgLu: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  msgArchiveBadge: { fontSize: 10 },
  msgQuickActions: { flexDirection: 'row' as const, gap: 2, marginTop: 2 },
  msgQuickBtn: { padding: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)' },
  // Zone saisie
  inputZone: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E6EA', gap: 8 },
  photoBtn: { padding: 10, backgroundColor: '#F2F4F7', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  photoBtnText: { fontSize: 20 },
  msgInput: { flex: 1, backgroundColor: '#F2F4F7', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#11181C', maxHeight: 120, borderWidth: 1, borderColor: '#E2E6EA' },
  sendBtn: { padding: 10, backgroundColor: '#1A3A6B', borderRadius: 22, alignItems: 'center', justifyContent: 'center', width: 44, height: 44 },
  sendBtnDisabled: { backgroundColor: '#B0BEC5' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  // Programmation message
  scheduleBar: { backgroundColor: '#FAFBFC', borderTopWidth: 1, borderTopColor: '#E2E6EA', padding: 10 },
  scheduleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F2F4F7', borderWidth: 1, borderColor: '#E2E6EA' },
  scheduleChipActive: { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' },
  scheduleChipText: { fontSize: 12, fontWeight: '600', color: '#687076' },
  // Barre et panneau de filtres
  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E6EA', paddingVertical: 6 },
  filterPanel: { backgroundColor: '#FAFBFC', borderBottomWidth: 1, borderBottomColor: '#E2E6EA', padding: 12, gap: 8 },
  filterRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  filterLabel: { fontSize: 12, fontWeight: '600', color: '#687076', minWidth: 28 },
  filterInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: '#11181C', width: 105 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#E2E6EA', backgroundColor: '#F2F4F7' },
  filterChipActive: { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: '#687076' },
  filterChipTextActive: { color: '#fff' },
  // Sélecteur de chantier
  chantierBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E6EA', maxHeight: 44 },
  chantierBarContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, alignItems: 'center' as const },
  chantierChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: '#E2E6EA', backgroundColor: '#F2F4F7' },
  chantierChipText: { fontSize: 12, fontWeight: '600', color: '#687076', maxWidth: 120 },
  // Bouton archiver discussion
  archiveDiscussionBtn: { marginHorizontal: 12, marginVertical: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFF3E0', alignItems: 'center' as const, borderWidth: 1, borderColor: '#FFE0B2' },
  archiveDiscussionBtnText: { fontSize: 13, fontWeight: '600', color: '#E65100' },
  // Menu contextuel
  contextOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' as const, alignItems: 'center' as const, padding: 24 },
  contextMenu: { backgroundColor: '#fff', borderRadius: 14, padding: 8, width: '100%', maxWidth: 320 },
  contextTitle: { fontSize: 13, color: '#687076', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  contextBtn: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 8 },
  contextBtnDanger: {},
  contextBtnText: { fontSize: 15, fontWeight: '600', color: '#11181C' },
  // Tag chantier sur les messages
  msgChantierTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4, borderWidth: 1, alignSelf: 'flex-start' as const },
  msgChantierTagText: { fontSize: 10, fontWeight: '700' },
});
