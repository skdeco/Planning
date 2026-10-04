/**
 * Accueil de l'espace Menuiserie (administrateur) : invitations RDV, ordre du jour,
 * CA par usine, chantiers filtrables. Les autres rôles arrivent aux étapes suivantes.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS, screenTitle } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { InvitationsRdv } from '@/components/espaces/InvitationsRdv';
import { useSessionMn } from '@/lib/menuiserie/SessionMn';
import { chargerAccueilMn, type DonneesAccueilMn } from '@/lib/menuiserie/api';
import { ETAPES_MN } from '@/lib/menuiserie/etapes';
import { ROLE_COMPTE_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Pastille, Section, COULEUR_USINE, FOND_USINE } from '@/components/menuiserie/ui';
import { CaParUsine } from '@/components/menuiserie/CaParUsine';
import { TransfertTravaux } from '@/components/menuiserie/TransfertTravaux';
import { AccueilRole } from '@/components/menuiserie/AccueilRole';
import { useDonneesMn, prechargerMn } from '@/lib/menuiserie/cache';
import { chargerChantierMn, listerComptesMn, listerUsinesMn } from '@/lib/menuiserie/api';
import { listerCatalogueMn, listerFournisseursMn } from '@/lib/menuiserie/api2';
import { useSyncRdvMenuiserie } from '@/hooks/useSyncRdvMenuiserie';
import { listerRdvMn } from '@/lib/menuiserie/api2';
import type { RdvMn } from '@/lib/menuiserie/types';
import { FiltresChantiers, FILTRES_MN_DEFAUT, filtrerChantiers, type FiltresMn } from '@/components/menuiserie/FiltresChantiers';

import { LanguageFlag } from '@/components/LanguageFlag';
import { tm, localeMn } from '@/lib/menuiserie/i18n';
import { RdvDuJour } from '@/components/espaces/RdvDuJour';
const VIDE: DonneesAccueilMn = { chantiers: [], usines: [], intervenants: [], montants: [], etapes: [] };

export default function MenuiserieAccueil() {
  const { compte } = useSessionMn();
  if (compte && compte.role !== 'admin') return <AccueilRole />;
  return <AccueilAdmin />;
}

function AccueilAdmin() {
  const router = useRouter();
  const { compte, deconnecter } = useSessionMn();
  const { currentUser, logout, enregistrerContactDirection } = useApp();
  const estAdminTravaux = currentUser?.role === 'admin';
  const synchroniserRdv = useSyncRdvMenuiserie();
  // Les administrateurs Menuiserie (comptes propres à la Menuiserie) deviennent invitables
  // dans le Planning direction — enregistré depuis la session de l'administrateur principal.
  useEffect(() => {
    if (!estAdminTravaux) return;
    listerComptesMn().then(liste => liste
      .filter(c => c.actif && c.role === 'admin' && !c.app_ref)
      .forEach(c => enregistrerContactDirection(`mn:${c.id}`, c.nom))).catch(() => {});
  }, [estAdminTravaux]);
  const seDeconnecter = async () => { await deconnecter(); if (!estAdminTravaux) logout(); };
  const [rafraichit, setRafraichit] = useState(false);
  const [filtres, setFiltres] = useState<FiltresMn>(FILTRES_MN_DEFAUT);
  const estAdmin = compte?.role === 'admin';

  // Affichage immédiat depuis le cache, rafraîchi en fond (tables + RDV en parallèle)
  const { donnees, erreur, recharger: charger } = useDonneesMn(estAdmin ? 'accueil' : null, async () => {
    const [accueil, rdvs] = await Promise.all([chargerAccueilMn(), listerRdvMn()]);
    synchroniserRdv(accueil.chantiers);
    // Précharge les onglets du bas pour qu'ils s'ouvrent instantanément
    prechargerMn('usines', listerUsinesMn);
    prechargerMn('comptes', listerComptesMn);
    prechargerMn('catalogue', async () => { const [a, f] = await Promise.all([listerCatalogueMn(), listerFournisseursMn()]); return { a, f }; });
    return { accueil, rdvs };
  });
  const d = donnees?.accueil ?? VIDE;
  const rdvAValider: RdvMn[] = (donnees?.rdvs || []).filter(r => r.statut === 'validation_admins' && !!compte && r.accords[compte.id] === undefined);

  const liste = useMemo(() => filtrerChantiers(d.chantiers, d.intervenants, filtres), [d, filtres]);

  const ordreDuJour = useMemo(() => {
    const dans14 = new Date(); dans14.setDate(dans14.getDate() + 14);
    const limite = dans14.toISOString().slice(0, 10);
    const items: { id: string; texte: string }[] = [];
    d.chantiers.filter(c => c.statut !== 'cloture' && c.statut !== 'archive' && c.date_livraison_prevue && c.date_livraison_prevue <= limite)
      .forEach(c => items.push({ id: `l-${c.id}`, texte: tm("Livraison {0} le {1}", c.nom, formatDateFR(c.date_livraison_prevue)) }));
    d.etapes.filter(e => e.statut === 'en_cours').slice(0, 5).forEach(e => {
      const c = d.chantiers.find(x => x.id === e.chantier_id);
      const def = ETAPES_MN.find(x => x.cle === e.etape);
      if (c && def) items.push({ id: `e-${c.id}-${e.etape}`, texte: tm("{0} · {1} en cours", c.nom, def.titre) });
    });
    return items;
  }, [d]);

  const etapeCourante = (chantierId: string) => {
    const etapes = d.etapes.filter(e => e.chantier_id === chantierId);
    const enCours = ETAPES_MN.find(def => etapes.some(e => e.etape === def.cle && e.statut === 'en_cours'));
    const faites = etapes.filter(e => e.statut === 'fait').length;
    return `${enCours ? enCours.titre : faites ? tm('Dernière étape faite') : tm('Pas commencé')} · ${faites}/${ETAPES_MN.length}`;
  };

  return (
    <ScreenContainer containerClassName="bg-[#F4F4F2]" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await charger(); setRafraichit(false); }} tintColor={DS.primary} />}
      >
        <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, color: DS.textSecondary, textTransform: 'capitalize' }}>
            {new Date().toLocaleDateString(localeMn(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <LanguageFlag />
        </View>

        <View style={{ marginHorizontal: -12 }}><InvitationsRdv /></View>
        <RdvDuJour marge={0} />

        {!estAdmin ? (
          <Carte>
            <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{tm("Votre espace arrive bientôt")}</Text>
            <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Vous serez prévenu dès son ouverture.")}</Text>
          </Carte>
        ) : (
          <>
            {!!erreur && <Carte><Text style={{ color: DS.error, fontWeight: '700' }}>{erreur}</Text></Carte>}

            {rdvAValider.map(r => {
              const ch = d.chantiers.find(c => c.id === r.chantier_id);
              return (
                <Pressable key={r.id} onPress={() => router.push(`/menuiserie/messagerie/${r.chantier_id}` as any)} accessibilityRole="button">
                  <Carte style={{ borderWidth: 2, borderColor: DS.warning }}>
                    <Section>{tm("RDV à valider")}{ch ? ` · ${ch.nom}` : ''}</Section>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{r.titre} · {formatDateFR(r.date_rdv)} {r.heure_debut}</Text>
                    <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Proposé par")}{' '}{r.propose_par_nom}{' '}{tm("— touche pour répondre")}</Text>
                  </Carte>
                </Pressable>
              );
            })}

            {ordreDuJour.length > 0 && (
              <Carte>
                <Section>{tm("Ordre du jour")}</Section>
                {ordreDuJour.map(o => <Text key={o.id} style={{ fontSize: 15, fontWeight: '600', color: DS.text }}>• {o.texte}</Text>)}
              </Carte>
            )}

            {/* Transfert depuis Travaux : réservé à l'administrateur principal (données Travaux) */}
            {estAdminTravaux && <TransfertTravaux onFini={charger} />}

            <CaParUsine montants={d.montants} chantiers={d.chantiers} usines={d.usines} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Section>{tm("Chantiers (")}{liste.length})</Section>
              <Pressable onPress={() => router.push('/menuiserie/nouveau' as any)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: DS.primary }}>{tm("+ Nouveau")}</Text>
              </Pressable>
            </View>
            <FiltresChantiers valeur={filtres} onChange={setFiltres} usines={d.usines} intervenants={d.intervenants} />

            {liste.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucun chantier pour ces filtres.")}</Text>}
            {liste.map(c => {
              const usine = d.usines.find(u => u.id === c.usine_id);
              return (
                <Pressable key={c.id} onPressIn={() => prechargerMn(`chantier:${c.id}`, () => chargerChantierMn(c.id))} onPress={() => router.push(`/menuiserie/chantier/${c.id}` as any)} accessibilityRole="button">
                  <Carte style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</Text>
                      <Text style={{ fontSize: 13, color: DS.textSecondary }}>{etapeCourante(c.id)}</Text>
                    </View>
                    {usine && <Pastille label={usine.nom} fond={FOND_USINE} texte={COULEUR_USINE} />}
                  </Carte>
                </Pressable>
              );
            })}

          </>
        )}

        {!estAdmin && <Bouton label={tm("Se déconnecter de la Menuiserie")} variante="discret" onPress={deconnecter} />}
        {estAdmin && !estAdminTravaux && <Bouton label={tm("Se déconnecter")} variante="discret" onPress={seDeconnecter} />}
      </ScrollView>
    </ScreenContainer>
  );
}
