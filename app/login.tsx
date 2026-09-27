import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
  ScrollView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { verifierMotDePasse, preparerChangementMotDePasse } from '@/lib/externAuth';
import { Ico } from '@/components/ui/Ico';
import type { CurrentUser } from '@/app/types';
import { droitsEspaces } from '@/lib/espaces';

export default function LoginScreen() {
  const { data, setCurrentUser, updateApporteur } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  /**
   * Ouvre la session puis choisit l'écran d'arrivée :
   *  - accès à l'espace Menuiserie (seul ou avec Travaux) → routage central ('/') :
   *    écran de choix si 2 espaces, sinon l'espace unique ;
   *  - sinon : écran historique du rôle.
   */
  const connecter = (user: CurrentUser, ecranTravaux: string) => {
    setCurrentUser(user);
    const droits = droitsEspaces(user, data);
    router.replace((droits.espaces.includes('menuiserie') ? '/' : ecranTravaux) as any);
  };

  const handleLogin = async () => {
    setError('');
    const id = identifiant.trim().toLowerCase();
    const pwd = motDePasse;

    // Connexion admin (identifiant configurable, défaut : 'admin')
    const adminIdentifiant = (data.adminIdentifiant || 'admin').toLowerCase();
    const adminPassword = data.adminPassword || 'admin';
    if (id === adminIdentifiant && pwd === adminPassword) {
      const adminEmploye = data.adminEmployeId
        ? data.employes.find(e => e.id === data.adminEmployeId)
        : undefined;
      connecter({
        role: 'admin',
        employeId: adminEmploye?.id,
        nom: adminEmploye ? `${adminEmploye.prenom} ${adminEmploye.nom}` : undefined,
      }, '/(tabs)');
      return;
    }

    // Connexion employé
    const employe = data.employes.find(
      e => e.identifiant.toLowerCase() === id && e.motDePasse === pwd
    );

    if (employe) {
      connecter({
        role: employe.role,
        employeId: employe.id,
        nom: `${employe.prenom} ${employe.nom}`,
      }, '/(tabs)');
      return;
    }

    // Connexion sous-traitant
    const st = data.sousTraitants.find(
      s => s.identifiant?.toLowerCase() === id && s.motDePasse === pwd
    );

    if (st) {
      connecter({
        role: 'soustraitant',
        soustraitantId: st.id,
        nom: `${st.prenom} ${st.nom}`,
      }, '/(tabs)');
      return;
    }

    // Connexion apporteur (architecte / apporteur / contractant / client) avec accesApp = true
    const candidats = (data.apporteurs || []).filter(
      a => !!a.accesApp && (a.identifiant || '').toLowerCase() === id
    );
    for (const apporteur of candidats) {
      const { ok, needsMigration } = await verifierMotDePasse(apporteur, pwd);
      if (!ok) continue;
      // Migration legacy clair → hash + mémorisation du mot de passe visible admin
      if (needsMigration) {
        const maj = await preparerChangementMotDePasse(pwd);
        updateApporteur({ ...apporteur, ...maj, derniereConnexion: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else {
        updateApporteur({ ...apporteur, derniereConnexion: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      connecter({
        role: 'apporteur',
        apporteurId: apporteur.id,
        nom: `${apporteur.prenom} ${apporteur.nom}`,
      }, '/(externe)/mes-chantiers');
      return;
    }

    setError(t.auth.loginError);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/sk_deco_logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.appSub}>Planning</Text>
          </View>

          {/* Formulaire */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t.auth.login}</Text>

            <Text style={styles.label}>{t.auth.username}</Text>
            <TextInput
              style={styles.input}
              value={identifiant}
              onChangeText={v => { setIdentifiant(v); setError(''); }}
              placeholder={t.auth.usernamePlaceholder}
              placeholderTextColor="#6E5F54"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={styles.label}>{t.auth.password}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={motDePasse}
                onChangeText={v => { setMotDePasse(v); setError(''); }}
                placeholder={t.auth.passwordPlaceholder}
                placeholderTextColor="#6E5F54"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
              >
                <Ico e={showPassword ? '🙈' : '👁'} size={18} />
              </Pressable>
            </View>

            {error !== '' && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <Pressable
              style={[styles.loginBtn, (!identifiant || !motDePasse) && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={!identifiant || !motDePasse}
            >
              <Text style={styles.loginBtnText}>{t.auth.loginBtn}</Text>
            </Pressable>

          </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F1E7DC',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 160,
    height: 160,
    marginBottom: 8,
  },
  appSub: {
    fontSize: 14,
    color: '#6E5F54',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2B1D14',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2B1D14',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F1E7DC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#2B1D14',
    borderWidth: 1.5,
    borderColor: '#EDE2D6',
    // @ts-ignore — propriété web pour le focus
    outlineColor: '#5C1F2E',
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  eyeIcon: {
    fontSize: 18,
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: '#5C1F2E',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  loginBtnDisabled: {
    opacity: 0.5,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 11,
    color: '#6E5F54',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  hintBold: {
    fontWeight: '700',
    color: '#5C1F2E',
  },
});
