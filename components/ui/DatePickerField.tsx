/**
 * Sélecteur de date cross-platform sans module natif.
 * - Web : <input type="date"> (calendrier natif du navigateur)
 * - Mobile : mini-calendrier JS intégré (View/Pressable)
 * Valeur : chaîne ISO "YYYY-MM-DD" (ou '' pour vide).
 */
import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform } from 'react-native';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minDate?: string;
}

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function parseISO(s: string): Date {
  if (!s) return new Date();
  return new Date(s + 'T12:00:00');
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function formatFR(s: string): string {
  if (!s) return '';
  const d = parseISO(s);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DatePickerField({ value, onChange, placeholder = 'Sélectionner une date', minDate }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (value ? parseISO(value) : new Date()));

  if (Platform.OS === 'web') {
    return (
      // @ts-ignore — input HTML natif
      <input
        type="date"
        value={value}
        min={minDate || undefined}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: 12, borderRadius: 10, border: '1.5px solid #E8DDD0',
          fontSize: 14, backgroundColor: '#FAF7F3', color: '#2C2C2C',
          width: '100%', boxSizing: 'border-box', outlineColor: '#C9A96E',
        } as any}
      />
    );
  }

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const firstDow = (monthStart.getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();

  const cells: ({ iso: string; day: number } | null)[] = useMemo(() => {
    const arr: ({ iso: string; day: number } | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
      arr.push({ iso: toISO(dt), day: d });
    }
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewMonth, firstDow, daysInMonth]);

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const today = toISO(new Date());
  const selectDay = (iso: string) => {
    if (minDate && iso < minDate) return;
    onChange(iso);
    setShowPicker(false);
  };

  return (
    <>
      <Pressable onPress={() => setShowPicker(true)} style={styles.inputBox}>
        <Text style={[styles.inputText, !value && { color: '#B0BEC5' }]}>
          {value ? formatFR(value) : placeholder}
        </Text>
      </Pressable>
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
            <View style={styles.header}>
              <Pressable onPress={prevMonth} style={styles.navBtn}>
                <Text style={styles.navBtnText}>‹</Text>
              </Pressable>
              <Text style={styles.monthTitle}>
                {MOIS_FR[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </Text>
              <Pressable onPress={nextMonth} style={styles.navBtn}>
                <Text style={styles.navBtnText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.dowRow}>
              {JOURS_FR.map((j, i) => (
                <Text key={i} style={styles.dowCell}>{j}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((c, i) => {
                if (!c) return <View key={i} style={styles.cellEmpty} />;
                const isSel = c.iso === value;
                const isToday = c.iso === today;
                const isDisabled = !!minDate && c.iso < minDate;
                return (
                  <Pressable
                    key={i}
                    onPress={() => selectDay(c.iso)}
                    style={[
                      styles.cell,
                      isSel && styles.cellSelected,
                      isToday && !isSel && styles.cellToday,
                      isDisabled && styles.cellDisabled,
                    ]}
                  >
                    <Text style={[styles.cellText, isSel && { color: '#fff', fontWeight: '800' }, isDisabled && { color: '#B0BEC5' }]}>
                      {c.day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable onPress={() => { onChange(''); setShowPicker(false); }} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Effacer</Text>
              </Pressable>
              <Pressable onPress={() => setShowPicker(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Fermer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  inputBox: {
    backgroundColor: '#FAF7F3',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E8DDD0',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  inputText: { fontSize: 14, color: '#2C2C2C' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  sheet: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', maxWidth: 360,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  navBtn: {
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#F5EDE3', borderRadius: 8,
  },
  navBtnText: { fontSize: 20, fontWeight: '800', color: '#2C2C2C' },
  monthTitle: { fontSize: 15, fontWeight: '800', color: '#2C2C2C' },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowCell: { flex: 1, textAlign: 'center', fontSize: 11, color: '#8C8077', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  cell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
  },
  cellSelected: { backgroundColor: '#C9A96E' },
  cellToday: { borderWidth: 1, borderColor: '#C9A96E' },
  cellDisabled: { opacity: 0.3 },
  cellText: { fontSize: 13, color: '#2C2C2C' },
  clearBtn: {
    flex: 1, backgroundColor: '#F5EDE3', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  clearBtnText: { color: '#8C8077', fontWeight: '700' },
  closeBtn: {
    flex: 1, backgroundColor: '#2C2C2C', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  closeBtnText: { color: '#C9A96E', fontWeight: '700' },
});
