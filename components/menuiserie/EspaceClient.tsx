/**
 * Espace client / architecte d'un chantier, en une seule fiche lisible :
 *  1. nom du projet, statut, livraison prévue ;
 *  2. prix de vente, règlements numérotés, reste à payer ;
 *  3. toutes les rubriques en liste déroulante (le nombre de documents de chacune) ;
 *  + les suppléments au devis, que le client accepte ou refuse.
 *  4. messagerie.
 * L'architecte (et l'apporteur) voit aussi sa commission — jamais visible par le client.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DS } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import type { ChantierMn, CompteMn, DocumentMn, MontantMn } from '@/lib/menuiserie/types';
import { CATEGORIES_CLIENT, STATUT_CHANTIER_MN_LABELS, TYPE_MONTANT_MN_LABELS } from '@/lib/menuiserie/types';
import { ouvrirDocumentMn } from './DocumentsEtape';
import { BORDEAUX, BORDEAUX_DOUX, Bouton, euros } from './ui';
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

function Rubrique({ titre, docs, premiere, avant, nbAvant = 0, ouvrir = 0, onLayoutY }: {
  titre: string; docs: DocumentMn[]; premiere: boolean;
  /** Contenu affiché avant les documents (ex. suppléments) */
  avant?: React.ReactNode; nbAvant?: number;
  /** Ouvre la rubrique quand ce compteur change (> 0) */
  ouvrir?: number; onLayoutY?: (y: number) => void;
}) {
  const [ouvert, setOuvert] = useState(ouvrir > 0);
  useEffect(() => { if (ouvrir > 0) setOuvert(true); }, [ouvrir]);
  const n = docs.length + nbAvant;
  return (
    <View onLayout={e => onLayoutY?.(e.nativeEvent.layout.y)} style={{ borderTopWidth: premiere ? 0 : 1, borderTopColor: DS.border }}>
      <Pressable onPress={() => setOuvert(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: ouvert }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 10 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: n ? DS.text : DS.textMuted }}>{titre}</Text>
        <View style={{ minWidth: 24, paddingHorizontal: 7, height: 22, borderRadius: 11, backgroundColor: n ? DS.primary : DS.background, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: n ? DS.textInverse : DS.textMuted }}>{n}</Text>
        </View>
        <Text style={{ fontSize: 16, color: DS.textSecondary, width: 16, textAlign: 'center' }}>{ouvert ? '⌃' : '⌄'}</Text>
      </Pressable>
      {ouvert && (
        <View style={{ gap: 6, paddingBottom: 12 }}>
          {avant}
          {n === 0 && <Text style={{ fontSize: 13, color: DS.textMuted }}>{tm("Pas encore disponible")}</Text>}
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

export function EspaceClient({ moi, chantier, documents, montants, onMessagerie, defiler }: {
  moi: CompteMn; chantier: ChantierMn; documents: DocumentMn[]; montants: MontantMn[]; onMessagerie: () => void;
  /** Fait défiler l'écran jusqu'à une position (relative au haut de l'espace client) */
  defiler?: (y: number) => void;
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
  const enAttente = supplements.filter(x => x.statut === 'propose').length;
  // Bandeau « supplément en attente » → ouvre la rubrique Suppléments et y descend
  const [ouvrirSupp, setOuvrirSupp] = useState(0);
  const pos = useRef({ docs: 0, supp: 0 });
  useEffect(() => { if (enAttente > 0) setOuvrirSupp(1); }, [enAttente > 0]);
  const total = prix + suppAcceptes;
  const reste = Math.max(0, total - regle);
  const rubriques = CATEGORIES_CLIENT
    .map(cat => ({ ...cat, docs: documents.filter(d => d.categorie_client === cat.cle && !supplements.some(x => x.document_id === d.id)) }));
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
              {suppAcceptes > 0 && <Ligne label={tm("Suppléments acceptés")} valeur={`+ ${euros(suppAcceptes)} ${tm("HT")}`} />}
              {enAttente > 0 && (
                <Pressable onPress={() => { setOuvrirSupp(c => c + 1); setTimeout(() => defiler?.(pos.current.docs + pos.current.supp), 80); }} accessibilityRole="button"
                  style={{ borderRadius: 12, backgroundColor: BORDEAUX_DOUX, borderWidth: 1, borderColor: BORDEAUX, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: BORDEAUX }}>
                    {enAttente > 1 ? tm("{0} suppléments attendent votre réponse ↓", enAttente) : tm("1 supplément attend votre réponse ↓")}
                  </Text>
                </Pressable>
              )}
              {suppAcceptes > 0 && prix > 0 && <Ligne label={tm("Total")} valeur={`${euros(total)} ${tm("HT")}`} fort />}
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
            <View onLayout={e => { pos.current.docs = e.nativeEvent.layout.y; }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>{tm("Documents")}</Text>
              {rubriques.map((r, i) => r.cle === 'supplements' ? (
                <Rubrique key={r.cle} titre={r.label} docs={r.docs} premiere={i === 0} ouvrir={ouvrirSupp} nbAvant={supplements.length}
                  onLayoutY={y => { pos.current.supp = y; }}
                  avant={<SupplementsClient moi={moi} liste={supplements} documents={documents} onChange={chargerSupp} />} />
              ) : <Rubrique key={r.cle} titre={r.label} docs={r.docs} premiere={i === 0} />)}
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
