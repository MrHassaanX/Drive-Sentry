const { readFileSync, realpathSync } = require('node:fs');
const { dirname } = require('node:path');
const upstream = require(require.resolve('@expo/metro-config/babel-transformer', {
  paths: [dirname(require.resolve('expo/package.json'))],
}));

const leaflet = realpathSync(require.resolve('leaflet/dist/leaflet.js'));

exports.transform = (args) => {
  if (/[\\/]leaflet\.js$/.test(args.filename) && realpathSync(args.filename) === leaflet) {
    // Leaflet executes inside the WebView document, where DOM APIs are available.
    const assets = {
      script: args.src,
      css: readFileSync(require.resolve('leaflet/dist/leaflet.css'), 'utf8'),
    };
    return upstream.transform({ ...args, src: 'module.exports = ' + JSON.stringify(assets) + ';' });
  }
  return upstream.transform(args);
};
