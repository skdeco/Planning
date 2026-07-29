import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal } from 'react-native';
import { DS, font, radius, space } from '@/constants/design';
import { useApp } from '@/app/context/AppContext';

/**
 * Sélecteur de fournisseur pour la saisie d'un achat : choisit une fiche
 * existante OU crée une nouvelle fiche à la volée (nom seul, complétable
 * ensuite dans le carnet). La valeur stockée reste le NOM (string), pour
 * rester compatible avec le champ `fournisseur` des dépenses.
 */
interface Props {
  value: string;
  onChange: (nom: string) => void;
  placeholder?: string;
}

export function FournisseurPicker({ value, onChange, placeholder = 'Choisir un fournisseur…' }: Props) {
  const { data, addFournisseur } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const noms = useMemo(
    () => [...new Set((data.fournisseursFiches || []).map(f => f.nom).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    [data.fournisseursFiches],
  );
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? noms.filter(n => n.toLowerCase().includes(s)) : noms;
  }, [noms, q]);

  const exactExists = noms.some(n => n.trim().toLowerCase() === q.trim().toLowerCase());

  const pick = (nom: string) => { onChange(nom); setOpen(false); setQ(''); };
  const createAndPick = () => {
    const n = q.trim();
    if (!n) return;
    addFournisseur(n);   // crée la fiche (nom seul) si absente
    pick(n);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md,
          paddingHorizontal: space.md, paddingVertical: space.sm }}>
        <Text style={{ color: value ? DS.text : DS.textSecondary, fontSize: font.md }} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={{ color: DS.textSecondary, fontSize: font.md }}>▾</Text>
      </Pressable>
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 2 }}>
          <Text style={{ color: DS.textSecondary, fontSize: font.compact }}>✕ Retirer</Text>
        </Pressable>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <View style={{ backgroundColor: DS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, maxHeight: '75%' }}>
            <Text style={{ fontSize: font.title, fontWeight: font.bold, color: DS.textStrong, marginBottom: space.sm }}>Fournisseur</Text>
            <TextInput
              value={q}
              onChangeText={setQ}
              autoFocus
              placeholder="Rechercher ou saisir un nouveau nom…"
              placeholderTextColor={DS.textSecondary}
              style={{ backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, color: DS.text, marginBottom: space.sm }}
            />
            {q.trim() && !exactExists ? (
              <Pressable onPress={createAndPick} style={{ backgroundColor: DS.primary, borderRadius: radius.md, paddingVertical: space.sm, alignItems: 'center', marginBottom: space.sm }}>
                <Text style={{ color: DS.textInverse, fontWeight: font.semibold }}>＋ Ajouter « {q.trim()} »</Text>
              </Pressable>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
              {filtered.length === 0 ? (
                <Text style={{ color: DS.textSecondary, fontStyle: 'italic', textAlign: 'center', padding: space.md }}>
                  {noms.length === 0 ? 'Aucun fournisseur enregistré — saisissez un nom ci-dessus.' : 'Aucun résultat.'}
                </Text>
              ) : filtered.map(n => (
                <Pressable key={n} onPress={() => pick(n)}
                  style={{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: DS.border, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: DS.text, fontSize: font.md }}>{n}</Text>
                  {value === n ? <Text style={{ color: DS.primary }}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setOpen(false)} style={{ paddingVertical: space.md, alignItems: 'center', marginTop: space.sm }}>
              <Text style={{ color: DS.textSecondary, fontWeight: font.semibold }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
