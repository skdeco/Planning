/**
 * ComboSelect — liste déroulante avec champ de recherche.
 * Fermée : affiche la sélection. Ouverte : un champ de saisie filtre les options
 * (insensible aux accents et à la casse). S'ouvre « en ligne » dans le formulaire
 * (pas de calque flottant) : fonctionne à l'identique sur iOS, Android et web,
 * y compris dans une modale qui défile.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp, Search, Check, Plus, X } from 'lucide-react-native';
import { DS, radius, font } from '@/constants/design';

export interface ComboOption {
  id: string;
  label: string;
  /** Ligne secondaire (société, type…) — également prise en compte par la recherche. */
  detail?: string;
}

export interface ComboSelectProps {
  options: ComboOption[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Si fourni, ajoute une ligne « + … » en bas de liste. */
  onAdd?: () => void;
  addLabel?: string;
  /** Autorise à vider la sélection. */
  clearable?: boolean;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function ComboSelect({
  options, value, onChange, placeholder = 'Sélectionner…', searchPlaceholder = 'Rechercher…',
  onAdd, addLabel = 'Ajouter', clearable = false,
}: ComboSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.id === value) || null;

  const filtered = useMemo(() => {
    const mots = norm(query).split(/\s+/).filter(Boolean);
    const tri = [...options].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    if (mots.length === 0) return tri;
    return tri.filter(o => {
      const cible = norm(`${o.label} ${o.detail || ''}`);
      return mots.every(m => cible.includes(m));
    });
  }, [options, query]);

  const choisir = (id: string) => { onChange(id); setOpen(false); setQuery(''); };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(o => !o)}
        style={[styles.field, open && styles.fieldOpen]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldText, !selected && { color: DS.textMuted }]} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
          {!!selected?.detail && <Text style={styles.fieldDetail} numberOfLines={1}>{selected.detail}</Text>}
        </View>
        {clearable && selected && !open && (
          <Pressable hitSlop={10} accessibilityLabel="Effacer la sélection" onPress={() => onChange('')}>
            <X size={16} color={DS.textSecondary} />
          </Pressable>
        )}
        {open ? <ChevronUp size={18} color={DS.primary} /> : <ChevronDown size={18} color={DS.primary} />}
      </Pressable>

      {open && (
        <View style={styles.panel}>
          <View style={styles.search}>
            <Search size={16} color={DS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={DS.textMuted}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => { if (filtered.length === 1) choisir(filtered[0].id); }}
            />
            {query.length > 0 && (
              <Pressable hitSlop={10} accessibilityLabel="Effacer la recherche" onPress={() => setQuery('')}>
                <X size={16} color={DS.textSecondary} />
              </Pressable>
            )}
          </View>
          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && <Text style={styles.empty}>Aucun contact ne correspond à « {query} »</Text>}
            {filtered.map(o => {
              const on = o.id === value;
              return (
                <Pressable key={o.id} accessibilityRole="button" onPress={() => choisir(o.id)} style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { opacity: 0.6 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionText, on && { fontWeight: font.semibold, color: DS.primary }]} numberOfLines={1}>{o.label}</Text>
                    {!!o.detail && <Text style={styles.optionDetail} numberOfLines={1}>{o.detail}</Text>}
                  </View>
                  {on && <Check size={16} color={DS.primary} strokeWidth={2.4} />}
                </Pressable>
              );
            })}
          </ScrollView>
          {onAdd && (
            <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onAdd(); }} style={styles.add}>
              <Plus size={16} color={DS.primary} strokeWidth={2.2} />
              <Text style={styles.addText}>{addLabel}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: DS.border, backgroundColor: DS.surface },
  fieldOpen: { borderColor: DS.primary, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  fieldText: { fontSize: 14, fontWeight: font.semibold, color: DS.text },
  fieldDetail: { fontSize: 11, color: DS.textSecondary, marginTop: 1 },
  panel: { borderWidth: 1, borderTopWidth: 0, borderColor: DS.primary, borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm, backgroundColor: DS.surface, overflow: 'hidden' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, borderBottomWidth: 1, borderBottomColor: DS.border, backgroundColor: DS.background },
  searchInput: { flex: 1, fontSize: 14, color: DS.text, paddingVertical: 0 },
  list: { maxHeight: 220 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.border },
  optionOn: { backgroundColor: DS.soft },
  optionText: { fontSize: 14, color: DS.text },
  optionDetail: { fontSize: 11, color: DS.textSecondary, marginTop: 1 },
  empty: { fontSize: 13, color: DS.textSecondary, fontStyle: 'italic', padding: 14, textAlign: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, backgroundColor: DS.soft },
  addText: { fontSize: 13, fontWeight: font.semibold, color: DS.primary },
});
