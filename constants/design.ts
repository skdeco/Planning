import { Platform } from 'react-native';

/**
 * Système de design SK DECO — Refonte sept. 2026 : sable & bordeaux.
 * Fond sable #FAF5EF, cartes blanches très arrondies, accent unique bordeaux #5C1F2E,
 * titres en Fraunces. Les anciens noms de tokens sont conservés (valeurs mises à jour).
 */

// ── Couleurs principales ────────────────────────────────────────────────────
export const DS = {
  // Palette principale
  primary: '#5C1F2E',          // noir doux (boutons, onglets actifs)
  primaryLight: '#74303F',     // noir léger (hover)
  primarySoft: '#F2E4E1',      // beige clair (fond bouton secondaire)
  accent: '#5C1F2E',           // or doux (badges, prix, liens, touches premium)
  accentLight: '#74303F',      // or clair

  // Fond & surfaces
  background: '#FAF5EF',       // beige chaud (fond principal)
  surface: '#FFFFFF',          // blanc (cartes)
  surfaceHover: '#FAF5EF',     // blanc cassé
  surfaceAlt: '#FAF5EF',       // fond secondaire neutre (listes, alternance)
  surfaceInfo: '#F2E4E1',      // fond bleuté léger (sélection, sections info)

  // Textes
  text: '#2B1D14',             // noir profond
  textStrong: '#2B1D14',       // noir fort (titres principaux, valeurs importantes)
  textSecondary: '#6E5F54',    // taupe (sous-titres)
  textAlt: '#6E5F54',          // gris moyen (labels, metadata, placeholders)
  textMuted: '#9A8C80',        // taupe clair
  textDisabled: '#B5A99E',     // gris clair (désactivé, placeholder inactif)
  textInverse: '#FFFFFF',      // blanc sur fond sombre

  // Bordures
  border: '#EDE2D6',           // beige moyen (cartes, modales)
  borderLight: '#F1E7DC',      // beige clair
  borderAlt: '#EDE2D6',        // gris neutre (grilles, tableaux, séparateurs)
  divider: '#EDE2D6',          // beige diviseur

  // Accents sémantiques
  success: '#10B981',
  successSoft: '#D1FAE5',
  warning: '#E5A840',
  warningSoft: '#FEF3C7',
  error: '#E74C3C',            // rouge unifié (#D94F4F et #E74C3C → un seul token)
  errorSoft: '#FEE2E2',
  info: '#6B8EBF',
  infoSoft: '#E0EAF5',

  // Header
  headerStart: '#5C1F2E',
  headerEnd: '#74303F',

  // ────── PALETTE V10 (refonte mai 2026, additive) ──────
  // Coexiste avec la palette beige/noir actuelle pour migration progressive.
  // À utiliser dans les nouveaux composants UI et écrans refondus.
  // Cf. memory/design-system-sk-deco-planning.md
  soft:      '#F2E4E1',   // fond des pastilles, icônes et pistes de progression
  segment:   '#F1E7DC',   // piste des sélecteurs à segments
  bordeaux:  '#5C1F2E',   // accent principal v10 (CTA, FAB, statut actif, icônes gestion)
  marron:    '#5C1F2E',   // accent secondaire v10 (statut attente, sous-titres, icônes terrain)
  sombre:    '#2B1D14',   // texte principal v10 + bordures épaisses
  cremeFond: '#FAF5EF',   // fond app v10
  cremeNude: '#F2E4E1',   // fond icônes bordeaux + search bar + filter chips
  nudeMoyen: '#F2E4E1',   // fond icônes marron
  // Pour blanc → utiliser DS.surface (existant)
  // Pour taupe → utiliser DS.textSecondary (existant, #8C8077, équivalent)
  // Pour bordures → utiliser DS.border (existant, #E8DDD0, équivalent)
};

// ── Overlays ────────────────────────────────────────────────────────────────
export const overlay = {
  light:  'rgba(0,0,0,0.30)',      // fonds légèrement assombris
  medium: 'rgba(0,0,0,0.50)',      // modales standard
  dark:   'rgba(0,0,0,0.65)',      // modales importantes, drawers
  white:  'rgba(255,255,255,0.85)',// surcharge claire sur fond sombre
} as const;

// ── Z-index ─────────────────────────────────────────────────────────────────
export const zIndex = {
  base:     1,
  raised:   2,
  sticky:   10,
  dropdown: 50,
  modal:    100,
  toast:    200,
} as const;

// ── Durées d'animation (Moti / Reanimated) ──────────────────────────────────
export const duration = {
  fast:   150,
  normal: 250,
  slow:   400,
  xslow:  600,
} as const;

// ── Ombres ──────────────────────────────────────────────────────────────────
export const shadows = {
  sm: Platform.select({
    ios:     { shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    android: { elevation: 1 },
    default: { shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  }),
  md: Platform.select({
    ios:     { shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20 },
    android: { elevation: 3 },
    default: { shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20 },
  }),
  lg: Platform.select({
    ios:     { shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16 },
    android: { elevation: 6 },
    default: { shadowColor: '#2B1D14', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16 },
  }),
} as const;

// ── Rayons de bordure ───────────────────────────────────────────────────────
export const radius = { xs: 6, sm: 10, md: 16, lg: 20, xl: 24, xxl: 28, full: 999 } as const;

// ── Espacements ─────────────────────────────────────────────────────────────
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

// ── Typographie ─────────────────────────────────────────────────────────────
export const font = {
  // Tailles existantes — INCHANGÉES
  xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 26, xxxl: 32,

  // Tailles intermédiaires (additif uniquement)
  // Lot 9 — lisibilité : +1px sur les plus petites tailles (les plus dures à lire)
  tiny:    10,   // micro-labels (numéros, dates dans grilles)
  compact: 12,   // badges, onglets, labels compacts
  body:    14,   // corps de texte médium
  subhead: 15,   // sous-titres de section
  title:   18,   // titres de modales

  // Graisses — INCHANGÉES
  normal:   '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  heavy:    '800' as const,

  // Police de titre (chargée dans app/_layout.tsx). Repli sur la police système tant qu'elle n'est pas prête.
  display:  'Fraunces_600SemiBold',
};

/** Style des grands titres d'écran. */
export const screenTitle = { fontFamily: 'Fraunces_600SemiBold', fontSize: 32, lineHeight: 38, letterSpacing: -0.5, color: '#2B1D14' } as const;

// ── Hauteurs de ligne ───────────────────────────────────────────────────────
export const lineHeight = {
  tight:  1.2,
  normal: 1.4,
  loose:  1.6,
} as const;

// ── Styles prédéfinis ───────────────────────────────────────────────────────
export const cardStyle = { backgroundColor: DS.surface, borderRadius: radius.xl, padding: space.lg, ...shadows.md } as const;
export const buttonPrimary = { backgroundColor: DS.primary, borderRadius: radius.xl, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: 'center' as const } as const;
export const buttonSecondary = { backgroundColor: DS.primarySoft, borderRadius: radius.xl, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: 'center' as const } as const;
export const inputStyle = { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text } as const;
