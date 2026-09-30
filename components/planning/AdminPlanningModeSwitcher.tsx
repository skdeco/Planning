import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Modal } from 'react-native';
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

// ─── Version compacte (menu déroulant) ────────────────────────────────────────

/**
 * Sélecteur compact « Travaux ▾ » : ouvre une petite liste Travaux / Menuiserie /
 * Dépannages (et Direction seulement si l'onglet Planning n'est pas dans la barre du haut).
 */
export function ChoixPlanningCompact({ value, onChange, avecDirection }: AdminPlanningModeSwitcherProps & { avecDirection: boolean }): React.ReactElement {
  const { t } = useLanguage();
  const [ouvert, setOuvert] = React.useState(false);
  const labels: Record<PlanningMode, string> = {
    travaux: t.ui.planningTravaux,
    menuiserie: t.ui.planningMenuiserie,
    depannage: t.ui.planningDepannage,
    direction: t.ui.planningDirection,
  };
  const modes = PLANNING_MODES.filter(m => avecDirection || m !== 'direction');
  return (
    <>
      <Pressable onPress={() => setOuvert(true)} accessibilityRole="button" hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.full, backgroundColor: DS.primary }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: DS.textInverse }} numberOfLines={1}>{labels[value]}</Text>
        <Text style={{ fontSize: 10, color: DS.textInverse }}>▾</Text>
      </Pressable>
      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: 32 }} onPress={() => setOuvert(false)}>
          <View style={{ backgroundColor: DS.surface, borderRadius: 16, padding: 6, width: '100%', maxWidth: 280 }}>
            {modes.map(m => (
              <Pressable key={m} onPress={() => { onChange(m); setOuvert(false); }} accessibilityRole="button" accessibilityState={{ selected: m === value }}
                style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: m === value ? DS.primarySoft : undefined }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: m === value ? '800' : '500', color: DS.text }}>{labels[m]}</Text>
                {m === value && <Text style={{ color: DS.primary, fontWeight: '900' }}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
