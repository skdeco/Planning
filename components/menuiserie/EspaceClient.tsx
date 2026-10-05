/**
 * Espace client / architecte d'un chantier, en une seule fiche lisible :
 *  1. nom du projet, statut, livraison prévue ;
 *  2. prix de vente, règlements numérotés, reste à payer ;
 *  3. toutes les rubriques en liste déroulante (le nombre de documents de chacune) ;
 *  + les suppléments au devis, que le client accepte ou refuse.
 *  4. messagerie.
 * L'architecte (et l'apporteur) voit aussi sa commission — jamais visible par le client.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import type { ChantierMn, CompteMn, DocumentMn, MontantMn } from '@/lib/menuiserie/types';
import { CATEGORIES_CLIENT, STATUT_CHANTIER_MN_LABELS, TYPE_MONTANT_MN_LABELS } from '@/lib/menuiserie/types';
import { ouvrirDocumentMn } from './DocumentsEtape';
import { Bouton, euros } from './ui';
import { SupplementsClient } from './SupplementsClient';
import { listerSupplementsMn, totalAccepte, type SupplementMn } from '@/lib/menuiserie/supplements';
import { tm } from '@/lib/menuiserie/i18n';

const MANROPE = 'Manrope_700Bold';

function Separateur() {
  return <View style={{ height: 1, backgroundColor: DS.border, marginHorizontal: -18 }} />;
}

function Ligne({ label, valeur, fort, grand }: { label: string; valeur?: string | null; fort?: boolean; grand?: boolean }) {
  if (!valeur) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 28 }}>
      <Text style={{ fontSize: 14, color: DS.textSecondary, fontWeight: fort ? '700' : '500' }}>{label}</Text>
      <Text style={{ fontSize: grand ? 20 : 15, fontFamily: fort ? MANROPE : undefined, fontWeight: fort ? undefined : '700', color: DS.text, flexShrink: 1, textAlign: 'right' }}>{valeur}</Text>
    </View>
  );
}

function Numero({ n }: { n: number }) {
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: DS.text, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: DS.text }}>{n}</Text>
    </View>
  );
}

function Rubrique({ titre, docs, premiere }: { titre: string; docs: DocumentMn[]; premiere: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <View style={{ borderTopWidth: premiere ? 0 : 1, borderTopColor: DS.border }}>
      <Pressable onPress={() => setOuvert(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: ouvert }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 10 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: docs.length ? DS.text : DS.textMuted }}>{titre}</Text>
        <View style={{ minWidth: 24, paddingHorizontal: 7, height: 22, borderRadius: 11, backgroundColor: docs.length ? DS.primary : DS.background, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: docs.length ? DS.textInverse : DS.textMuted }}>{docs.length}</Text>
        </View>
        <Text style={{ fontSize: 16, color: DS.textSecondary, width: 16, textAlign: 'center' }}>{ouvert ? '⌃' : '⌄'}</Text>
      </Pressable>
      {ouvert && (
        <View style={{ gap: 6, paddingBottom: 12 }}>
          {docs.length === 0 && <Text style={{ fontSize: 13, color: DS.textMuted }}>{tm("Pas encore disponible")}</Text>}
          {docs.map(d => (
            <Pressable key={d.id} onPress={() => ouvrirDocumentMn(d)} accessibilityRole="link"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: DS.background }}>
              <Text style={{ fontSize: 15 }}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: DS.text }} numberOfLines={1}>{d.nom}</Text>
                {!!d.created_at && <Text style={{ fontSize: 11, color: DS.textMuted }}>{formatDateFR(d.created_at.slice(0, 10))}</Text>}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: DS.textSecondary }}>{tm("Ouvrir")}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function EspaceClient({ moi, chantier, documents, montants, onMessagerie }: {
  moi: CompteMn; chantier: ChantierMn; documents: DocumentMn[]; montants: MontantMn[]; onMessagerie: () => void;
}) {
  const visibles = montants.filter(m => m.visibilite === 'client');
  const commissions = montants.filter(m => m.visibilite === 'personnel');
  const reglements = visibles.filter(m => m.type === 'reglement_client')
    .sort((a, b) => String(a.date_montant || '').localeCompare(String(b.date_montant || '')));
  const lignesPrix = visibles.filter(m => m.type === 'vente_client');
  const prix = lignesPrix.reduce((s, m) => s + Number(m.montant_ht), 0);
  const prixTtc = lignesPrix.length && lignesPrix.every(m => m.montant_ttc != null) ? lignesPrix.reduce((s, m) => s + Number(m.montant_ttc), 0) : null;
  const regle = reglements.reduce((s, m) => s + Number(m.montant_ht), 0);
  const [supplements, setSupplements] = useState<SupplementMn[]>([]);
  const chargerSupp = useCallback(() => { listerSupplementsMn(chantier.id).then(setSupplements).catch(() => {}); }, [chantier.id]);
  useEffect(() => { if (moi.role !== 'apporteur') chargerSupp(); }, [chargerSupp, moi.role]);
  const suppAcceptes = totalAccepte(supplements);
  const total = prix + suppAcceptes;
  const reste = Math.max(0, total - regle);
  const rubriques = CATEGORIES_CLIENT
    .map(cat => ({ ...cat, docs: documents.filter(d => d.categorie_client === cat.cle) }));
  const estClient = moi.role !== 'apporteur';

  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: DS.surface, borderRadius: 22, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 18, paddingVertical: 16, gap: 14 }}>
        <Text style={{ fontSize: 28, fontFamily: MANROPE, color: DS.text, textAlign: 'center', letterSpacing: 1 }} numberOfLines={2} adjustsFontSizeToFit>
          {chantier.nom.toUpperCase()}
        </Text>
        <Separateur />
        <View style={{ gap: 4 }}>
          <Ligne label={tm("Statut")} valeur={STATUT_CHANTIER_MN_LABELS[chantier.statut]} />
          <Ligne label={tm("Livraison prévue")} valeur={chantier.date_livraison_prevue ? formatDateFR(chantier.date_livraison_prevue) : tm("À définir")} />
        </View>

        {estClient && (prix > 0 || reglements.length > 0 || supplements.length > 0) && (
          <>
            <Separateur />
            <View style={{ gap: 8 }}>
              {prix > 0 && <Ligne label={tm("Prix de vente")} valeur={`${euros(prix)} ${tm("HT")}`} fort grand />}
              {prixTtc != null && <Text style={{ fontSize: 12, color: DS.textSecondary, textAlign: 'right', marginTop: -6 }}>{euros(prixTtc)} {tm("TTC")}</Text>}
              <SupplementsClient moi={moi} liste={supplements} documents={documents} onChange={chargerSupp} />
              {suppAcceptes > 0 && prix > 0 && <Ligne label={tm("Total avec suppléments")} valeur={`${euros(total)} ${tm("HT")}`} fort />}
              {reglements.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Règlements")}</Text>
                  {reglements.map((m, i) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 }}>
                      <Numero n={i + 1} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, color: DS.text }} numberOfLines={1}>{m.libelle || tm("Règlement")}</Text>
                        {!!m.date_montant && <Text style={{ fontSize: 11, color: DS.textMuted }}>{formatDateFR(m.date_montant)}</Text>}
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>− {euros(Number(m.montant_ht))}</Text>
                    </View>
                  ))}
                </View>
              )}
              {total > 0 && (
                <View style={{ marginTop: 4, borderRadius: 16, backgroundColor: DS.primary, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.75)' }}>{tm("Reste à payer")}</Text>
                  <Text style={{ fontSize: 20, fontFamily: MANROPE, color: DS.textInverse }}>{reste > 0 ? `${euros(reste)} ${tm("HT")}` : tm("Soldé")}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {estClient && (
          <>
            <Separateur />
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>{tm("Documents")}</Text>
              {rubriques.map((r, i) => <Rubrique key={r.cle} titre={r.label} docs={r.docs} premiere={i === 0} />)}
            </View>
          </>
        )}
      </View>

      {estClient && <Bouton label={tm("Messagerie · proposer un RDV")} variante="contour" onPress={onMessagerie} />}

      {(moi.role === 'architecte' || moi.role === 'apporteur') && (
        <View style={{ backgroundColor: DS.primary, borderRadius: 22, padding: 18, gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{tm("Ma commission")}</Text>
          {commissions.length === 0 && <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>{tm("Aucune commission renseignée.")}</Text>}
          {commissions.map(m => (
            <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>{m.libelle || TYPE_MONTANT_MN_LABELS[m.type]}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: DS.textInverse }}>{euros(Number(m.montant_ht))}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
