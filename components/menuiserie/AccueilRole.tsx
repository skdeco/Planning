/**
 * Accueil Menuiserie des comptes non administrateurs :
 * usine, employé d'usine, poseur, client, architecte, apporteur.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DS, screenTitle } from '@/constants/design';
import { formatDateFR } from '@/lib/date/format';
import { useSessionMn } from '@/lib/menuiserie/SessionMn';
import { mesChantiersMn } from '@/lib/menuiserie/api2';
import { mn } from '@/lib/menuiserie/client';
import { lireCacheMn, ecrireCacheMn } from '@/lib/menuiserie/cache';
import type { ChantierMn, EtapeMn } from '@/lib/menuiserie/types';
import { ROLE_COMPTE_MN_LABELS, STATUT_CHANTIER_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Section } from './ui';
import { PointageCarte } from './PointageCarte';

import { LanguageFlag } from '@/components/LanguageFlag';
import { tm } from '@/lib/menuiserie/i18n';
export function AccueilRole() {
  const router = useRouter();
  const { currentUser, logout } = useApp();
  const { compte, deconnecter } = useSessionMn();
  const [chantiers, setChantiers] = useState<ChantierMn[]>(() => lireCacheMn<ChantierMn[]>('role:chantiers') || []);
  const [poses, setPoses] = useState<EtapeMn[]>(() => lireCacheMn<EtapeMn[]>('role:poses') || []);
  const [erreur, setErreur] = useState('');
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    if (!compte) return;
    try {
      const ch = await mesChantiersMn(compte);
      ecrireCacheMn('role:chantiers', ch); setChantiers(ch);
      if (compte.role === 'poseur') {
        const { data } = await mn().from('mn_etapes').select('*').eq('etape', 'pose');
        ecrireCacheMn('role:poses', (data as EtapeMn[]) || []); setPoses((data as EtapeMn[]) || []);
      }
      setErreur('');
    } catch (e) { setErreur((e as Error).message); }
  }, [compte]);
  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  if (!compte) return null;
  const role = compte.role;
  const seDeconnecter = async () => {
    await deconnecter();
    if (currentUser?.role === 'menuiserie') logout();
    else router.replace('/espace' as any);
  };
  const enCours = chantiers.filter(c => c.statut !== 'cloture' && c.statut !== 'archive');

  return (
    <ScreenContainer containerClassName="bg-[#F4F4F2]" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await charger(); setRafraichit(false); }} tintColor={DS.primary} />}
      >
        <View style={{ marginTop: 8, gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: DS.textSecondary }}>{tm("SK DECO ·")}{' '}{ROLE_COMPTE_MN_LABELS[role].toUpperCase()}</Text>
          <View style={{ position: 'absolute', right: 0, top: 0 }}><LanguageFlag /></View>
          <Text style={screenTitle}>{tm("Bonjour")}{' '}{compte.nom.split(' ')[0]}</Text>
        </View>
        {!!erreur && <Text style={{ color: DS.error, fontWeight: '700' }}>{erreur}</Text>}

        {(role === 'employe_usine' || role === 'poseur') && <PointageCarte moi={compte} />}

        {role === 'poseur' && poses.length > 0 && (
          <>
            <Section>{tm("Mes poses")}</Section>
            {poses.map(p => {
              const ch = chantiers.find(c => c.id === p.chantier_id);
              return (
                <Pressable key={p.chantier_id} onPress={() => router.push(`/menuiserie/chantier/${p.chantier_id}` as any)} accessibilityRole="button">
                  <Carte>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{ch?.nom || tm("Chantier")}</Text>
                    <Text style={{ fontSize: 14, color: DS.text }}>
                      {p.infos.date_debut ? tm("Du {0}", formatDateFR(p.infos.date_debut)) : tm("Dates à définir")}{p.infos.date_fin ? ` ${tm('au')} ${formatDateFR(p.infos.date_fin)}` : ''}
                    </Text>
                  </Carte>
                </Pressable>
              );
            })}
          </>
        )}

        <Section>{role === 'client' ? tm("Mon projet") : tm("Chantiers")} ({enCours.length})</Section>
        {enCours.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucun chantier pour le moment.")}</Text>}
        {enCours.map(c => (
          <Pressable key={c.id} onPress={() => router.push(`/menuiserie/chantier/${c.id}` as any)} accessibilityRole="button">
            <Carte>
              <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{c.nom.toUpperCase()}{c.ville ? ` · ${c.ville}` : ''}</Text>
              <Text style={{ fontSize: 13, color: DS.textSecondary }}>
                {STATUT_CHANTIER_MN_LABELS[c.statut]}{c.date_livraison_prevue ? tm(" · livraison prévue {0}", formatDateFR(c.date_livraison_prevue)) : ''}
              </Text>
            </Carte>
          </Pressable>
        ))}

        {role === 'usine' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton label={tm("Employés")} variante="contour" onPress={() => router.push('/menuiserie/employes' as any)} /></View>
            <View style={{ flex: 1 }}><Bouton label={tm("Catalogue")} variante="contour" onPress={() => router.push('/menuiserie/catalogue' as any)} /></View>
          </View>
        )}
        {role === 'employe_usine' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton label={tm("Congés & documents")} variante="contour" onPress={() => router.push('/menuiserie/rh' as any)} /></View>
            <View style={{ flex: 1 }}><Bouton label={tm("Catalogue")} variante="contour" onPress={() => router.push('/menuiserie/catalogue' as any)} /></View>
          </View>
        )}
        {role === 'poseur' && <Bouton label={tm("Historique de mes pointages")} variante="contour" onPress={() => router.push('/menuiserie/rh' as any)} />}

        <Bouton label={tm("Mon compte (identifiant, mot de passe)")} variante="contour" onPress={() => router.push('/menuiserie/moncompte' as any)} />
        <Bouton label={tm("Se déconnecter")} variante="discret" onPress={seDeconnecter} />
      </ScrollView>
    </ScreenContainer>
  );
}
