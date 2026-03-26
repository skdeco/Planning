# SK DECO Planning — Design Mobile

## Concept général

Application de gestion de planning pour une entreprise de décoration/construction (SK DECO). Interface sobre, professionnelle, inspirée des apps iOS natives. Fond clair (#F2F4F7), cartes blanches avec ombre légère, accents bleu marine (#1A3A6B) et couleurs métiers vives.

---

## Palette de couleurs

| Rôle | Couleur | Usage |
|------|---------|-------|
| Primary | `#1A3A6B` (bleu marine) | Boutons principaux, onglet actif, en-têtes |
| Background | `#F2F4F7` (gris très clair) | Fond général des écrans |
| Surface | `#FFFFFF` | Cartes, cellules, modales |
| Foreground | `#11181C` | Texte principal |
| Muted | `#687076` | Texte secondaire, sous-titres |
| Border | `#E2E6EA` | Séparateurs, bordures de cartes |
| Today highlight | `#1A3A6B` | Colonne du jour actuel (fond bleu) |

### Couleurs métiers

| Métier | Couleur badge |
|--------|--------------|
| Électricien | `#FFB800` (orange-jaune) |
| Plombier | `#0088FF` (bleu vif) |
| Maçon | `#888888` (gris) |
| Peintre | `#9B59B6` (violet) |
| Menuisier | `#A0522D` (marron) |
| Plaquiste | `#FF6B35` (orange) |
| Carreleur | `#27AE60` (vert) |
| Chef de chantier | `#E74C3C` (rouge) |
| Autre | `#AAAAAA` (gris clair) |

---

## Liste des écrans

### 1. Écran de connexion (Login)
- Logo SK DECO centré en haut
- Sélecteur de rôle : **Administrateur** / **Employé**
- Si Employé : liste déroulante pour choisir son nom parmi les employés
- Bouton "Se connecter" bleu marine
- Pas de mot de passe (accès simplifié local)

### 2. Planning (onglet 1 — tous les rôles)
- En-tête : "SK DECO" + "Planning", navigation semaine (← Auj. →), icône poubelle
- Bande de dates : semaine courante (Lun–Dim), jour actuel surligné en bleu
- Compteur de chantiers visibles en haut à droite
- Grille : colonne gauche fixe (noms des chantiers avec point couleur), colonnes jours
- Cellules : badges colorés des employés (prénom tronqué), bouton "+" pour Admin
- Légende des métiers en bas de page
- **Employé** : vue en lecture seule, affiche uniquement ses propres affectations

### 3. Chantiers (onglet 2 — Admin uniquement)
- En-tête "Chantiers" + bouton "+ Nouveau"
- Liste de cartes : nom, badge statut (Actif/En attente/Terminé), adresse, dates, badges employés
- Bordure gauche colorée (couleur du chantier)
- Actions : voir (œil), éditer (crayon), supprimer (poubelle rouge)
- Modal d'ajout/édition : nom, adresse, dates, statut, couleur, employés assignés

### 4. Équipe (onglet 3 — Admin uniquement)
- En-tête "Équipe" + bouton "+ Ajouter"
- Filtre horizontal des métiers (scrollable)
- Liste de cartes : avatar initiale colorée, nom complet, badge métier, nb chantiers en cours
- Actions : éditer (crayon), supprimer (poubelle rouge)
- Modal d'ajout/édition : prénom, nom, métier, rôle (admin/employé)

---

## Flux utilisateur principaux

### Flux Admin — Créer un chantier et affecter des employés
1. Onglet Chantiers → bouton "+ Nouveau"
2. Remplir le formulaire (nom, adresse, dates, statut, couleur)
3. Sélectionner les employés dans la liste
4. Valider → chantier apparaît dans la liste et dans le planning
5. Sur le planning, appuyer "+" dans une cellule pour ajuster les affectations par jour

### Flux Admin — Gérer l'équipe
1. Onglet Équipe → bouton "+ Ajouter"
2. Renseigner prénom, nom, métier
3. Valider → employé disponible pour affectation

### Flux Employé — Consulter son planning
1. Connexion → sélectionner son nom
2. Onglet Planning uniquement visible
3. Voir ses affectations de la semaine en lecture seule

---

## Composants clés

- `PlanningGrid` : grille semaine scrollable horizontalement
- `ChantierCard` : carte avec bordure colorée et actions
- `EmployeCard` : carte avec avatar initiale
- `MetierBadge` : badge coloré selon le métier
- `WeekNavigator` : navigation ← Auj. → avec affichage de la plage de dates
- `AddEmployeeModal` : modal de sélection d'employés pour une cellule
- `ChantierFormModal` : modal de création/édition d'un chantier
- `EmployeFormModal` : modal de création/édition d'un employé
