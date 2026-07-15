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

const finalConfig = withShareExtension(nativeWindConfig, {
  isCSSEnabled: true,
});

// Fix `pdf-lib` (build ESM `pdf-lib/es/...`) qui tire un shim
// `tslib/modules/index.js` cassé sous Metro : `const { __extends } = tslib.default`
// où `tslib.default` est `undefined` → crash au chargement du module (SSR ET client).
// On force toute résolution de `tslib` vers son build CJS (interop named-exports OK).
const tslibCjs = require.resolve("tslib/tslib.js");
const upstreamResolveRequest = finalConfig.resolver.resolveRequest;
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib") {
    return { type: "sourceFile", filePath: tslibCjs };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = finalConfig;
