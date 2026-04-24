# REFACTOR_NOTES.md — Erreurs TypeScript pré-existantes

Identifiées lors du `pnpm check` de la Phase 1 (étape 1.1).
À corriger quand on touchera ces fichiers en Phase 2/3.

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
