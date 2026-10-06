/**
 * « Devis / Facture » — suppléments d'un côté :
 *  - client : proposés par l'administrateur, acceptés ou refusés par le client ;
 *  - usine : saisis par l'administrateur (acceptés d'office) ou proposés par l'usine
 *    (l'administrateur accepte ou refuse).
 * Chaque supplément a son HT, son TTC et son devis PDF (montants lus à l'envoi).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { DS } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import type { CompteMn, DocumentMn } from '@/lib/menuiserie/types';
import { ajouterSupplementMn, joindrePdfSupplementMn, repondreSupplementMn, supprimerSupplementMn, totalAccepte, type SupplementMn } from '@/lib/menuiserie/supplements';
import { choisirEtDeposerMn, lireMontantsPdfMn, lireNombre, type CoteMn } from '@/lib/menuiserie/pieces';
import { ouvrirDocumentMn } from './DocumentsEtape';
import { BORDEAUX, BORDEAUX_DOUX, Bloc, Bouton, Champ, Pastille, euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';
import { ZoneDepot } from '@/components/share/ZoneDepot';

export function StatutSupplement({ s }: { s: SupplementMn }) {
  if (s.statut === 'accepte') return <Pastille label={tm("Accepté")} fond={DS.successSoft} texte="#065F46" />;
  if (s.statut === 'refuse') return <Pastille label={tm("Refusé")} fond="#FDE2E1" texte={DS.error} />;
  return <Pastille label={s.cote === 'usine' ? tm("À valider") : tm("En attente du client")} fond={BORDEAUX_DOUX} texte={BORDEAUX} />;
}

/** Envoie un PDF de supplément (visible du côté concerné) et lit ses montants. */
async function deposerPdfSupplement(moi: CompteMn, chantierId: string, cote: CoteMn, onInfo: (t: string) => void) {
  const { deposes, erreurs } = await choisirEtDeposerMn(moi, {
    chantierId, etape: 'devis', piece: `supp_${cote}`, multiple: false, onInfo,
    visibilite: cote === 'client' ? ['admin', 'client'] : ['admin', 'usine'], categorieClient: cote === 'client' ? 'supplements' : null,
  });
  const d = deposes[0];
  if (!d) return { erreur: erreurs[0] };
  if (!d.pdf) return { doc: d, ht: null, ttc: null };
  onInfo(tm("Lecture des montants de « {0} »…", d.nom));
  const r = await lireMontantsPdfMn(d.chemin);
  onInfo('');
  return { doc: d, ht: r.ht, ttc: r.ttc, erreur: r.message };
}

export function SupplementsDevis({ moi, chantierId, usineId, cote, documents, liste, onChange }: {
  moi: CompteMn; chantierId: string; usineId: string | null; cote: CoteMn; documents: DocumentMn[];
  /** Suppléments de ce côté */
  liste: SupplementMn[]; onChange: () => void;
}) {
  const admin = moi.role === 'admin';
  const peutAjouter = admin || (cote === 'usine' && moi.role === 'usine');
  const [ajout, setAjout] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [ht, setHt] = useState('');
  const [ttc, setTtc] = useState('');
  const [pdf, setPdf] = useState<{ id: string; nom: string } | null>(null);
  const [charge, setCharge] = useState(false);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');

  const recharger = async () => { onChange(); };

  const joindre = async () => {
    setErreur('');
    const r = await deposerPdfSupplement(moi, chantierId, cote, setInfo);
    if (r.doc) {
      setPdf({ id: r.doc.id, nom: r.doc.nom });
      if (!libelle.trim()) setLibelle(r.doc.nom.replace(/\.[a-z0-9]{2,5}$/i, ''));
      if (r.ht != null) setHt(String(r.ht).replace('.', ','));
      if (r.ttc != null) setTtc(String(r.ttc).replace('.', ','));
    }
    if (r.erreur) setErreur(r.erreur);
  };
  const valider = async () => {
    const vHt = lireNombre(ht);
    if (!libelle.trim() || vHt == null || vHt <= 0) { setErreur(tm("Indiquez un libellé et un montant.")); return; }
    setCharge(true); setErreur('');
    try {
      await ajouterSupplementMn(moi, chantierId, { cote, usineId, libelle, montant_ht: vHt, montant_ttc: lireNombre(ttc), documentId: pdf?.id });
      setLibelle(''); setHt(''); setTtc(''); setPdf(null); setAjout(false); await recharger();
    } catch (e) { setErreur((e as Error).message); }
    setCharge(false);
  };
  const accepte = totalAccepte(liste);

  return (
    <Bloc titre={tm("Suppléments")} droite={peutAjouter && !ajout ? (
      <ZoneDepot onDepot={async () => { setAjout(true); await joindre(); }}>
      <Pressable onPress={() => setAjout(true)} accessibilityRole="button" hitSlop={8}
        style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DS.primary, justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textInverse }}>{tm("+ Supplément")}</Text>
      </Pressable>
      </ZoneDepot>
    ) : null}>
      {!!info && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator size="small" color={DS.primary} /><Text style={{ fontSize: 13, color: DS.textSecondary, flex: 1 }}>{info}</Text></View>}
      {liste.length === 0 && !ajout && (
        <Text style={{ fontSize: 13, color: DS.textMuted }}>
          {cote === 'client' ? tm("Aucun supplément. Ceux que vous ajoutez sont envoyés au client pour acceptation.") : tm("Aucun supplément usine.")}
        </Text>
      )}
      {liste.map(s => {
        const doc = documents.find(d => d.id === s.document_id);
        const aValider = admin && cote === 'usine' && s.statut === 'propose';
        const peutRetirer = admin ? s.statut !== 'accepte' || cote === 'usine' : s.statut === 'propose';
        return (
          <View key={s.id} style={{ borderRadius: 14, backgroundColor: DS.background, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: DS.text }}>{s.libelle}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontFamily: 'Manrope_700Bold', color: DS.text }}>{euros(Number(s.montant_ht))} {tm("HT")}</Text>
                {s.montant_ttc != null && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{euros(Number(s.montant_ttc))} {tm("TTC")}</Text>}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatutSupplement s={s} />
              {!!s.repondu_le && <Text style={{ fontSize: 11, color: DS.textMuted }}>{s.repondu_par_nom} · {formatDateFR(s.repondu_le.slice(0, 10))}</Text>}
              {doc ? (
                <Pressable onPress={() => ouvrirDocumentMn(doc)} accessibilityRole="link" hitSlop={6}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>📄 {tm("Ouvrir le PDF")}</Text>
                </Pressable>
              ) : peutAjouter && (
                <Pressable onPress={async () => { const r = await deposerPdfSupplement(moi, chantierId, cote, setInfo); if (r.doc) { await joindrePdfSupplementMn(s.id, r.doc.id, s.statut === 'propose' ? r.ht : null, s.statut === 'propose' ? r.ttc : null); await recharger(); } if (r.erreur) setErreur(r.erreur); }}
                  accessibilityRole="button" hitSlop={6}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>{tm("Joindre le PDF")}</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              {peutRetirer && peutAjouter && (
                <Pressable onPress={async () => { await supprimerSupplementMn(moi, s); recharger(); }} hitSlop={8} accessibilityRole="button">
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.error }}>{tm("Retirer")}</Text>
                </Pressable>
              )}
            </View>
            {!!s.commentaire_client && <Text style={{ fontSize: 12, color: DS.textSecondary, fontStyle: 'italic' }}>« {s.commentaire_client} »</Text>}
            {aValider && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Bouton label={tm("Refuser")} variante="contour" onPress={async () => { await repondreSupplementMn(s.id, false); recharger(); }} /></View>
                <View style={{ flex: 1 }}><Bouton label={tm("Accepter")} onPress={async () => { await repondreSupplementMn(s.id, true); recharger(); }} /></View>
              </View>
            )}
          </View>
        );
      })}
      {ajout && (
        <View style={{ gap: 10, backgroundColor: DS.background, borderRadius: 14, padding: 12 }}>
          <Pressable onPress={joindre} accessibilityRole="button"
            style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: DS.border, backgroundColor: DS.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }} numberOfLines={1}>{pdf ? `📄 ${pdf.nom}` : tm("Joindre le devis du supplément (PDF)")}</Text>
          </Pressable>
          <Champ label={tm("Libellé du supplément")} value={libelle} onChangeText={setLibelle} placeholder={tm("Ex. : niche supplémentaire cuisine")} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Champ label={tm("Montant HT (€)")} value={ht} onChangeText={setHt} keyboardType="decimal-pad" placeholder="0" />
            <Champ label={tm("Montant TTC (€)")} value={ttc} onChangeText={setTtc} keyboardType="decimal-pad" placeholder={tm("facultatif")} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton label={tm("Annuler")} variante="contour" onPress={() => { setAjout(false); setErreur(''); setPdf(null); }} /></View>
            <View style={{ flex: 1 }}><Bouton label={cote === 'client' ? tm("Envoyer au client") : admin ? tm("Enregistrer") : tm("Proposer")} onPress={valider} charge={charge} /></View>
          </View>
        </View>
      )}
      {!!erreur && <Text style={{ fontSize: 13, color: DS.error }}>{erreur}</Text>}
      {accepte > 0 && (
        <Text style={{ fontSize: 13, color: DS.textSecondary, textAlign: 'right' }}>
          {tm("Suppléments acceptés :")} <Text style={{ fontWeight: '800', color: DS.text }}>{euros(accepte)} {tm("HT")}</Text>
        </Text>
      )}
    </Bloc>
  );
}
