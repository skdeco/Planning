/**
 * Modal de création d'un ticket SAV par n'importe quel rôle
 * (admin / architecte / apporteur / client / contractant).
 *
 * Au submit :
 *  1. addTicketSAV avec statut='ouvert' et flag creePar (type/id/nom/createdAt)
 *  2. Si creePar.type !== 'admin' : push notification automatique aux admins
 *     via getAdminPushTokens (helper centralisé)
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, Image,
} from 'react-native';
import { toast } from 'sonner-native';
import { useApp } from '@/app/context/AppContext';
import type { PrioriteSAV, TicketSAV } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { sendPushNotification } from '@/hooks/useNotifications';
import { getAdminPushTokens } from '@/lib/notif/getAdminPushTokens';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { Ico } from '@/components/ui/Ico';

/** Labels client-friendly pour les priorités (différents des labels admin). */
const PRIO_CLIENT_LABELS: Record<PrioriteSAV, string> = {
  basse:   'Pas urgent',
  normale: 'Standard',
  haute:   'Important',
  urgente: 'Urgent',
};
const PRIO_COLORS: Record<PrioriteSAV, { bg: string; border: string; text: string }> = {
  basse:   { bg: '#D4EDDA', border: '#27AE60', text: '#155724' },
  normale: { bg: '#F2E4E1', border: '#5C1F2E', text: '#5C1F2E' },
  haute:   { bg: '#FFF3CD', border: '#F59E0B', text: '#856404' },
  urgente: { bg: '#FEF2F2', border: '#E74C3C', text: '#991B1B' },
};

interface CreePar {
  type: 'admin' | 'apporteur' | 'architecte' | 'contractant' | 'client';
  id: string;
  nom: string;
}

interface Props {
  visible: boolean;
  chantierId: string;
  chantierNom: string;
  creePar: CreePar;
  /**
   * Liste optionnelle des employés pour le dropdown "Assigner à" (admin only).
   * Si non fournie ou créateur non-admin, le dropdown n'est pas affiché.
   */
  employes?: { id: string; prenom: string; nom: string }[];
  onClose: () => void;
}

export function ModalNouveauTicketSAV({ visible, chantierId, chantierNom, creePar, employes, onClose }: Props) {
  const { data, addTicketSAV } = useApp();
  const isAdminCreator = creePar.type === 'admin';
  const [objet, setObjet] = useState('');
  const [description, setDescription] = useState('');
  const [priorite, setPriorite] = useState<PrioriteSAV>('normale');
  const [photos, setPhotos] = useState<string[]>([]);
  const [fichiers, setFichiers] = useState<{ uri: string; nom: string }[]>([]);
  const [assigneA, setAssigneA] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setObjet('');
    setDescription('');
    setPriorite('normale');
    setPhotos([]);
    setFichiers([]);
    setAssigneA('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickPhoto = async () => {
    // ActionSheet natif iOS gère Photothèque/Caméra/Fichiers — pas de bouton
    // Scanner dédié séparé (redondance évitée).
    const files = await pickNativeFile({
      acceptImages: true,
      acceptPdf: false,
      acceptCamera: true,
      multiple: false,
      compressImages: true,
    });
    if (files.length === 0) return;
    const url = await uploadFileToStorage(files[0].uri, `chantiers/${chantierId}/sav`, `sav_photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    if (!url) return;
    setPhotos(prev => [...prev, url]);
  };

  const pickPdf = async () => {
    const files = await pickNativeFile({
      acceptImages: false,
      acceptPdf: true,
      acceptCamera: false,
      multiple: false,
      compressImages: false,
    });
    if (files.length === 0) return;
    const file = files[0];
    const url = await uploadFileToStorage(file.uri, `chantiers/${chantierId}/sav`, `sav_doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    if (!url) return;
    setFichiers(prev => [...prev, { uri: url, nom: file.filename || 'Document.pdf' }]);
  };

  const removePhoto = (uri: string) => {
    setPhotos(prev => prev.filter(p => p !== uri));
  };

  const removeFichier = (uri: string) => {
    setFichiers(prev => prev.filter(f => f.uri !== uri));
  };

  const submit = async () => {
    if (!objet.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const newTicket: TicketSAV = {
        id: `sav_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        chantierId,
        objet: objet.trim(),
        description: description.trim(),
        priorite,
        statut: 'ouvert',
        dateOuverture: now.slice(0, 10),
        assigneA: isAdminCreator && assigneA ? assigneA : undefined,
        photos: photos.length > 0 ? photos : undefined,
        fichiers: fichiers.length > 0 ? fichiers : undefined,
        commentaires: [],
        creePar: { ...creePar, createdAt: now },
        createdAt: now,
        updatedAt: now,
      };
      addTicketSAV(newTicket);

      // Push notif aux admins UNIQUEMENT si non-admin
      if (creePar.type !== 'admin') {
        const tokens = getAdminPushTokens(data.employes || [], data.adminEmployeId);
        if (tokens.length > 0) {
          const msg = `Nouveau SAV chez ${chantierNom} créé par ${creePar.nom}: ${objet.trim()}`;
          // Fire-and-forget : on n'attend pas le résultat pour fermer le modal
          sendPushNotification(tokens, 'Nouveau SAV', msg).catch(() => {});
        }
      }

      reset();
      onClose();
      toast.success('Ticket SAV envoyé');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = objet.trim().length > 0 && description.trim().length > 0 && !submitting;

  return (
    <ModalKeyboard visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Signaler un problème</Text>
              <Text style={styles.headerSub}>{chantierNom}</Text>
            </View>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Titre du problème *</Text>
            <TextInput
              style={styles.input}
              value={objet}
              onChangeText={setObjet}
              placeholder="Ex: Fuite robinet cuisine"
              maxLength={120}
            />

            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Détails du problème, contexte, depuis quand..."
              multiline
            />

            <Text style={styles.label}>Niveau d'urgence</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {(['basse', 'normale', 'haute', 'urgente'] as PrioriteSAV[]).map(p => {
                const c = PRIO_COLORS[p];
                const active = priorite === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPriorite(p)}
                    style={[styles.prioChip, active && { backgroundColor: c.bg, borderColor: c.border }]}
                  >
                    <Text style={[styles.prioChipText, active && { color: c.text, fontWeight: '700' }]}>
                      {PRIO_CLIENT_LABELS[p]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Assigner à — admin only, si liste employés disponible */}
            {isAdminCreator && employes && employes.length > 0 && (
              <>
                <Text style={styles.label}>Assigner à (optionnel)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={{ marginBottom: 12 }}>
                  <Pressable
                    onPress={() => setAssigneA('')}
                    style={[styles.assignChip, !assigneA && styles.assignChipActive]}
                  >
                    <Text style={[styles.assignChipText, !assigneA && styles.assignChipTextActive]}>Non assigné</Text>
                  </Pressable>
                  {employes.map(emp => {
                    const active = assigneA === emp.id;
                    return (
                      <Pressable
                        key={emp.id}
                        onPress={() => setAssigneA(emp.id)}
                        style={[styles.assignChip, active && styles.assignChipActive]}
                      >
                        <Text style={[styles.assignChipText, active && styles.assignChipTextActive]}>{emp.prenom}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={styles.label}>Photos</Text>
            {photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginBottom: 8 }}>
                {photos.map(uri => (
                  <View key={uri} style={{ width: 72, height: 72, position: 'relative' }}>
                    <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 6 }} resizeMode="cover" />
                    <Pressable
                      onPress={() => removePhoto(uri)}
                      style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable onPress={pickPhoto} style={[styles.btn, styles.btnSecondary, { marginBottom: 10 }]}>
              <Text style={styles.btnSecondaryText}>Ajouter une photo</Text>
            </Pressable>

            {/* Fichiers PDF — bouton séparé pour distinction sémantique */}
            <Text style={styles.label}>Fichiers PDF</Text>
            {fichiers.length > 0 && (
              <View style={{ gap: 6, marginBottom: 8 }}>
                {fichiers.map(f => (
                  <View key={f.uri} style={styles.fichierRow}>
                    <Ico e="📄" size={20} />
                    <Text style={styles.fichierNom} numberOfLines={1}>{f.nom}</Text>
                    <Pressable onPress={() => removeFichier(f.uri)} style={{ padding: 6 }}>
                      <Ico e="🗑" size={16} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Pressable onPress={pickPdf} style={[styles.btn, styles.btnSecondary, { marginBottom: 14 }]}>
              <Text style={styles.btnSecondaryText}>Ajouter un PDF</Text>
            </Pressable>

            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={[styles.btn, styles.btnPrimary, !canSubmit && { opacity: 0.5 }]}
            >
              <Text style={styles.btnPrimaryText}>
                {submitting ? 'Envoi...' : 'Envoyer la demande'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </ModalKeyboard>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '80%', overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#EDE2D6',
    backgroundColor: '#5C1F2E',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#5C1F2E', fontSize: 14, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: '#6E5F54', marginBottom: 4, marginTop: 6 },
  input: {
    backgroundColor: '#FAF5EF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#2B1D14',
    borderWidth: 1, borderColor: '#EDE2D6', marginBottom: 8,
  },
  prioChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderColor: '#EDE2D6',
    backgroundColor: '#fff',
  },
  prioChipText: { fontSize: 11, color: '#6E5F54', fontWeight: '600' },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#5C1F2E' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnSecondary: { backgroundColor: '#F1E7DC', borderWidth: 1, borderColor: '#EDE2D6' },
  btnSecondaryText: { color: '#5C1F2E', fontSize: 13, fontWeight: '600' },
  assignChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 14, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#EDE2D6',
  },
  assignChipActive: { backgroundColor: '#5C1F2E', borderColor: '#5C1F2E' },
  assignChipText: { fontSize: 11, color: '#6E5F54', fontWeight: '600' },
  assignChipTextActive: { color: '#fff', fontWeight: '700' },
  fichierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8, backgroundColor: '#FAF5EF',
    borderWidth: 1, borderColor: '#EDE2D6',
  },
  fichierNom: { flex: 1, fontSize: 13, color: '#5C1F2E', fontWeight: '600' },
});
