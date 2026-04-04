import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, Platform, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { useRefresh } from '@/hooks/useRefresh';
import type { AgendaEvent } from '@/app/types';

const COULEURS = ['#1A3A6B', '#27AE60', '#E74C3C', '#F59E0B', '#9B59B6', '#00BCD4', '#FF6B35'];
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateFr(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00');
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

function genId() { return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

export default function AgendaScreen() {
  const { data, currentUser, isHydrated, addAgendaEvent, updateAgendaEvent, deleteAgendaEvent } = useApp();
  const { refreshing, onRefresh } = useRefresh();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login' as any);
  }, [isHydrated, currentUser]);

  const isAdmin = currentUser?.role === 'admin';
  if (!isAdmin) return null;

  const today = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    titre: '', description: '', date: today, heureDebut: '09:00', heureFin: '10:00',
    lieu: '', couleur: COULEURS[0], invites: [] as string[],
  });

  // Tous les admins (pour les invitations) — on considère les employés admin
  const admins = useMemo(() =>
    data.employes.filter(e => e.role === 'admin'),
    [data.employes]
  );

  const events = useMemo(() =>
    (data.agendaEvents || [])
      .filter(e => e.date === selectedDate)
      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)),
    [data.agendaEvents, selectedDate]
  );

  const allEvents = useMemo(() =>
    (data.agendaEvents || []).sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut)),
    [data.agendaEvents]
  );

  // Navigation jours
  const prevDay = () => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setSelectedDate(toYMD(d)); };
  const nextDay = () => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setSelectedDate(toYMD(d)); };

  const openNew = () => {
    setEditId(null);
    setForm({ titre: '', description: '', date: selectedDate, heureDebut: '09:00', heureFin: '10:00', lieu: '', couleur: COULEURS[0], invites: [] });
    setShowForm(true);
  };

  const openEdit = (evt: AgendaEvent) => {
    setEditId(evt.id);
    setForm({ titre: evt.titre, description: evt.description || '', date: evt.date, heureDebut: evt.heureDebut, heureFin: evt.heureFin || '', lieu: evt.lieu || '', couleur: evt.couleur, invites: evt.invites });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.titre.trim()) return;
    const event: AgendaEvent = {
      id: editId || genId(),
      titre: form.titre.trim(),
      description: form.description.trim() || undefined,
      date: form.date,
      heureDebut: form.heureDebut,
      heureFin: form.heureFin || undefined,
      lieu: form.lieu.trim() || undefined,
      couleur: form.couleur,
      createdBy: 'admin',
      createdByNom: 'Admin',
      invites: form.invites,
      acceptes: editId ? (data.agendaEvents || []).find(e => e.id === editId)?.acceptes || [] : [],
      refuses: editId ? (data.agendaEvents || []).find(e => e.id === editId)?.refuses || [] : [],
      createdAt: editId ? (data.agendaEvents || []).find(e => e.id === editId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
    };
    if (editId) updateAgendaEvent(event);
    else addAgendaEvent(event);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    const doDelete = () => deleteAgendaEvent(id);
    if (Platform.OS === 'web') { if (window.confirm('Supprimer ce rendez-vous ?')) doDelete(); }
    else Alert.alert('Supprimer', 'Supprimer ce rendez-vous ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: doDelete }]);
  };

  const toggleInvite = (id: string) => {
    setForm(f => ({
      ...f,
      invites: f.invites.includes(id) ? f.invites.filter(i => i !== id) : [...f.invites, id],
    }));
  };

  // Prochains RDV (7 prochains jours)
  const prochains = useMemo(() => {
    const dans7j = new Date(); dans7j.setDate(dans7j.getDate() + 7);
    return allEvents.filter(e => e.date >= today && e.date <= toYMD(dans7j));
  }, [allEvents, today]);

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📅 Agenda</Text>
        <Pressable style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>+ Nouveau</Text>
        </Pressable>
      </View>

      {/* Navigation jour */}
      <View style={styles.navRow}>
        <Pressable style={styles.navBtn} onPress={prevDay}><Text style={styles.navArrow}>‹</Text></Pressable>
        <Pressable onPress={() => setSelectedDate(today)}>
          <Text style={styles.navLabel}>{formatDateFr(selectedDate)}</Text>
        </Pressable>
        <Pressable style={styles.navBtn} onPress={nextDay}><Text style={styles.navArrow}>›</Text></Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1A3A6B']} tintColor="#1A3A6B" />}>

        {/* Events du jour */}
        {events.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📭</Text>
            <Text style={{ fontSize: 15, color: '#687076' }}>Aucun rendez-vous ce jour</Text>
          </View>
        )}
        {events.map(evt => (
          <Pressable key={evt.id} style={[styles.eventCard, { borderLeftColor: evt.couleur }]} onPress={() => openEdit(evt)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTime}>{evt.heureDebut}{evt.heureFin ? ` — ${evt.heureFin}` : ''}</Text>
                <Text style={styles.eventTitle}>{evt.titre}</Text>
                {evt.description ? <Text style={styles.eventDesc}>{evt.description}</Text> : null}
                {evt.lieu ? <Text style={styles.eventLieu}>📍 {evt.lieu}</Text> : null}
              </View>
              <Pressable onPress={() => handleDelete(evt.id)} style={{ padding: 4 }}>
                <Text style={{ color: '#E74C3C', fontSize: 14 }}>🗑</Text>
              </Pressable>
            </View>
            {/* Invités */}
            {evt.invites.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {evt.invites.map(invId => {
                  const emp = data.employes.find(e => e.id === invId);
                  const accepted = evt.acceptes.includes(invId);
                  const refused = evt.refuses.includes(invId);
                  return (
                    <View key={invId} style={[styles.inviteBadge, accepted && { backgroundColor: '#D4EDDA' }, refused && { backgroundColor: '#F8D7DA' }]}>
                      <Text style={{ fontSize: 11, color: accepted ? '#155724' : refused ? '#721C24' : '#687076' }}>
                        {emp ? `${emp.prenom} ${emp.nom.charAt(0)}.` : invId}
                        {accepted ? ' ✓' : refused ? ' ✕' : ' ?'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </Pressable>
        ))}

        {/* Prochains RDV */}
        {prochains.length > 0 && selectedDate === today && (
          <>
            <Text style={styles.sectionTitle}>Prochains rendez-vous</Text>
            {prochains.filter(e => e.date > today).map(evt => (
              <Pressable key={evt.id} style={[styles.eventCardSmall, { borderLeftColor: evt.couleur }]} onPress={() => { setSelectedDate(evt.date); }}>
                <Text style={{ fontSize: 11, color: '#687076' }}>{formatDateFr(evt.date)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#11181C' }}>{evt.heureDebut} — {evt.titre}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* Modal formulaire */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowForm(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{editId ? 'Modifier' : 'Nouveau rendez-vous'}</Text>

              <Text style={styles.label}>Titre *</Text>
              <TextInput style={styles.input} value={form.titre} onChangeText={v => setForm(f => ({ ...f, titre: v }))} placeholder="Ex: Réunion chantier FOCH" />

              <Text style={styles.label}>Description</Text>
              <TextInput style={[styles.input, { minHeight: 60 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline placeholder="Détails..." />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Date</Text>
                  <TextInput style={styles.input} value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="AAAA-MM-JJ" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Début</Text>
                  <TextInput style={styles.input} value={form.heureDebut} onChangeText={v => setForm(f => ({ ...f, heureDebut: v }))} placeholder="HH:MM" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Fin</Text>
                  <TextInput style={styles.input} value={form.heureFin} onChangeText={v => setForm(f => ({ ...f, heureFin: v }))} placeholder="HH:MM" />
                </View>
              </View>

              <Text style={styles.label}>Lieu</Text>
              <TextInput style={styles.input} value={form.lieu} onChangeText={v => setForm(f => ({ ...f, lieu: v }))} placeholder="Adresse ou chantier" />

              <Text style={styles.label}>Couleur</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {COULEURS.map(c => (
                  <Pressable key={c} onPress={() => setForm(f => ({ ...f, couleur: c }))}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: form.couleur === c ? 3 : 0, borderColor: '#11181C' }} />
                ))}
              </View>

              {admins.length > 0 && (
                <>
                  <Text style={styles.label}>Inviter</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {admins.map(adm => (
                      <Pressable key={adm.id}
                        style={[styles.inviteChip, form.invites.includes(adm.id) && styles.inviteChipActive]}
                        onPress={() => toggleInvite(adm.id)}>
                        <Text style={[styles.inviteChipText, form.invites.includes(adm.id) && { color: '#fff' }]}>
                          {adm.prenom} {adm.nom.charAt(0)}.
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <Pressable style={[styles.saveBtn, !form.titre.trim() && { opacity: 0.5 }]} onPress={handleSave} disabled={!form.titre.trim()}>
                <Text style={styles.saveBtnText}>{editId ? 'Modifier' : 'Créer le rendez-vous'}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#11181C' },
  addBtn: { backgroundColor: '#1A3A6B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  navRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E6EA' },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 20, color: '#11181C' },
  navLabel: { fontSize: 15, fontWeight: '700', color: '#1A3A6B' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#11181C', marginTop: 20, marginBottom: 8 },
  eventCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  eventCardSmall: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderLeftWidth: 3, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  eventTime: { fontSize: 12, fontWeight: '700', color: '#1A3A6B', marginBottom: 2 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  eventDesc: { fontSize: 13, color: '#687076', marginTop: 2 },
  eventLieu: { fontSize: 12, color: '#687076', marginTop: 4 },
  inviteBadge: { backgroundColor: '#F2F4F7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#11181C', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#687076', marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: '#F2F4F7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#11181C', borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 4 },
  inviteChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F2F4F7', borderWidth: 1, borderColor: '#E2E6EA' },
  inviteChipActive: { backgroundColor: '#1A3A6B', borderColor: '#1A3A6B' },
  inviteChipText: { fontSize: 13, fontWeight: '600', color: '#687076' },
  saveBtn: { backgroundColor: '#1A3A6B', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
