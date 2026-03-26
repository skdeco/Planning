const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Only force write CSS to file system in development mode
  // In production (Vercel), the cache directory may not be writable
  forceWriteFileSystem: process.env.NODE_ENV !== 'production',
});
