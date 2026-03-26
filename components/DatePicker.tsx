import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput,
} from 'react-native';

const JOURS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYMD(str: string): Date | null {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplay(ymd: string): string {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

interface DatePickerProps {
  value: string;           // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;        // YYYY-MM-DD
  maxDate?: string;        // YYYY-MM-DD
}

export function DatePicker({ value, onChange, label, placeholder = 'JJ/MM/AAAA', minDate, maxDate }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  // Calendrier : mois affiché
  const initialDate = parseYMD(value) || new Date();
  const [calYear, setCalYear] = useState(initialDate.getFullYear());
  const [calMonth, setCalMonth] = useState(initialDate.getMonth());

  const openCalendar = () => {
    const d = parseYMD(value) || new Date();
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setOpen(true);
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  // Génère les jours du mois (avec padding pour aligner sur lundi)
  const getDays = useCallback(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    // 0=dim, 1=lun... → on veut lundi=0
    let dow = firstDay.getDay(); // 0=dim
    dow = dow === 0 ? 6 : dow - 1; // convertir : lun=0, dim=6
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(dow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Compléter à un multiple de 7
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const selectDay = (day: number) => {
    const d = new Date(calYear, calMonth, day);
    onChange(toYMD(d));
    setOpen(false);
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    const d = parseYMD(value);
    return d ? d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === day : false;
  };

  const isDisabled = (day: number) => {
    const ymd = toYMD(new Date(calYear, calMonth, day));
    if (minDate && ymd < minDate) return true;
    if (maxDate && ymd > maxDate) return true;
    return false;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
  };

  const days = getDays();

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable style={styles.inputRow} onPress={openCalendar}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Text style={styles.calIcon}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.calSheet} onPress={e => e.stopPropagation()}>
            {/* Navigation mois */}
            <View style={styles.calHeader}>
              <Pressable style={styles.navBtn} onPress={prevMonth}>
                <Text style={styles.navArrow}>‹</Text>
              </Pressable>
              <Text style={styles.calTitle}>{MOIS[calMonth]} {calYear}</Text>
              <Pressable style={styles.navBtn} onPress={nextMonth}>
                <Text style={styles.navArrow}>›</Text>
              </Pressable>
            </View>

            {/* En-têtes jours */}
            <View style={styles.weekRow}>
              {JOURS.map(j => (
                <Text key={j} style={styles.weekDay}>{j}</Text>
              ))}
            </View>

            {/* Grille des jours */}
            <View style={styles.daysGrid}>
              {days.map((day, idx) => {
                if (day === null) return <View key={idx} style={styles.dayCell} />;
                const selected = isSelected(day);
                const disabled = isDisabled(day);
                const today = isToday(day);
                return (
                  <Pressable
                    key={idx}
                    style={[
                      styles.dayCell,
                      today && styles.dayCellToday,
                      selected && styles.dayCellSelected,
                      disabled && styles.dayCellDisabled,
                    ]}
                    onPress={() => !disabled && selectDay(day)}
                    disabled={disabled}
                  >
                    <Text style={[
                      styles.dayText,
                      today && styles.dayTextToday,
                      selected && styles.dayTextSelected,
                      disabled && styles.dayTextDisabled,
                    ]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Bouton Aujourd'hui */}
            <Pressable style={styles.todayBtn} onPress={() => {
              const today = new Date();
              onChange(toYMD(today));
              setOpen(false);
            }}>
              <Text style={styles.todayBtnText}>Aujourd'hui</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  inputText: {
    flex: 1,
    fontSize: 15,
    color: '#11181C',
    fontWeight: '500',
  },
  placeholder: {
    color: '#B0BEC5',
    fontWeight: '400',
  },
  calIcon: {
    fontSize: 18,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 20,
    color: '#1A3A6B',
    fontWeight: '700',
    lineHeight: 22,
  },
  calTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#11181C',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    marginVertical: 2,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: '#1A3A6B',
  },
  dayCellSelected: {
    backgroundColor: '#1A3A6B',
  },
  dayCellDisabled: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    color: '#11181C',
    fontWeight: '500',
  },
  dayTextToday: {
    color: '#1A3A6B',
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: '#B0BEC5',
  },
  todayBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EEF2F8',
    alignItems: 'center',
  },
  todayBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A3A6B',
  },
});
