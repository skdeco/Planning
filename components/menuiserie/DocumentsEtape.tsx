/**
 * Documents et photos d'une étape : ajout (photothèque, appareil photo, fichiers),
 * ouverture par lien temporaire, suppression tracée, classement par pièce,
 * et (administrateur) partage d'un document dans une rubrique de l'espace client.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, Platform, Modal } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { DS, radius } from '@/constants/design';
import { formatDateHeureFR } from '@/lib/date/format';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { deposerDocumentMn, lienDocumentMn, partagerClientMn, supprimerDocumentMn } from '@/lib/menuiserie/api';
import type { CompteMn, DocumentMn, MontantMn, TypeMontantMn } from '@/lib/menuiserie/types';
import { CATEGORIES_CLIENT, groupeMn } from '@/lib/menuiserie/types';
import { visibiliteDocs, type DefEtape } from '@/lib/menuiserie/etapes';
import { ActionPilule, Bloc, Bouton, Champ, Puce } from './ui';
import { estPdf, importerMontantDevisMn, libelleDevis } from '@/lib/menuiserie/importDevis';
import { compresserPdf, compressionPdfPossible } from '@/lib/menuiserie/compresserPdf';

import { tm } from '@/lib/menuiserie/i18n';
/** Limite d'envoi d'un fichier (serveur) */
const TAILLE_MAX = 50 * 1024 * 1024;

export async function ouvrirDocumentMn(d: { chemin: string }): Promise<boolean> {
  const url = await lienDocumentMn(d);
  if (!url) return false;
  if (Platform.OS === 'web') window.open(url, '_blank');
  else await WebBrowser.openBrowserAsync(url);
  return true;
}

export function DocumentsEtape({ moi, chantierId, def, documents, onChange, lectureSeule, importDevis, titre }: {
  moi: CompteMn; chantierId: string; def: DefEtape; documents: DocumentMn[]; onChange: () => void; lectureSeule?: boolean;
  /** Étape « Devis » : lecture automatique du montant HT des PDF déposés */
  importDevis?: { usineId: string | null; montants: MontantMn[]; type?: TypeMontantMn; cote?: 'client' | 'usine' };
  titre?: string;
}) {
  const [piece, setPiece] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [aPartager, setAPartager] = useState<DocumentMn | null>(null);
  const [info, setInfo] = useState('');
  const [lecture, setLecture] = useState<string | null>(null);
  const dejaTentes = useRef(new Set<string>());
  const peutImporter = !!importDevis && (moi.role === 'admin' || moi.role === 'usine');
  const importer = async (d: { chemin: string; nom: string }) => {
    if (!importDevis) return;
    setLecture(d.chemin); setInfo('');
    try {
      const msg = await importerMontantDevisMn(moi, { chantierId, usineId: importDevis.usineId, chemin: d.chemin, nom: d.nom, montants: importDevis.montants, typeForce: importDevis.type });
      if (msg) setInfo(msg);
      onChange();
    } catch (e) { setInfo((e as Error).message); } finally { setLecture(null); }
  };
  const pieces = useMemo(() => Array.from(new Set(documents.map(d => d.piece).filter(Boolean) as string[])).sort(), [documents]);
  const admin = moi.role === 'admin';
  const peutSupprimer = (d: DocumentMn) => admin || (d.depose_par === moi.id && !def.suppressionAdminSeul);

  const ajouter = async () => {
    if (def.parPiece && !piece.trim()) { setErreur(tm("Indique d'abord le nom de la pièce.")); return; }
    setErreur('');
    const fichiers = await pickNativeFile({ acceptCamera: true, compressImages: true, multiple: true });
    if (!fichiers.length) return;
    setEnvoi(true);
    const vis = Array.from(new Set([...visibiliteDocs(def), groupeMn(moi.role)]));
    // Chaque fichier est envoyé à part : un fichier refusé n'empêche pas les autres
    const deposes: { chemin: string; nom: string }[] = [];
    const erreurs: string[] = [];
    for (const f of fichiers) {
      const nomFichier = f.filename || (f.mimeType === 'application/pdf' ? 'document.pdf' : 'photo.jpg');
      const taille = f.size ?? (f.uri.startsWith('data:') ? Math.round((f.uri.length - f.uri.indexOf(',') - 1) * 0.75) : undefined);
      let uri = f.uri;
      if (taille && taille > TAILLE_MAX) {
        // Trop lourd : on l'allège automatiquement (sur ordinateur) pour passer sous 50 Mo
        const estUnPdf = f.mimeType === 'application/pdf' || nomFichier.toLowerCase().endsWith('.pdf');
        if (!estUnPdf || !compressionPdfPossible()) {
          erreurs.push(tm("« {0} » est trop lourd ({1} Mo, maximum 50 Mo) : ajoute-le depuis l'ordinateur (version web), il sera allégé automatiquement.", nomFichier, Math.round(taille / 1048576)));
          continue;
        }
        try {
          setInfo(tm("Allègement de « {0} » ({1} Mo)…", nomFichier, Math.round(taille / 1048576)));
          const allege = await compresserPdf(f.uri, TAILLE_MAX * 0.95, (p, n) => setInfo(tm("Allègement de « {0} » : page {1} / {2}…", nomFichier, p, n)));
          if (!allege) { erreurs.push(tm("« {0} » n'a pas pu être allégé sous 50 Mo.", nomFichier)); setInfo(''); continue; }
          uri = allege;
          setInfo(tm("« {0} » allégé à {1} Mo, envoi en cours…", nomFichier, Math.round((allege.length * 0.75) / 1048576)));
        } catch (e) {
          erreurs.push(`« ${nomFichier} » : ${(e as Error).message}`); setInfo(''); continue;
        }
      }
      try {
        const chemin = await deposerDocumentMn(moi, {
          chantierId, etape: def.cle, uri, mime: f.mimeType || 'application/pdf', visibilite: vis, nom: nomFichier,
          piece: def.parPiece ? piece.trim() : (importDevis?.cote || null),
        });
        deposes.push({ chemin, nom: nomFichier });
      } catch (e) {
        erreurs.push(`« ${nomFichier} » : ${(e as Error).message}`);
      }
    }
    setErreur(erreurs.join('\n'));
    if (deposes.length && !peutImporter) setInfo('');
    setEnvoi(false);
    if (deposes.length) onChange();
    // Devis PDF : le montant HT est lu et reporté tout seul
    if (peutImporter) for (const d of deposes.filter(x => estPdf(x))) { dejaTentes.current.add(d.chemin); await importer(d); }
  };

  // Devis déjà déposés (ex. par l'agent) et jamais lus : lecture automatique, une seule fois
  useEffect(() => {
    if (!peutImporter || !importDevis) return;
    const aLire = documents.filter(d => estPdf(d) && !dejaTentes.current.has(d.chemin)
      && !importDevis.montants.some(m => m.libelle === libelleDevis(d.nom)));
    if (!aLire.length) return;
    aLire.forEach(d => dejaTentes.current.add(d.chemin));
    (async () => { for (const d of aLire) await importer(d); })();
  }, [documents.map(d => d.chemin).join('|'), importDevis?.montants.length]);

  const ouvrir = async (d: DocumentMn) => { if (!(await ouvrirDocumentMn(d))) setErreur(tm("Impossible d'ouvrir ce document.")); };

  const supprimer = (d: DocumentMn) => {
    const go = async () => { await supprimerDocumentMn(moi, d); onChange(); };
    if (Platform.OS === 'web') { if (window.confirm(tm("Supprimer « {0} » ?", d.nom))) go(); return; }
    Alert.alert(tm("Supprimer ce document ?"), d.nom, [{ text: tm("Annuler"), style: 'cancel' }, { text: tm("Supprimer"), style: 'destructive', onPress: go }]);
  };

  const partager = async (categorie: string | null) => {
    if (!aPartager) return;
    await partagerClientMn(moi, aPartager, categorie);
    setAPartager(null); onChange();
  };

  const groupes = def.parPiece
    ? [...pieces.map(p => ({ titre: p, docs: documents.filter(d => d.piece === p) })), { titre: tm("Sans pièce"), docs: documents.filter(d => !d.piece) }].filter(g => g.docs.length)
    : [{ titre: '', docs: documents }];

  return (
    <Bloc titre={titre || tm("Documents et photos")} droite={!lectureSeule ? <ActionPilule label={tm("+ Ajouter")} onPress={ajouter} charge={envoi} /> : undefined}>
      {def.parPiece && !lectureSeule && (
        <View style={{ gap: 6 }}>
          <Champ label={tm("Nom de la pièce")} value={piece} onChangeText={setPiece} placeholder={tm("Ex. Chambre 2, Cuisine…")} />
          {pieces.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {pieces.map(p => <Puce key={p} label={p} actif={piece === p} onPress={() => setPiece(p)} />)}
            </View>
          )}
        </View>
      )}
      {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}
      {!!info && <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text, backgroundColor: DS.surfaceAlt, borderRadius: 10, padding: 10 }}>{info}</Text>}
      {documents.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucun document pour cette étape.")}</Text>}
      {groupes.map(g => (
        <View key={g.titre || 'tous'}>
          {!!g.titre && <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textSecondary, marginTop: 4, marginBottom: 2 }}>{g.titre}</Text>}
          {g.docs.map((d, i) => (
            <View key={d.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: DS.border, gap: 6 }}>
              <Pressable onPress={() => ouvrir(d)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: DS.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '800', color: DS.text }}>{estPdf(d) ? 'PDF' : 'IMG'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.text }} numberOfLines={1}>{d.nom}</Text>
                  <Text style={{ fontSize: 11.5, color: DS.textSecondary }}>
                    {d.depose_par_nom || '—'} · {formatDateHeureFR(d.created_at)}
                    {admin && d.categorie_client ? tm(" · client : {0}", CATEGORIES_CLIENT.find(c => c.cle === d.categorie_client)?.label) : ''}
                  </Text>
                </View>
              </Pressable>
              {(admin || (peutSupprimer(d) && !lectureSeule) || (peutImporter && estPdf(d))) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 42 }}>
                  {peutImporter && estPdf(d) && (
                    <Pressable onPress={() => importer(d)} disabled={lecture === d.chemin} accessibilityRole="button" style={puceAction}>
                      <Text style={texteAction}>{lecture === d.chemin ? tm("Lecture…") : tm("Relire le montant")}</Text>
                    </Pressable>
                  )}
                  {admin && (
                    <Pressable onPress={() => setAPartager(d)} accessibilityRole="button" accessibilityLabel={tm("Partager {0} au client", d.nom)} style={puceAction}>
                      <Text style={texteAction}>{d.categorie_client ? tm("Partagé au client ✓") : tm("Partager au client")}</Text>
                    </Pressable>
                  )}
                  {peutSupprimer(d) && !lectureSeule && (
                    <Pressable onPress={() => supprimer(d)} accessibilityRole="button" accessibilityLabel={tm("Supprimer {0}", d.nom)} style={puceAction}>
                      <Text style={[texteAction, { color: DS.error }]}>{tm("Supprimer")}</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      <Modal visible={!!aPartager} transparent animationType="fade" onRequestClose={() => setAPartager(null)}>
        <Pressable onPress={() => setAPartager(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.xxl, padding: 16, gap: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text }}>{tm("Partager dans l'espace client")}</Text>
            <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Le client et son architecte verront ce document dans la rubrique choisie.")}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES_CLIENT.map(c => <Puce key={c.cle} label={c.label} actif={aPartager?.categorie_client === c.cle} onPress={() => partager(c.cle)} />)}
            </View>
            {!!aPartager?.categorie_client && <Bouton label={tm("Ne plus partager")} variante="discret" onPress={() => partager(null)} />}
          </View>
        </Pressable>
      </Modal>
    </Bloc>
  );
}

const puceAction = { minHeight: 28, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: DS.border, justifyContent: 'center' as const };
const texteAction = { fontSize: 12, fontWeight: '600' as const, color: DS.text };
