export const MAP_ORIGIN = 'https://github.com/MrHassaanX/Drive-Sentry';
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function leafletDocument(assets: { css: string; script: string }, dark: boolean,
  clusterAssets?: { css: string; script: string }, reduceMotion = false, mode: 'stations' | 'trip' = 'stations') {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://tile.openstreetmap.org data:">
<style>${assets.css}${clusterAssets?.css ?? ''}
html,body,#map{height:100%;margin:0} #map{background:${dark ? '#192832' : '#e9eee9'}}
.leaflet-tile-pane{filter:${dark ? 'invert(0.88) hue-rotate(175deg) saturate(0.67) brightness(0.90)' : 'none'}}
.pin{display:grid;place-items:center;box-sizing:border-box;height:100%;width:100%;padding:0;border:2px solid white;border-radius:50%;color:white;font:700 12px system-ui;background:#087968;box-shadow:0 2px 5px #0005}
.cluster{box-shadow:0 0 0 2px #08796880}.gps{background:#2466c7}
.selected{box-shadow:0 0 0 3px #172b3e,0 2px 6px #0007}
.leaflet-control-attribution{max-width:96%;background:#fffffff0!important}
</style></head>
<body><div id="map" role="region" aria-label="${mode === 'trip' ? 'Trip route map' : 'Fuel station map'}"></div>
<script>${assets.script.replace(/<\/script/gi, '<\\/script')}</script>
<script>${clusterAssets?.script.replace(/<\/script/gi, '<\\/script') ?? ''}</script>
<script>
const send = (type, data) => window.ReactNativeWebView.postMessage(JSON.stringify({type, data}));
const map = L.map('map', { minZoom: 2, maxZoom: 19, zoomControl: false, preferCanvas: true });
map.attributionControl.setPrefix(false);
L.control.zoom({ position: 'topright' }).addTo(map);
const stationLayer = L.markerClusterGroup({
  maxClusterRadius: zoom => zoom >= 17 ? 38 : 52,
  spiderfyOnMaxZoom: true, spiderfyDistanceMultiplier: 1.35,
  showCoverageOnHover: false, chunkedLoading: true, chunkInterval: 25, chunkDelay: 16,
  animate: ${!reduceMotion},
  iconCreateFunction(cluster) {
    const node = document.createElement('button');
    node.className = 'pin cluster';
    node.textContent = String(cluster.getChildCount());
    node.setAttribute('aria-label', node.textContent + ' stations, expand cluster');
    return L.divIcon({html: node, className: '', iconSize: [36, 36]});
  }
}).addTo(map);
const originLayer = L.layerGroup().addTo(map);
const coverageLayer = L.layerGroup().addTo(map);
const selectionLayer = L.layerGroup().addTo(map);
const individual = new Map();
let selectedId;
let floatedId;
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
  if (event.target.closest('.leaflet-control-attribution a')) { event.preventDefault(); send('attribution'); }
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
  });
  if (activate) {
    button.addEventListener('click', event => { L.DomEvent.stopPropagation(event); activate(); });
    pin.on('click', activate);
  }
  return { pin, button };
}
window.showOutlets = function(state) {
  stationLayer.clearLayers();
  originLayer.clearLayers();
  selectionLayer.clearLayers();
  individual.clear();
  selectedId = undefined;
  floatedId = undefined;
  if (ring) map.removeLayer(ring);
  ring = state.overview ? undefined : L.circle([state.center.latitude, state.center.longitude], {
    radius: state.radius * 1000, weight: 1.5, color: '#14937d', fillOpacity: 0.08, interactive: false
  }).addTo(map);
  if (state.locationLabel) marker(state.center, state.locationLabel, '●', '', 'gps', 22).pin.addTo(originLayer);
  if (state.accuracy > 0 && state.locationLabel) L.circle([state.center.latitude,state.center.longitude], {
    radius: state.accuracy, weight: 1, color: '#2466c7', interactive: false
  }).addTo(originLayer);
  const pins = state.markers.map(item => {
    const entry = marker(item.station, item.title, item.symbol, item.color, '', 29,
      () => send('select', item.station.id));
    individual.set(item.station.id, entry);
    return entry.pin;
  });
  stationLayer.addLayers(pins);
};
window.showCoverage = function(cells) {
  coverageLayer.clearLayers();
  for (const cell of cells) {
    L.rectangle([[cell.latitude - 2, cell.longitude - 2], [cell.latitude + 2, cell.longitude + 2]], {
      stroke: false, fillColor: '#047c5f', fillOpacity: Math.min(0.72, 0.13 + cell.count / 6500),
      interactive: false
    }).addTo(coverageLayer);
  }
};
window.selectOutlet = function(id) {
  const old = individual.get(selectedId);
  old?.button.classList.remove('selected');
  old?.pin.setZIndexOffset(0);
  if (floatedId && floatedId !== id) {
    const previous = individual.get(floatedId);
    selectionLayer.removeLayer(previous.pin);
    stationLayer.addLayer(previous.pin);
    floatedId = undefined;
  }
  selectedId = id;
  const item = individual.get(id);
  if (!item) return;
  item.button.classList.add('selected');
  item.pin.setZIndexOffset(1000);
  map.invalidateSize({ animate: false, debounceMoveend: true });
  const cluster = stationLayer.getVisibleParent(item.pin);
  if (floatedId !== id && cluster !== item.pin) {
    if (cluster && cluster.getChildCount() <= 8) cluster.spiderfy();
    else {
      // Keep large clusters intact when selecting from List. Their badge
      // counts the remaining members while this marker stands on its own.
      stationLayer.removeLayer(item.pin);
      selectionLayer.addLayer(item.pin);
      floatedId = id;
    }
  }
  keepSelectionVisible();
};
function keepSelectionVisible() {
  const item = individual.get(selectedId);
  if (item) map.panInside(item.pin.getLatLng(), {
    paddingTopLeft: [35, 45], paddingBottomRight: [35, 80], animate: false
  });
}
window.showIndia = function() {
  map.fitBounds([[6.5, 67], [37.5, 98]], {padding: [14, 14], animate: false});
};
const mapContainer = document.getElementById('map');
new ResizeObserver(() => {
  if (!mapContainer.clientWidth || !mapContainer.clientHeight) return;
  map.invalidateSize({ animate: false, debounceMoveend: true });
  keepSelectionVisible();
}).observe(mapContainer);
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
${mode === 'trip' ? `
const tripLayer = L.layerGroup().addTo(map);
let routePoints = [];
let tripWaypoints = [];
const toLeaflet = point => [point.latitude, point.longitude];
window.showTrip = function(data) {
  tripLayer.clearLayers();
  routePoints = data.geometry;
  tripWaypoints = data.waypoints;
  if (routePoints.length) {
    const line = routePoints.map(toLeaflet);
    L.polyline(line, {color:'#163e55', weight:9, opacity:0.82, interactive:false}).addTo(tripLayer);
    L.polyline(line, {color:'#40d7a8', weight:5, opacity:1, interactive:false}).addTo(tripLayer);
  }
  for (const point of tripWaypoints) {
    marker(point, point.label, point.symbol, point.symbol === 'F' ? '#98611b' : '#2263aa', '', 30).pin.addTo(tripLayer);
  }
};
window.showTripStations = function(items) {
  window.showOutlets({overview:true, markers:items.map(point => ({
    station: point, symbol:point.symbol, title:point.label, color:'#087968'
  }))});
};
window.fitTrip = function() {
  const fit = [...routePoints, ...tripWaypoints];
  if (fit.length) map.fitBounds(fit.map(toLeaflet), {padding:[32,32], maxZoom:14, animate:false});
  else window.showIndia();
};
window.centerTrip = function() {
  if (tripWaypoints.length) map.setView(toLeaflet(tripWaypoints[0]), 13, {animate:false});
};
map.on('click', event => {
  const point = event.latlng.wrap();
  send('tripPoint', {latitude:point.lat, longitude:point.lng});
});
` : ''}
send('ready');
</script></body></html>`;
}
