// Entry point de la Share Extension iOS (mini-UI affichée dans le
// Share Sheet quand l'utilisateur partage un fichier vers SK Deco
// depuis Mail, Photos, Files, etc.).
//
// Le bundler Metro (wrappé par withShareExtension dans metro.config.js)
// détecte ce fichier et compile un bundle distinct pour l'extension
// native iOS, avec ShareExtension comme composant racine.
//
// IMPORTANT : le premier argument de registerComponent doit être
// "shareExtension" (string littérale exigée par expo-share-extension).

import { AppRegistry } from "react-native";
import ShareExtension from "./ShareExtension";

AppRegistry.registerComponent("shareExtension", () => ShareExtension);
