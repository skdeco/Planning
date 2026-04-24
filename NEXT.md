# Prochaine session — Phase 2

## État actuel — fin session du 2026-04-25

Phase 2 en cours. 8 commits poussés à origin/main :
- 2.0 ✅ Dead code direction (-254 L)
- 2.1 ✅ AlertesChantiersRetard extrait (+ rattrapage Git 9d1011b)
- 2.2 ✅ AdminPlanningModeSwitcher extrait
- 2.3 ✅ Dead code ModalSaisiePointage (-184 L)
- 2.4 ✅ ModalRetardPlanifie extrait (-155 L, dead code editRetardId)
- 2.5 ✅ MonthViewGrid extrait (-107 L)
- 2.6 ✅ ModalPlansChantier extrait (-119 L, useLanguage interne)
- 2.7 🟡 WIP — fichier ModalNotesChantier.tsx créé (1038 L)
       mais pas encore branché. Vérifications structurelles
       en cours : NoteCard inline vs extrait, audit styles
       orphelins, application Option A (7 violations DS).

## Métriques actuelles

- planning.tsx : 5648 → 4774 lignes (-874, -15.5%)
- useState : 73 → 53 (-20)
- Composants extraits : 5 fichiers (1986 lignes au total)

## Reprise 2.7 (à faire)

1. Relire ModalNotesChantier.tsx (1038 L) au calme
2. Décider : NoteCard interne ou extrait dans NoteCard.tsx ?
3. Audit des 54 styles : combien sont vraiment utilisés ?
4. Appliquer Option A (7 violations DS, X_BTN_SIZE orphelin,
   radius.lg → font.lg)
5. 2.7.b.2 : branchement dans planning.tsx (5 useMemo+callbacks
   à ajouter, JSX modale à remplacer)
6. Commit + push + test visuel

## Étapes restantes Phase 2

- 2.7 (en cours)
- 2.8 EmployeeBadge (préparatoire WeekGrid)
- 2.9 Hook usePlanningWeekData
- 2.10 Fix Gantt + extraire GanttTimelineAdmin
- 2.11 WeekGridView + WeekGridCell (boss principal)
- 2.12 ModalAjoutEmployesST
- 2.13 Hook useCellAffectationManager
- 2.14 ModalNotes (boss notes journalières, 370 L)
- 2.15 Hook useNotesModalLogic
- 2.16 Cleanup final (styles + types + DS compliance)

## Bugs pré-existants documentés (REFACTOR_NOTES.md)

- Retards planifiés : pas de notif + invisibles côté admin (2.4)
- handlePickPlanFile web-only sur mobile (2.6)
- handlePickNotePhotos web-only sur mobile (à ajouter en 2.7
  quand on commit définitivement)
- handleDeleteNotePlanning hardcode strings FR (à ajouter en 2.7)
- Gantt admin web : colonne CHANTIER pas figée (commit 7cb9565)

## Règles d'or à RAPPELER en début de session

- Une étape = une intention (pas de fix bonus)
- Audit honnête avant décision d'API
- Dry-run des Edits avant exécution
- Commit + push IMMÉDIAT après validation compteurs
- Test visuel APRÈS le push
- Si fatigue ressentie : STOP, commit WIP, push
