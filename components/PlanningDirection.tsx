import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, TextInput, Platform,
  Alert, RefreshControl, useWindowDimensions,
} from 'react-native';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { useApp } from '@/app/context/AppContext';
import { useRefresh } from '@/hooks/useRefresh';
import type { AgendaEvent } from '@/app/types';
import { formatDateFR, parseDateFR } from '@/lib/date/format';
import { Ico } from '@/components/ui/Ico';
import { cleUtilisateur, nomParticipant, participantsDirection } from '@/lib/espaces';
import { InvitationsRdv } from '@/components/espaces/InvitationsRdv';

import { useLanguage } from '@/app/context/LanguageContext';
import { tm, traduit, localeMn } from '@/lib/menuiserie/i18n';
const COULEURS = ['#2C2C2C', '#27AE60', '#E74C3C', '#F59E0B', '#9B59B6', '#00BCD4', '#FF6B35'];
const JOURS_COURT = traduit(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
const MOIS = traduit(['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']);
const HEURES_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const h = Math.floor(i / 2) + 6;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
}); // 06:00 à 20:00

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genId() { return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

const HOUR_HEIGHT = 40;
const HEADER_HEIGHT = 36;
const TIME_COL = 38;

export function PlanningDirection() {
  useLanguage(); // re-rendu au changement de langue
  const { data, currentUser, addAgendaEvent, updateAgendaEvent, deleteAgendaEvent } = useApp();
  const moi = cleUtilisateur(currentUser);
  const estAdmin = currentUser?.role === 'admin';
  // Invitables : employés + contacts / sous-traitants ayant le Planning direction (hors soi-même)
  const invitables = useMemo(() => {
    const liste = data.employes.map(e => ({ cle: e.id, nom: `${e.prenom} ${e.nom.charAt(0)}.` }));
    participantsDirection(data).forEach(p => {
      if (!liste.some(l => l.cle === p.cle)) liste.push({ cle: p.cle, nom: p.nom });
    });
    return liste.filter(l => l.cle !== moi);
  }, [data, moi]);
  const { refreshing, onRefresh } = useRefresh();
  const { width: screenW } = useWindowDimensions();

  // Weekend (samedi/dimanche) : afficher par défaut la semaine suivante
  const [weekOffset, setWeekOffset] = useState(() => {
    const dow = new Date().getDay(); // 0=dim, 6=sam
    return (dow === 0 || dow === 6) ? 1 : 0;
  });
  const [directionVue, setDirectionVue] = useState<'semaine' | 'jour'>('semaine');
  const [dayOffset, setDayOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    titre: '', description: '', date: toYMD(new Date()), heureDebut: '09:00', heureFin: '10:00',
    lieu: '', couleur: COULEURS[0], invites: [] as string[], visiblePar: [] as string[],
    chantierId: '', recurrence: 'aucune' as string, recurrenceFinDate: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showHeureDebutPicker, setShowHeureDebutPicker] = useState(false);
  const [showHeureFinPicker, setShowHeureFinPicker] = useState(false);

  // Semaine courante
  const today = new Date();
  const monday = useMemo(() => {
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [monday]);

  const weekLabel = `${days[0].getDate()} ${MOIS[days[0].getMonth()].slice(0, 3)} — ${days[6].getDate()} ${MOIS[days[6].getMonth()].slice(0, 3)} ${days[6].getFullYear()}`;

  // Events de la semaine (inclut les récurrences)
  const weekEvents = useMemo(() => {
    const allEvents = data.agendaEvents || [];
    const start = toYMD(days[0]);
    const end = toYMD(days[6]);
    const result: AgendaEvent[] = [];
    allEvents.forEach(evt => {
      if (evt.date >= start && evt.date <= end) {
        result.push(evt);
      }
      // Récurrences
      if (evt.recurrence && evt.recurrence !== 'aucune') {
        const evtDate = new Date(evt.date + 'T12:00:00');
        const finDate = evt.recurrenceFinDate ? new Date(evt.recurrenceFinDate + 'T12:00:00') : new Date(today.getFullYear() + 1, 0, 1);
        let cursor = new Date(evtDate);
        while (cursor <= finDate) {
          const curYmd = toYMD(cursor);
          if (curYmd !== evt.date && curYmd >= start && curYmd <= end) {
            result.push({ ...evt, id: `${evt.id}_rec_${curYmd}`, date: curYmd });
          }
          if (evt.recurrence === 'quotidien') cursor.setDate(cursor.getDate() + 1);
          else if (evt.recurrence === 'hebdomadaire') cursor.setDate(cursor.getDate() + 7);
          else cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    });
    return result;
  }, [data.agendaEvents, days]);

  // Plage horaire adaptative
  const { startHour, endHour } = useMemo(() => {
    let min = 8, max = 19;
    weekEvents.forEach(e => {
      const h = parseInt(e.heureDebut.split(':')[0]);
      const hf = e.heureFin ? parseInt(e.heureFin.split(':')[0]) : h + 1;
      if (h < min) min = h;
      if (hf > max) max = hf;
    });
    return { startHour: Math.max(6, min), endHour: Math.min(21, max + 1) };
  }, [weekEvents]);

  const totalHours = endHour - startHour;
  const dayColWidth = Math.floor((screenW - TIME_COL) / 7);

  // Sauvegarder RDV
  const handleSave = () => {
    if (!form.titre.trim()) return;
    const existant = editId ? (data.agendaEvents || []).find(e => e.id === editId) : undefined;
    const event: AgendaEvent = {
      id: editId || genId(),
      titre: form.titre.trim(),
      description: form.description.trim() || undefined,
      date: form.date,
      heureDebut: form.heureDebut,
      heureFin: form.heureFin || undefined,
      lieu: form.lieu.trim() || undefined,
      couleur: form.couleur,
      chantierId: form.chantierId || undefined,
      createdBy: existant?.createdBy || moi,
      createdByNom: existant?.createdByNom || currentUser?.nom || nomParticipant(moi, data),
      invites: form.invites, visiblePar: form.visiblePar,
      // Le créateur est d'office présent ; on garde les réponses déjà données
      acceptes: Array.from(new Set([...(existant?.acceptes || []), existant?.createdBy || moi])),
      refuses: existant?.refuses || [],
      contrePropositions: existant?.contrePropositions,
      recurrence: (form.recurrence as any) || undefined,
      recurrenceFinDate: form.recurrenceFinDate || undefined,
      createdAt: editId ? (data.agendaEvents || []).find(e => e.id === editId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
    };
    if (editId) updateAgendaEvent(event);
    else addAgendaEvent(event);
    setShowForm(false);
  };

  const openNew = (date?: string, heure?: string) => {
    setEditId(null);
    setForm({ titre: '', description: '', date: date || toYMD(days[0]), heureDebut: heure || '09:00', heureFin: heure ? `${String(parseInt(heure) + 1).padStart(2, '0')}:00` : '10:00', lieu: '', couleur: COULEURS[0], invites: [], visiblePar: [], chantierId: '', recurrence: 'aucune', recurrenceFinDate: '' });
    setShowForm(true);
  };

  const openEdit = (evt: AgendaEvent) => {
    setEditId(evt.id.includes('_rec_') ? evt.id.split('_rec_')[0] : evt.id);
    setForm({ titre: evt.titre, description: evt.description || '', date: evt.date, heureDebut: evt.heureDebut, heureFin: evt.heureFin || '', lieu: evt.lieu || '', couleur: evt.couleur, invites: evt.invites || [], visiblePar: evt.visiblePar || [], chantierId: evt.chantierId || '', recurrence: evt.recurrence || 'aucune', recurrenceFinDate: evt.recurrenceFinDate || '' });
    setShowForm(true);
  };

  // Sélecteur déroulant
  const PickerModal = ({ visible, onClose, options, onSelect, title }: { visible: boolean; onClose: () => void; options: { label: string; value: string }[]; onSelect: (v: string) => void; title: string }) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={onClose}>
        <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 8, width: '100%', maxWidth: 320, maxHeight: 400 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#5C1F2E', paddingHorizontal: 12, paddingVertical: 8 }}>{title}</Text>
          <ScrollView>
            {options.map(opt => (
              <Pressable key={opt.value} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 }}
                onPress={() => { onSelect(opt.value); onClose(); }}>
                <Text style={{ fontSize: 15, color: '#2B1D14' }}>{opt.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );

  // Générer les dates du mois pour le sélecteur
  const dateOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    const d = new Date();
    for (let i = 0; i < 60; i++) {
      const ymd = toYMD(d);
      const jour = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()];
      opts.push({ label: `${jour} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`, value: ymd });
      d.setDate(d.getDate() + 1);
    }
    return opts;
  }, []);

  const heureOptions = HEURES_OPTIONS.map(h => ({ label: h, value: h }));

  return (
    <>
      {/* Invitations reçues et contre-propositions à traiter */}
      <InvitationsRdv />
      {/* Toggle semaine/jour + navigation */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#EDE2D6', gap: 4 }}>
        <Pressable style={{ backgroundColor: directionVue === 'semaine' ? '#5C1F2E' : '#F1E7DC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }} onPress={() => setDirectionVue('semaine')}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: directionVue === 'semaine' ? '#fff' : '#6E5F54' }}>{tm("7j")}</Text>
        </Pressable>
        <Pressable style={{ backgroundColor: directionVue === 'jour' ? '#5C1F2E' : '#F1E7DC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }} onPress={() => setDirectionVue('jour')}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: directionVue === 'jour' ? '#fff' : '#6E5F54' }}>{tm("Jour")}</Text>
        </Pressable>
        <Pressable onPress={() => directionVue === 'semaine' ? setWeekOffset(w => w - 1) : setDayOffset(d => d - 1)} style={{ padding: 4 }}><Text style={{ fontSize: 16 }}>‹</Text></Pressable>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#2B1D14', textAlign: 'center' }}>
          {directionVue === 'semaine' ? weekLabel : (() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d.toLocaleDateString(localeMn(), { weekday: 'long', day: 'numeric', month: 'long' }); })()}
        </Text>
        <Pressable onPress={() => directionVue === 'semaine' ? setWeekOffset(w => w + 1) : setDayOffset(d => d + 1)} style={{ padding: 4 }}><Text style={{ fontSize: 16 }}>›</Text></Pressable>
        <Pressable onPress={() => { setWeekOffset(0); setDayOffset(0); }} style={{ backgroundColor: '#F1E7DC', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#5C1F2E' }}>{tm("Auj.")}</Text>
        </Pressable>
        <Pressable style={{ backgroundColor: '#5C1F2E', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }} onPress={() => openNew()}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{tm("+ RDV")}</Text>
        </Pressable>
      </View>

      {/* ── VUE JOUR ── */}
      {directionVue === 'jour' && (() => {
        const d = new Date(); d.setDate(d.getDate() + dayOffset);
        const dateStr = toYMD(d);
        const evtsJour = (data.agendaEvents || []).filter(e => e.date === dateStr).sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
        return (
          <ScrollView style={{ flex: 1, backgroundColor: '#FAF5EF' }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
            {evtsJour.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ico e="📭" size={28} />
                <Text style={{ fontSize: 14, color: '#6E5F54' }}>{tm("Aucun rendez-vous")}</Text>
                <Pressable style={{ marginTop: 12, backgroundColor: '#5C1F2E', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }} onPress={() => openNew(dateStr)}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{tm("+ Ajouter un RDV")}</Text>
                </Pressable>
              </View>
            ) : (
              evtsJour.map(evt => {
                const ch = evt.chantierId ? data.chantiers.find(c => c.id === evt.chantierId) : null;
                return (
                  <Pressable key={evt.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: evt.couleur, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
                    onPress={() => openEdit(evt)}
                    onLongPress={() => {
                      if (Platform.OS === 'web') {
                        const nd = parseDateFR(window.prompt(tm("Déplacer à quelle date ? (JJ/MM/AAAA)"), formatDateFR(evt.date)));
                        if (nd && nd !== evt.date) updateAgendaEvent({ ...evt, date: nd });
                      } else {
                        const jours: string[] = [];
                        for (let i = -3; i <= 7; i++) { const dt = new Date(); dt.setDate(dt.getDate() + i); jours.push(toYMD(dt)); }
                        Alert.alert(tm("Déplacer \"{0}\"", evt.titre), tm("Nouvelle date :"), [{ text: tm("Annuler"), style: 'cancel' }, ...jours.filter(j => j !== evt.date).slice(0, 7).map(j => ({
                          text: new Date(j + 'T12:00:00').toLocaleDateString(localeMn(), { weekday: 'short', day: 'numeric', month: 'short' }),
                          onPress: () => updateAgendaEvent({ ...evt, date: j }),
                        }))]);
                      }
                    }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ backgroundColor: evt.couleur + '15', width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: evt.couleur }}>{evt.heureDebut}</Text>
                        {evt.heureFin && <Text style={{ fontSize: 10, color: evt.couleur }}>{evt.heureFin}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#2B1D14' }}>{evt.titre}</Text>
                        {evt.description ? <Text style={{ fontSize: 13, color: '#6E5F54', marginTop: 2 }}>{evt.description}</Text> : null}
                        {evt.lieu ? <Text style={{ fontSize: 12, color: '#6E5F54', marginTop: 2 }}>{evt.lieu}</Text> : null}
                        {ch ? <Text style={{ fontSize: 12, color: ch.couleur, fontWeight: '600', marginTop: 2 }}>{ch.nom}</Text> : null}
                        {evt.invites.length > 0 && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {evt.invites.map(id => {
                              const etat = (evt.acceptes || []).includes(id) ? ' ✓' : (evt.refuses || []).includes(id) ? ' ✗' : ' …';
                              return <View key={id} style={{ backgroundColor: '#F2E4E1', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, color: '#5C1F2E', fontWeight: '600' }}>{nomParticipant(id, data).split(' ')[0]}{etat}</Text></View>;
                            })}
                          </View>
                        )}
                      </View>
                      {(estAdmin || evt.createdBy === moi) && (
                        <Pressable onPress={() => deleteAgendaEvent(evt.id)} style={{ padding: 6 }} accessibilityLabel={tm("Supprimer le RDV")}>
                          <Ico e="🗑" size={16} color="#E74C3C" />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        );
      })()}

      {/* ── VUE SEMAINE ── */}
      {directionVue === 'semaine' && <>
      {/* Header jours — FIXE (ne défile pas) */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EDE2D6', backgroundColor: '#FAF5EF' }}>
        <View style={{ width: TIME_COL, height: HEADER_HEIGHT, justifyContent: 'center', alignItems: 'center' }} />
        {days.map((day, i) => {
          const isToday = toYMD(day) === toYMD(new Date());
          return (
            <View key={i} style={{ width: dayColWidth, height: HEADER_HEIGHT, justifyContent: 'center', alignItems: 'center', backgroundColor: isToday ? '#F2E4E1' : undefined }}>
              <Text style={{ fontSize: 9, fontWeight: '500', color: isToday ? '#5C1F2E' : '#6E5F54' }}>{JOURS_COURT[i]}</Text>
              <Text style={{ fontSize: 13, fontWeight: isToday ? '800' : '600', color: isToday ? '#5C1F2E' : '#2B1D14' }}>{day.getDate()}</Text>
            </View>
          );
        })}
      </View>

      {/* Grille horaire — défile verticalement */}
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#5C1F2E']} tintColor="#5C1F2E" />}>
        {/* Lignes horaires */}
        <View style={{ flexDirection: 'row' }}>
          {/* Colonne heures */}
          <View style={{ width: TIME_COL }}>
            {Array.from({ length: totalHours }, (_, i) => (
              <View key={i} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start', paddingTop: 2, paddingRight: 4, alignItems: 'flex-end', borderTopWidth: 0.5, borderTopColor: '#EDE2D6' }}>
                <Text style={{ fontSize: 10, color: '#6E5F54', fontWeight: '500' }}>{String(startHour + i).padStart(2, '0')}:00</Text>
              </View>
            ))}
          </View>

          {/* Colonnes jours avec RDV */}
          {days.map((day, dayIdx) => {
            const dateStr = toYMD(day);
            const dayEvents = weekEvents.filter(e => e.date === dateStr);
            const isToday = dateStr === toYMD(new Date());
            return (
              <Pressable key={dayIdx} style={{ width: dayColWidth, position: 'relative', backgroundColor: isToday ? '#FAFBFF' : undefined }}
                onPress={() => openNew(dateStr, '09:00')}>
                {/* Lignes horizontales */}
                {Array.from({ length: totalHours }, (_, i) => (
                  <View key={i} style={{ height: HOUR_HEIGHT, borderTopWidth: 0.5, borderTopColor: '#EDE2D6', borderRightWidth: 0.5, borderRightColor: '#EDE2D6' }} />
                ))}
                {/* Events positionnés */}
                {dayEvents.map(evt => {
                  const [h1, m1] = evt.heureDebut.split(':').map(Number);
                  const [h2, m2] = evt.heureFin ? evt.heureFin.split(':').map(Number) : [h1 + 1, 0];
                  const top = ((h1 - startHour) * 60 + m1) * (HOUR_HEIGHT / 60);
                  const height = Math.max(((h2 - h1) * 60 + (m2 - m1)) * (HOUR_HEIGHT / 60), 20);
                  const ch = evt.chantierId ? data.chantiers.find(c => c.id === evt.chantierId) : null;
                  return (
                    <Pressable key={evt.id}
                      style={{ position: 'absolute', top, left: 1, right: 1, height, backgroundColor: evt.couleur, borderRadius: 4, padding: 2, overflow: 'hidden' }}
                      onPress={(e) => { e.stopPropagation(); openEdit(evt); }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }} numberOfLines={2}>{evt.titre}</Text>
                    </Pressable>
                  );
                })}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      </>}

      {/* Modal formulaire RDV */}
      <ModalKeyboard visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setShowForm(false)}>
          <Pressable style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' }} onPress={e => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 20, fontFamily: 'Fraunces_600SemiBold', color: '#2B1D14' }}>{editId ? tm("Modifier") : tm("Nouveau RDV")}</Text>
                {editId && (
                  <Pressable onPress={() => { deleteAgendaEvent(editId); setShowForm(false); }} style={{ padding: 6 }}>
                    <Text style={{ color: '#E74C3C', fontWeight: '600' }}>{tm("Supprimer")}</Text>
                  </Pressable>
                )}
              </View>

              <Text style={labelStyle}>{tm("Titre *")}</Text>
              <TextInput style={inputStyle} value={form.titre} onChangeText={v => setForm(f => ({ ...f, titre: v }))} placeholder={tm("Réunion, visite...")} />

              <Text style={labelStyle}>{tm("Description")}</Text>
              <TextInput style={[inputStyle, { minHeight: 50 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline />

              {/* Date — grille inline */}
              <Text style={labelStyle}>{tm("Date :")}{' '}{form.date.split('-').reverse().join('/')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 4 }} keyboardShouldPersistTaps="handled">
                {dateOptions.map(opt => (
                  <Pressable key={opt.value} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: form.date === opt.value ? '#5C1F2E' : '#F1E7DC', borderWidth: 1, borderColor: form.date === opt.value ? '#5C1F2E' : '#EDE2D6', minWidth: 60, alignItems: 'center' }}
                    onPress={() => setForm(f => ({ ...f, date: opt.value }))}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: form.date === opt.value ? '#fff' : '#2B1D14' }}>{opt.label.split(' ')[0]}</Text>
                    <Text style={{ fontSize: 9, color: form.date === opt.value ? 'rgba(255,255,255,0.7)' : '#6E5F54' }}>{opt.label.split(' ').slice(1).join(' ')}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Heures — grille inline */}
              <Text style={labelStyle}>{tm("Début :")}{' '}{form.heureDebut}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {heureOptions.map(opt => (
                  <Pressable key={`d_${opt.value}`} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: form.heureDebut === opt.value ? '#5C1F2E' : '#F1E7DC', borderWidth: 1, borderColor: form.heureDebut === opt.value ? '#5C1F2E' : '#EDE2D6' }}
                    onPress={() => setForm(f => ({ ...f, heureDebut: opt.value }))}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: form.heureDebut === opt.value ? '#fff' : '#6E5F54' }}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={labelStyle}>{tm("Fin :")}{' '}{form.heureFin || '—'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {heureOptions.map(opt => (
                  <Pressable key={`f_${opt.value}`} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: form.heureFin === opt.value ? '#5C1F2E' : '#F1E7DC', borderWidth: 1, borderColor: form.heureFin === opt.value ? '#5C1F2E' : '#EDE2D6' }}
                    onPress={() => setForm(f => ({ ...f, heureFin: opt.value }))}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: form.heureFin === opt.value ? '#fff' : '#6E5F54' }}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={labelStyle}>{tm("Lieu")}</Text>
              <TextInput style={inputStyle} value={form.lieu} onChangeText={v => setForm(f => ({ ...f, lieu: v }))} placeholder={tm("Adresse...")} />

              {/* Chantier */}
              <Text style={labelStyle}>{tm("Chantier associé")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 4 }}>
                <Pressable style={chipStyle(!form.chantierId)} onPress={() => setForm(f => ({ ...f, chantierId: '' }))}>
                  <Text style={chipTextStyle(!form.chantierId)}>{tm("Aucun")}</Text>
                </Pressable>
                {data.chantiers.filter(c => c.statut === 'actif').map(c => (
                  <Pressable key={c.id} style={chipStyle(form.chantierId === c.id, c.couleur)} onPress={() => setForm(f => ({ ...f, chantierId: f.chantierId === c.id ? '' : c.id }))}>
                    <Text style={chipTextStyle(form.chantierId === c.id)}>{c.nom}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Récurrence */}
              <Text style={labelStyle}>{tm("Récurrence")}</Text>
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
                {[{ l: tm("Aucune"), v: 'aucune' }, { l: tm("Quotidien"), v: 'quotidien' }, { l: tm("Hebdo"), v: 'hebdomadaire' }, { l: tm("Mensuel"), v: 'mensuel' }].map(r => (
                  <Pressable key={r.v} style={chipStyle(form.recurrence === r.v)} onPress={() => setForm(f => ({ ...f, recurrence: r.v }))}>
                    <Text style={chipTextStyle(form.recurrence === r.v)}>{r.l}</Text>
                  </Pressable>
                ))}
              </View>
              {form.recurrence !== 'aucune' && (
                <>
                  <Text style={labelStyle}>{tm("Fin de récurrence")}</Text>
                  <Pressable style={inputStyle} onPress={() => {/* TODO: date picker */}}>
                    <Text style={{ fontSize: 14, color: form.recurrenceFinDate ? '#2B1D14' : '#9A8C80' }}>
                      {form.recurrenceFinDate ? form.recurrenceFinDate.split('-').reverse().join('/') : tm("Sélectionner...")}
                    </Text>
                  </Pressable>
                </>
              )}

              {/* Couleur */}
              <Text style={labelStyle}>{tm("Couleur")}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {COULEURS.map(c => (
                  <Pressable key={c} onPress={() => setForm(f => ({ ...f, couleur: c }))}
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: form.couleur === c ? 3 : 0, borderColor: '#2B1D14' }} />
                ))}
              </View>

              {/* Invités */}
              <Text style={labelStyle}>{tm("Invités (participants)")}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {invitables.map(p => (
                  <Pressable key={p.cle} style={chipStyle(form.invites.includes(p.cle))}
                    onPress={() => setForm(f => ({ ...f, invites: f.invites.includes(p.cle) ? f.invites.filter(i => i !== p.cle) : [...f.invites, p.cle] }))}>
                    <Text style={chipTextStyle(form.invites.includes(p.cle))}>{p.nom}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Visibilité */}
              <Text style={labelStyle}>{tm("Visible par (sans être invité)")}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {data.employes.filter(e => !form.invites.includes(e.id)).map(emp => (
                  <Pressable key={emp.id} style={chipStyle(form.visiblePar.includes(emp.id))}
                    onPress={() => setForm(f => ({ ...f, visiblePar: f.visiblePar.includes(emp.id) ? f.visiblePar.filter(i => i !== emp.id) : [...f.visiblePar, emp.id] }))}>
                    <Text style={chipTextStyle(form.visiblePar.includes(emp.id))}>{emp.prenom} {emp.nom.charAt(0)}.</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={{ backgroundColor: '#5C1F2E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: form.titre.trim() ? 1 : 0.5 }}
                onPress={handleSave} disabled={!form.titre.trim()}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editId ? tm("Modifier") : tm("Créer le rendez-vous")}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </ModalKeyboard>

    </>
  );
}

const labelStyle = { fontSize: 12, fontWeight: '600' as const, color: '#6E5F54', marginBottom: 4, marginTop: 8 };
const inputStyle = { backgroundColor: '#F1E7DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#EDE2D6', marginBottom: 4 };
const chipStyle = (active: boolean, color?: string) => ({
  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  backgroundColor: active ? (color || '#5C1F2E') : '#F1E7DC',
  borderWidth: 1, borderColor: active ? (color || '#5C1F2E') : '#EDE2D6',
});
const chipTextStyle = (active: boolean) => ({ fontSize: 12, fontWeight: '600' as const, color: active ? '#fff' : '#6E5F54' });
