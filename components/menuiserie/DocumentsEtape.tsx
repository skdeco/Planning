/**
 * Documents et photos d'une étape : ajout (photothèque, appareil photo, fichiers),
 * ouverture par lien temporaire, suppression tracée. Classement par pièce si demandé.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { DS, radius } from '@/constants/design';
import { formatDateHeureFR } from '@/lib/date/format';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { deposerDocumentMn, lienDocumentMn, supprimerDocumentMn } from '@/lib/menuiserie/api';
import type { CompteMn, DocumentMn } from '@/lib/menuiserie/types';
import type { DefEtape } from '@/lib/menuiserie/etapes';
import { Bouton, Champ, Puce } from './ui';

export function DocumentsEtape({ moi, chantierId, def, documents, onChange }: {
  moi: CompteMn; chantierId: string; def: DefEtape; documents: DocumentMn[]; onChange: () => void;
}) {
  const [piece, setPiece] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const pieces = useMemo(() => Array.from(new Set(documents.map(d => d.piece).filter(Boolean) as string[])).sort(), [documents]);
  const peutSupprimer = !def.suppressionAdminSeul || moi.role === 'admin';

  const ajouter = async () => {
    if (def.parPiece && !piece.trim()) { setErreur("Indique d'abord le nom de la pièce."); return; }
    setErreur('');
    const fichiers = await pickNativeFile({ acceptCamera: true, compressImages: true, multiple: true });
    if (!fichiers.length) return;
    setEnvoi(true);
    try {
      for (const f of fichiers) {
        await deposerDocumentMn(moi, {
          chantierId, etape: def.cle, uri: f.uri, mime: f.mimeType,
          nom: f.filename || (f.mimeType === 'application/pdf' ? 'document.pdf' : 'photo.jpg'),
          piece: def.parPiece ? piece.trim() : null,
        });
      }
      onChange();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  const ouvrir = async (d: DocumentMn) => {
    const url = await lienDocumentMn(d);
    if (!url) { setErreur("Impossible d'ouvrir ce document."); return; }
    if (Platform.OS === 'web') window.open(url, '_blank');
    else await WebBrowser.openBrowserAsync(url);
  };

  const supprimer = (d: DocumentMn) => {
    const go = async () => { await supprimerDocumentMn(moi, d); onChange(); };
    if (Platform.OS === 'web') { if (window.confirm(`Supprimer « ${d.nom} » ?`)) go(); return; }
    Alert.alert('Supprimer ce document ?', d.nom, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: go }]);
  };

  const groupes = def.parPiece
    ? [...pieces.map(p => ({ titre: p, docs: documents.filter(d => d.piece === p) })), { titre: 'Sans pièce', docs: documents.filter(d => !d.piece) }].filter(g => g.docs.length)
    : [{ titre: '', docs: documents }];

  return (
    <View style={{ gap: 8 }}>
      {def.parPiece && (
        <View style={{ gap: 6 }}>
          <Champ label="Nom de la pièce" value={piece} onChangeText={setPiece} placeholder="Ex. Chambre 2, Cuisine…" />
          {pieces.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {pieces.map(p => <Puce key={p} label={p} actif={piece === p} onPress={() => setPiece(p)} />)}
            </View>
          )}
        </View>
      )}
      <Bouton label="+ Ajouter photos / documents" variante="contour" onPress={ajouter} charge={envoi} />
      {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}
      {documents.length === 0 && <Text style={{ fontSize: 13, color: DS.textSecondary }}>Aucun document pour cette étape.</Text>}
      {groupes.map(g => (
        <View key={g.titre || 'tous'} style={{ gap: 6 }}>
          {!!g.titre && <Text style={{ fontSize: 13, fontWeight: '800', color: DS.text, marginTop: 4 }}>{g.titre}</Text>}
          {g.docs.map(d => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
              <Pressable onPress={() => ouvrir(d)} accessibilityRole="link" style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.primary }} numberOfLines={1}>{d.nom}</Text>
                <Text style={{ fontSize: 12, color: DS.textSecondary }}>{d.depose_par_nom || '—'} · {formatDateHeureFR(d.created_at)}</Text>
              </Pressable>
              {peutSupprimer && (
                <Pressable onPress={() => supprimer(d)} accessibilityRole="button" accessibilityLabel={`Supprimer ${d.nom}`} style={{ padding: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: DS.error }}>Suppr.</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
