// 让 .html 也能作为资源打进包里（Live2D 看板娘那份自包含 html）
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('html')) {
  config.resolver.assetExts.push('html');
}
module.exports = config;