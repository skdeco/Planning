/**
 * Fiche chantier vue par un compte non administrateur :
 *  - usine / employé d'usine / poseur : étapes autorisées (sans info client) ;
 *  - client / architecte : espace client (documents partagés, règlements, messagerie) ;
 *  - apporteur : statut + commission.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';
import { chantierPourRoleMn, type ChantierRoleMn } from '@/lib/menuiserie/api2';
import { lireCacheMn, ecrireCacheMn } from '@/lib/menuiserie/cache';
import { ETAPES_MN, etapeVisiblePour, type DefEtape } from '@/lib/menuiserie/etapes';
import { groupeMn, STATUT_CHANTIER_MN_LABELS } from '@/lib/menuiserie/types';
import { Carte, EnTete, Section } from './ui';
import { EtapeSheet } from './EtapeSheet';
import { BadgeRempliPar } from './BadgeRempliPar';
import { ReservesPanel } from './ReservesPanel';
import { EspaceClient } from './EspaceClient';
import { SignalerPoseur } from './SignalerPoseur';

import { tm } from '@/lib/menuiserie/i18n';
function Ligne({ label, valeur }: { label: string; valeur?: string | null }) {
  if (!valeur) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 14, color: DS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text, flexShrink: 1, textAlign: 'right' }}>{valeur}</Text>
    </View>
  );
}

export function ChantierRole() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const moi = useCompteMn();
  const groupe = groupeMn(moi.role);
  const [d, setD] = useState<ChantierRoleMn | null>(() => lireCacheMn<ChantierRoleMn>(`role:chantier:${id}`) ?? null);
  const [erreur, setErreur] = useState('');
  const [ouverte, setOuverte] = useState<DefEtape | null>(null);
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    try { const v = await chantierPourRoleMn(moi, String(id)); ecrireCacheMn(`role:chantier:${id}`, v); setD(v); setErreur(''); } catch (e) { setErreur((e as Error).message); }
  }, [id, moi]);
  useEffect(() => { charger(); }, [charger]);

  if (!d) {
    return (
      <ScreenContainer containerClassName="bg-[#F4F4F2]" edges={['top', 'left', 'right']}>
        <View style={{ padding: 16 }}><EnTete titre={tm("Chantier")} retour={() => router.back()} /></View>
        {erreur ? <Text style={{ color: DS.error, padding: 16 }}>{erreur}</Text> : <ActivityIndicator color={DS.primary} style={{ marginTop: 40 }} />}
      </ScreenContainer>
    );
  }
  const c = d.chantier;
  const etapes = ETAPES_MN.filter(e => etapeVisiblePour(moi, e.cle) && !e.aVenir);

  return (
    <ScreenContainer containerClassName="bg-[#F4F4F2]" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await charger(); setRafraichit(false); }} tintColor={DS.primary} />}
      >
        <EnTete titre={c.nom.toUpperCase()} retour={() => router.back()} />
        <Carte>
          <Ligne label={tm("Statut")} valeur={STATUT_CHANTIER_MN_LABELS[c.statut]} />
          <Ligne label={tm("Adresse")} valeur={[c.rue, c.code_postal, c.ville].filter(Boolean).join(' ')} />
          {groupe !== 'client' && groupe !== 'apporteur' && (
            <>
              <Ligne label={tm("Code")} valeur={c.code_acces} />
              <Ligne label={tm("Étage")} valeur={c.etage} />
              <Ligne label={tm("Clé")} valeur={c.cle} />
            </>
          )}
          <Ligne label={tm("Livraison prévue")} valeur={formatDateFR(c.date_livraison_prevue)} />
        </Carte>

        {(groupe === 'client' || groupe === 'apporteur') && (
          <EspaceClient moi={moi} chantier={c} documents={d.documents} montants={d.montants} onMessagerie={() => router.push(`/menuiserie/messagerie/${c.id}` as any)} />
        )}

        {groupe === 'poseur' && <SignalerPoseur moi={moi} chantierId={c.id} />}

        {etapes.length > 0 && <Section>{tm("Processus")}</Section>}
        {etapes.map(def => {
          const e = d.etapes.find(x => x.etape === def.cle);
          const nbDocs = d.documents.filter(x => x.etape === def.cle).length;
          const fait = e?.statut === 'fait', enCours = e?.statut === 'en_cours';
          return (
            <Pressable key={def.cle} onPress={() => setOuverte(def)} accessibilityRole="button" accessibilityLabel={def.titre}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: DS.surface, borderRadius: 14, borderWidth: 1, borderColor: enCours ? DS.warning : DS.border, padding: 10 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: fait ? '#2F6B4F' : enCours ? DS.warning : '#EAE2D8', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: fait ? '#FFFFFF' : DS.sombre }}>{fait ? '✓' : enCours ? '…' : ''}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{def.titre}</Text>
                  <Text style={{ fontSize: 12, color: DS.textSecondary }}>{nbDocs}{' '}{tm("document")}{nbDocs > 1 ? 's' : ''}{e?.updated_by_nom ? ` · ${e.updated_by_nom}` : ''}</Text>
                </View>
                <BadgeRempliPar def={def} />
              </View>
            </Pressable>
          );
        })}

        {groupe === 'usine' && d.reserves.length > 0 && (
          <>
            <Section>{tm("Éléments à reprendre ou terminer")}</Section>
            <Carte><ReservesPanel moi={moi} chantierId={c.id} /></Carte>
          </>
        )}
      </ScrollView>

      {ouverte && (
        <EtapeSheet
          moi={moi} chantierId={c.id} usineId={c.usine_id} def={ouverte}
          etape={d.etapes.find(x => x.etape === ouverte.cle)}
          documents={d.documents.filter(x => x.etape === ouverte.cle)}
          montants={d.montants.filter(x => x.etape === ouverte.cle)}
          onClose={() => setOuverte(null)} onChange={charger}
        />
      )}
    </ScreenContainer>
  );
}
