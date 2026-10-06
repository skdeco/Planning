/**
 * « Devis / Facture » — factures et règlements d'un côté, liés entre eux :
 * une facture peut avoir plusieurs règlements, un règlement peut couvrir plusieurs
 * factures, et chacun peut exister sans l'autre (facture pas encore réglée,
 * acompte versé avant facture). Les liens se font et se défont à tout moment.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn, DocumentMn, MontantMn } from '@/lib/menuiserie/types';
import { majMontantMn, partagerClientMn, supprimerDocumentMn, supprimerMontantMn } from '@/lib/menuiserie/api';
import {
  TYPES_COTE, ajouterLigneMn, dateFR, delierMn, deposerPiecesMn, lierMn, listerLettragesMn, lireMontantsPdfMn, modifierLigneMn,
  type CoteMn, type LettrageMn,
} from '@/lib/menuiserie/pieces';
import { ouvrirDocumentMn } from './DocumentsEtape';
import { Formulaire, docDeLigne, type Options } from './LignesPieces';
import { Bloc, euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';
import { ZoneDepot } from '@/components/share/ZoneDepot';

const OPT_FACTURE: Options = { pdf: true, ttc: true, date: true };
const OPT_REGLEMENT: Options = { pdf: false, ttc: false, date: true, labelMontant: 'Montant (€)' };
const aujourdhui = () => dateFR(new Date().toISOString());
const montantFacture = (f: MontantMn) => Number(f.montant_ttc ?? f.montant_ht);

function Pilule({ label, onPress, plein }: { label: string; onPress: () => void; plein?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4}
      style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: plein ? DS.primary : DS.surface, borderWidth: plein ? 0 : 1, borderColor: DS.border }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: plein ? DS.textInverse : DS.text }}>{label}</Text>
    </Pressable>
  );
}

export function FacturesReglements({ moi, chantierId, usineId, cote, montants, documents, onChange, peutFactures, peutReglements }: {
  moi: CompteMn; chantierId: string; usineId: string | null; cote: CoteMn; montants: MontantMn[]; documents: DocumentMn[];
  onChange: () => void; peutFactures: boolean; peutReglements: boolean;
}) {
  const t = TYPES_COTE[cote];
  const admin = moi.role === 'admin';
  const factures = montants.filter(m => m.type === t.facture).sort((a, b) => String(a.date_montant).localeCompare(String(b.date_montant)));
  const reglements = montants.filter(m => m.type === t.reglement).sort((a, b) => String(a.date_montant).localeCompare(String(b.date_montant)));
  const [liens, setLiens] = useState<LettrageMn[]>([]);
  const charger = useCallback(() => { listerLettragesMn(chantierId).then(setLiens).catch(() => {}); }, [chantierId]);
  useEffect(() => { charger(); }, [charger, montants.length]);
  // Formulaire ouvert : nouvelle facture / nouveau règlement (éventuellement à lier), ou modification d'une ligne
  const [form, setForm] = useState<{ quoi: 'facture' | 'reglement'; lierA?: string } | null>(null);
  const [lier, setLier] = useState<string | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [info, setInfo] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const rafraichir = () => { charger(); onChange(); };

  const reglementsDe = (f: MontantMn) => liens.filter(l => l.facture_id === f.id).map(l => ({ l, r: reglements.find(r => r.id === l.reglement_id) })).filter(x => x.r) as { l: LettrageMn; r: MontantMn }[];
  const facturesDe = (r: MontantMn) => liens.filter(l => l.reglement_id === r.id).map(l => ({ l, f: factures.find(f => f.id === l.facture_id) })).filter(x => x.f) as { l: LettrageMn; f: MontantMn }[];
  const reglementsSeuls = reglements.filter(r => facturesDe(r).length === 0);
  const totalFacture = factures.reduce((x, f) => x + montantFacture(f), 0);
  const totalRegle = reglements.reduce((x, r) => x + Number(r.montant_ht), 0);

  const deposerFacture = async (lierA?: string) => {
    setMessages([]);
    const r = await deposerPiecesMn(moi, { chantierId, usineId, cote, type: t.facture, onInfo: setInfo }).catch(e => ({ messages: [(e as Error).message], ids: [] as string[] }));
    if (lierA) for (const id of r.ids) await lierMn(chantierId, id, lierA);
    setMessages(r.messages); setInfo(''); setForm(null); setLier(null); rafraichir();
  };
  const creer = async (quoi: 'facture' | 'reglement', v: { libelle: string; ht: number; ttc: number | null; date: string | null }, lierA?: string) => {
    const id = await ajouterLigneMn(moi, { chantierId, usineId, type: quoi === 'facture' ? t.facture : t.reglement, libelle: v.libelle || null, ht: v.ht, ttc: quoi === 'facture' ? v.ttc : null, date: v.date });
    if (lierA) await (quoi === 'facture' ? lierMn(chantierId, id, lierA) : lierMn(chantierId, lierA, id));
    setForm(null); setLier(null); rafraichir();
  };

  /** Une ligne (facture ou règlement) : touche pour modifier ou supprimer. */
  const ligne = (m: MontantMn, quoi: 'facture' | 'reglement', retrait?: () => void) => {
    const doc = quoi === 'facture' ? docDeLigne(m, documents) : undefined;
    const peut = quoi === 'facture' ? peutFactures : peutReglements;
    if (edition === m.id) {
      return (
        <Formulaire key={m.id} options={quoi === 'facture' ? OPT_FACTURE : { ...OPT_REGLEMENT, labelMontant: tm("Montant (€)") }}
          initial={{ libelle: m.libelle || '', ht: Number(m.montant_ht) ? String(m.montant_ht).replace('.', ',') : '', ttc: m.montant_ttc != null ? String(m.montant_ttc).replace('.', ',') : '', date: dateFR(m.date_montant) }}
          onAnnuler={() => setEdition(null)}
          onValider={async v => { await modifierLigneMn(moi, m, { libelle: v.libelle || null, montant_ht: v.ht, montant_ttc: quoi === 'facture' ? v.ttc : null, date_montant: v.date }); setEdition(null); rafraichir(); }}
          autres={
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {doc && (
                <Pressable hitSlop={6} onPress={async () => { setInfo(tm("Lecture des montants de « {0} »…", doc.nom)); const r = await lireMontantsPdfMn(doc.chemin); setInfo('');
                  if (r.ht != null) { await modifierLigneMn(moi, m, { montant_ht: r.ht, montant_ttc: r.ttc }); setEdition(null); rafraichir(); } else setMessages([r.message || '']); }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>{tm("Relire le PDF")}</Text>
                </Pressable>
              )}
              <Pressable hitSlop={6} onPress={async () => { await supprimerMontantMn(moi, m); if (doc && (admin || doc.depose_par === moi.id)) await supprimerDocumentMn(moi, doc).catch(() => {}); setEdition(null); rafraichir(); }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.error }}>{tm("Supprimer")}</Text>
              </Pressable>
            </View>
          } />
      );
    }
    const aSaisir = Number(m.montant_ht) === 0;
    return (
      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => peut && setEdition(m.id)} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: quoi === 'facture' ? 14 : 13, fontWeight: quoi === 'facture' ? '700' : '600', color: DS.text }} numberOfLines={1}>
              {quoi === 'reglement' ? '↳ ' : ''}{m.libelle || (quoi === 'facture' ? tm("Facture") : tm("Règlement"))}
            </Text>
            <Text style={{ fontSize: 12, color: DS.textSecondary }}>{dateFR(m.date_montant)}</Text>
          </View>
          {aSaisir ? <Text style={{ fontSize: 13, fontWeight: '800', color: DS.warning }}>{tm("Montant à saisir")}</Text> : (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: quoi === 'facture' ? 15 : 14, fontWeight: '800', color: DS.text }}>{euros(Number(m.montant_ht))}{quoi === 'facture' ? ` ${tm("HT")}` : ''}</Text>
              {quoi === 'facture' && m.montant_ttc != null && <Text style={{ fontSize: 11, color: DS.textSecondary }}>{euros(Number(m.montant_ttc))} {tm("TTC")}</Text>}
            </View>
          )}
        </Pressable>
        {retrait && peutReglements && (
          <Pressable onPress={retrait} hitSlop={8} accessibilityRole="button" accessibilityLabel={tm("Retirer le lien")}>
            <Text style={{ fontSize: 13, color: DS.textMuted }}>✕</Text>
          </Pressable>
        )}
      </View>
    );
  };

  /** Panneau « lier » : éléments existants à rattacher, ou en créer un nouveau. */
  const panneauLier = (cible: MontantMn, quoi: 'facture' | 'reglement') => {
    const deja = new Set(quoi === 'reglement' ? reglementsDe(cible).map(x => x.r.id) : facturesDe(cible).map(x => x.f.id));
    const choix = (quoi === 'reglement' ? reglements : factures).filter(x => !deja.has(x.id));
    return (
      <View style={{ gap: 8, backgroundColor: DS.background, borderRadius: 12, padding: 10 }}>
        {choix.length > 0 && <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{quoi === 'reglement' ? tm("Rattacher un règlement existant") : tm("Rattacher une facture existante")}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {choix.map(x => (
            <Pilule key={x.id} label={`${x.libelle || dateFR(x.date_montant)} · ${euros(quoi === 'reglement' ? Number(x.montant_ht) : montantFacture(x))}`}
              onPress={async () => { await (quoi === 'reglement' ? lierMn(chantierId, cible.id, x.id) : lierMn(chantierId, x.id, cible.id)); setLier(null); rafraichir(); }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {quoi === 'facture' && <Pilule plein label={tm("Déposer la facture (PDF)")} onPress={() => deposerFacture(cible.id)} />}
          <Pilule plein={quoi === 'reglement'} label={quoi === 'reglement' ? tm("Nouveau règlement") : tm("Saisir une facture")} onPress={() => setForm({ quoi, lierA: cible.id })} />
          <Pilule label={tm("Annuler")} onPress={() => setLier(null)} />
        </View>
      </View>
    );
  };

  const formulaireNouveau = (quoi: 'facture' | 'reglement', lierA?: string) => (
    <Formulaire options={quoi === 'facture' ? OPT_FACTURE : { ...OPT_REGLEMENT, labelMontant: tm("Montant (€)") }}
      initial={{ libelle: '', ht: '', ttc: '', date: aujourdhui() }} onAnnuler={() => setForm(null)} onValider={v => creer(quoi, v, lierA)} />
  );

  return (
    <Bloc titre={cote === 'client' ? tm("Factures et règlements") : tm("Factures et règlements usine")} droite={(
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {peutFactures && <ZoneDepot onDepot={() => deposerFacture()}><Pilule plein label={tm("+ Facture")} onPress={() => setForm({ quoi: 'facture' })} /></ZoneDepot>}
        {peutReglements && <Pilule label={tm("+ Règlement")} onPress={() => setForm({ quoi: 'reglement' })} />}
      </View>
    )}>
      {!!info && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator size="small" color={DS.primary} /><Text style={{ fontSize: 13, color: DS.textSecondary, flex: 1 }}>{info}</Text></View>}
      {messages.map((x, i) => <Text key={i} style={{ fontSize: 12, color: DS.warning }}>{x}</Text>)}

      {form && !form.lierA && (form.quoi === 'facture' ? (
        <View style={{ gap: 8 }}>
          <Pilule plein label={tm("Déposer la facture (PDF) — montants lus automatiquement")} onPress={() => deposerFacture()} />
          {formulaireNouveau('facture')}
        </View>
      ) : formulaireNouveau('reglement'))}

      {factures.length === 0 && reglements.length === 0 && !form && <Text style={{ fontSize: 13, color: DS.textMuted }}>{tm("Aucune facture ni règlement.")}</Text>}

      {factures.map(f => {
        const regs = reglementsDe(f);
        const paye = regs.reduce((x, { r }) => x + Number(r.montant_ht), 0);
        const du = montantFacture(f);
        const statut = paye <= 0 ? { l: tm("Non réglée"), fond: DS.warningSoft, txt: '#92400E' } : paye + 0.01 >= du ? { l: tm("Réglée"), fond: DS.successSoft, txt: '#065F46' } : { l: tm("Réglée en partie · reste {0}", euros(du - paye)), fond: DS.warningSoft, txt: '#92400E' };
        const doc = docDeLigne(f, documents);
        const partagee = f.visibilite === 'client';
        return (
          <View key={f.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: DS.border, padding: 12, gap: 8 }}>
            {ligne(f, 'facture')}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: statut.fond }}><Text style={{ fontSize: 11, fontWeight: '800', color: statut.txt }}>{statut.l}</Text></View>
              {doc && <Pressable onPress={() => ouvrirDocumentMn(doc)} hitSlop={6}><Text style={{ fontSize: 12, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>📄 {tm("Ouvrir le PDF")}</Text></Pressable>}
              {admin && cote === 'client' && (
                <Pressable hitSlop={6} onPress={async () => { await majMontantMn(moi, f, { visibilite: partagee ? 'admin' : 'client' }); if (doc) await partagerClientMn(moi, doc, partagee ? null : 'factures'); onChange(); }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary, textDecorationLine: 'underline' }}>{partagee ? tm("Visible par le client ✓") : tm("Montrer au client")}</Text>
                </Pressable>
              )}
            </View>
            {regs.length > 0 && <View style={{ gap: 6, paddingLeft: 6, borderLeftWidth: 2, borderLeftColor: DS.border }}>{regs.map(({ l, r }) => ligne(r, 'reglement', async () => { await delierMn(l); charger(); }))}</View>}
            {form?.lierA === f.id ? formulaireNouveau(form.quoi, f.id) : lier === f.id ? panneauLier(f, 'reglement') : peutReglements && (
              <Pressable onPress={() => setLier(f.id)} hitSlop={6} style={{ alignSelf: 'flex-start' }}><Text style={{ fontSize: 13, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>{tm("+ Lier un règlement")}</Text></Pressable>
            )}
          </View>
        );
      })}

      {reglementsSeuls.length > 0 && <Text style={{ fontSize: 12, fontWeight: '800', color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>{tm("Règlements sans facture")}</Text>}
      {reglementsSeuls.map(r => (
        <View key={r.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: DS.border, borderStyle: 'dashed', padding: 12, gap: 8 }}>
          {ligne(r, 'reglement')}
          {form?.lierA === r.id ? formulaireNouveau(form.quoi, r.id) : lier === r.id ? panneauLier(r, 'facture') : peutReglements && (
            <Pressable onPress={() => setLier(r.id)} hitSlop={6} style={{ alignSelf: 'flex-start' }}><Text style={{ fontSize: 13, fontWeight: '700', color: DS.text, textDecorationLine: 'underline' }}>{tm("+ Lier une facture")}</Text></Pressable>
          )}
        </View>
      ))}

      {(factures.length > 0 || reglements.length > 0) && (
        <Text style={{ fontSize: 13, color: DS.textSecondary, textAlign: 'right' }}>
          {tm("Facturé :")} <Text style={{ fontWeight: '800', color: DS.text }}>{euros(totalFacture)}</Text> · {cote === 'client' ? tm("Encaissé :") : tm("Payé :")} <Text style={{ fontWeight: '800', color: DS.text }}>{euros(totalRegle)}</Text>
        </Text>
      )}
    </Bloc>
  );
}
