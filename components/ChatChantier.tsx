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
  const { updateChantier } = useApp();
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

  // Marquer les messages comme lus à l'ouverture
  useEffect(() => {
    if (!monId) return;
    let changed = false;
    const next = messages.map(m => {
      if (m.luPar?.includes(monId)) return m;
      changed = true;
      return { ...m, luPar: [...(m.luPar || []), monId] };
    });
    if (changed) {
      updateChantier({ ...chantier, messagesChantier: next });
    }
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: false }), 100);
  }, [chantier.id]);

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
    const newMsg = {
      id: genId('msg'),
      auteurId: monId,
      auteurNom: currentUserNom || (externAp ? `${externAp.prenom} ${externAp.nom}` : 'Admin'),
      auteurType: monType,
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
    setTexte('');
    setPjUri(null);
    setPjNom(null);
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const nbNonLus = messages.filter(m => !m.luPar?.includes(monId)).length;

  return (
    <View style={[styles.card, fullScreen && styles.cardFull, fullScreen && kbHeight > 0 && { paddingBottom: kbHeight }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.title}>💬 Messagerie du chantier</Text>
        {nbNonLus > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{nbNonLus}</Text>
          </View>
        )}
      </View>
      <Text style={styles.subtitle}>Conversation admin ↔ intervenants externes</Text>

      <ScrollView
        ref={scrollRef}
        style={[styles.list, fullScreen && styles.listFull]}
        contentContainerStyle={{ paddingVertical: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>Aucun message. Soyez le premier à écrire !</Text>
        ) : (
          messages.map(m => {
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
                      <Text style={[styles.pjLink, isMine && { color: '#fff' }]} numberOfLines={1}>📎 {m.pieceJointeNom || 'Document'}</Text>
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
          <Text style={styles.pjPendingText} numberOfLines={1}>📎 {pjNom || 'Document'}</Text>
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
        <Pressable onPress={envoyer} disabled={!texte.trim() && !pjUri} style={[styles.sendBtn, (!texte.trim() && !pjUri) && { opacity: 0.4 }]}>
          <Text style={styles.sendBtnText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  cardFull: { flex: 1, marginBottom: 0 },
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
