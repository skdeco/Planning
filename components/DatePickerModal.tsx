import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, Platform,
} from 'react-native';

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const JOURS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function parseYMD(str: string): Date | null {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface CalendarProps {
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  maxDate?: string;
}

function Calendar({ value, onChange, minDate, maxDate }: CalendarProps) {
  const init = parseYMD(value) || new Date();
  const [calYear, setCalYear] = useState(init.getFullYear());
  const [calMonth, setCalMonth] = useState(init.getMonth());

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const getDays = () => {
    let dow = new Date(calYear, calMonth, 1).getDay();
    dow = dow === 0 ? 6 : dow - 1;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(dow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const todayD = new Date();
  const isToday = (day: number) =>
    todayD.getFullYear() === calYear && todayD.getMonth() === calMonth && todayD.getDate() === day;
  const isSelected = (day: number) => {
    const sel = parseYMD(value);
    return sel ? sel.getFullYear() === calYear && sel.getMonth() === calMonth && sel.getDate() === day : false;
  };
  const isDisabled = (day: number) => {
    const d = new Date(calYear, calMonth, day);
    const dStr = toYMD(d);
    if (minDate && dStr < minDate) return true;
    if (maxDate && dStr > maxDate) return true;
    return false;
  };

  const cells = getDays();

  return (
    <View>
      <View style={calS.header}>
        <Pressable style={calS.navBtn} onPress={prevMonth}>
          <Text style={calS.navArrow}>‹</Text>
        </Pressable>
        <Text style={calS.title}>{MOIS[calMonth]} {calYear}</Text>
        <Pressable style={calS.navBtn} onPress={nextMonth}>
          <Text style={calS.navArrow}>›</Text>
        </Pressable>
      </View>
      <View style={calS.weekRow}>
        {JOURS.map(j => <Text key={j} style={calS.weekDay}>{j}</Text>)}
      </View>
      <View style={calS.grid}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={idx} style={calS.cell} />;
          const sel = isSelected(day);
          const tod = isToday(day);
          const dis = isDisabled(day);
          return (
            <Pressable
              key={idx}
              style={[calS.cell, tod && calS.cellToday, sel && calS.cellSel, dis && calS.cellDis]}
              onPress={() => {
                if (dis) return;
                const d = new Date(calYear, calMonth, day);
                onChange(toYMD(d));
              }}
              disabled={dis}
            >
              <Text style={[calS.cellText, tod && calS.cellTextToday, sel && calS.cellTextSel, dis && calS.cellTextDis]}>
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const calS = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 18, color: '#1A3A6B', fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#687076', textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%' as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginVertical: 1 },
  cellToday: { borderWidth: 1.5, borderColor: '#1A3A6B' },
  cellSel: { backgroundColor: '#1A3A6B' },
  cellDis: { opacity: 0.3 },
  cellText: { fontSize: 13, color: '#11181C', fontWeight: '500' },
  cellTextToday: { color: '#1A3A6B', fontWeight: '700' },
  cellTextSel: { color: '#fff', fontWeight: '700' },
  cellTextDis: { color: '#aaa' },
});

// ─── DateField : champ de saisie de date avec calendrier ─────────────────────

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
}

export function DateField({ label, value, onChange, minDate, maxDate, placeholder = 'JJ/MM/AAAA' }: DateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  const displayValue = value
    ? value.split('-').reverse().join('/')
    : '';

  return (
    <View style={dfS.container}>
      <Text style={dfS.label}>{label}</Text>
      <Pressable style={dfS.field} onPress={() => setShowPicker(true)}>
        <Text style={[dfS.fieldText, !value && dfS.placeholder]}>
          {displayValue || placeholder}
        </Text>
        <Text style={dfS.icon}>📅</Text>
      </Pressable>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={dfS.overlay} onPress={() => setShowPicker(false)}>
          <Pressable style={dfS.sheet} onPress={e => e.stopPropagation()}>
            <View style={dfS.sheetHeader}>
              <Text style={dfS.sheetTitle}>{label}</Text>
              <Pressable style={dfS.closeBtn} onPress={() => setShowPicker(false)}>
                <Text style={dfS.closeTxt}>✕</Text>
              </Pressable>
            </View>
            <Calendar
              value={value}
              onChange={v => { onChange(v); setShowPicker(false); }}
              minDate={minDate}
              maxDate={maxDate}
            />
            {value ? (
              <Pressable style={dfS.clearBtn} onPress={() => { onChange(''); setShowPicker(false); }}>
                <Text style={dfS.clearTxt}>Effacer la date</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const dfS = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#11181C', marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  fieldText: { fontSize: 15, color: '#11181C' },
  placeholder: { color: '#aaa' },
  icon: { fontSize: 16 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: 320,
    maxWidth: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: { fontSize: 12, color: '#687076', fontWeight: '700' },
  clearBtn: {
    marginTop: 12,
    padding: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#FFF0F0',
  },
  clearTxt: { color: '#E74C3C', fontSize: 14, fontWeight: '600' },
});
