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
import { Bouton } from '@/components/menuiserie/ui';

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

  if (!d) {
    return (
      <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
        <View style={{ padding: 16 }}><EnTete titre="Chantier" retour={() => router.back()} /></View>
        {erreur ? <Text style={{ color: DS.error, padding: 16 }}>{erreur}</Text> : <ActivityIndicator color={DS.primary} style={{ marginTop: 40 }} />}
      </ScreenContainer>
    );
  }

  const c = d.chantier;
  const usine = usines.find(u => u.id === c.usine_id);
  const adresse = [c.rue, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const adresseClient = [c.client_rue, [c.client_code_postal, c.client_ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const changerStatut = async (s: StatutChantierMn) => { await majChantierMn(moi, c.id, { statut: s }, `Statut : ${STATUT_CHANTIER_MN_LABELS[s]}`); charger(); };
  const supprimer = () => {
    const titre = `Supprimer « ${c.nom} » ?`;
    const texte = "Le chantier, ses étapes, documents, photos, montants et réserves seront effacés définitivement. Pour simplement le ranger, choisis plutôt « Archivé ».";
    const go = async () => {
      try { await supprimerChantierMn(c.id); router.replace('/menuiserie' as any); }
      catch (e) { setErreur((e as Error).message); }
    };
    if (Platform.OS === 'web') { if (window.confirm(`${titre}\n\n${texte}`)) go(); return; }
    Alert.alert(titre, texte, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer définitivement', style: 'destructive', onPress: go }]);
  };
  const changerUsine = async (u: UsineMn | null) => { await majChantierMn(moi, c.id, { usine_id: u?.id || null }, `Usine : ${u?.nom || 'à définir'}`); charger(); };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await charger(); setRafraichit(false); }} tintColor={DS.primary} />}
      >
        <EnTete titre={c.nom} retour={() => router.back()} />

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {(['en_cours', 'cloture', 'sav', 'archive'] as const).map(s => <Puce key={s} label={STATUT_CHANTIER_MN_LABELS[s]} actif={c.statut === s} onPress={() => changerStatut(s)} />)}
        </View>

        <Carte>
          <Ligne label="Adresse" valeur={adresse} />
          <Ligne label="Code" valeur={c.code_acces} />
          <Ligne label="Étage" valeur={c.etage} />
          <Ligne label="Clé" valeur={c.cle} />
          <Ligne label="Livraison prévue" valeur={formatDateFR(c.date_livraison_prevue)} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary, marginTop: 4 }}>Usine de production</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Puce label="À définir" actif={!usine} onPress={() => changerUsine(null)} />
            {usines.map(u => <Puce key={u.id} label={u.nom} actif={usine?.id === u.id} couleur="#1F4E79" onPress={() => changerUsine(u)} />)}
          </View>
        </Carte>

        <Section>Client & intervenants</Section>
        <Carte>
          <Ligne label="Client" valeur={[c.client_nom, c.client_societe].filter(Boolean).join(' · ')} />
          <Ligne label="Adresse client" valeur={adresseClient} />
          <Ligne label="Téléphone" valeur={c.client_tel} />
          <Ligne label="E-mail" valeur={c.client_email} />
        </Carte>
        <Section>Intervenants & accès</Section>
        <Carte>
          <IntervenantsPanel moi={moi} chantierId={c.id} intervenants={d.intervenants} onChange={charger} />
        </Carte>

        <Carte>
          <FinancesChantier moi={moi} chantierId={c.id} intervenants={d.intervenants} montants={d.montants} onChange={charger} />
        </Carte>

        <Bouton label="Messagerie & RDV avec le client" variante="contour" onPress={() => router.push(`/menuiserie/messagerie/${c.id}` as any)} />
        <SignalementsListe chantierId={c.id} />

        <Section>Processus</Section>
        {ETAPES_MN.map((def, idx) => {
          const e = d.etapes.find(x => x.etape === def.cle);
          const st = PASTILLE_STATUT[e?.statut || 'a_faire'];
          const nbDocs = d.documents.filter(x => x.etape === def.cle).length;
          return (
            <Pressable key={def.cle} onPress={() => setOuverte(def)} accessibilityRole="button" accessibilityLabel={`Étape ${idx + 1} : ${def.titre}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: DS.surface, borderRadius: 14, borderWidth: 1, borderColor: e?.statut === 'en_cours' ? DS.warning : DS.border, padding: 10, opacity: def.aVenir ? 0.6 : 1 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: st.fond, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: st.texte }}>{st.signe || idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{def.titre}</Text>
                  <Text style={{ fontSize: 12, color: DS.textSecondary }}>
                    {def.aVenir ? 'Bientôt disponible' : `${nbDocs} document${nbDocs > 1 ? 's' : ''}${e?.updated_by_nom ? ` · ${e.updated_by_nom}` : ''}`}
                  </Text>
                </View>
                <BadgeRempliPar def={def} />
              </View>
            </Pressable>
          );
        })}

        {d.journal.length > 0 && (
          <>
            <Section>Historique</Section>
            <Carte>
              {d.journal.slice(0, 12).map(j => (
                <Text key={j.id} style={{ fontSize: 13, color: DS.text }}>
                  <Text style={{ fontWeight: '700' }}>{j.par_nom || '—'}</Text> · {formatDateHeureFR(j.created_at)} — {j.action}{j.detail ? ` : ${j.detail}` : ''}
                </Text>
              ))}
            </Carte>
          </>
        )}
        {c.statut !== 'archive' && (
          <Bouton label="Archiver ce chantier" variante="contour" onPress={() => changerStatut('archive')} />
        )}
        <Pressable onPress={supprimer} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: DS.error }}>Supprimer définitivement ce chantier</Text>
        </Pressable>
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
