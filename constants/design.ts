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

  // Textes
  text: '#1A1A1A',             // noir profond
  textSecondary: '#8C8077',    // taupe (sous-titres)
  textMuted: '#B0A89E',        // taupe clair
  textInverse: '#FFFFFF',      // blanc sur fond sombre

  // Bordures
  border: '#E8DDD0',           // beige moyen
  borderLight: '#F0E8DE',      // beige clair
  divider: '#EDE5DA',          // beige diviseur

  // Accents sémantiques
  success: '#10B981',
  successSoft: '#D1FAE5',
  warning: '#E5A840',
  warningSoft: '#FEF3C7',
  error: '#D94F4F',
  errorSoft: '#FEE2E2',
  info: '#6B8EBF',
  infoSoft: '#E0EAF5',

  // Header
  headerStart: '#2C2C2C',
  headerEnd: '#3D3D3D',
};

// ── Ombres ──────────────────────────────────────────────────────────────────
export const shadows = {
  sm: Platform.select({
    ios: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    android: { elevation: 1 },
    default: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
    android: { elevation: 3 },
    default: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#2C2C2C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16 },
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
  xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 26, xxxl: 32,
  normal: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const, heavy: '800' as const,
};

// ── Styles prédéfinis ───────────────────────────────────────────────────────
export const cardStyle = { backgroundColor: DS.surface, borderRadius: radius.md, padding: space.lg, ...shadows.md } as const;
export const buttonPrimary = { backgroundColor: DS.primary, borderRadius: radius.xl, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: 'center' as const } as const;
export const buttonSecondary = { backgroundColor: DS.primarySoft, borderRadius: radius.xl, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: 'center' as const } as const;
export const inputStyle = { backgroundColor: '#FBF8F4', borderWidth: 1, borderColor: DS.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text } as const;
