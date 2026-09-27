/** Fiche d'un chantier Menuiserie : infos, client, intervenants, les 15 étapes, historique. */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS } from '@/constants/design';
import { formatDateFR, formatDateHeureFR } from '@/lib/date/format';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';
import { useDonneesMn } from '@/lib/menuiserie/cache';
import { chargerChantierMn, listerUsinesMn, majChantierMn, supprimerChantierMn, type DonneesChantierMn } from '@/lib/menuiserie/api';
import { ETAPES_MN, type DefEtape } from '@/lib/menuiserie/etapes';
import { STATUT_CHANTIER_MN_LABELS, type StatutChantierMn, type UsineMn } from '@/lib/menuiserie/types';
import { Carte, EnTete, Puce, Section } from '@/components/menuiserie/ui';
import { EtapeSheet } from '@/components/menuiserie/EtapeSheet';
import { BadgeRempliPar } from '@/components/menuiserie/BadgeRempliPar';
import { IntervenantsPanel } from '@/components/menuiserie/IntervenantsPanel';
import { FinancesChantier } from '@/components/menuiserie/FinancesChantier';
import { ChantierRole } from '@/components/menuiserie/ChantierRole';
import { SignalementsListe } from '@/components/menuiserie/SignalementsListe';
import { AdresseChantier } from '@/components/menuiserie/AdresseChantier';
import { ChoixUsine } from '@/components/menuiserie/ChoixUsine';
import { Bouton } from '@/components/menuiserie/ui';

import { tm } from '@/lib/menuiserie/i18n';
const PASTILLE_STATUT = { a_faire: { fond: '#EAE2D8', texte: DS.textSecondary, signe: '' }, en_cours: { fond: DS.warning, texte: DS.sombre, signe: '…' }, fait: { fond: '#2F6B4F', texte: '#FFFFFF', signe: '✓' } };

function Ligne({ label, valeur }: { label: string; valeur?: string | null }) {
  if (!valeur) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 14, color: DS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text, flexShrink: 1, textAlign: 'right' }}>{valeur}</Text>
    </View>
  );
}

export default function ChantierMnScreen() {
  const moi = useCompteMn();
  if (moi.role !== 'admin') return <ChantierRole />;
  return <ChantierAdmin />;
}

function ChantierAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const moi = useCompteMn();
  const { donnees: d, erreur: erreurCharge, recharger: charger } = useDonneesMn(`chantier:${id}`, () => chargerChantierMn(String(id)));
  const { donnees: usinesCache } = useDonneesMn('usines', listerUsinesMn);
  const usines: UsineMn[] = usinesCache || [];
  const [erreurAction, setErreur] = useState('');
  const erreur = erreurAction || erreurCharge;
  const [ouverte, setOuverte] = useState<DefEtape | null>(null);
  const [rafraichit, setRafraichit] = useState(false);
  const [onglet, setOnglet] = useState<'general' | 'deroulement'>('general');

  if (!d) {
    return (
      <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
        <View style={{ padding: 16 }}><EnTete titre={tm("Chantier")} retour={() => router.back()} /></View>
        {erreur ? <Text style={{ color: DS.error, padding: 16 }}>{erreur}</Text> : <ActivityIndicator color={DS.primary} style={{ marginTop: 40 }} />}
      </ScreenContainer>
    );
  }

  const c = d.chantier;
  const adresseClient = [c.client_rue, [c.client_code_postal, c.client_ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const changerStatut = async (s: StatutChantierMn) => { await majChantierMn(moi, c.id, { statut: s }, `Statut : ${STATUT_CHANTIER_MN_LABELS[s]}`); charger(); };
  const supprimer = () => {
    const titre = tm("Supprimer « {0} » ?", c.nom);
    const texte = tm("Le chantier, ses étapes, documents, photos, montants et réserves seront effacés définitivement. Pour simplement le ranger, choisis plutôt « Archivé ».");
    const go = async () => {
      try { await supprimerChantierMn(c.id); router.replace('/menuiserie' as any); }
      catch (e) { setErreur((e as Error).message); }
    };
    if (Platform.OS === 'web') { if (window.confirm(`${titre}\n\n${texte}`)) go(); return; }
    Alert.alert(titre, texte, [{ text: tm("Annuler"), style: 'cancel' }, { text: tm("Supprimer définitivement"), style: 'destructive', onPress: go }]);
  };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await charger(); setRafraichit(false); }} tintColor={DS.primary} />}
      >
        <EnTete titre={c.nom} retour={() => router.back()} />

        {/* Deux onglets : Général (infos, intervenants, argent) / Déroulement (étapes 1 à 15) */}
        <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: 12, padding: 3 }}>
          {(['general', 'deroulement'] as const).map(o => {
            const on = onglet === o;
            return (
              <Pressable key={o} onPress={() => setOnglet(o)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? DS.surface : 'transparent' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: on ? DS.primary : DS.textSecondary }}>{o === 'general' ? tm("Général") : tm("Déroulement")}</Text>
              </Pressable>
            );
          })}
        </View>

        {onglet === 'general' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(['en_cours', 'cloture', 'sav', 'archive'] as const).map(s => <Puce key={s} label={STATUT_CHANTIER_MN_LABELS[s]} actif={c.statut === s} onPress={() => changerStatut(s)} />)}
            </View>

            <Section>{tm("Usine de production")}</Section>
            <Carte><ChoixUsine moi={moi} chantier={c} usines={usines} onChange={charger} /></Carte>

            <Section>{tm("Adresse du chantier")}</Section>
            <Carte><AdresseChantier moi={moi} chantier={c} onChange={charger} /></Carte>

            <Section>{tm("Intervenants")}</Section>
            <Carte>
              <IntervenantsPanel moi={moi} chantierId={c.id} intervenants={d.intervenants} onChange={charger} />
              {(c.client_tel || c.client_email || adresseClient) && (
                <View style={{ borderTopWidth: 1, borderTopColor: DS.border, paddingTop: 8, marginTop: 4, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: DS.textSecondary }}>{tm("COORDONNÉES DU CLIENT")}</Text>
                  <Ligne label={tm("Client")} valeur={[c.client_nom, c.client_societe].filter(Boolean).join(' · ')} />
                  <Ligne label={tm("Adresse")} valeur={adresseClient} />
                  <Ligne label={tm("Téléphone")} valeur={c.client_tel} />
                  <Ligne label={tm("E-mail")} valeur={c.client_email} />
                </View>
              )}
            </Carte>

            <FinancesChantier moi={moi} chantierId={c.id} intervenants={d.intervenants} montants={d.montants} onChange={charger} />

            <Bouton label={tm("Messagerie & RDV avec le client")} variante="contour" onPress={() => router.push(`/menuiserie/messagerie/${c.id}` as any)} />
            {c.statut !== 'archive' && (
              <Bouton label={tm("Archiver ce chantier")} variante="contour" onPress={() => changerStatut('archive')} />
            )}
            <Pressable onPress={supprimer} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: DS.error }}>{tm("Supprimer définitivement ce chantier")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {ETAPES_MN.map((def, idx) => {
              const e = d.etapes.find(x => x.etape === def.cle);
              const st = PASTILLE_STATUT[e?.statut || 'a_faire'];
              const nbDocs = d.documents.filter(x => x.etape === def.cle).length;
              return (
                <Pressable key={def.cle} onPress={() => setOuverte(def)} accessibilityRole="button" accessibilityLabel={tm("Étape {0} : {1}", idx + 1, def.titre)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: DS.surface, borderRadius: 14, borderWidth: 1, borderColor: e?.statut === 'en_cours' ? DS.warning : DS.border, padding: 10, opacity: def.aVenir ? 0.6 : 1 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: st.fond, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: st.texte }}>{st.signe || idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{idx + 1}. {def.titre}</Text>
                      <Text style={{ fontSize: 12, color: DS.textSecondary }}>
                        {def.aVenir ? tm("Bientôt disponible") : `${nbDocs} document${nbDocs > 1 ? 's' : ''}${e?.updated_by_nom ? ` · ${e.updated_by_nom}` : ''}`}
                      </Text>
                    </View>
                    <BadgeRempliPar def={def} />
                  </View>
                </Pressable>
              );
            })}

            <SignalementsListe chantierId={c.id} />

            {d.journal.length > 0 && (
              <>
                <Section>{tm("Historique")}</Section>
                <Carte>
                  {d.journal.slice(0, 12).map(j => (
                    <Text key={j.id} style={{ fontSize: 13, color: DS.text }}>
                      <Text style={{ fontWeight: '700' }}>{j.par_nom || '—'}</Text> · {formatDateHeureFR(j.created_at)} — {j.action}{j.detail ? ` : ${j.detail}` : ''}
                    </Text>
                  ))}
                </Carte>
              </>
            )}
          </>
        )}
        {!!erreur && <Text style={{ color: DS.error, fontWeight: '600' }}>{erreur}</Text>}
      </ScrollView>

      {ouverte && (
        <EtapeSheet
          moi={moi} chantierId={c.id} usineId={c.usine_id} def={ouverte}
          etape={d.etapes.find(x => x.etape === ouverte.cle)}
          documents={d.documents.filter(x => x.etape === ouverte.cle)}
          montants={d.montants.filter(x => x.etape === ouverte.cle)}
          onClose={() => setOuverte(null)} onChange={charger} chantier={c}
          dateReception={d.etapes.find(x => x.etape === 'livraison')?.infos?.date_reception || null}
          poseur={(() => { const p = d.intervenants.find(i => i.role === 'poseur' && i.compte_id); return p && p.compte_id ? { id: p.compte_id, nom: p.nom } : null; })()}
        />
      )}
    </ScreenContainer>
  );
}
