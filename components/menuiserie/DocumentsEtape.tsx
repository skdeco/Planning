/**
 * Documents et photos d'une étape : ajout (photothèque, appareil photo, fichiers),
 * ouverture par lien temporaire, suppression tracée, classement par pièce,
 * et (administrateur) partage d'un document dans une rubrique de l'espace client.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, Platform, Modal } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { DS, radius } from '@/constants/design';
import { formatDateHeureFR } from '@/lib/date/format';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { deposerDocumentMn, lienDocumentMn, partagerClientMn, supprimerDocumentMn } from '@/lib/menuiserie/api';
import type { CompteMn, DocumentMn } from '@/lib/menuiserie/types';
import { CATEGORIES_CLIENT, groupeMn } from '@/lib/menuiserie/types';
import { visibiliteDocs, type DefEtape } from '@/lib/menuiserie/etapes';
import { Bouton, Champ, Puce } from './ui';

export async function ouvrirDocumentMn(d: { chemin: string }): Promise<boolean> {
  const url = await lienDocumentMn(d);
  if (!url) return false;
  if (Platform.OS === 'web') window.open(url, '_blank');
  else await WebBrowser.openBrowserAsync(url);
  return true;
}

export function DocumentsEtape({ moi, chantierId, def, documents, onChange, lectureSeule }: {
  moi: CompteMn; chantierId: string; def: DefEtape; documents: DocumentMn[]; onChange: () => void; lectureSeule?: boolean;
}) {
  const [piece, setPiece] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [aPartager, setAPartager] = useState<DocumentMn | null>(null);
  const pieces = useMemo(() => Array.from(new Set(documents.map(d => d.piece).filter(Boolean) as string[])).sort(), [documents]);
  const admin = moi.role === 'admin';
  const peutSupprimer = (d: DocumentMn) => admin || (d.depose_par === moi.id && !def.suppressionAdminSeul);

  const ajouter = async () => {
    if (def.parPiece && !piece.trim()) { setErreur("Indique d'abord le nom de la pièce."); return; }
    setErreur('');
    const fichiers = await pickNativeFile({ acceptCamera: true, compressImages: true, multiple: true });
    if (!fichiers.length) return;
    setEnvoi(true);
    const vis = Array.from(new Set([...visibiliteDocs(def), groupeMn(moi.role)]));
    try {
      for (const f of fichiers) {
        await deposerDocumentMn(moi, {
          chantierId, etape: def.cle, uri: f.uri, mime: f.mimeType, visibilite: vis,
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

  const ouvrir = async (d: DocumentMn) => { if (!(await ouvrirDocumentMn(d))) setErreur("Impossible d'ouvrir ce document."); };

  const supprimer = (d: DocumentMn) => {
    const go = async () => { await supprimerDocumentMn(moi, d); onChange(); };
    if (Platform.OS === 'web') { if (window.confirm(`Supprimer « ${d.nom} » ?`)) go(); return; }
    Alert.alert('Supprimer ce document ?', d.nom, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: go }]);
  };

  const partager = async (categorie: string | null) => {
    if (!aPartager) return;
    await partagerClientMn(moi, aPartager, categorie);
    setAPartager(null); onChange();
  };

  const groupes = def.parPiece
    ? [...pieces.map(p => ({ titre: p, docs: documents.filter(d => d.piece === p) })), { titre: 'Sans pièce', docs: documents.filter(d => !d.piece) }].filter(g => g.docs.length)
    : [{ titre: '', docs: documents }];

  return (
    <View style={{ gap: 8 }}>
      {def.parPiece && !lectureSeule && (
        <View style={{ gap: 6 }}>
          <Champ label="Nom de la pièce" value={piece} onChangeText={setPiece} placeholder="Ex. Chambre 2, Cuisine…" />
          {pieces.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {pieces.map(p => <Puce key={p} label={p} actif={piece === p} onPress={() => setPiece(p)} />)}
            </View>
          )}
        </View>
      )}
      {!lectureSeule && <Bouton label="+ Ajouter photos / documents" variante="contour" onPress={ajouter} charge={envoi} />}
      {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}
      {documents.length === 0 && <Text style={{ fontSize: 13, color: DS.textSecondary }}>Aucun document pour cette étape.</Text>}
      {groupes.map(g => (
        <View key={g.titre || 'tous'} style={{ gap: 6 }}>
          {!!g.titre && <Text style={{ fontSize: 13, fontWeight: '800', color: DS.text, marginTop: 4 }}>{g.titre}</Text>}
          {g.docs.map(d => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
              <Pressable onPress={() => ouvrir(d)} accessibilityRole="link" style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.primary }} numberOfLines={1}>{d.nom}</Text>
                <Text style={{ fontSize: 12, color: DS.textSecondary }}>
                  {d.depose_par_nom || '—'} · {formatDateHeureFR(d.created_at)}
                  {admin && d.categorie_client ? ` · client : ${CATEGORIES_CLIENT.find(c => c.cle === d.categorie_client)?.label}` : ''}
                </Text>
              </Pressable>
              {admin && (
                <Pressable onPress={() => setAPartager(d)} accessibilityRole="button" accessibilityLabel={`Partager ${d.nom} au client`} style={{ padding: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: DS.primary }}>{d.categorie_client ? 'Client ✓' : 'Client'}</Text>
                </Pressable>
              )}
              {peutSupprimer(d) && !lectureSeule && (
                <Pressable onPress={() => supprimer(d)} accessibilityRole="button" accessibilityLabel={`Supprimer ${d.nom}`} style={{ padding: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: DS.error }}>Suppr.</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ))}

      <Modal visible={!!aPartager} transparent animationType="fade" onRequestClose={() => setAPartager(null)}>
        <Pressable onPress={() => setAPartager(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.xxl, padding: 16, gap: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text }}>Partager dans l'espace client</Text>
            <Text style={{ fontSize: 13, color: DS.textSecondary }}>Le client et son architecte verront ce document dans la rubrique choisie.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES_CLIENT.map(c => <Puce key={c.cle} label={c.label} actif={aPartager?.categorie_client === c.cle} onPress={() => partager(c.cle)} />)}
            </View>
            {!!aPartager?.categorie_client && <Bouton label="Ne plus partager" variante="discret" onPress={() => partager(null)} />}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
