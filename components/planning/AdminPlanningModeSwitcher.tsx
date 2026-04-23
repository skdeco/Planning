import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { DS, font, radius, space } from '../../constants/design';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Modes de planning disponibles pour un admin. */
export type PlanningMode = 'equipe' | 'direction';

/**
 * Props de `AdminPlanningModeSwitcher`.
 *
 * Composant 100 % contrôlé : il ne gère aucun state interne, le parent
 * détient la valeur courante et applique la mise à jour via `onChange`.
 */
export interface AdminPlanningModeSwitcherProps {
  /** Mode actuellement sélectionné (visuel "actif"). */
  value: PlanningMode;
  /** Appelé quand l'utilisateur tape sur un des boutons du switcher. */
  onChange: (mode: PlanningMode) => void;
}

// ─── Records statiques (emojis + labels) ──────────────────────────────────────

/**
 * Méta visuelle par mode. Centralise emoji + label pour chaque bouton.
 * Migration future (Phase 4 — lucide icons) : ne toucher que ce record.
 */
const MODE_META: Record<
  PlanningMode,
  { emoji: string; label: string }
> = {
  equipe:    { emoji: '👷', label: 'Planning Équipe' },
  direction: { emoji: '📅', label: 'Planning Direction' },
};

// ─── Constantes internes ──────────────────────────────────────────────────────

/**
 * Padding vertical du wrapper du switcher. Valeur fine (entre `space.xs=4`
 * et `space.sm=8`) pour un bandeau compact — l'action principale reste
 * visible sans alourdir la hiérarchie visuelle.
 */
const SWITCHER_WRAPPER_PV = 6;

/**
 * Gap horizontal entre les 2 boutons. Identique à `SWITCHER_WRAPPER_PV`
 * pour maintenir un rythme visuel cohérent sur le bandeau compact
 * (même respiration verticale que horizontale entre les éléments).
 */
const SWITCHER_GAP = 6;

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Sélecteur à 2 boutons pour basculer entre les modes de planning "Équipe"
 * et "Direction". Réservé à l'admin — le gating est la responsabilité du parent.
 *
 * Composant 100 % contrôlé : le parent détient `value`, reçoit `onChange`.
 *
 * @example
 * ```tsx
 * {isAdmin && (
 *   <AdminPlanningModeSwitcher
 *     value={planningMode}
 *     onChange={setPlanningMode}
 *   />
 * )}
 * ```
 */
export function AdminPlanningModeSwitcher({
  value,
  onChange,
}: AdminPlanningModeSwitcherProps): React.ReactElement {
  const isEquipeActive    = value === 'equipe';
  const isDirectionActive = value === 'direction';

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => onChange('equipe')}
        accessibilityRole="button"
        accessibilityState={{ selected: isEquipeActive }}
        style={[
          styles.button,
          { backgroundColor: isEquipeActive ? DS.primary : DS.background },
        ]}
      >
        <Text
          style={[
            styles.label,
            { color: isEquipeActive ? DS.textInverse : DS.textAlt },
          ]}
        >
          {MODE_META.equipe.emoji} {MODE_META.equipe.label}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onChange('direction')}
        accessibilityRole="button"
        accessibilityState={{ selected: isDirectionActive }}
        style={[
          styles.button,
          { backgroundColor: isDirectionActive ? DS.primary : DS.background },
        ]}
      >
        <Text
          style={[
            styles.label,
            { color: isDirectionActive ? DS.textInverse : DS.textAlt },
          ]}
        >
          {MODE_META.direction.emoji} {MODE_META.direction.label}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    flexDirection:     'row',
    backgroundColor:   DS.surface,
    borderBottomWidth: 1,
    borderBottomColor: DS.borderAlt,
    paddingHorizontal: space.md,            // 12
    paddingVertical:   SWITCHER_WRAPPER_PV, // 6
    gap:               SWITCHER_GAP,        // 6
  },

  button: {
    flex:            1,
    paddingVertical: space.sm,   // 8
    borderRadius:    radius.sm,  // 8
    alignItems:      'center',
  },

  label: {
    fontSize:   font.body, // 13
    fontWeight: font.bold, // '700'
  },
});
