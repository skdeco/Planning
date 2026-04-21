import React from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { DS, font, radius, space } from '../../constants/design';
import {
  ChantierCardHeader,
  type StatutChantier,
} from './ChantierCardHeader';

// ─── Types auxiliaires ────────────────────────────────────────────────────────

/**
 * Informations pratiques affichées sous l'en-tête dans la vue dashboard.
 *
 * Type LOCAL au composant (pas d'import de `Chantier.fiche`). L'appelant
 * passe `ficheInfo={c.fiche}` si la structure matche (typage structurel),
 * sinon il compose un objet ciblé.
 *
 * - Clé `undefined` ou chaîne vide → ligne masquée.
 * - Section entière masquée si aucun champ n'a de valeur.
 */
export interface ChantierFicheInfo {
  /** Code d'accès au bâtiment / portail. */
  codeAcces?: string;
  /** Emplacement de la clé (ex: "sous le paillasson"). */
  emplacementCle?: string;
  /** Code d'alarme. */
  codeAlarme?: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * Props du composant `ChantierDashboardCard`.
 *
 * Carte compacte pour le dashboard employé — met en avant les informations
 * pratiques (codes d'accès, clés) et propose 2 actions contextuelles :
 * ouvrir la galerie photos et naviguer vers l'adresse.
 */
export interface ChantierDashboardCardProps {
  // ── Header (transférés à ChantierCardHeader) ──
  /** Nom du chantier. */
  nom: string;
  /** Couleur d'identification — matérialisée en bordure gauche de la carte. */
  couleur: string;
  /** Adresse déjà composée par l'appelant. Masquée si vide. */
  adresse?: string;
  /** Statut optionnel — affiché en badge à droite du nom si fourni. */
  statut?: StatutChantier;

  // ── Spécifique dashboard ──
  /** Infos pratiques (codes d'accès, clé, alarme). Masquée si aucun champ renseigné. */
  ficheInfo?: ChantierFicheInfo;
  /** Nombre de photos — si fourni, affiché en suffixe du bouton Photos. */
  photosCount?: number;

  // ── Interactions ──
  /** Tap sur la carte entière. Si absent, la carte est non-interactive. */
  onPress?: () => void;
  /** Tap sur le bouton Photos. Le bouton n'est rendu que si ce callback est fourni. */
  onPhotosPress?: () => void;
  /** Tap sur le bouton Naviguer. Le bouton n'est rendu que si ce callback est fourni. */
  onNavigatePress?: () => void;

  style?: StyleProp<ViewStyle>;
}

// ─── Records statiques (emojis + méta) ────────────────────────────────────────

/**
 * Méta visuelle par clé de `ChantierFicheInfo`. Centralise emoji + label.
 * Migration future (Phase 4 — lucide icons) : ne toucher que ce record.
 */
const FICHE_META: Record<
  keyof ChantierFicheInfo,
  { emoji: string; label: string }
> = {
  codeAcces:      { emoji: '🔑', label: 'Code accès' },
  emplacementCle: { emoji: '🗝', label: 'Clé' },
  codeAlarme:     { emoji: '🔔', label: 'Alarme' },
};

/** Ordre d'affichage fixe des lignes d'infos pratiques. */
const FICHE_ORDER: Array<keyof ChantierFicheInfo> = [
  'codeAcces',
  'emplacementCle',
  'codeAlarme',
];

/**
 * Méta visuelle des boutons d'action. Centralise emoji + label.
 * Migration future (Phase 4 — lucide icons) : ne toucher que ce record.
 */
const BUTTON_META: Record<
  'photos' | 'navigate',
  { emoji: string; label: string }
> = {
  photos:   { emoji: '📸', label: 'Photos' },
  navigate: { emoji: '📍', label: 'Naviguer' },
};

// ─── Constantes internes ──────────────────────────────────────────────────────

// Valeur fine non couverte par les tokens du design system
const CARD_BORDER_LEFT_WIDTH = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Teste si au moins un champ de `fi` a une valeur non vide. */
function hasAnyFicheValue(fi: ChantierFicheInfo): boolean {
  return FICHE_ORDER.some(k => {
    const v = fi[k];
    return v !== undefined && v.length > 0;
  });
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Carte chantier compacte pour le dashboard employé — en-tête + infos
 * pratiques (codes, clés) + boutons d'action (photos, naviguer).
 *
 * La bordure gauche colorée est portée par la carte elle-même (pas par le
 * header), pour traverser toute la hauteur.
 *
 * @example Usage complet
 * ```tsx
 * <ChantierDashboardCard
 *   nom={chantier.nom}
 *   couleur={chantier.couleur}
 *   adresse={chantier.adresse}
 *   statut={chantier.statut}
 *   ficheInfo={chantier.fiche}
 *   photosCount={photos.length}
 *   onPress={() => router.push('/(tabs)/planning')}
 *   onPhotosPress={() => openGalerie(chantier.id)}
 *   onNavigatePress={() => openMaps(chantier.adresse)}
 * />
 * ```
 */
export function ChantierDashboardCard({
  nom,
  couleur,
  adresse,
  statut,
  ficheInfo,
  photosCount,
  onPress,
  onPhotosPress,
  onNavigatePress,
  style,
}: ChantierDashboardCardProps): React.ReactElement {
  const isInteractive = onPress !== undefined;
  const hasFiche      = ficheInfo !== undefined && hasAnyFicheValue(ficheInfo);
  const hasPhotosBtn  = onPhotosPress !== undefined;
  const hasNavBtn     = onNavigatePress !== undefined;
  const hasActions    = hasPhotosBtn || hasNavBtn;

  const photosLabel = photosCount !== undefined
    ? `${BUTTON_META.photos.emoji} ${BUTTON_META.photos.label} (${photosCount})`
    : `${BUTTON_META.photos.emoji} ${BUTTON_META.photos.label}`;
  const navLabel = `${BUTTON_META.navigate.emoji} ${BUTTON_META.navigate.label}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      accessibilityRole={isInteractive ? 'button' : undefined}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: couleur },
        pressed && isInteractive && styles.cardPressed,
        style,
      ]}
    >
      <ChantierCardHeader nom={nom} adresse={adresse} statut={statut} />

      {hasFiche && (
        <View style={styles.ficheSection}>
          {FICHE_ORDER.map(key => {
            const value = ficheInfo?.[key];
            if (value === undefined || value.length === 0) return null;
            const meta = FICHE_META[key];
            return (
              <Text
                key={`fiche-${key}`}
                style={styles.ficheLine}
                accessibilityLabel={`${meta.label}: ${value}`}
              >
                {`${meta.emoji} ${meta.label} : ${value}`}
              </Text>
            );
          })}
        </View>
      )}

      {hasActions && (
        <View style={styles.actionsRow}>
          {hasPhotosBtn && (
            <Pressable
              onPress={onPhotosPress}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={
                photosCount !== undefined
                  ? `${BUTTON_META.photos.label}, ${photosCount}`
                  : BUTTON_META.photos.label
              }
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && styles.actionBtnPressed,
              ]}
            >
              <Text style={styles.actionBtnText}>{photosLabel}</Text>
            </Pressable>
          )}

          {hasNavBtn && (
            <Pressable
              onPress={onNavigatePress}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={BUTTON_META.navigate.label}
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && styles.actionBtnPressed,
              ]}
            >
              <Text style={styles.actionBtnText}>{navLabel}</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: DS.surface,
    borderRadius:    radius.md,            // 12
    borderWidth:     1,
    borderColor:     DS.border,
    borderLeftWidth: CARD_BORDER_LEFT_WIDTH, // 4
    padding:         space.md,             // 12
  },

  cardPressed: {
    opacity: 0.85,
  },

  ficheSection: {
    marginTop: space.sm, // 8
    gap:       space.xs, // 4
  },

  ficheLine: {
    fontSize:   font.body,   // 13
    fontWeight: font.normal, // '400'
    color:      DS.text,
  },

  actionsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    columnGap:     space.sm, // 8
    rowGap:        space.xs, // 4
    marginTop:     space.md, // 12
  },

  actionBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   DS.surfaceAlt,
    paddingHorizontal: space.md,   // 12
    paddingVertical:   space.sm,   // 8
    borderRadius:      radius.sm,  // 8
  },

  actionBtnPressed: {
    opacity: 0.7,
  },

  actionBtnText: {
    fontSize:   font.compact,   // 11
    fontWeight: font.semibold,  // '600'
    color:      DS.text,
  },
});
