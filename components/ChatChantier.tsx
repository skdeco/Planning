/**
 * Mini messagerie par chantier — admin ↔ client/architecte/apporteur.
 */
import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';

function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

interface Props {
  chantier: Chantier;
  isAdmin: boolean;
  externAp?: { id: string; prenom: string; nom: string; type: 'client' | 'architecte' | 'apporteur' | 'contractant' };
  currentUserNom?: string;
}

export function ChatChantier({ chantier, isAdmin, externAp, currentUserNom }: Props) {
  const { updateChantier } = useApp();
  const messages = chantier.messagesChantier || [];
  const [texte, setTexte] = useState('');
  const scrollRef = useRef<ScrollView>(null);

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

  const envoyer = () => {
    if (!texte.trim()) return;
    const newMsg = {
      id: genId('msg'),
      auteurId: monId,
      auteurNom: currentUserNom || (externAp ? `${externAp.prenom} ${externAp.nom}` : 'Admin'),
      auteurType: monType,
      texte: texte.trim(),
      createdAt: new Date().toISOString(),
      luPar: [monId],
    };
    updateChantier({
      ...chantier,
      messagesChantier: [...messages, newMsg],
      derniereMajContenu: new Date().toISOString(),
    });
    setTexte('');
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const nbNonLus = messages.filter(m => !m.luPar?.includes(monId)).length;

  return (
    <View style={styles.card}>
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
        style={styles.list}
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
                  <Text style={[styles.msgText, isMine && { color: '#fff' }]}>{m.texte}</Text>
                  <Text style={[styles.date, isMine && { color: 'rgba(255,255,255,0.7)' }]}>{formatDate(m.createdAt)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={texte}
          onChangeText={setTexte}
          placeholder="Votre message..."
          multiline
        />
        <Pressable onPress={envoyer} disabled={!texte.trim()} style={[styles.sendBtn, !texte.trim() && { opacity: 0.4 }]}>
          <Text style={styles.sendBtnText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '800', color: '#2C2C2C' },
  subtitle: { fontSize: 11, color: '#8C8077', marginBottom: 8 },
  list: { maxHeight: 360, backgroundColor: '#FAF7F3', borderRadius: 10, paddingHorizontal: 10 },
  empty: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  msgRow: { marginBottom: 6, flexDirection: 'row' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', padding: 10, borderRadius: 12 },
  bubbleMine: { backgroundColor: '#2C2C2C', borderBottomRightRadius: 2 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8DDD0', borderBottomLeftRadius: 2 },
  author: { fontSize: 10, color: '#8C6D2F', fontWeight: '800', marginBottom: 3 },
  msgText: { fontSize: 13, color: '#2C2C2C', lineHeight: 18 },
  date: { fontSize: 9, color: '#8C8077', marginTop: 4, textAlign: 'right' },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginTop: 10 },
  input: { flex: 1, backgroundColor: '#FAF7F3', borderRadius: 10, borderWidth: 1, borderColor: '#E8DDD0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2C2C2C', minHeight: 40, maxHeight: 100 },
  sendBtn: { backgroundColor: '#2C2C2C', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#C9A96E', fontSize: 18, fontWeight: '800' },
  unreadBadge: { backgroundColor: '#E74C3C', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, minWidth: 22, alignItems: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
