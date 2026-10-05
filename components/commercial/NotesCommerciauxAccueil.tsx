/** Accueil admin : notes des commerciaux à traiter (chiffrage ou autre). */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { openDocPreview } from '@/lib/share/openDocPreview';

export function NotesCommerciauxAccueil() {
  const { data, updateNoteCommercial } = useApp();
  const notes = (data.notesCommerciaux || []).filter(n => !n.traitee).sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  if (!notes.length) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 18, fontFamily: 'Manrope_500Medium', color: DS.text, marginBottom: 8, marginLeft: 4 }}>Notes des commerciaux</Text>
      <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border }}>
        {notes.map((n, i) => {
          const ch = data.chantiers.find(c => c.id === n.chantierId);
          return (
            <View key={n.id} style={{ padding: 14, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: DS.border }}>
              <Text style={{ fontSize: 12, color: DS.textSecondary }}>
                {n.categorie === 'chiffrage' ? 'Chiffrage' : 'Autre'} · {ch?.nom || 'Chantier'} · {n.auteurNom} · {new Date(n.creeLe).toLocaleDateString('fr-FR')}
              </Text>
              <Text style={{ fontSize: 15, color: DS.text }}>{n.texte}</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {!!n.pieceJointe && (
                  <Pressable onPress={() => openDocPreview(n.pieceJointe!.uri)} style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: DS.border, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text }} numberOfLines={1}>📎 {n.pieceJointe.nom}</Text>
                  </Pressable>
                )}
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => updateNoteCommercial({ ...n, traitee: true, traiteeLe: new Date().toISOString() })} accessibilityRole="button"
                  style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DS.primary, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textInverse }}>Traitée</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
