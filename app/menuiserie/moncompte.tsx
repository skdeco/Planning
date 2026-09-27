/** Mon compte Menuiserie : identifiant / e-mail de connexion et mot de passe. */
import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS } from '@/constants/design';
import { useSessionMn } from '@/lib/menuiserie/SessionMn';
import { changerMesIdentifiantsMn, changerMonMotDePasseMn } from '@/lib/menuiserie/auth';
import { ROLE_COMPTE_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Section } from '@/components/menuiserie/ui';

export default function MonCompteMn() {
  const router = useRouter();
  const { compte, recharger } = useSessionMn();
  const [identifiant, setIdentifiant] = useState(compte?.identifiant || '');
  const [email, setEmail] = useState(compte?.email || '');
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [msgId, setMsgId] = useState('');
  const [msgMdp, setMsgMdp] = useState('');
  const [charge, setCharge] = useState<'id' | 'mdp' | null>(null);
  if (!compte) return null;
  const estAdmin = compte.role === 'admin';

  const enregistrerIdentifiants = async () => {
    setCharge('id'); setMsgId('');
    try { await changerMesIdentifiantsMn(identifiant, email); await recharger(); setMsgId('Identifiants de connexion mis à jour.'); }
    catch (e) { setMsgId((e as Error).message); } finally { setCharge(null); }
  };
  const enregistrerMdp = async () => {
    if (mdp !== mdp2) { setMsgMdp('Les deux mots de passe ne sont pas identiques.'); return; }
    setCharge('mdp'); setMsgMdp('');
    try { await changerMonMotDePasseMn(mdp); setMdp(''); setMdp2(''); setMsgMdp('Mot de passe changé.'); }
    catch (e) { setMsgMdp((e as Error).message); } finally { setCharge(null); }
  };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre="Mon compte" retour={router.canGoBack() ? () => router.back() : undefined} />
        <Carte>
          <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text }}>{compte.nom}</Text>
          <Text style={{ fontSize: 14, color: DS.textSecondary }}>{ROLE_COMPTE_MN_LABELS[compte.role]}</Text>
        </Carte>

        {estAdmin && (
          <Carte style={{ backgroundColor: '#F6EEDB' }}>
            <Text style={{ fontSize: 13, color: '#5A3E08', lineHeight: 18 }}>
              Ton compte administrateur utilise les mêmes identifiants que l'app : pour les changer, change-les dans l'app (Plus → compte admin),
              puis reconnecte-toi — la Menuiserie s'alignera toute seule.
            </Text>
          </Carte>
        )}

        <Section>Identifiants de connexion</Section>
        <Carte>
          <Champ label="Identifiant" value={identifiant} onChangeText={setIdentifiant} autoCapitalize="none" autoCorrect={false} />
          <Champ label="E-mail (permet « mot de passe oublié »)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Text style={{ fontSize: 12, color: DS.textSecondary }}>Tu peux te connecter avec l'un ou l'autre.</Text>
          <Bouton label="Enregistrer les identifiants" onPress={enregistrerIdentifiants} charge={charge === 'id'} />
          {!!msgId && <Text style={{ fontSize: 13, fontWeight: '600', color: DS.primary }}>{msgId}</Text>}
        </Carte>

        <Section>Mot de passe</Section>
        <Carte>
          <Champ label="Nouveau mot de passe (8 caractères min.)" value={mdp} onChangeText={setMdp} secureTextEntry autoCapitalize="none" />
          <Champ label="Confirmer le mot de passe" value={mdp2} onChangeText={setMdp2} secureTextEntry autoCapitalize="none" />
          <Bouton label="Changer le mot de passe" onPress={enregistrerMdp} charge={charge === 'mdp'} disabled={!mdp} />
          {!!msgMdp && <Text style={{ fontSize: 13, fontWeight: '600', color: DS.primary }}>{msgMdp}</Text>}
        </Carte>
        <View style={{ height: 8 }} />
      </ScrollView>
    </ScreenContainer>
  );
}
