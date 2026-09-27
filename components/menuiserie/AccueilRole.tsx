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
import { EspaceBar } from '@/components/espaces/EspaceBar';
import { useSessionMn } from '@/lib/menuiserie/SessionMn';
import { mesChantiersMn } from '@/lib/menuiserie/api2';
import { mn } from '@/lib/menuiserie/client';
import type { ChantierMn, EtapeMn } from '@/lib/menuiserie/types';
import { ROLE_COMPTE_MN_LABELS, STATUT_CHANTIER_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Section } from './ui';
import { PointageCarte } from './PointageCarte';

export function AccueilRole() {
  const router = useRouter();
  const { currentUser, logout } = useApp();
  const { compte, deconnecter } = useSessionMn();
  const [chantiers, setChantiers] = useState<ChantierMn[]>([]);
  const [poses, setPoses] = useState<EtapeMn[]>([]);
  const [erreur, setErreur] = useState('');
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    if (!compte) return;
    try {
      setChantiers(await mesChantiersMn(compte));
      if (compte.role === 'poseur') {
        const { data } = await mn().from('mn_etapes').select('*').eq('etape', 'pose');
        setPoses((data as EtapeMn[]) || []);
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
  const enCours = chantiers.filter(c => c.statut !== 'cloture');

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await charger(); setRafraichit(false); }} tintColor={DS.primary} />}
      >
        <View style={{ marginTop: 8, gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: DS.textSecondary }}>SK DECO · {ROLE_COMPTE_MN_LABELS[role].toUpperCase()}</Text>
          <Text style={screenTitle}>Bonjour {compte.nom.split(' ')[0]}</Text>
          {currentUser?.role !== 'menuiserie' && <EspaceBar espaceCourant="menuiserie" />}
        </View>
        {!!erreur && <Text style={{ color: DS.error, fontWeight: '700' }}>{erreur}</Text>}

        {(role === 'employe_usine' || role === 'poseur') && <PointageCarte moi={compte} />}

        {role === 'poseur' && poses.length > 0 && (
          <>
            <Section>Mes poses</Section>
            {poses.map(p => {
              const ch = chantiers.find(c => c.id === p.chantier_id);
              return (
                <Pressable key={p.chantier_id} onPress={() => router.push(`/menuiserie/chantier/${p.chantier_id}` as any)} accessibilityRole="button">
                  <Carte>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{ch?.nom || 'Chantier'}</Text>
                    <Text style={{ fontSize: 14, color: DS.text }}>
                      {p.infos.date_debut ? `Du ${formatDateFR(p.infos.date_debut)}` : 'Dates à définir'}{p.infos.date_fin ? ` au ${formatDateFR(p.infos.date_fin)}` : ''}
                    </Text>
                  </Carte>
                </Pressable>
              );
            })}
          </>
        )}

        <Section>{role === 'client' ? 'Mon projet' : 'Chantiers'} ({enCours.length})</Section>
        {enCours.length === 0 && <Text style={{ fontSize: 14, color: DS.textSecondary }}>Aucun chantier pour le moment.</Text>}
        {enCours.map(c => (
          <Pressable key={c.id} onPress={() => router.push(`/menuiserie/chantier/${c.id}` as any)} accessibilityRole="button">
            <Carte>
              <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{c.nom.toUpperCase()}{c.ville ? ` · ${c.ville}` : ''}</Text>
              <Text style={{ fontSize: 13, color: DS.textSecondary }}>
                {STATUT_CHANTIER_MN_LABELS[c.statut]}{c.date_livraison_prevue ? ` · livraison prévue ${formatDateFR(c.date_livraison_prevue)}` : ''}
              </Text>
            </Carte>
          </Pressable>
        ))}

        {role === 'usine' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton label="Employés" variante="contour" onPress={() => router.push('/menuiserie/employes' as any)} /></View>
            <View style={{ flex: 1 }}><Bouton label="Catalogue" variante="contour" onPress={() => router.push('/menuiserie/catalogue' as any)} /></View>
          </View>
        )}
        {role === 'employe_usine' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton label="Congés & documents" variante="contour" onPress={() => router.push('/menuiserie/rh' as any)} /></View>
            <View style={{ flex: 1 }}><Bouton label="Catalogue" variante="contour" onPress={() => router.push('/menuiserie/catalogue' as any)} /></View>
          </View>
        )}
        {role === 'poseur' && <Bouton label="Historique de mes pointages" variante="contour" onPress={() => router.push('/menuiserie/rh' as any)} />}

        <Bouton label="Se déconnecter" variante="discret" onPress={seDeconnecter} />
      </ScrollView>
    </ScreenContainer>
  );
}
