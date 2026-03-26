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
  const scrollRef = useRef<ScrollView>(null);

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
      .filter(m => m.conversationId === convId && (showArchive || !m.archive))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [data.messagesPrive, convId, showArchive]);

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

    const msg: MessagePrive = {
      id: genId(),
      conversationId: convId,
      expediteurRole: myRole as 'admin' | 'employe' | 'soustraitant',
      expediteurId: myConvId,
      expediteurNom,
      contenu: texte,
      createdAt: now(),
      lu: false,
      archive: false,
    };
    addMessagePrive(msg);
    setMessageText('');
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

  // ─── Archiver un message ───────────────────────────────────────────────────
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

  // ─── Vue liste des conversations (admin) ──────────────────────────────────
  if (isAdmin && !selectedConvId) {
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
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {conversations.map(conv => (
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
                <Text style={styles.convType}>{conv.type === 'employe' ? `👷 ${t.messagerie.employee}` : `🏗 ${t.messagerie.subcontractor}`}</Text>
              </View>
            </Pressable>
          ))}
          {conversations.length === 0 && (
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
        <Pressable
          style={[styles.archiveToggle, showArchive && styles.archiveToggleActive]}
          onPress={() => setShowArchive(v => !v)}
        >
          <Text style={[styles.archiveToggleText, showArchive && styles.archiveToggleTextActive]}>
            {showArchive ? `📂 ${t.messagerie.archived}` : `📁 ${t.messagerie.archives}`}
          </Text>
        </Pressable>
      </View>

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
                    onLongPress={() => {
                      if (Platform.OS === 'web') {
                        const action = (typeof window !== 'undefined' && window.confirm ? window.confirm(
                          `${msg.archive ? t.messagerie.unarchive : t.messagerie.archive} ?\n\nOK = ${msg.archive ? t.messagerie.unarchive : t.messagerie.archive}\n${t.common.cancel} = ${t.common.delete}`
                        ) : true);
                        if (action) handleArchive(msg);
                        else if (!action) handleDelete(msg);
                      } else {
                        Alert.alert(t.messagerie.message, '', [
                          { text: t.common.cancel, style: 'cancel' },
                          { text: msg.archive ? t.messagerie.unarchive : t.messagerie.archive, onPress: () => handleArchive(msg) },
                          { text: t.common.delete, style: 'destructive', onPress: () => handleDelete(msg) },
                        ]);
                      }
                    }}
                  >
                    <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleOther]}>
                      {!isMine && (
                        <Text style={styles.msgExpéditeur}>{msg.expediteurNom}</Text>
                      )}
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
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* Zone de saisie */}
        {!showArchive && (
          <View style={styles.inputZone}>
            <Pressable style={styles.photoBtn} onPress={handleUploadPhoto}>
              <Text style={styles.photoBtnText}>📎</Text>
            </Pressable>
            <TextInput
              style={styles.msgInput}
              placeholder={t.messagerie.messagePlaceholder}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={2000}
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!messageText.trim()}
            >
              <Text style={styles.sendBtnText}>➤</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
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
  // Zone saisie
  inputZone: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E6EA', gap: 8 },
  photoBtn: { padding: 10, backgroundColor: '#F2F4F7', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  photoBtnText: { fontSize: 20 },
  msgInput: { flex: 1, backgroundColor: '#F2F4F7', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#11181C', maxHeight: 120, borderWidth: 1, borderColor: '#E2E6EA' },
  sendBtn: { padding: 10, backgroundColor: '#1A3A6B', borderRadius: 22, alignItems: 'center', justifyContent: 'center', width: 44, height: 44 },
  sendBtnDisabled: { backgroundColor: '#B0BEC5' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
