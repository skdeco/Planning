/**
 * BackToPlus — lien de retour « ‹ Plus » en haut des écrans ouverts depuis
 * l'écran Plus (Équipe, Matériel, Reporting, RH, Documents, Société).
 * Masqué pour les rôles qui n'ont pas l'écran Plus, et sur Matériel quand
 * celui-ci est déjà dans la barre d'onglets (employé dispensé de pointage).
 */
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { DS } from '@/constants/design';

export function BackToPlus({ screen }: { screen?: 'materiel' | 'messagerie' }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { data, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const isEmploye = currentUser?.role === 'employe';
  if (!isAdmin && !isEmploye) return null;
  // Matériel est dans la barre d'onglets de l'employé : pas de retour « Plus ».
  if (screen === 'materiel' && isEmploye) return null;
  // Messages : retour « Plus » seulement pour l'employé qui pointe (Messages est alors rangé dans Plus).
  if (screen === 'messagerie') {
    const emp = data.employes.find(e => e.id === currentUser?.employeId);
    if (!isEmploye || emp?.doitPointer === false) return null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.gestion.plusTitle}
      hitSlop={8}
      onPress={() => router.navigate('/(tabs)/gestion' as never)}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
    >
      <ChevronLeft size={22} color={DS.primary} strokeWidth={2.2} />
      <Text style={styles.label}>{t.gestion.plusTitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 40, paddingLeft: 8, paddingRight: 12, gap: 2 },
  label: { fontSize: 17, color: DS.primary },
});
