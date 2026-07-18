/**
 * Mini messagerie par chantier — admin ↔ client/architecte/apporteur.
 */
import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, Platform, Keyboard,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { openDocPreview } from '@/lib/share/openDocPreview';
import * as Notifications from 'expo-notifications';
import { sendPushNotification } from '@/hooks/useNotifications';
import { getAdminPushTokens } from '@/lib/notif/getAdminPushTokens';
import { countUnreadChantierMessages } from '@/lib/notif/countUnreadChantierMessages';

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

interface Props {
  chantier: Chantier;
  isAdmin: boolean;
  externAp?: { id: string; prenom: string; nom: string; type: 'client' | 'architecte' | 'apporteur' | 'contractant' };
  currentUserNom?: string;
  /** Si true, occupe toute la hauteur disponible (flex:1) au lieu de maxHeight 360. */
  fullScreen?: boolean;
}

export function ChatChantier({ chantier, isAdmin, externAp, currentUserNom, fullScreen = false }: Props) {
  const { updateChantier, data } = useApp();
  const messages = chantier.messagesChantier || [];
  const [texte, setTexte] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const [pjUri, setPjUri] = useState<string | null>(null);
  const [pjNom, setPjNom] = useState<string | null>(null);
  const [pjUploading, setPjUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Remonte la zone de saisie au-dessus du clavier (le Modal parent ne gère
  // pas le clavier de façon fiable sur iOS → on écoute les events directement).
  useEffect(() => {
    if (!fullScreen) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, [fullScreen]);

  const monId = isAdmin ? 'admin' : (externAp?.id || '');
  const monType: 'admin' | 'client' | 'architecte' | 'apporteur' | 'contractant' =
    isAdmin ? 'admin' : (externAp?.type || 'client');

  // ── Conversations par set de participants externes (privé = 1, groupe = N) ──
  // Contacts externes rattachés au chantier.
  const contactsExternes = useMemo(() => {
    const ids = [chantier.clientApporteurId, chantier.architecteId, chantier.apporteurId, chantier.contractantId]
      .filter(Boolean) as string[];
    return (data.apporteurs || []).filter(a => ids.includes(a.id));
  }, [chantier.clientApporteurId, chantier.architecteId, chantier.apporteurId, chantier.contractantId, data.apporteurs]);

  // Set de participants externes d'un message (normalise l'ancien modèle mono-destinataire).
  const msgParticipants = (m: typeof messages[number]): string[] => {
    if (m.destinatairesIds && m.destinatairesIds.length) return [...m.destinatairesIds].sort();
    if (m.destinataireId) return [m.destinataireId];
    if (m.auteurType !== 'admin') return [m.auteurId]; // ancien message externe = privé avec son auteur
    return []; // ancien message admin sans destinataire = orphelin (masqué)
  };
  const keyOf = (ids: string[]) => ids.join('|');

  // Côté admin : destinataires sélectionnés (1 = privé, plusieurs = groupe).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    const valid = selectedIds.filter(id => contactsExternes.some(c => c.id === id));
    if (valid.length === 0 && contactsExternes.length > 0) setSelectedIds([contactsExternes[0].id]);
    else if (valid.length !== selectedIds.length) setSelectedIds(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, contactsExternes]);
  const toggleContact = (id: string) => setSelectedIds(prev =>
    prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id],
  );

  // Côté externe : conversations auxquelles je participe (privé + groupes).
  const externeConvs = useMemo(() => {
    if (isAdmin) return [] as string[][];
    const map = new Map<string, string[]>();
    messages.forEach(m => {
      const p = msgParticipants(m);
      if (p.includes(monId)) { const k = keyOf(p); if (!map.has(k)) map.set(k, p); }
    });
    if (map.size === 0 && monId) map.set(keyOf([monId]), [monId]);
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, monId, isAdmin]);
  const [externeConvKey, setExterneConvKey] = useState('');
  useEffect(() => {
    if (!isAdmin && externeConvs.length > 0 && !externeConvs.some(p => keyOf(p) === externeConvKey)) {
      setExterneConvKey(keyOf(externeConvs[0]));
    }
  }, [isAdmin, externeConvs, externeConvKey]);

  // Côté admin : fils déjà existants (dérivés des sets de participants des messages),
  // pour retrouver un fil de groupe sans re-cocher la sélection exacte.
  const adminConvs = useMemo(() => {
    if (!isAdmin) return [] as string[][];
    const map = new Map<string, string[]>();
    messages.forEach(m => {
      const p = msgParticipants(m);
      if (p.length) { const k = keyOf(p); if (!map.has(k)) map.set(k, p); }
    });
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isAdmin]);

  // Participants de la conversation active + sa clé.
  const activeParticipants = useMemo(() => {
    if (isAdmin) return [...selectedIds].sort();
    return externeConvKey ? externeConvKey.split('|') : (monId ? [monId] : []);
  }, [isAdmin, selectedIds, externeConvKey, monId]);
  const activeKey = keyOf(activeParticipants);

  const messagesVisibles = useMemo(() => {
    if (!activeParticipants.length) return [];
    return messages.filter(m => keyOf(msgParticipants(m)) === activeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeKey]);

  // Marquer comme lus les messages de la conversation active (à l'ouverture / changement de fil)
  useEffect(() => {
    if (!monId) return;
    const visibleIds = new Set(messagesVisibles.map(m => m.id));
    let changed = false;
    const next = messages.map(m => {
      if (!visibleIds.has(m.id) || m.luPar?.includes(monId)) return m;
      changed = true;
      return { ...m, luPar: [...(m.luPar || []), monId] };
    });
    if (changed) {
      updateChantier({ ...chantier, messagesChantier: next });
    }
    // Met à jour le badge d'icône
    const updated = data.chantiers.map(c => c.id === chantier.id ? { ...c, messagesChantier: next } : c);
    Notifications.setBadgeCountAsync(countUnreadChantierMessages(updated, monId)).catch(() => {});
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: false }), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantier.id, activeKey, messages.length]);

  const ajouterPieceJointe = async () => {
    try {
      const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: false, compressImages: true });
      if (!files || files.length === 0) return;
      setPjUploading(true);
      const url = await uploadFileToStorage(
        files[0].uri,
        `chantiers/${chantier.id}/messages`,
        `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      );
      if (url) {
        setPjUri(url);
        setPjNom(files[0].filename || 'Document');
      }
    } catch (err) {
      console.error('Pièce jointe message échouée', err);
    } finally {
      setPjUploading(false);
    }
  };

  const envoyer = () => {
    if (!texte.trim() && !pjUri) return;
    if (activeParticipants.length === 0) return; // il faut une conversation cible
    const newMsg = {
      id: genId('msg'),
      auteurId: monId,
      auteurNom: currentUserNom || (externAp ? `${externAp.prenom} ${externAp.nom}` : 'Admin'),
      auteurType: monType,
      destinatairesIds: activeParticipants, // set des participants (identifie le fil, privé ou groupe)
      texte: texte.trim(),
      createdAt: new Date().toISOString(),
      luPar: [monId],
      ...(pjUri ? { pieceJointe: pjUri, pieceJointeNom: pjNom || 'Document' } : {}),
    };
    updateChantier({
      ...chantier,
      messagesChantier: [...messages, newMsg],
      derniereMajContenu: new Date().toISOString(),
    });

    // Notifier l'autre partie par push (atteint le destinataire même app fermée)
    try {
      const titre = `💬 ${newMsg.auteurNom}`;
      const corps = `${chantier.nom} : ${texte.trim() || '📎 Pièce jointe'}`;
      // Données à jour (message ajouté) pour calculer le badge exact du destinataire
      const updatedChantiers = data.chantiers.map(c =>
        c.id === chantier.id ? { ...c, messagesChantier: [...messages, newMsg] } : c,
      );
      if (isAdmin) {
        // Admin → chaque destinataire de la conversation (privé ou groupe)
        activeParticipants.forEach(pid => {
          const target = (data.apporteurs || []).find(a => a.id === pid);
          if (target?.pushToken) {
            const n = countUnreadChantierMessages(updatedChantiers, target.id);
            sendPushNotification([target.pushToken!], titre, corps, undefined, n);
          }
        });
      } else {
        // Intervenant externe → admin + les AUTRES participants du fil (cas groupe)
        const adminTokens = getAdminPushTokens(data.employes, data.adminEmployeId);
        const nAdmin = countUnreadChantierMessages(updatedChantiers, 'admin');
        sendPushNotification(adminTokens, titre, corps, undefined, nAdmin);
        activeParticipants.filter(pid => pid !== monId).forEach(pid => {
          const target = (data.apporteurs || []).find(a => a.id === pid);
          if (target?.pushToken) {
            const n = countUnreadChantierMessages(updatedChantiers, target.id);
            sendPushNotification([target.pushToken!], titre, corps, undefined, n);
          }
        });
      }
    } catch (e) {
      console.warn('[Chat] push échoué', e);
    }

    setTexte('');
    setPjUri(null);
    setPjNom(null);
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const nbNonLus = messagesVisibles.filter(m => !m.luPar?.includes(monId)).length;

  return (
    <View style={[styles.card, fullScreen && styles.cardFull, fullScreen && kbHeight > 0 && { paddingBottom: kbHeight }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.title}>Messagerie du chantier</Text>
        {nbNonLus > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{nbNonLus}</Text>
          </View>
        )}
      </View>
      <Text style={styles.subtitle}>Conversation admin ↔ intervenants externes</Text>
      {isAdmin && contactsExternes.length > 1 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contactRow} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            {contactsExternes.map(c => {
              const on = selectedIds.includes(c.id);
              return (
                <Pressable key={c.id} onPress={() => toggleContact(c.id)} style={[styles.contactChip, on && styles.contactChipActive]}>
                  <Text style={[styles.contactChipText, on && styles.contactChipTextActive]}>{on ? '✓ ' : ''}{c.prenom} {c.nom}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.hintSel}>
            {selectedIds.length > 1
              ? `Message groupé — ${selectedIds.length} destinataires`
              : 'Touchez pour ajouter/retirer des destinataires (groupe possible)'}
          </Text>
        </>
      )}
      {isAdmin && contactsExternes.length === 0 && (
        <Text style={styles.empty}>Aucun intervenant externe rattaché à ce chantier.</Text>
      )}
      {isAdmin && adminConvs.length > 0 && (
        <>
          <Text style={styles.hintSel}>Fils existants (toucher pour ouvrir)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contactRow} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            {adminConvs.map(p => {
              const k = keyOf(p);
              const on = k === activeKey;
              const label = p.map(id => {
                const c = (data.apporteurs || []).find(a => a.id === id);
                return c ? `${c.prenom} ${c.nom}` : '?';
              }).join(', ');
              const unread = messages.filter(m => keyOf(msgParticipants(m)) === k && m.auteurType !== 'admin' && !(m.luPar || []).includes('admin')).length;
              return (
                <Pressable key={k} onPress={() => setSelectedIds([...p])} style={[styles.contactChip, on && styles.contactChipActive, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                  <Text style={[styles.contactChipText, on && styles.contactChipTextActive]} numberOfLines={1}>{p.length > 1 ? `Groupe · ${label}` : label}</Text>
                  {unread > 0 && (
                    <View style={{ backgroundColor: '#E74C3C', borderRadius: 8, minWidth: 16, paddingHorizontal: 4, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{unread}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}
      {!isAdmin && externeConvs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contactRow} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {externeConvs.map(p => {
            const k = keyOf(p);
            const on = k === externeConvKey;
            const others = p.filter(id => id !== monId).map(id => {
              const c = (data.apporteurs || []).find(a => a.id === id);
              return c ? `${c.prenom} ${c.nom}` : '?';
            });
            const label = others.length ? `Groupe · ${others.join(', ')}` : 'Admin (privé)';
            return (
              <Pressable key={k} onPress={() => setExterneConvKey(k)} style={[styles.contactChip, on && styles.contactChipActive]}>
                <Text style={[styles.contactChipText, on && styles.contactChipTextActive]} numberOfLines={1}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        ref={scrollRef}
        style={[styles.list, fullScreen && styles.listFull]}
        contentContainerStyle={{ paddingVertical: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {messagesVisibles.length === 0 ? (
          <Text style={styles.empty}>Aucun message. Soyez le premier à écrire !</Text>
        ) : (
          messagesVisibles.map(m => {
            const isMine = m.auteurId === monId;
            return (
              <View key={m.id} style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  {!isMine && (
                    <Text style={styles.author}>{m.auteurNom} · {m.auteurType}</Text>
                  )}
                  {!!m.texte && (
                    <Text style={[styles.msgText, isMine && { color: '#fff' }]}>{m.texte}</Text>
                  )}
                  {m.pieceJointe && (
                    <Pressable onPress={() => openDocPreview(m.pieceJointe!)} style={styles.pjBubble}>
                      <Text style={[styles.pjLink, isMine && { color: '#fff' }]} numberOfLines={1}>{m.pieceJointeNom || 'Document'}</Text>
                    </Pressable>
                  )}
                  <Text style={[styles.date, isMine && { color: 'rgba(255,255,255,0.7)' }]}>{formatDate(m.createdAt)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {pjUri && (
        <View style={styles.pjPending}>
          <Text style={styles.pjPendingText} numberOfLines={1}>{pjNom || 'Document'}</Text>
          <Pressable onPress={() => { setPjUri(null); setPjNom(null); }} hitSlop={8}>
            <Text style={styles.pjPendingRemove}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.inputRow}>
        <Pressable onPress={ajouterPieceJointe} disabled={pjUploading} style={[styles.attachBtn, pjUploading && { opacity: 0.4 }]}>
          <Text style={styles.attachBtnText}>{pjUploading ? '…' : '📎'}</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={texte}
          onChangeText={setTexte}
          placeholder="Votre message..."
          multiline
        />
        <Pressable onPress={envoyer} disabled={(!texte.trim() && !pjUri) || activeParticipants.length === 0} style={[styles.sendBtn, ((!texte.trim() && !pjUri) || activeParticipants.length === 0) && { opacity: 0.4 }]}>
          <Text style={styles.sendBtnText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  cardFull: { flex: 1, marginBottom: 0 },
  contactRow: { flexGrow: 0, marginBottom: 8 },
  contactChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F0F0' },
  contactChipActive: { backgroundColor: '#2C2C2C' },
  contactChipText: { fontSize: 12, color: '#687076', fontWeight: '600' },
  contactChipTextActive: { color: '#fff' },
  hintSel: { fontSize: 10, color: '#8C8077', fontStyle: 'italic', marginBottom: 8, marginTop: 2 },
  title: { fontSize: 14, fontWeight: '800', color: '#2C2C2C' },
  subtitle: { fontSize: 11, color: '#8C8077', marginBottom: 8 },
  list: { maxHeight: 360, backgroundColor: '#FAF7F3', borderRadius: 10, paddingHorizontal: 10 },
  listFull: { flex: 1, maxHeight: undefined },
  empty: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  msgRow: { marginBottom: 6, flexDirection: 'row' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', padding: 10, borderRadius: 12 },
  bubbleMine: { backgroundColor: '#2C2C2C', borderBottomRightRadius: 2 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8DDD0', borderBottomLeftRadius: 2 },
  author: { fontSize: 10, color: '#8C6D2F', fontWeight: '800', marginBottom: 3 },
  msgText: { fontSize: 13, color: '#2C2C2C', lineHeight: 18 },
  pjBubble: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  pjLink: { fontSize: 13, color: '#8C6D2F', fontWeight: '700', textDecorationLine: 'underline', flexShrink: 1 },
  date: { fontSize: 9, color: '#8C8077', marginTop: 4, textAlign: 'right' },
  pjPending: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  pjPendingText: { flex: 1, fontSize: 12, color: '#2C2C2C', fontWeight: '600' },
  pjPendingRemove: { fontSize: 14, color: '#E74C3C', fontWeight: '800' },
  attachBtn: { backgroundColor: '#FAF7F3', borderRadius: 10, borderWidth: 1, borderColor: '#E8DDD0', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  attachBtnText: { fontSize: 18 },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginTop: 10 },
  input: { flex: 1, backgroundColor: '#FAF7F3', borderRadius: 10, borderWidth: 1, borderColor: '#E8DDD0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2C2C2C', minHeight: 40, maxHeight: 100 },
  sendBtn: { backgroundColor: '#2C2C2C', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#C9A96E', fontSize: 18, fontWeight: '800' },
  unreadBadge: { backgroundColor: '#E74C3C', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, minWidth: 22, alignItems: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
