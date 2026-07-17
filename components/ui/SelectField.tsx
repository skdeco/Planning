import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput } from 'react-native';

/**
 * SelectField — liste déroulante réutilisable (remplace les rangées de chips).
 * Ouvre une modale listant les options ; `searchable` ajoute une barre de recherche
 * (utile quand il y a beaucoup d'éléments, ex. contacts).
 */
export interface SelectOption {
  value: string;
  label: string;
  color?: string; // pastille optionnelle (ex. statut)
}

interface SelectFieldProps {
  value: string | null;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  /** Style compact (filtres) vs champ de formulaire. */
  compact?: boolean;
  title?: string; // titre de la modale
}

export function SelectField({ value, options, onSelect, placeholder = 'Sélectionner…', searchable = false, compact = false, title }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selected = options.find(o => o.value === value) || null;
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? options.filter(o => o.label.toLowerCase().includes(term)) : options;
  }, [options, q]);

  return (
    <>
      <Pressable
        onPress={() => { setQ(''); setOpen(true); }}
        style={[styles.field, compact && styles.fieldCompact]}
      >
        {selected?.color && <View style={[styles.dot, { backgroundColor: selected.color }]} />}
        <Text style={[styles.value, compact && styles.valueCompact, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {searchable && (
              <TextInput
                style={styles.search}
                placeholder="Rechercher…"
                placeholderTextColor="#B0A99F"
                value={q}
                onChangeText={setQ}
                autoFocus
              />
            )}
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.empty}>Aucun résultat</Text>
              ) : filtered.map(o => {
                const active = o.value === value;
                return (
                  <Pressable key={o.value} onPress={() => { onSelect(o.value); setOpen(false); }} style={[styles.option, active && styles.optionActive]}>
                    {o.color && <View style={[styles.dot, { backgroundColor: o.color }]} />}
                    <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>{o.label}</Text>
                    {active && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E6EA', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  fieldCompact: { paddingVertical: 8, borderRadius: 16, backgroundColor: '#F5EDE3', borderColor: '#E8DDD0' },
  value: { flex: 1, fontSize: 14, color: '#2C2C2C', fontWeight: '600' },
  valueCompact: { fontSize: 13 },
  placeholder: { color: '#B0A99F', fontWeight: '400' },
  chevron: { fontSize: 12, color: '#8C8077' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 12, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#2C2C2C', marginBottom: 8, paddingHorizontal: 4 },
  search: { backgroundColor: '#F5EDE3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2C2C2C', marginBottom: 8 },
  empty: { fontSize: 13, color: '#B0A99F', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
  optionActive: { backgroundColor: '#F5EDE3' },
  optionText: { flex: 1, fontSize: 14, color: '#2C2C2C' },
  optionTextActive: { fontWeight: '700' },
  check: { fontSize: 14, color: '#5C1F2E', fontWeight: '800' },
});
