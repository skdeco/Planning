/**
 * « Devis / Facture » — une rubrique (devis, factures ou règlements) d'un côté
 * (client ou usine) : lignes HT / TTC / date, PDF lié, lecture automatique des
 * montants à l'envoi, modification en touchant la ligne.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn, DocumentMn, MontantMn, TypeMontantMn } from '@/lib/menuiserie/types';
import { majMontantMn, partagerClientMn, supprimerDocumentMn, supprimerMontantMn } from '@/lib/menuiserie/api';
import { libelleDevis } from '@/lib/menuiserie/importDevis';
import { ajouterLigneMn, dateFR, deposerPiecesMn, lireDateFR, lireMontantsPdfMn, lireNombre, modifierLigneMn, nomSansExtension, type CoteMn } from '@/lib/menuiserie/pieces';
import { ouvrirDocumentMn } from './DocumentsEtape';
import { Bloc, Bouton, Champ, euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';
import { ZoneDepot } from '@/components/share/ZoneDepot';

export const docDeLigne = (m: MontantMn, docs: DocumentMn[]) =>
  docs.find(d => d.id === m.document_id) || (m.libelle ? docs.find(d => libelleDevis(d.nom) === m.libelle || nomSansExtension(d.nom) === m.libelle) : undefined);

export type Options = { pdf: boolean; ttc: boolean; date: boolean; partageClient?: string; labelMontant?: string };

export function Formulaire({ initial, options, onValider, onAnnuler, autres }: {
  initial: { libelle: string; ht: string; ttc: string; date: string }; options: Options;
  onValider: (v: { libelle: string; ht: number; ttc: number | null; date: string | null }) => Promise<void>; onAnnuler: () => void;
  autres?: React.ReactNode;
}) {
  const [v, setV] = useState(initial);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const valider = async () => {
    const ht = lireNombre(v.ht), ttc = lireNombre(v.ttc);
    const date = options.date ? lireDateFR(v.date) : null;
    if (ht == null) { setErreur(tm("Montant HT invalide.")); return; }
    if (options.date && !date) { setErreur(tm("Date invalide (JJ/MM/AAAA).")); return; }
    setCharge(true); setErreur('');
    try { await onValider({ libelle: v.libelle.trim(), ht, ttc, date }); } catch (e) { setErreur((e as Error).message); setCharge(false); }
  };
  return (
    <View style={{ gap: 8, backgroundColor: DS.background, borderRadius: 14, padding: 12 }}>
      <Champ label={tm("Libellé")} value={v.libelle} onChangeText={t => setV({ ...v, libelle: t })} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Champ label={options.labelMontant || tm("Montant HT (€)")} value={v.ht} onChangeText={t => setV({ ...v, ht: t })} keyboardType="decimal-pad" />
        {options.ttc && <Champ label={tm("Montant TTC (€)")} value={v.ttc} onChangeText={t => setV({ ...v, ttc: t })} keyboardType="decimal-pad" placeholder={tm("facultatif")} />}
      </View>
      {options.date && <Champ label={tm("Date (JJ/MM/AAAA)")} value={v.date} onChangeText={t => setV({ ...v, date: t })} keyboardType="numbers-and-punctuation" />}
      {!!erreur && <Text style={{ fontSize: 13, color: DS.error }}>{erreur}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Bouton label={tm("Annuler")} variante="contour" onPress={onAnnuler} /></View>
        <View style={{ flex: 1 }}><Bouton label={tm("Enregistrer")} onPress={valider} charge={charge} /></View>
      </View>
      {autres}
    </View>
  );
}

export function LignesPieces({ moi, chantierId, usineId, cote, type, titre, lignes, documents, orphelins = [], onChange, peutSaisir, options, vide }: {
  moi: CompteMn; chantierId: string; usineId: string | null; cote: CoteMn; type: TypeMontantMn; titre: string;
  lignes: MontantMn[]; documents: DocumentMn[]; orphelins?: DocumentMn[]; onChange: () => void; peutSaisir: boolean;
  options: Options; vide: string;
}) {
  const [ajout, setAjout] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const [info, setInfo] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [occupe, setOccupe] = useState(false);
  const admin = moi.role === 'admin';
  const total = lignes.reduce((x, m) => x + Number(m.montant_ht), 0);
  const totalTtc = lignes.every(m => m.montant_ttc != null) ? lignes.reduce((x, m) => x + Number(m.montant_ttc), 0) : null;
  const tries = [...lignes].sort((a, b) => String(a.date_montant || a.created_at).localeCompare(String(b.date_montant || b.created_at)));

  const deposer = async () => {
    setOccupe(true); setMessages([]);
    try { setMessages((await deposerPiecesMn(moi, { chantierId, usineId, cote, type, onInfo: setInfo })).messages); onChange(); }
    catch (e) { setMessages([(e as Error).message]); }
    setOccupe(false); setInfo('');
  };
  const lireOrphelin = async (d: DocumentMn) => {
    setOccupe(true); setInfo(tm("Lecture des montants de « {0} »…", d.nom));
    const r = await lireMontantsPdfMn(d.chemin);
    await ajouterLigneMn(moi, { chantierId, usineId, type, libelle: nomSansExtension(d.nom), ht: r.ht ?? 0, ttc: r.ttc, date: null, documentId: d.id }).catch(e => setMessages([(e as Error).message]));
    if (r.message) setMessages([r.message]);
    setOccupe(false); setInfo(''); onChange();
  };

  return (
    <Bloc titre={titre} droite={peutSaisir && !ajout ? (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {options.pdf && (
          <ZoneDepot onDepot={deposer} actif={!occupe}>
          <Pressable onPress={deposer} disabled={occupe} accessibilityRole="button" style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: DS.primary, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textInverse }}>{tm("+ PDF")}</Text>
          </Pressable>
          </ZoneDepot>
        )}
        <Pressable onPress={() => setAjout(true)} accessibilityRole="button" style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: DS.border, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: DS.text }}>{options.pdf ? tm("Saisir") : tm("+ Ajouter")}</Text>
        </Pressable>
      </View>
    ) : null}>
      {!!info && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator size="small" color={DS.primary} /><Text style={{ fontSize: 13, color: DS.textSecondary, flex: 1 }}>{info}</Text></View>}
      {messages.map((t, i) => <Text key={i} style={{ fontSize: 12, color: DS.warning }}>{t}</Text>)}
      {tries.length === 0 && orphelins.length === 0 && !ajout && <Text style={{ fontSize: 13, color: DS.textMuted }}>{vide}</Text>}

      {tries.map(m => {
        const doc = docDeLigne(m, documents);
        const aSaisir = Number(m.montant_ht) === 0;
        if (edition === m.id) {
          return (
            <Formulaire key={m.id} options={options}
              initial={{ libelle: m.libelle || '', ht: aSaisir ? '' : String(m.montant_ht).replace('.', ','), ttc: m.montant_ttc != null ? String(m.montant_ttc).replace('.', ',') : '', date: dateFR(m.date_montant) }}
              onAnnuler={() => setEdition(null)}
              onValider={async v => { await modifierLigneMn(moi, m, { libelle: v.libelle || null, montant_ht: v.ht, montant_ttc: v.ttc, ...(options.date ? { date_montant: v.date } : {}) }); setEdition(null); onChange(); }}
              autres={
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 2 }}>
                  {doc && options.pdf && (
                    <Pressable onPress={async () => { setInfo(tm("Lecture des montants de « {0} »…", doc.nom)); const r = await lireMontantsPdfMn(doc.chemin); setInfo('');
                      if (r.ht != null) { await modifierLigneMn(moi, m, { montant_ht: r.ht, montant_ttc: r.ttc }); setEdition(null); onChange(); } else setMessages([r.message || '']); }}
                      accessibilityRole="button" hitSlop={6}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>{tm("Relire le PDF")}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={async () => { await supprimerMontantMn(moi, m); if (doc && (admin || doc.depose_par === moi.id)) await supprimerDocumentMn(moi, doc).catch(() => {}); setEdition(null); onChange(); }}
                    accessibilityRole="button" hitSlop={6}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: DS.error }}>{tm("Supprimer")}</Text>
                  </Pressable>
                </View>
              } />
          );
        }
        const visibleClient = m.visibilite === 'client';
        return (
          <View key={m.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: aSaisir ? DS.warning : DS.border, padding: 12, gap: 6 }}>
            <Pressable onPress={() => peutSaisir && setEdition(m.id)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }} numberOfLines={2}>{m.libelle || tm("Sans libellé")}</Text>
                {(options.date || !!m.date_montant) && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{dateFR(m.date_montant)}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {aSaisir
                  ? <Text style={{ fontSize: 13, fontWeight: '800', color: DS.warning }}>{tm("Montant à saisir")}</Text>
                  : <Text style={{ fontSize: 16, fontFamily: 'Manrope_700Bold', color: DS.text }}>{euros(Number(m.montant_ht))} <Text style={{ fontSize: 11, color: DS.textSecondary }}>{tm("HT")}</Text></Text>}
                {options.ttc && m.montant_ttc != null && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{euros(Number(m.montant_ttc))} {tm("TTC")}</Text>}
              </View>
            </Pressable>
            {(doc || (admin && options.partageClient)) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {doc && (
                  <Pressable onPress={() => ouvrirDocumentMn(doc)} accessibilityRole="link" hitSlop={6}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }} numberOfLines={1}>📄 {tm("Ouvrir le PDF")}</Text>
                  </Pressable>
                )}
                {admin && options.partageClient && (
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: visibleClient }}
                    onPress={async () => {
                      await majMontantMn(moi, m, { visibilite: visibleClient ? 'admin' : 'client' });
                      if (doc) await partagerClientMn(moi, doc, visibleClient ? null : options.partageClient!);
                      onChange();
                    }}
                    style={{ minHeight: 28, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', backgroundColor: visibleClient ? DS.primary : DS.segment }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: visibleClient ? DS.textInverse : DS.textSecondary }}>{visibleClient ? tm("Visible par le client ✓") : tm("Montrer au client")}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}

      {orphelins.map(d => (
        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: DS.border, borderStyle: 'dashed', padding: 12 }}>
          <Pressable onPress={() => ouvrirDocumentMn(d)} style={{ flex: 1 }} accessibilityRole="link">
            <Text style={{ fontSize: 14, fontWeight: '600', color: DS.text }} numberOfLines={1}>📄 {d.nom}</Text>
          </Pressable>
          {peutSaisir && (
            <Pressable onPress={() => lireOrphelin(d)} disabled={occupe} accessibilityRole="button" hitSlop={6}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: DS.text, textDecorationLine: 'underline' }}>{tm("Lire le montant")}</Text>
            </Pressable>
          )}
        </View>
      ))}

      {ajout && (
        <Formulaire options={options} initial={{ libelle: '', ht: '', ttc: '', date: dateFR(new Date().toISOString()) }}
          onAnnuler={() => setAjout(false)}
          onValider={async v => { await ajouterLigneMn(moi, { chantierId, usineId, type, libelle: v.libelle || null, ht: v.ht, ttc: v.ttc, date: v.date }); setAjout(false); onChange(); }} />
      )}

      {tries.length > 1 && (
        <Text style={{ fontSize: 13, color: DS.textSecondary, textAlign: 'right' }}>
          {tm("Total :")} <Text style={{ fontWeight: '800', color: DS.text }}>{euros(total)} {tm("HT")}</Text>
          {options.ttc && totalTtc != null ? ` · ${euros(totalTtc)} ${tm("TTC")}` : ''}
        </Text>
      )}
    </Bloc>
  );
}
