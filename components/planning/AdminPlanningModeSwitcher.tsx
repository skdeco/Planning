import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { DS, font, radius, space } from '../../constants/design';
import { useLanguage } from '@/app/context/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Plannings disponibles pour un admin ou un RH. */
export type PlanningMode = 'travaux' | 'menuiserie' | 'depannage' | 'direction';

export const PLANNING_MODES: PlanningMode[] = ['travaux', 'menuiserie', 'depannage', 'direction'];

export interface AdminPlanningModeSwitcherProps {
  value: PlanningMode;
  onChange: (mode: PlanningMode) => void;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Sélecteur à 4 segments : Travaux / Menuiserie / Dépannages / Direction.
 * Composant contrôlé : le parent détient `value` et reçoit `onChange`.
 */
export function AdminPlanningModeSwitcher({ value, onChange }: AdminPlanningModeSwitcherProps): React.ReactElement {
  const { t } = useLanguage();
  const labels: Record<PlanningMode, string> = {
    travaux: t.ui.planningTravaux,
    menuiserie: t.ui.planningMenuiserie,
    depannage: t.ui.planningDepannage,
    direction: t.ui.planningDirection,
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrapper} style={{ flexGrow: 0 }}>
      {PLANNING_MODES.map(mode => {
        const on = value === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.button, on && styles.buttonOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{labels[mode]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: DS.segment,
    borderRadius: radius.full,
    marginHorizontal: space.lg,
    marginVertical: 6,
    padding: 3,
    gap: 2,
    minWidth: '100%',
  },
  button: { flex: 1, minWidth: 92, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  buttonOn: { backgroundColor: DS.primary },
  label: { fontSize: font.body, fontWeight: font.medium, color: DS.text },
  labelOn: { fontWeight: font.semibold, color: '#FFFFFF' },
});
