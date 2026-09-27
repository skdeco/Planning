/**
 * Connexion sécurisée à l'espace Menuiserie (e-mail OU identifiant + mot de passe).
 * Si aucun administrateur Menuiserie n'existe encore, propose de créer le premier.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { DS, screenTitle } from '@/constants/design';
import { droitsEspaces, cleUtilisateur } from '@/lib/espaces';
import { connexionMn, creerPremierAdminMn, deconnexionMn, existeAdminMn, motDePasseOublieMn } from '@/lib/menuiserie/auth';
import { useSessionMn } from '@/lib/menuiserie/SessionMn';
import { alignerSurApp } from '@/lib/menuiserie/liaison';
import { Bouton, Carte, Champ } from './ui';

export function ConnexionMn() {
  const { data, currentUser } = useApp();
  const { recharger } = useSessionMn();
  const router = useRouter();
  const droits = droitsEspaces(currentUser, data);
  const [mode, setMode] = useState<'connexion' | 'premier'>('connexion');
  const [existeAdmin, setExisteAdmin] = useState(true);
  const [saisie, setSaisie] = useState('');
  const [mdp, setMdp] = useState('');
  const [nom, setNom] = useState(currentUser?.nom || '');
  const [email, setEmail] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);

  useEffect(() => { existeAdminMn().then(setExisteAdmin).catch(() => setExisteAdmin(true)); }, []);

  const seConnecter = async () => {
    setCharge(true); setMessage('');
    try {
      const r = await connexionMn(saisie, mdp);
      if (!r.ok) { setMessage(r.erreur); return; }
      const c = await recharger();
      if (c) {
        const info = await alignerSurApp(c);
        if (info) setMessage(info);
      }
      if (!c) {
        setMessage("Connexion acceptée, mais aucun compte Menuiserie actif n'est associé à cet e-mail / identifiant. "
          + (existeAdmin ? "Demande à un administrateur de créer ton compte (Menuiserie → Comptes)." : "Crée d'abord le compte administrateur avec le bouton ci-dessous."));
        await deconnexionMn();
      }
    } catch (e) {
      setMessage(`Erreur : ${(e as Error).message}`);
    } finally {
      setCharge(false);
    }
  };

  const oublie = async () => {
    if (!saisie.includes('@')) { setMessage("Indique ton e-mail pour recevoir un lien. Si tu te connectes avec un identifiant, demande à un administrateur."); return; }
    const ok = await motDePasseOublieMn(saisie);
    setMessage(ok ? 'Un e-mail de réinitialisation vient de partir.' : "Impossible d'envoyer l'e-mail pour le moment.");
  };

  const creerPremier = async () => {
    if (!nom.trim() || !email.includes('@') || mdp.length < 8) { setMessage('Nom, e-mail valide et mot de passe de 8 caractères minimum.'); return; }
    setCharge(true); setMessage('');
    try {
      const r = await creerPremierAdminMn({ nom: nom.trim(), email, motDePasse: mdp, identifiant, appRef: cleUtilisateur(currentUser) });
      if (!r.ok) { setMessage(r.erreur); return; }
      if (!(await recharger())) setMessage("Compte créé, mais la fiche administrateur n'a pas pu être lue. Vérifie que les fichiers SQL ont bien été exécutés.");
    } catch (e) {
      setMessage(`Erreur : ${(e as Error).message}`);
    } finally {
      setCharge(false);
    }
  };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: DS.textSecondary, marginTop: 12 }}>SK DECO · MENUISERIE</Text>
        <Text style={screenTitle}>{mode === 'premier' ? 'Créer le compte administrateur' : 'Connexion sécurisée'}</Text>
        <Text style={{ fontSize: 14, color: DS.textSecondary, lineHeight: 20 }}>
          {mode === 'premier'
            ? "C'est le tout premier compte de l'espace Menuiserie. Il pourra ensuite créer les autres (Anthony, usines, clients…)."
            : "L'espace Menuiserie est protégé : chacun ne reçoit que ce qui le concerne. Connecte-toi une seule fois sur cet appareil : ensuite tu bascules sans rien ressaisir."}
        </Text>

        <Carte>
          {mode === 'connexion' ? (
            <>
              <Champ label="E-mail ou identifiant" value={saisie} onChangeText={setSaisie} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
              <Champ label="Mot de passe" value={mdp} onChangeText={setMdp} secureTextEntry autoCapitalize="none" />
              <Bouton label="Se connecter" onPress={seConnecter} charge={charge} />
              <Bouton label="Mot de passe oublié" variante="discret" onPress={oublie} />
            </>
          ) : (
            <>
              <Champ label="Nom affiché" value={nom} onChangeText={setNom} />
              <Champ label="E-mail (sert à la connexion)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              <Champ label="Identifiant (facultatif)" value={identifiant} onChangeText={setIdentifiant} autoCapitalize="none" />
              <Champ label="Mot de passe (8 caractères min.)" value={mdp} onChangeText={setMdp} secureTextEntry autoCapitalize="none" />
              <Bouton label="Créer et se connecter" onPress={creerPremier} charge={charge} />
            </>
          )}
          {!!message && <Text style={{ fontSize: 14, color: DS.primary, fontWeight: '600' }}>{message}</Text>}
        </Carte>

        {!existeAdmin && droits.menuiserie === 'admin' && mode === 'connexion' && (
          <Bouton label="Aucun administrateur encore : créer le premier" variante="contour" onPress={() => { setMode('premier'); setMessage(''); }} />
        )}
        {mode === 'premier' && <Bouton label="Retour à la connexion" variante="discret" onPress={() => setMode('connexion')} />}

        <View style={{ height: 8 }} />
        <Bouton label="‹ Revenir au choix d'espace" variante="discret" onPress={() => router.replace('/espace' as any)} />
      </ScrollView>
    </ScreenContainer>
  );
}
