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
