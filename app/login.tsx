import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
  ScrollView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';

export default function LoginScreen() {
  const { data, setCurrentUser } = useApp();
  const { t } = useLanguage();
  const router = useRouter();

  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = () => {
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
      setCurrentUser({
        role: 'admin',
        employeId: adminEmploye?.id,
        nom: adminEmploye ? `${adminEmploye.prenom} ${adminEmploye.nom}` : undefined,
      });
      router.replace('/(tabs)' as any);
      return;
    }

    // Connexion employé
    const employe = data.employes.find(
      e => e.identifiant.toLowerCase() === id && e.motDePasse === pwd
    );

    if (employe) {
      setCurrentUser({
        role: employe.role,
        employeId: employe.id,
        nom: `${employe.prenom} ${employe.nom}`,
      });
      router.replace('/(tabs)' as any);
      return;
    }

    // Connexion sous-traitant
    const st = data.sousTraitants.find(
      s => s.identifiant?.toLowerCase() === id && s.motDePasse === pwd
    );

    if (st) {
      setCurrentUser({
        role: 'soustraitant',
        soustraitantId: st.id,
        nom: `${st.prenom} ${st.nom}`,
      });
      router.replace('/(tabs)' as any);
      return;
    }

    // Connexion apporteur (architecte / apporteur / contractant / client) avec accesApp = true
    const apporteur = (data.apporteurs || []).find(
      a => !!a.accesApp && (a.identifiant || '').toLowerCase() === id && a.motDePasse === pwd
    );

    if (apporteur) {
      setCurrentUser({
        role: 'apporteur',
        apporteurId: apporteur.id,
        nom: `${apporteur.prenom} ${apporteur.nom}`,
      });
      router.replace('/(tabs)/chantiers' as any);
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
              placeholderTextColor="#8C8077"
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
                placeholderTextColor="#8C8077"
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
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
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
    backgroundColor: '#F5EDE3',
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
    color: '#8C8077',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1A1A1A',
    borderWidth: 1.5,
    borderColor: '#E8DDD0',
    // @ts-ignore — propriété web pour le focus
    outlineColor: '#2C2C2C',
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
    backgroundColor: '#2C2C2C',
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
    color: '#8C8077',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  hintBold: {
    fontWeight: '700',
    color: '#2C2C2C',
  },
});
