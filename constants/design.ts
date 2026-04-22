import { Platform } from 'react-native';

/**
 * Système de design SK DECO — Palette Beige & Noir élégante.
 * Fidèle au logo SK DECO (fond beige, typographie noire, touche dorée).
 */

// ── Couleurs principales ────────────────────────────────────────────────────
export const DS = {
  // Palette principale
  primary: '#2C2C2C',          // noir doux (boutons, onglets actifs)
  primaryLight: '#3D3D3D',     // noir léger (hover)
  primarySoft: '#F0E8DE',      // beige clair (fond bouton secondaire)
  accent: '#C9A96E',           // or doux (badges, prix, liens, touches premium)
  accentLight: '#D4B87A',      // or clair

  // Fond & surfaces
  background: '#F5EDE3',       // beige chaud (fond principal)
  surface: '#FFFFFF',          // blanc (cartes)
  surfaceHover: '#FBF8F4',     // blanc cassé
  surfaceAlt: '#F8F9FA',       // fond secondaire neutre (listes, alternance)
  surfaceInfo: '#EEF2F8',      // fond bleuté léger (sélection, sections info)

  // Textes
  text: '#1A1A1A',             // noir profond
  textStrong: '#11181C',       // noir fort (titres principaux, valeurs importantes)
  textSecondary: '#8C8077',    // taupe (sous-titres)
  textAlt: '#687076',          // gris moyen (labels, metadata, placeholders)
  textMuted: '#B0A89E',        // taupe clair
  textDisabled: '#B0BEC5',     // gris clair (désactivé, placeholder inactif)
  textInverse: '#FFFFFF',      // blanc sur fond sombre

  // Bordures
  border: '#E8DDD0',           // beige moyen (cartes, modales)
  borderLight: '#F0E8DE',      // beige clair
  borderAlt: '#E2E6EA',        // gris neutre (grilles, tableaux, séparateurs)
  divider: '#EDE5DA',          // beige diviseur

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
  headerStart: '#2C2C2C',
  headerEnd: '#3D3D3D',
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
    ios:     { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    android: { elevation: 1 },
    default: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  }),
  md: Platform.select({
    ios:     { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
    android: { elevation: 3 },
    default: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  }),
  lg: Platform.select({
    ios:     { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16 },
    android: { elevation: 6 },
    default: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16 },
  }),
} as const;

// ── Rayons de bordure ───────────────────────────────────────────────────────
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 999 } as const;

// ── Espacements ─────────────────────────────────────────────────────────────
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

// ── Typographie ─────────────────────────────────────────────────────────────
export const font = {
  // Tailles existantes — INCHANGÉES
  xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 26, xxxl: 32,

  // Tailles intermédiaires manquantes (additif uniquement)
  tiny:    9,    // micro-labels (numéros, dates dans grilles)
  compact: 11,   // badges, onglets, labels compacts
  body:    13,   // corps de texte médium
  subhead: 15,   // sous-titres de section
  title:   18,   // titres de modales

  // Graisses — INCHANGÉES
  normal:   '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  heavy:    '800' as const,
};

// ── Hauteurs de ligne ───────────────────────────────────────────────────────
export const lineHeight = {
  tight:  1.2,
  normal: 1.4,
  loose:  1.6,
} as const;

// ── Styles prédéfinis ───────────────────────────────────────────────────────
export const cardStyle = { backgroundColor: DS.surface, borderRadius: radius.md, padding: space.lg, ...shadows.md } as const;
export const buttonPrimary = { backgroundColor: DS.primary, borderRadius: radius.xl, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: 'center' as const } as const;
export const buttonSecondary = { backgroundColor: DS.primarySoft, borderRadius: radius.xl, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: 'center' as const } as const;
export const inputStyle = { backgroundColor: '#FBF8F4', borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text } as const;
