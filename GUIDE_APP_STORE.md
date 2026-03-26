# Guide de Publication App Store - SK DECO Planning

Ce guide vous explique comment compiler et soumettre l'application SK DECO Planning sur l'App Store Apple depuis votre Mac.

## Prérequis sur votre Mac

1. **Node.js** installé (version 18 ou supérieure)
2. **Xcode** installé (depuis le Mac App Store)
3. **CocoaPods** installé (généralement inclus avec Xcode)
4. L'archive du code source extraite dans un dossier

## Étape 1 : Préparer l'environnement local

Ouvrez l'application **Terminal** sur votre Mac et tapez les commandes suivantes une par une :

```bash
# 1. Allez dans le dossier du projet (remplacez le chemin par le vôtre)
cd chemin/vers/sk-deco-planning

# 2. Installez les dépendances du projet
npm install

# 3. Installez l'outil Expo CLI globalement
npm install -g eas-cli
```

## Étape 2 : Connexion à votre compte Expo

Pour compiler l'application, nous allons utiliser les outils Expo.

```bash
# Connectez-vous ou créez un compte Expo (gratuit)
eas login
```

## Étape 3 : Compilation pour iOS (Localement sur votre Mac)

Puisque vous avez un Mac avec Xcode, vous pouvez compiler l'application localement sans payer d'abonnement Expo :

```bash
# Lancer la compilation locale pour iOS
eas build --platform ios --local
```

Pendant ce processus, le terminal vous demandera de vous connecter à votre compte Apple Developer. 
1. Saisissez votre **Apple ID** et votre **mot de passe**.
2. Expo va automatiquement créer les certificats et profils de provisionnement nécessaires.
3. La compilation va démarrer (cela peut prendre 15 à 30 minutes selon la puissance de votre Mac).

À la fin de la compilation, un fichier `application.ipa` sera généré dans votre dossier.

## Étape 4 : Soumission à l'App Store

Une fois le fichier `.ipa` généré, vous devez l'envoyer à Apple :

```bash
# Soumettre l'application à l'App Store Connect
eas submit -p ios --latest
```

Sélectionnez le fichier `.ipa` qui vient d'être généré. L'outil va l'uploader vers les serveurs d'Apple.

## Étape 5 : TestFlight et Publication

1. Retournez sur [App Store Connect](https://appstoreconnect.apple.com)
2. Allez dans votre app **SKDECO**
3. Allez dans l'onglet **TestFlight**
4. Vous devriez voir votre build en cours de traitement (cela prend généralement 15-30 minutes).
5. Une fois traité, vous pouvez ajouter des testeurs internes (vous-même) pour tester l'app sur votre iPhone.
6. Quand vous êtes satisfait, retournez dans l'onglet **App Store**, sélectionnez le build, remplissez les captures d'écran et cliquez sur **Soumettre pour évaluation**.

Apple mettra entre 24h et 48h pour valider l'application.

## Résolution des problèmes fréquents

- **Erreur de certificat** : Si EAS n'arrive pas à gérer les certificats, allez sur le portail développeur Apple, révoquez les anciens certificats de distribution et relancez `eas build`.
- **Erreur Xcode** : Assurez-vous d'avoir ouvert Xcode au moins une fois et d'avoir accepté les conditions d'utilisation d'Apple.
