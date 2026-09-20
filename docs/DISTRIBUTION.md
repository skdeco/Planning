# Distribution de SK DECO Planning

Deux voies mènent à un téléphone, et elles fonctionnent en parallèle sur le même
compte Apple et le même identifiant d'application (`bundleIdentifier`) :

1. **Lien d'installation direct** — opérationnel tout de suite, sans Apple.
2. **Publication classique sur l'App Store** — dossier à monter, revue Apple.

Rien à changer dans le code pour passer de l'une à l'autre : seul le profil de
compilation diffère (`preview` pour le lien direct, `production` pour l'App Store).

---

## 1. Lien d'installation direct

Toutes les commandes se lancent depuis le dossier du projet, dans le Terminal du Mac.

### a) Enregistrer chaque iPhone (une seule fois par appareil)

```
eas device:create
```

Choisir **Website** : la commande affiche un lien et un QR code. Chaque personne
ouvre ce lien **sur son iPhone**, installe le profil proposé, et l'appareil est
enregistré. Pour vérifier la liste : `eas device:list`.

### b) Compiler

```
eas build --platform ios --profile preview
```

Quand la commande demande de régénérer le profil de signature (« reuse / generate
new provisioning profile »), répondre **oui** : c'est ce qui intègre les appareils
fraîchement enregistrés. À la fin, elle affiche une page d'installation avec un QR
code — c'est le lien à envoyer aux gars. Ils l'ouvrent depuis Safari sur l'iPhone
et l'application s'installe.

Android, si besoin un jour :

```
eas build --platform android --profile preview
```

Le lien fournit un fichier .apk ; le téléphone demandera d'autoriser
l'installation depuis cette source.

### c) Mettre à jour ensuite

Pour toute modification qui ne touche pas la configuration native (donc 95 % des
cas) :

```
eas update --channel preview --message "ce qui change"
```

Les téléphones prennent la mise à jour à la réouverture de l'application. Une
**nouvelle compilation** n'est nécessaire que si : un appareil vient d'être ajouté,
la version change dans `app.config.ts`, ou une brique native est ajoutée.

### Limites à connaître

- 100 iPhone maximum par an sur le compte développeur.
- Le profil de signature expire **au bout de 12 mois** : il faut recompiler et
  redistribuer le lien une fois par an, sinon l'application refuse de s'ouvrir.
- Un nouveau téléphone = enregistrement + nouvelle compilation.

---

## 2. Publication classique sur l'App Store

### a) Créer la fiche

Dans App Store Connect → Mes apps → +, choisir l'identifiant d'application du
projet. Noter l'**App ID** (un nombre) affiché dans les informations générales,
puis compléter `eas.json`, section `submit.production.ios` :

- `appleId` : l'adresse e-mail du compte développeur ;
- `ascAppId` : l'App ID relevé ci-dessus ;
- `appleTeamId` : le Team ID (Membership dans le compte développeur).

### b) Compiler et envoyer

```
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

### c) Éléments à fournir dans la fiche

- **Nom** : SK DECO Planning. **Sous-titre** : par exemple « Chantiers, plannings,
  pointage ».
- **Catégorie** : Entreprise (secondaire : Productivité).
- **Captures d'écran** : iPhone 6,9 pouces obligatoires. L'application déclare
  `supportsTablet: true` dans `app.config.ts`, donc Apple réclamera **aussi** des
  captures iPad 13 pouces. Pour s'en dispenser, passer cette option à `false`
  avant la compilation de production.
- **URL de politique de confidentialité** :
  `https://sk-deco-planning.vercel.app/confidentialite.html`
- **URL d'assistance** : `https://sk-deco-planning.vercel.app/assistance.html`
- **Classification** : 4+.
- **Compte de démonstration** : obligatoire, toute l'application étant derrière une
  connexion. Créer un employé fictif avec quelques données de démonstration et
  donner identifiant + mot de passe dans les notes destinées à la revue.
- **Notes pour la revue** : expliquer que l'application est l'outil interne d'une
  entreprise de rénovation, que les comptes sont créés par l'entreprise, et que le
  compte fourni permet de tout parcourir.
- **Questionnaire confidentialité** : données collectées = identité
  professionnelle, contenu créé par l'utilisateur (photos, notes), position au
  moment du pointage ; usage = fonctionnement de l'application ; **aucun suivi
  publicitaire**, aucune donnée revendue.
- **Chiffrement** : déjà déclaré dans `app.config.ts`
  (`ITSAppUsesNonExemptEncryption: false`).

### d) Le point de vigilance

Apple refuse régulièrement, au titre de ses règles 4.2 et 3.2, les applications
strictement internes à une entreprise, au motif qu'elles n'ont pas d'intérêt pour
le grand public. Deux réponses possibles si cela arrive :

- argumenter que l'application s'adresse aussi aux clients et sous-traitants
  invités sur un chantier (le portail extérieur existe déjà) ;
- basculer sur la **distribution non répertoriée** : l'application reste hébergée
  par Apple et s'installe en un geste, mais n'apparaît pas dans la recherche et ne
  s'obtient que par un lien privé. Elle supprime la limite des 100 appareils et le
  renouvellement annuel du lien direct. Demande à faire sur
  <https://developer.apple.com/support/unlisted-app-distribution>.

---

## Pense-bête des commandes

| Besoin | Commande |
| --- | --- |
| Enregistrer un iPhone | `eas device:create` |
| Voir les appareils | `eas device:list` |
| Compiler pour le lien direct | `eas build --platform ios --profile preview` |
| Mise à jour rapide (lien direct) | `eas update --channel preview --message "…"` |
| Compiler pour l'App Store | `eas build --platform ios --profile production` |
| Envoyer à l'App Store | `eas submit --platform ios --profile production` |
| Mise à jour rapide (App Store) | `eas update --channel production --message "…"` |
| Publier le site web | `npx vercel --prod --archive=tgz` |
