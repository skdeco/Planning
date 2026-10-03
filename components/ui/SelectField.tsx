import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Keyboard, Platform, useWindowDimensions } from 'react-native';
import { ChevronDown, Check, Search } from 'lucide-react-native';
import { useLanguage } from '@/app/context/LanguageContext';
import { ModalKeyboard } from '@/components/ModalKeyboard';

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

export function SelectField({ value, options, onSelect, placeholder, searchable = false, compact = false, title }: SelectFieldProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selected = options.find(o => o.value === value) || null;
  // La feuille s'accroche en haut de l'écran : le clavier ne recouvre jamais la liste.
  const { height: winH } = useWindowDimensions();
  const listMaxHeight = Math.max(180, Math.min(360, winH * 0.42));
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
          {selected ? selected.label : (placeholder ?? t.ui.selectionner)}
        </Text>
        <ChevronDown size={16} color="#6A6A68" strokeWidth={2} />
      </Pressable>

      <ModalKeyboard visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={() => { Keyboard.dismiss(); setOpen(false); }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {searchable && (
              <View style={styles.searchWrap}>
                <Search size={16} color="#6A6A68" strokeWidth={2} />
                <TextInput
                  style={styles.search}
                  placeholder={t.ui.rechercher}
                  placeholderTextColor="#B0A99F"
                  value={q}
                  onChangeText={setQ}
                  // Clavier ouvert d'office seulement quand la liste est longue :
                  // sinon il cache les choix (contacts d'un chantier, par ex.).
                  autoFocus={options.length > 8}
                  returnKeyType="search"
                />
              </View>
            )}
            <ScrollView style={{ maxHeight: listMaxHeight }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {filtered.length === 0 ? (
                <Text style={styles.empty}>{t.ui.aucunResultat}</Text>
              ) : filtered.map(o => {
                const active = o.value === value;
                return (
                  <Pressable key={o.value} onPress={() => { Keyboard.dismiss(); onSelect(o.value); setOpen(false); }} style={[styles.option, active && styles.optionActive]}>
                    {o.color && <View style={[styles.dot, { backgroundColor: o.color }]} />}
                    <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>{o.label}</Text>
                    {active && <Check size={16} color="#141414" strokeWidth={2.4} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </ModalKeyboard>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E2DF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  fieldCompact: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#EBEBE8', borderColor: '#E2E2DF' },
  value: { flex: 1, fontSize: 14, color: '#141414', fontWeight: '500' },
  valueCompact: { fontSize: 13.5 },
  placeholder: { color: '#B0A99F', fontWeight: '400' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  overlay: { flex: 1, backgroundColor: 'rgba(20,20,20,0.45)', justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: 72, paddingBottom: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 28, padding: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { fontFamily: 'Manrope_500Medium', fontSize: 20, lineHeight: 26, color: '#141414', marginBottom: 10, paddingHorizontal: 4 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EBEBE8', borderRadius: 999, paddingHorizontal: 14, marginBottom: 10 },
  search: { flex: 1, paddingVertical: 10, fontSize: 14.5, color: '#141414' },
  empty: { fontSize: 13, color: '#B0A99F', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14 },
  optionActive: { backgroundColor: '#EBEBE8' },
  optionText: { flex: 1, fontSize: 15, color: '#141414' },
  optionTextActive: { fontWeight: '600', color: '#141414' },
});
