/**
 * Accueil de l'espace Menuiserie (administrateur) : invitations RDV, ordre du jour,
 * CA par usine, chantiers filtrables. Les autres rôles arrivent aux étapes suivantes.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS, screenTitle } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { EspaceBar } from '@/components/espaces/EspaceBar';
import { InvitationsRdv } from '@/components/espaces/InvitationsRdv';
import { useSessionMn } from '@/lib/menuiserie/SessionMn';
import { chargerAccueilMn, type DonneesAccueilMn } from '@/lib/menuiserie/api';
import { ETAPES_MN } from '@/lib/menuiserie/etapes';
import { ROLE_COMPTE_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Pastille, Section, COULEUR_USINE, FOND_USINE } from '@/components/menuiserie/ui';
import { CaParUsine } from '@/components/menuiserie/CaParUsine';
import { FiltresChantiers, FILTRES_MN_DEFAUT, filtrerChantiers, type FiltresMn } from '@/components/menuiserie/FiltresChantiers';

const VIDE: DonneesAccueilMn = { chantiers: [], usines: [], intervenants: [], montants: [], etapes: [] };

export default function MenuiserieAccueil() {
  const router = useRouter();
  const { compte, deconnecter } = useSessionMn();
  const [d, setD] = useState<DonneesAccueilMn>(VIDE);
  const [erreur, setErreur] = useState('');
  const [rafraichit, setRafraichit] = useState(false);
  const [filtres, setFiltres] = useState<FiltresMn>(FILTRES_MN_DEFAUT);
  const estAdmin = compte?.role === 'admin';

  const charger = useCallback(async () => {
    if (!estAdmin) return;
    try { setD(await chargerAccueilMn()); setErreur(''); } catch (e) { setErreur((e as Error).message); }
  }, [estAdmin]);
  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const liste = useMemo(() => filtrerChantiers(d.chantiers, d.intervenants, filtres), [d, filtres]);

  const ordreDuJour = useMemo(() => {
    const dans14 = new Date(); dans14.setDate(dans14.getDate() + 14);
    const limite = dans14.toISOString().slice(0, 10);
    const items: { id: string; texte: string }[] = [];
    d.chantiers.filter(c => c.statut !== 'cloture' && c.date_livraison_prevue && c.date_livraison_prevue <= limite)
      .forEach(c => items.push({ id: `l-${c.id}`, texte: `Livraison ${c.nom} le ${formatDateFR(c.date_livraison_prevue)}` }));
    d.etapes.filter(e => e.statut === 'en_cours').slice(0, 5).forEach(e => {
      const c = d.chantiers.find(x => x.id === e.chantier_id);
      const def = ETAPES_MN.find(x => x.cle === e.etape);
      if (c && def) items.push({ id: `e-${c.id}-${e.etape}`, texte: `${c.nom} · ${def.titre} en cours` });
    });
    return items;
  }, [d]);

  const etapeCourante = (chantierId: string) => {
    const etapes = d.etapes.filter(e => e.chantier_id === chantierId);
    const enCours = ETAPES_MN.find(def => etapes.some(e => e.etape === def.cle && e.statut === 'en_cours'));
    const faites = etapes.filter(e => e.statut === 'fait').length;
    return `${enCours ? enCours.titre : faites ? 'Dernière étape faite' : 'Pas commencé'} · ${faites}/${ETAPES_MN.length}`;
  };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await charger(); setRafraichit(false); }} tintColor={DS.primary} />}
      >
        <View style={{ marginTop: 8, gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: DS.textSecondary }}>
            SK DECO · {compte ? `${compte.nom} · ${ROLE_COMPTE_MN_LABELS[compte.role]}` : ''}
          </Text>
          <Text style={screenTitle}>Menuiserie</Text>
          <EspaceBar espaceCourant="menuiserie" />
        </View>

        <View style={{ marginHorizontal: -12 }}><InvitationsRdv /></View>

        {!estAdmin ? (
          <Carte>
            <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>Votre espace arrive bientôt</Text>
            <Text style={{ fontSize: 14, color: DS.textSecondary }}>Vous serez prévenu dès son ouverture.</Text>
          </Carte>
        ) : (
          <>
            {!!erreur && <Carte><Text style={{ color: DS.error, fontWeight: '700' }}>{erreur}</Text></Carte>}

            {ordreDuJour.length > 0 && (
              <Carte>
                <Section>Ordre du jour</Section>
                {ordreDuJour.map(o => <Text key={o.id} style={{ fontSize: 15, fontWeight: '600', color: DS.text }}>• {o.texte}</Text>)}
              </Carte>
            )}

            <CaParUsine montants={d.montants} chantiers={d.chantiers} usines={d.usines} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Section>Chantiers ({liste.length})</Section>
              <Pressable onPress={() => router.push('/menuiserie/nouveau' as any)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: DS.primary }}>+ Nouveau</Text>
              </Pressable>
            </View>
            <FiltresChantiers valeur={filtres} onChange={setFiltres} usines={d.usines} intervenants={d.intervenants} />

            {liste.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>Aucun chantier pour ces filtres.</Text>}
            {liste.map(c => {
              const usine = d.usines.find(u => u.id === c.usine_id);
              return (
                <Pressable key={c.id} onPress={() => router.push(`/menuiserie/chantier/${c.id}` as any)} accessibilityRole="button">
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

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Bouton label="Usines" variante="contour" onPress={() => router.push('/menuiserie/usines' as any)} /></View>
              <View style={{ flex: 1 }}><Bouton label="Comptes" variante="contour" onPress={() => router.push('/menuiserie/comptes' as any)} /></View>
            </View>
          </>
        )}

        <Bouton label="Se déconnecter de la Menuiserie" variante="discret" onPress={deconnecter} />
      </ScrollView>
    </ScreenContainer>
  );
}
