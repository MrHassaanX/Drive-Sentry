export const MAP_ORIGIN = 'https://github.com/MrHassaanX/Drive-Sentry';
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function leafletDocument(assets: { css: string; script: string }, dark: boolean) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://tile.openstreetmap.org data:">
<style>${assets.css}
html,body,#map{height:100%;margin:0} #map{background:${dark ? '#192832' : '#e9eee9'}}
.leaflet-tile-pane{filter:${dark ? 'invert(0.88) hue-rotate(175deg) saturate(0.67) brightness(0.90)' : 'none'}}
.pin{display:grid;place-items:center;box-sizing:border-box;height:100%;width:100%;padding:0;border:2px solid white;border-radius:50%;color:white;font:700 12px system-ui;background:#087968;box-shadow:0 2px 5px #0005}
.cluster{box-shadow:0 0 0 2px #08796880}.gps{background:#2466c7}
.selected{box-shadow:0 0 0 3px #172b3e,0 2px 6px #0007}
.leaflet-control-attribution{max-width:96%;background:#fffffff0!important}
</style></head>
<body><div id="map" role="region" aria-label="Fuel station map"></div>
<script>${assets.script.replace(/<\/script/gi, '<\\/script')}</script>
<script>
const send = (type, data) => window.ReactNativeWebView.postMessage(JSON.stringify({type, data}));
const map = L.map('map', { minZoom: 2, maxZoom: 19, zoomControl: false, preferCanvas: true });
map.attributionControl.setPrefix(false);
const stationLayer = L.layerGroup().addTo(map);
let ring;
let tilesReady = false;
let tileIssue = false;
const tiles = L.tileLayer(${JSON.stringify(TILE_URL)}, {
  maxZoom: 19, updateWhenIdle: true, keepBuffer: 1,
  attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>'
}).addTo(map);
tiles.on('tileload', () => {
  if (!tilesReady || tileIssue) send('tiles', true);
  tilesReady = true;
  tileIssue = false;
});
tiles.on('tileerror', () => {
  if (!tilesReady && !tileIssue) send('tiles', false);
  tileIssue = true;
});
document.addEventListener('click', event => {
  if (event.target.closest('a')) { event.preventDefault(); send('attribution'); }
});
map.on('moveend', () => {
  const point = map.getCenter();
  const bounds = map.getBounds();
  send('region', { latitude: point.lat, longitude: point.lng,
    latitudeDelta: bounds.getNorth() - bounds.getSouth(), longitudeDelta: bounds.getEast() - bounds.getWest() });
});
function marker(point, label, text, fill, className, size, activate) {
  const button = document.createElement(activate ? 'button' : 'span');
  button.className = 'pin ' + className;
  button.textContent = text;
  button.setAttribute('aria-label', label);
  if (fill) button.style.background = fill;
  const pin = L.marker([point.latitude, point.longitude], {
    icon: L.divIcon({ html: button, className: '', iconSize: [size, size] }),
    interactive: !!activate, keyboard: !!activate, alt: label
  }).addTo(stationLayer);
  if (activate) {
    button.addEventListener('click', event => { L.DomEvent.stopPropagation(event); activate(); });
    pin.on('click', activate);
  }
}
window.showOutlets = function(state) {
  stationLayer.clearLayers();
  if (ring) map.removeLayer(ring);
  ring = L.circle([state.center.latitude, state.center.longitude], {
    radius: state.radius * 1000, weight: 1.5, color: '#14937d', fillOpacity: 0.08, interactive: false
  }).addTo(map);
  if (state.locationLabel) marker(state.center, state.locationLabel, '●', '', 'gps', 22);
  state.markers.forEach(item => {
    if (item.count) {
      marker(item.center, item.count + ' stations, zoom in', String(item.count), '', 'cluster', 30,
        () => map.setView([item.center.latitude, item.center.longitude], Math.min(19, map.getZoom() + 2)));
    } else {
      marker(item.station, item.title, item.symbol, item.color, item.selected ? 'selected' : '', item.selected ? 34 : 27,
        () => send('select', item.station.id));
    }
  });
};
window.focusOutlets = function(point, delta) {
  map.invalidateSize({ pan: false });
  map.fitBounds([[point.latitude - delta, point.longitude - delta], [point.latitude + delta, point.longitude + delta]], {
    animate: false, padding: [10, 10], maxZoom: 18
  });
};
window.fitOutlets = function(points) {
  map.fitBounds(points.map(point => [point.latitude, point.longitude]), {
    paddingTopLeft: [30, 30], paddingBottomRight: [30, 65], maxZoom: 16
  });
};
send('ready');
</script></body></html>`;
}
