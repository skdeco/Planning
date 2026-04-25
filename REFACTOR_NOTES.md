# REFACTOR_NOTES.md — Erreurs TypeScript pré-existantes

Identifiées lors du `pnpm check` de la Phase 1 (étape 1.1).
À corriger quand on touchera ces fichiers en Phase 2/3.

---

## Décisions architecturales

### 2.8 SKIP — Pas d'extraction préventive de EmployeeBadge

Audit 2.8.a (2026-04-25) a identifié que le pattern "badge employé"
n'apparaît qu'une seule fois dans planning.tsx (cellule WeekGrid,
L1827-1944). Avec 2 sous-variantes (employé vs sous-traitant) qui
divergent fortement sur les comportements (onLongPress, onRemove
conditionnels).

Décision : skip 2.8. Le badge sera factorisé naturellement en 2.11
lors de l'extraction de WeekGridCell, avec un contexte concret
d'usage. Évite la sur-ingénierie d'une API polymorphe à 8-10 props.

Pattern YAGNI cohérent avec NoteCard (2.7) : inline tant que couplage
fort, extrait quand découplage évident.

---

## 1. `app/(tabs)/planning.tsx` — ligne 3643

```
error TS7006: Parameter 'uri' implicitly has an 'any' type.
error TS7006: Parameter 'idx' implicitly has an 'any' type.
```

**À corriger en Phase 2** lors du découpage de `planning.tsx`.

---

## 2. `app/context/AppContext.tsx` — lignes 820–823

```
error TS2345: Argument of type '{}' is not assignable to parameter of type '{ id: string; }[]'.
  Type '{}' is missing the following properties from type '{ id: string; }[]': length, pop, push, concat, and 35 more.
```

4 occurrences consécutives (lignes 820, 821, 822, 823).

**À corriger en Phase 2** si AppContext est touché, sinon Phase 3.

---

## 3. `components/BilanFinancierChantier.tsx` — lignes 157, 178–181

```
error TS2339: Property 'totalSousTraitants' does not exist on type '{...}'.
error TS2339: Property 'sousTraitants' does not exist on type '{...}'.
```

5 occurrences — propriétés `sousTraitants` et `totalSousTraitants` absentes du type de retour calculé.

**À corriger en Phase 3** lors du refactor de `chantiers.tsx` / `BilanFinancierChantier`.

---

## 4. Naming du statut `actif` (UX)

Type `StatutChantier` utilise `'actif'` comme valeur principale. À évaluer en Phase 2 si `'en_cours'` serait plus intuitif pour l'UX (rename potentiel à piloter avec l'équipe métier).

---

## Bugs pré-existants détectés en Phase 2

### Retards planifiés — découverts lors de l'extraction 2.4

Bug 1 : aucune notification n'est envoyée au moment de la création
d'un retard planifié côté employé. Ni push, ni toast, ni badge admin.

Bug 2 : les retards planifiés ne sont pas visibles côté admin — pas
de section dédiée dans le planning admin, pas d'indicateur.

Statut : pré-existants (vérifiés avant l'extraction 2.4).
Localisation probable : `addRetardPlanifie` dans AppContext.tsx
+ absence de composant d'affichage admin.
À traiter : hors scope refactor structurel, à planifier en tâche
séparée "Fix retards planifiés — notif + visibilité admin".

### Plans chantier — picker web-only (découvert lors de l'extraction 2.6)

`handlePickPlanFile` dans planning.tsx (et précédemment
`handlePickPlanPlanning`) est strictement web-only :
`if (Platform.OS !== 'web') return null;`

Sur mobile (iOS/Android), le bouton "📎 Ajouter plan" dans la modale
ModalPlansChantier est silencieusement non-fonctionnel — le callback
retourne null, aucun feedback utilisateur.

Statut : pré-existant (confirmé dans le commit 8622383 du 2026-04-20).
Origine probable : migration web-first sans porter le file picker
mobile (devrait utiliser expo-document-picker + expo-image-picker).
Comportement préservé à l'identique lors de l'extraction 2.6.
À traiter : hors scope refactor structurel, à planifier en tâche
séparée "Fix picker plans chantier mobile".

### Notes chantier — picker photos web-only (découvert lors de l'extraction 2.7)

`handlePickNotePhotos` dans planning.tsx (anciennement
`handlePickNotePhotosPlanning`) est strictement web-only :
`if (Platform.OS !== 'web') return [];`

Sur mobile (iOS/Android), le bouton "📎 Ajouter photo / PDF" dans la
modale ModalNotesChantier est silencieusement non-fonctionnel — le
callback retourne `[]`, aucun feedback utilisateur.

Statut : pré-existant (même pattern que les plans chantier).
Comportement préservé à l'identique lors de l'extraction 2.7.
À traiter : hors scope refactor structurel, à regrouper avec le fix
picker plans chantier mobile.

### Notes chantier — strings FR hardcodées dans la confirmation de suppression (2.7)

`confirmDelete` dans `components/planning/ModalNotesChantier.tsx`
utilise des strings FR en dur (`'Supprimer'`, `'Supprimer cette note ?'`,
`'Annuler'`) au lieu de passer par `useLanguage()`.

Statut : pré-existant (déjà présent dans `handleDeleteNotePlanning`
de planning.tsx avant l'extraction).
Comportement préservé à l'identique lors de l'extraction 2.7.
À traiter : i18n complet de la modale en passe finale (Phase 2.16
cleanup) ou hors scope refactor structurel.

### Dette technique — Helpers de date dupliqués

`addDays`, `dateInRange` et `MOIS` (abbr 3-lettres) sont définis
inline dans 6+ fichiers du repo (planning.tsx, pointage.tsx,
reporting.tsx, rh.tsx, GaleriePhotos.tsx, GanttGlobal.tsx, et
tests). Pas de `lib/dateUtils` centralisée.

À extraire dans `lib/dateUtils.ts` dans une étape dédiée (Phase 3
ou cleanup post-Phase 2). Gain estimé : ~6 duplications éliminées,
cohérence garantie sur les calculs de date.

En attendant, le pattern Phase 2 reste : duplication locale dans
les composants/hooks extraits, cohérent avec l'existant
(ex : `hooks/usePlanningWeekData.ts` en 2.9).

### Réorganisation chantiers admin — menu invisible sur web

Découverte : étape 2.9 (test contradictoire pré-2.9 vs post-2.9).

Sur Planning vue Semaine en admin, le long press sur la cellule
"nom du chantier" (première colonne) doit afficher un menu
Alert.alert avec 4 boutons (En premier / Monter / Descendre /
En dernier) qui appellent moveChantierInPlanning().

Sur web, le menu n'apparaît PAS. La fonction
moveChantierInPlanning() est correctement implémentée et la
mutation updateChantierOrderPlanning() fonctionnerait — mais
le trigger UI ne fonctionne pas.

Cause racine probable : Alert.alert avec >2 boutons est mal
supporté par React Native Web (fallback window.confirm/prompt
limité, ou pas d'affichage). Ce pattern est connu pour ne pas
bien fonctionner sur web.

Statut : pré-existant (vérifié par test contradictoire sur
commit 09b1bd3, code de moveChantierInPlanning et showReorderMenu
identique caractère par caractère pré/post 2.9).

À traiter : remplacer Alert.alert par une modale custom React
(ActionSheet ou similaire) pour le menu de réorganisation.
Hors scope refactor structurel Phase 2. À faire en Phase 5.

### Gantt admin — colonne CHANTIER pas figée sur web (fix échoué)

Bug pré-existant déjà documenté (commit wip 7cb9565). Tentative
de fix lors de l'étape 2.10 (commit 56c58d6 'freeze chantier
column on web Gantt view') : ajout de minWidth:0 sur le container
row + sur la ScrollView horizontale.

Résultat : fix ÉCHOUÉ. Le minWidth:0 ne suffit pas pour ce layout.
La colonne CHANTIER continue de scroller avec la timeline horizontale.

Commit revert : 9ccd4ca

Hypothèses pour fix futur (Phase 5) :
1. Pattern à 2 ScrollView synchronisés :
   - ScrollView 1 horizontal pour la timeline (headers mois/jours
     + body barres)
   - ScrollView 2 vertical pour la liste des chantiers à gauche
   - Synchronisation via onScroll handlers + scrollTo
   Solution standard pour les Gantt cross-platform.

2. Position absolute custom :
   - Colonne CHANTIER en position:'absolute' left:0 zIndex:10
   - Timeline avec marginLeft = NAME_W
   Plus simple mais moins flexible (taille fixe colonne).

3. CSS sticky web-only :
   - Web : position:'sticky' + top:0 / left:0
   - Mobile : pattern différent (RN ne supporte pas sticky)
   Nécessite Platform-specific styling.

Statut : reporté en Phase 5 avec ces 3 pistes documentées.
Investigation DOM/inspector nécessaire pour identifier la cause
exacte du problème de propagation flex.

---

## Phase 3 — Composants Phase 1 non migrés (skip volontaire)

### StatusBadge — pas de site dans le scope planning

Audit 3.1 (2026-04-25) : aucun pattern dans planning.tsx + 9 composants
extraits ne correspond au cas d'usage de StatusBadge.

Les "badges" du planning sont tous spécialisés :
- `empBadge` / `stBadge` (planning.tsx) : Pressable composite avec
  ordreBadge overlay + note dot — UI cell complexe
- `ordreBadge` (planning.tsx) : cercle absolute-positionné numéroté
- `materielBadgeCount` (planning.tsx) : count overlay corner
- `modalAvatar` (ModalAjoutEmployesST) : avatar circulaire avec initiale
- `chantierDot` (MonthViewGrid) : pill avec layout grid spécifique

→ StatusBadge sera utile en Phase 3 broader scope :
  - chantiers.tsx (statut chantier : actif / terminé / en retard)
    → utilisera `statutBadgeProps()` helper exporté
  - equipe.tsx (statut employé : actif / inactif)
  - rh.tsx (statut administratif)
  - autres écrans non-planning

À traiter dans une étape Phase 3 ultérieure dédiée à ces écrans.
