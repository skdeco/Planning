# CLAUDE.md — Règles strictes du projet SK DECO Planning

## Design System

- Source unique de vérité : `constants/design.ts`
- **INTERDIT** : styles inline avec des couleurs en dur (`#2C2C2C`, `#F5EDE3`, etc.)
- **INTERDIT** : `StyleSheet.create` avec des valeurs magiques
- **OBLIGATOIRE** : importer depuis `constants/design.ts` pour couleurs, ombres, rayons, espacements
- Styling via NativeWind (classes Tailwind) en priorité, `StyleSheet` seulement si nécessaire

## Architecture des écrans

- Aucun fichier écran ne doit dépasser 400 lignes
- Séparer logique métier (hooks custom) et UI (composants présentationnels)
- Extraire les patterns répétés dans `components/ui/` (badges, cards, filtres)
- Un écran = un conteneur léger qui orchestre des sous-composants

## Librairies à privilégier

- **Icônes** : `lucide-react-native` (remplacer progressivement `@expo/vector-icons`)
- **Animations** : `Moti` (basé sur Reanimated déjà installé)
- **Haptics** : `expo-haptics` sur chaque interaction importante
- **Toasts** : `sonner-native`

## Règles de travail

- TypeScript strict, pas de `any`
- **TOUJOURS** demander avant d'installer une dépendance
- **TOUJOURS** montrer le plan avant de modifier plus de 2 fichiers
- Pour les gros refactors : procéder par petites PR (un composant à la fois)
- Ne jamais casser la logique métier existante lors d'un refactor visuel
