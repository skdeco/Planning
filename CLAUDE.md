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

## Dette technique ouverte

### DESIGN-SYSTEM-REFONTE-001 — en cours (branche `refonte-design`, sept. 2026)
Direction retenue : **sable & bordeaux**. Fond `#FAF5EF`, cartes blanches très arrondies
(rayon 24) à ombre douce, accent unique bordeaux `#5C1F2E`, pastilles `#F2E4E1`,
texte `#2B1D14` / secondaire `#6E5F54`, titres d'écran en Fraunces (`screenTitle`),
listes groupées façon Réglages iOS, sélecteurs à segments, barre d'onglets flottante.
Fait : tokens (`constants/design.ts`), remappage des anciennes couleurs en dur, barre à
5 onglets + écran Plus (`app/(tabs)/gestion.tsx`), fiche chantier en 4 sections
(`ChantierDetailDashboard`), accueil admin allégé, vue Jour du planning (`DayListView`),
retour « ‹ Plus » (`BackToPlus`).
Fait aussi : accueil employé, titres Fraunces + cartes/boutons/segments sur tous les onglets,
modales (rayon 28, voile 0.45, titres Fraunces), emojis d'interface → `components/ui/Ico.tsx`,
dates JJ/MM/AAAA (`lib/date/format.ts`, `DateInput`), `ComboSelect`, `AlertHost` (Alert.alert sur le web).
Fait aussi : grille 7 jours, portail client, derniers emojis, thème clair imposé (`lib/theme-provider.tsx`).
Reste : remplacer les couleurs en dur par les tokens `DS.*` — prérequis d'un vrai mode sombre.

### DETTE-PV-DATAURI
Les signatures du PV V2 (`signatureEntrepriseUri`, `signatureClientUri`) sont
stockées en data URI base64 directement dans le state Supabase au lieu de
Storage (Plan D, commit `37e0de1`). Migrer vers Storage en V2 une fois Metro
dev local accessible pour debug logs serveur Supabase.

### DETTE-EXPO-FS-LEGACY-IMPORT
Incohérence imports `expo-file-system` : `genererPVPdf.ts` utilise
`/legacy` explicite, `lib/supabase.ts` utilise import implicite via `require`.
À harmoniser en V2. Non bloquant : runtime identique.
