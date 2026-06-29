const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite uses a WebAssembly worker in web builds.
config.resolver.assetExts.push('wasm');

module.exports = config;
