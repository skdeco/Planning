import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
  ScrollView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';

// Compte administrateur fixe
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin';

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

    // Connexion admin
    if (id === ADMIN_LOGIN && pwd === ADMIN_PASSWORD) {
      setCurrentUser({ role: 'admin' });
      router.replace('/(tabs)/' as any);
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
      router.replace('/(tabs)/' as any);
      return;
    }

    // Connexion sous-traitant
    const st = data.sousTraitants.find(
      s => s.identifiant.toLowerCase() === id && s.motDePasse === pwd
    );

    if (st) {
      setCurrentUser({
        role: 'soustraitant',
        soustraitantId: st.id,
        nom: `${st.prenom} ${st.nom}`,
      });
      router.replace('/(tabs)/' as any);
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
              placeholderTextColor="#687076"
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
                placeholderTextColor="#687076"
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

            <Text style={styles.hint}>
              {t.auth.adminHint} <Text style={styles.hintBold}>admin</Text> / <Text style={styles.hintBold}>admin</Text>
            </Text>
            <Text style={styles.hint}>
              {t.auth.employeeHint} (ex: <Text style={styles.hintBold}>sacha</Text>) / <Text style={styles.hintBold}>1234</Text>
            </Text>
          </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F2F4F7',
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
    color: '#687076',
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
    color: '#11181C',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
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
    backgroundColor: '#1A3A6B',
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
    color: '#687076',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  hintBold: {
    fontWeight: '700',
    color: '#1A3A6B',
  },
});
