// Écran boîte de réception : fichiers reçus via la Share Extension iOS
// (manifest AppGroup). Consultation, suppression, et « Placer dans… » :
// assigner un fichier à un chantier + une destination (Documents / Plans / Photos).

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';

import { DS, font, radius, space } from '@/constants/design';
import { useApp } from '@/app/context/AppContext';
import { notifyInboxChanged, useInbox } from '@/hooks/useInbox';
import { removeInboxItem, getInboxItemPath, type InboxItem } from '@/lib/share/inboxStore';
import { uploadFileToStorage } from '@/lib/supabase';
import { CHANTIER_DOC_CATEGORIES, type ChantierDoc, type ChantierDocCategorie, type PhotoChantier, type PlanChantier } from '@/app/types';

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  return '📎';
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatRelativeDate(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const rid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function InboxScreen(): React.ReactElement {
  const { items, refresh } = useInbox();
  const { data, currentUser, updateChantier, addPlanChantier, addPhotoChantier } = useApp();

  const [placing, setPlacing] = useState<InboxItem | null>(null);
  const [targetChantierId, setTargetChantierId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chantiers = useMemo(
    () => [...(data.chantiers || [])].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')),
    [data.chantiers],
  );

  const handleDelete = useCallback((item: InboxItem): void => {
    Alert.alert('Supprimer ce fichier ?', item.filename, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => { removeInboxItem(item.id); notifyInboxChanged(); refresh(); } },
    ]);
  }, [refresh]);

  const cancelPlace = () => { setPlacing(null); setTargetChantierId(null); };

  const finishPlace = () => {
    if (placing) { removeInboxItem(placing.id); notifyInboxChanged(); }
    setBusy(false);
    cancelPlace();
    refresh();
    toast.success('Fichier classé');
  };

  const uploadInbox = async (item: InboxItem, chantierId: string, sub: string): Promise<{ url: string; nom: string } | null> => {
    const path = getInboxItemPath(item);
    if (!path) return null;
    const url = await uploadFileToStorage(path, `chantiers/${chantierId}/${sub}`, rid(sub));
    return url ? { url, nom: item.filename } : null;
  };

  const placeDrive = async (categorie: ChantierDocCategorie) => {
    if (!placing || !targetChantierId || busy) return;
    const chantier = chantiers.find(c => c.id === targetChantierId);
    if (!chantier) return;
    setBusy(true);
    try {
      const up = await uploadInbox(placing, targetChantierId, 'drive');
      if (!up) { setBusy(false); toast.error("L'envoi a échoué"); return; }
      const doc: ChantierDoc = { id: rid('doc'), categorie, nom: up.nom, fichierUrl: up.url, uploadedAt: new Date().toISOString(), uploadedPar: currentUser?.nom };
      updateChantier({ ...chantier, documents: [...(chantier.documents || []), doc] });
      finishPlace();
    } catch { setBusy(false); toast.error("L'envoi a échoué"); }
  };

  const placePlans = async () => {
    if (!placing || !targetChantierId || busy) return;
    const chantier = chantiers.find(c => c.id === targetChantierId);
    if (!chantier) return;
    setBusy(true);
    try {
      const up = await uploadInbox(placing, targetChantierId, 'plans');
      if (!up) { setBusy(false); toast.error("L'envoi a échoué"); return; }
      const plan: PlanChantier = { id: rid('plan'), nom: up.nom, fichier: up.url, visiblePar: 'tous', uploadedAt: new Date().toISOString() };
      addPlanChantier(targetChantierId, plan);
      finishPlace();
    } catch { setBusy(false); toast.error("L'envoi a échoué"); }
  };

  const placePhotos = async () => {
    if (!placing || !targetChantierId || busy) return;
    setBusy(true);
    try {
      const up = await uploadInbox(placing, targetChantierId, 'photos');
      if (!up) { setBusy(false); toast.error("L'envoi a échoué"); return; }
      const now = new Date();
      const photo: PhotoChantier = {
        id: rid('photo'), chantierId: targetChantierId, employeId: currentUser?.employeId || 'admin',
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        uri: up.url, nom: up.nom, createdAt: now.toISOString(), source: 'manuel',
      };
      addPhotoChantier(photo);
      finishPlace();
    } catch { setBusy(false); toast.error("L'envoi a échoué"); }
  };

  const renderItem = useCallback(({ item }: ListRenderItemInfo<InboxItem>) => {
    const subtitle = [formatBytes(item.fileSize), formatRelativeDate(item.createdAt)].filter(s => s.length > 0).join(' · ');
    return (
      <View style={{ backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text style={{ fontSize: 28 }}>{getFileIcon(item.mimeType)}</Text>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: DS.text, fontSize: font.md, fontWeight: font.semibold }}>{item.filename}</Text>
            <Text numberOfLines={1} style={{ color: DS.textSecondary, fontSize: font.compact, marginTop: 2 }}>{subtitle}</Text>
          </View>
          <Pressable onPress={() => handleDelete(item)} hitSlop={8} style={{ paddingVertical: space.xs, paddingHorizontal: space.sm }}>
            <Text style={{ color: DS.error, fontSize: font.compact, fontWeight: font.semibold }}>Supprimer</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => { setTargetChantierId(null); setPlacing(item); }} style={{ backgroundColor: DS.primary, borderRadius: radius.md, paddingVertical: space.sm, alignItems: 'center', marginTop: space.sm }}>
          <Text style={{ color: DS.textInverse, fontSize: font.md, fontWeight: font.semibold }}>Placer dans…</Text>
        </Pressable>
      </View>
    );
  }, [handleDelete]);

  const isImage = placing?.mimeType.startsWith('image/');
  const targetChantier = chantiers.find(c => c.id === targetChantierId);

  return (
    <View style={{ flex: 1, backgroundColor: DS.background }}>
      <Stack.Screen options={{ headerShown: true, title: 'Boîte de réception' }} />

      {items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxxl }}>
          <Text style={{ fontSize: 48, marginBottom: space.md }}>📥</Text>
          <Text style={{ color: DS.text, fontSize: font.title, fontWeight: font.semibold, marginBottom: space.sm, textAlign: 'center' }}>Aucun fichier en attente</Text>
          <Text style={{ color: DS.textSecondary, fontSize: font.md, textAlign: 'center', lineHeight: 20 }}>Partagez un fichier vers SK DECO depuis Mail, Photos ou Files pour le voir ici.</Text>
        </View>
      ) : (
        <FlatList data={items} keyExtractor={(item) => item.id} renderItem={renderItem} contentContainerStyle={{ padding: space.lg }} />
      )}

      {/* Placer dans… : chantier → destination */}
      {placing && (
        <Modal transparent visible animationType="slide" onRequestClose={cancelPlace}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={cancelPlace} />
            <View style={{ backgroundColor: DS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, maxHeight: '80%' }}>
              <Text style={{ fontSize: font.title, fontWeight: font.bold, color: DS.textStrong, marginBottom: 4 }} numberOfLines={1}>Placer « {placing.filename} »</Text>

              {!targetChantierId ? (
                <>
                  <Text style={{ color: DS.textSecondary, fontSize: font.compact, marginBottom: space.sm }}>1. Choisir le chantier</Text>
                  <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                    {chantiers.map(c => (
                      <Pressable key={c.id} onPress={() => setTargetChantierId(c.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: DS.border }}>
                        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: c.couleur }} />
                        <Text style={{ flex: 1, color: DS.text, fontSize: font.md, fontWeight: font.semibold }} numberOfLines={1}>{c.nom}</Text>
                        <Text style={{ color: DS.textSecondary, fontSize: font.lg }}>›</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <>
                  <Pressable onPress={() => setTargetChantierId(null)} style={{ paddingVertical: space.xs, marginBottom: space.xs }}>
                    <Text style={{ color: DS.primary, fontSize: font.compact, fontWeight: font.semibold }}>‹ {targetChantier?.nom} — changer</Text>
                  </Pressable>
                  <Text style={{ color: DS.textSecondary, fontSize: font.compact, marginBottom: space.sm }}>2. Où le classer ?</Text>
                  <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                    <Text style={{ color: DS.textStrong, fontSize: font.md, fontWeight: font.semibold, marginBottom: space.xs }}>Documents</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
                      {CHANTIER_DOC_CATEGORIES.map(cat => (
                        <Pressable key={cat.key} onPress={() => placeDrive(cat.key)} disabled={busy} style={{ backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.full, paddingVertical: space.sm, paddingHorizontal: space.md }}>
                          <Text style={{ color: DS.text, fontSize: font.compact, fontWeight: font.semibold }}>{cat.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable onPress={placePlans} disabled={busy} style={{ backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center', marginBottom: space.sm }}>
                      <Text style={{ color: DS.text, fontSize: font.md, fontWeight: font.semibold }}>📐 Plans</Text>
                    </Pressable>
                    {isImage && (
                      <Pressable onPress={placePhotos} disabled={busy} style={{ backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' }}>
                        <Text style={{ color: DS.text, fontSize: font.md, fontWeight: font.semibold }}>🖼️ Photos</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                </>
              )}

              {busy && <View style={{ paddingTop: space.md, alignItems: 'center' }}><ActivityIndicator color={DS.primary} /></View>}

              <Pressable onPress={cancelPlace} style={{ paddingVertical: space.md, alignItems: 'center', marginTop: space.sm }}>
                <Text style={{ color: DS.textSecondary, fontSize: font.md, fontWeight: font.semibold }}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
