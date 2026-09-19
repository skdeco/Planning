/** @type {const} */
const themeColors = {
  // Noir doux élégant (fidèle au logo SK DECO)
  primary: { light: '#5C1F2E', dark: '#E8DDD0' },
  // Fond beige chaud (couleur du logo SK DECO)
  background: { light: '#FAF5EF', dark: '#1A1816' },
  // Cartes blanc pur
  surface: { light: '#FFFFFF', dark: '#242220' },
  // Textes
  foreground: { light: '#2B1D14', dark: '#F5EDE3' },
  // Texte secondaire taupe
  muted: { light: '#6E5F54', dark: '#A89E94' },
  // Bordures
  border: { light: '#EDE2D6', dark: '#3D3835' },
  // Accents
  success: { light: '#10B981', dark: '#4ADE80' },
  warning: { light: '#E5A840', dark: '#FBBF24' },
  error: { light: '#D94F4F', dark: '#F87171' },
  // Tint (or doux — couleur d'accent premium)
  tint: { light: '#5C1F2E', dark: '#D4B87A' },

  // ────── PALETTE V10 (refonte mai 2026, additive) ──────
  // Synchro avec constants/design.ts. Dark mode à raffiner plus tard.
  bordeaux:   { light: '#5C1F2E', dark: '#5C1F2E' },
  marron:     { light: '#7A4F2E', dark: '#7A4F2E' },
  sombre:     { light: '#2A2622', dark: '#F5EDE3' },
  cremeFond:  { light: '#FAF5EF', dark: '#1A1816' },
  cremeNude:  { light: '#F2E4E1', dark: '#3D3835' },
  nudeMoyen:  { light: '#EADFD0', dark: '#4D4540' },
};

module.exports = { themeColors };
