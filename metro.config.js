const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('db');
config.transformer.babelTransformerPath = require.resolve('./metro.leaflet.js');
module.exports = config;
