import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, TextInput, Platform,
  Alert, RefreshControl, useWindowDimensions,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { useRefresh } from '@/hooks/useRefresh';
import type { AgendaEvent } from '@/app/types';

const COULEURS = ['#1A3A6B', '#27AE60', '#E74C3C', '#F59E0B', '#9B59B6', '#00BCD4', '#FF6B35'];
const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const HEURES_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const h = Math.floor(i / 2) + 6;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
}); // 06:00 à 20:00

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genId() { return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

const HOUR_HEIGHT = 60;
const HEADER_HEIGHT = 40;
const TIME_COL = 44;

export function PlanningDirection() {
  const { data, addAgendaEvent, updateAgendaEvent, deleteAgendaEvent } = useApp();
  const { refreshing, onRefresh } = useRefresh();
  const { width: screenW } = useWindowDimensions();

  const [weekOffset, setWeekOffset] = useState(0);
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
      createdBy: 'admin', createdByNom: 'Admin',
      invites: form.invites, visiblePar: form.visiblePar,
      acceptes: [], refuses: [],
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
        <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 8, width: '100%', maxWidth: 320, maxHeight: 400 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A3A6B', paddingHorizontal: 12, paddingVertical: 8 }}>{title}</Text>
          <ScrollView>
            {options.map(opt => (
              <Pressable key={opt.value} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 }}
                onPress={() => { onSelect(opt.value); onClose(); }}>
                <Text style={{ fontSize: 15, color: '#11181C' }}>{opt.label}</Text>
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
      {/* Navigation semaine */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E2E6EA', gap: 6 }}>
        <Pressable onPress={() => setWeekOffset(w => w - 1)} style={{ padding: 6 }}><Text style={{ fontSize: 18 }}>‹</Text></Pressable>
        <Pressable onPress={() => setWeekOffset(0)} style={{ backgroundColor: '#1A3A6B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Auj.</Text>
        </Pressable>
        <Pressable onPress={() => setWeekOffset(w => w + 1)} style={{ padding: 6 }}><Text style={{ fontSize: 18 }}>›</Text></Pressable>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#11181C', textAlign: 'center' }}>{weekLabel}</Text>
        <Pressable style={{ backgroundColor: '#1A3A6B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }} onPress={() => openNew()}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>+ RDV</Text>
        </Pressable>
      </View>

      {/* Grille horaire */}
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1A3A6B']} tintColor="#1A3A6B" />}>
        {/* Header jours */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E6EA', backgroundColor: '#F8F9FA' }}>
          <View style={{ width: TIME_COL, height: HEADER_HEIGHT, justifyContent: 'center', alignItems: 'center' }} />
          {days.map((day, i) => {
            const isToday = toYMD(day) === toYMD(new Date());
            return (
              <View key={i} style={{ width: dayColWidth, height: HEADER_HEIGHT, justifyContent: 'center', alignItems: 'center', backgroundColor: isToday ? '#EBF0FF' : undefined }}>
                <Text style={{ fontSize: 10, fontWeight: '500', color: isToday ? '#1A3A6B' : '#687076' }}>{JOURS_COURT[i]}</Text>
                <Text style={{ fontSize: 14, fontWeight: isToday ? '800' : '600', color: isToday ? '#1A3A6B' : '#11181C' }}>{day.getDate()}</Text>
              </View>
            );
          })}
        </View>

        {/* Lignes horaires */}
        <View style={{ flexDirection: 'row' }}>
          {/* Colonne heures */}
          <View style={{ width: TIME_COL }}>
            {Array.from({ length: totalHours }, (_, i) => (
              <View key={i} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start', paddingTop: 2, paddingRight: 4, alignItems: 'flex-end', borderTopWidth: 0.5, borderTopColor: '#E2E6EA' }}>
                <Text style={{ fontSize: 10, color: '#687076', fontWeight: '500' }}>{String(startHour + i).padStart(2, '0')}:00</Text>
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
                  <View key={i} style={{ height: HOUR_HEIGHT, borderTopWidth: 0.5, borderTopColor: '#E2E6EA', borderRightWidth: 0.5, borderRightColor: '#E2E6EA' }} />
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
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }} numberOfLines={1}>{evt.titre}</Text>
                      <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)' }}>{evt.heureDebut}{evt.heureFin ? `-${evt.heureFin}` : ''}</Text>
                      {ch && <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>{ch.nom}</Text>}
                    </Pressable>
                  );
                })}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Modal formulaire RDV */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setShowForm(false)}>
          <Pressable style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' }} onPress={e => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#11181C' }}>{editId ? 'Modifier' : 'Nouveau RDV'}</Text>
                {editId && (
                  <Pressable onPress={() => { deleteAgendaEvent(editId); setShowForm(false); }} style={{ padding: 6 }}>
                    <Text style={{ color: '#E74C3C', fontWeight: '600' }}>🗑 Supprimer</Text>
                  </Pressable>
                )}
              </View>

              <Text style={labelStyle}>Titre *</Text>
              <TextInput style={inputStyle} value={form.titre} onChangeText={v => setForm(f => ({ ...f, titre: v }))} placeholder="Réunion, visite..." />

              <Text style={labelStyle}>Description</Text>
              <TextInput style={[inputStyle, { minHeight: 50 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline />

              {/* Date — sélecteur déroulant */}
              <Text style={labelStyle}>Date</Text>
              <Pressable style={inputStyle} onPress={() => setShowDatePicker(true)}>
                <Text style={{ fontSize: 14, color: '#11181C' }}>{form.date.split('-').reverse().join('/')}</Text>
              </Pressable>

              {/* Heures — sélecteurs déroulants */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={labelStyle}>Début</Text>
                  <Pressable style={inputStyle} onPress={() => setShowHeureDebutPicker(true)}>
                    <Text style={{ fontSize: 14, color: '#11181C' }}>{form.heureDebut}</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={labelStyle}>Fin</Text>
                  <Pressable style={inputStyle} onPress={() => setShowHeureFinPicker(true)}>
                    <Text style={{ fontSize: 14, color: '#11181C' }}>{form.heureFin || '—'}</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={labelStyle}>Lieu</Text>
              <TextInput style={inputStyle} value={form.lieu} onChangeText={v => setForm(f => ({ ...f, lieu: v }))} placeholder="Adresse..." />

              {/* Chantier */}
              <Text style={labelStyle}>Chantier associé</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 4 }}>
                <Pressable style={chipStyle(!form.chantierId)} onPress={() => setForm(f => ({ ...f, chantierId: '' }))}>
                  <Text style={chipTextStyle(!form.chantierId)}>Aucun</Text>
                </Pressable>
                {data.chantiers.filter(c => c.statut === 'actif').map(c => (
                  <Pressable key={c.id} style={chipStyle(form.chantierId === c.id, c.couleur)} onPress={() => setForm(f => ({ ...f, chantierId: f.chantierId === c.id ? '' : c.id }))}>
                    <Text style={chipTextStyle(form.chantierId === c.id)}>{c.nom}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Récurrence */}
              <Text style={labelStyle}>Récurrence</Text>
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
                {[{ l: 'Aucune', v: 'aucune' }, { l: 'Quotidien', v: 'quotidien' }, { l: 'Hebdo', v: 'hebdomadaire' }, { l: 'Mensuel', v: 'mensuel' }].map(r => (
                  <Pressable key={r.v} style={chipStyle(form.recurrence === r.v)} onPress={() => setForm(f => ({ ...f, recurrence: r.v }))}>
                    <Text style={chipTextStyle(form.recurrence === r.v)}>{r.l}</Text>
                  </Pressable>
                ))}
              </View>
              {form.recurrence !== 'aucune' && (
                <>
                  <Text style={labelStyle}>Fin de récurrence</Text>
                  <Pressable style={inputStyle} onPress={() => {/* TODO: date picker */}}>
                    <Text style={{ fontSize: 14, color: form.recurrenceFinDate ? '#11181C' : '#B0BEC5' }}>
                      {form.recurrenceFinDate ? form.recurrenceFinDate.split('-').reverse().join('/') : 'Sélectionner...'}
                    </Text>
                  </Pressable>
                </>
              )}

              {/* Couleur */}
              <Text style={labelStyle}>Couleur</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {COULEURS.map(c => (
                  <Pressable key={c} onPress={() => setForm(f => ({ ...f, couleur: c }))}
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: form.couleur === c ? 3 : 0, borderColor: '#11181C' }} />
                ))}
              </View>

              {/* Invités */}
              <Text style={labelStyle}>Invités (participants)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {data.employes.map(emp => (
                  <Pressable key={emp.id} style={chipStyle(form.invites.includes(emp.id))}
                    onPress={() => setForm(f => ({ ...f, invites: f.invites.includes(emp.id) ? f.invites.filter(i => i !== emp.id) : [...f.invites, emp.id] }))}>
                    <Text style={chipTextStyle(form.invites.includes(emp.id))}>{emp.prenom} {emp.nom.charAt(0)}.</Text>
                  </Pressable>
                ))}
              </View>

              {/* Visibilité */}
              <Text style={labelStyle}>Visible par (sans être invité)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {data.employes.filter(e => !form.invites.includes(e.id)).map(emp => (
                  <Pressable key={emp.id} style={chipStyle(form.visiblePar.includes(emp.id))}
                    onPress={() => setForm(f => ({ ...f, visiblePar: f.visiblePar.includes(emp.id) ? f.visiblePar.filter(i => i !== emp.id) : [...f.visiblePar, emp.id] }))}>
                    <Text style={chipTextStyle(form.visiblePar.includes(emp.id))}>{emp.prenom} {emp.nom.charAt(0)}.</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={{ backgroundColor: '#1A3A6B', borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: form.titre.trim() ? 1 : 0.5 }}
                onPress={handleSave} disabled={!form.titre.trim()}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editId ? 'Modifier' : 'Créer le rendez-vous'}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pickers */}
      <PickerModal visible={showDatePicker} onClose={() => setShowDatePicker(false)} options={dateOptions}
        onSelect={v => setForm(f => ({ ...f, date: v }))} title="Sélectionner une date" />
      <PickerModal visible={showHeureDebutPicker} onClose={() => setShowHeureDebutPicker(false)} options={heureOptions}
        onSelect={v => setForm(f => ({ ...f, heureDebut: v }))} title="Heure de début" />
      <PickerModal visible={showHeureFinPicker} onClose={() => setShowHeureFinPicker(false)} options={heureOptions}
        onSelect={v => setForm(f => ({ ...f, heureFin: v }))} title="Heure de fin" />
    </>
  );
}

const labelStyle = { fontSize: 12, fontWeight: '600' as const, color: '#687076', marginBottom: 4, marginTop: 8 };
const inputStyle = { backgroundColor: '#F2F4F7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E2E6EA', marginBottom: 4 };
const chipStyle = (active: boolean, color?: string) => ({
  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  backgroundColor: active ? (color || '#1A3A6B') : '#F2F4F7',
  borderWidth: 1, borderColor: active ? (color || '#1A3A6B') : '#E2E6EA',
});
const chipTextStyle = (active: boolean) => ({ fontSize: 12, fontWeight: '600' as const, color: active ? '#fff' : '#687076' });
