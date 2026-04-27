const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { withShareExtension } = require("expo-share-extension/metro");

const config = getDefaultConfig(__dirname);

// Wrap par couches : NativeWind d'abord (CSS-in-RN pour l'app
// principale), puis ShareExtension par-dessus (bundle séparé pour
// l'extension iOS via index.share.js).
const nativeWindConfig = withNativeWind(config, {
  input: "./global.css",
  // Only force write CSS to file system in development mode
  // In production (Vercel), the cache directory may not be writable
  forceWriteFileSystem: process.env.NODE_ENV !== 'production',
});

module.exports = withShareExtension(nativeWindConfig, {
  isCSSEnabled: true,
});
