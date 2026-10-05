/**
 * Commercial : laisser une note à l'administrateur sur un chantier
 * (chiffrage ou autre), avec une pièce jointe facultative. L'administrateur
 * est prévenu et la retrouve sur son accueil ; le commercial voit si elle a été traitée.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { NoteCommercial } from '@/app/types';
import { DS, radius } from '@/constants/design';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { sendPushNotification } from '@/hooks/useNotifications';
import { getAdminPushTokens } from '@/lib/notif/getAdminPushTokens';

const CATS: { v: NoteCommercial['categorie']; l: string }[] = [{ v: 'chiffrage', l: 'Pour le chiffrage' }, { v: 'autre', l: 'Autre' }];

export function NoteAdmin({ chantierId }: { chantierId: string }) {
  const { data, currentUser, addNoteCommercial } = useApp();
  const [categorie, setCategorie] = useState<NoteCommercial['categorie']>('chiffrage');
  const [texte, setTexte] = useState('');
  const [piece, setPiece] = useState<{ uri: string; nom: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [ok, setOk] = useState('');
  const moiId = currentUser?.apporteurId || '';
  const mesNotes = (data.notesCommerciaux || []).filter(n => n.chantierId === chantierId && n.auteurId === moiId)
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  const chantier = data.chantiers.find(c => c.id === chantierId);

  const joindre = async () => {
    const f = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: false, compressImages: true });
    if (!f.length) return;
    setEnvoi(true);
    const url = await uploadFileToStorage(f[0].uri, `chantiers/${chantierId}/notes-commercial`, `nc_${Date.now()}`);
    setEnvoi(false);
    if (url) setPiece({ uri: url, nom: f[0].filename || 'Pièce jointe' });
  };

  const envoyer = () => {
    const t = texte.trim();
    if (!t) return;
    const note: NoteCommercial = {
      id: `nc_${Date.now()}_${Math.random().toString(36).slice(2)}`, chantierId, auteurId: moiId,
      auteurNom: currentUser?.nom || 'Commercial', categorie, texte: t, ...(piece ? { pieceJointe: piece } : {}),
      creeLe: new Date().toISOString(),
    };
    addNoteCommercial(note);
    sendPushNotification(getAdminPushTokens(data.employes, data.adminEmployeId),
      `${categorie === 'chiffrage' ? 'Note chiffrage' : 'Note'} · ${chantier?.nom || ''}`, `${note.auteurNom} : ${t.slice(0, 90)}`).catch(() => {});
    setTexte(''); setPiece(null); setOk('Note envoyée à SK DECO.');
  };

  const chip = (on: boolean) => ({ minHeight: 34, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: 'center' as const, backgroundColor: on ? DS.primary : DS.surface, borderWidth: 1, borderColor: on ? DS.primary : DS.border });

  return (
    <View style={{ backgroundColor: DS.surface, borderRadius: 20, borderWidth: 1, borderColor: DS.border, padding: 16, gap: 10, marginBottom: 12 }}>
      <Text style={{ fontSize: 17, fontFamily: 'Manrope_500Medium', color: DS.text }}>Note pour SK DECO</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {CATS.map(c => (
          <Pressable key={c.v} onPress={() => setCategorie(c.v)} style={chip(categorie === c.v)} accessibilityRole="button">
            <Text style={{ fontSize: 13, fontWeight: '700', color: categorie === c.v ? DS.textInverse : DS.text }}>{c.l}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={texte} onChangeText={t => { setTexte(t); setOk(''); }} multiline placeholder="Ex. le client veut du chêne, budget autour de 40 k€, prévoir la dépose de l'existant…"
        placeholderTextColor={DS.textMuted}
        style={{ minHeight: 90, borderRadius: 12, borderWidth: 1, borderColor: DS.border, padding: 12, fontSize: 15, color: DS.text, textAlignVertical: 'top' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={joindre} disabled={envoi} style={chip(false)} accessibilityRole="button">
          <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text }}>{envoi ? 'Envoi…' : piece ? `📎 ${piece.nom}` : '📎 Joindre un fichier'}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={envoyer} disabled={!texte.trim()} accessibilityRole="button"
          style={{ minHeight: 40, paddingHorizontal: 18, borderRadius: radius.full, backgroundColor: DS.primary, justifyContent: 'center', opacity: texte.trim() ? 1 : 0.4 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: DS.textInverse }}>Envoyer</Text>
        </Pressable>
      </View>
      {!!ok && <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text }}>{ok}</Text>}
      {mesNotes.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: DS.border, paddingTop: 8, gap: 8 }}>
          {mesNotes.slice(0, 5).map(n => (
            <View key={n.id} style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, color: DS.textSecondary }}>
                {new Date(n.creeLe).toLocaleDateString('fr-FR')} · {n.categorie === 'chiffrage' ? 'Chiffrage' : 'Autre'} · {n.traitee ? 'Traitée ✓' : 'En attente'}
              </Text>
              <Text style={{ fontSize: 14, color: DS.text }} numberOfLines={3}>{n.texte}</Text>
              {!!n.pieceJointe && <Pressable onPress={() => openDocPreview(n.pieceJointe!.uri)}><Text style={{ fontSize: 13, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>📎 {n.pieceJointe.nom}</Text></Pressable>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
