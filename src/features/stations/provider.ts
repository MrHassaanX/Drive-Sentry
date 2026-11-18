export type Point = { latitude: number; longitude: number };
export type Radius = 3 | 5 | 10;
export const mysuru = { latitude: 12.3052, longitude: 76.6552 };
export const fresh = (timestamp: string, now = Date.now()) => {
  const age = now - Date.parse(timestamp);
  return age >= 0 && age < 24 * 3600000;
};

export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) *
    Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalize(data: unknown) {
  if (!record(data) || !Array.isArray(data.elements) || data.remark) {
    throw new Error('The station provider returned incomplete data. Please retry later.');
  }
  const stations = [];
  const seen = new Set<string>();
  for (const item of data.elements) {
    if (!record(item) || !['node','way','relation'].includes(String(item.type)) ||
        !Number.isSafeInteger(item.id) || !record(item.tags) || item.tags.amenity !== 'fuel') continue;
    const coords = item.type === 'node' ? item : item.center;
    if (!record(coords)) continue;
    const { lat, lon } = coords;
    if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
        typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon) > 180) continue;
    const id = item.type + '/' + item.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = item.tags;
    const tag = (key: string) => typeof tags[key] === 'string' ? tags[key].trim() : '';
    stations.push({ id, latitude: lat, longitude: lon, name: tag('name') || 'Unnamed fuel station',
      brand: tag('brand'), hours: tag('opening_hours'), source: 'OpenStreetMap',
      address: tag('addr:full') || ['addr:housenumber','addr:street','addr:suburb','addr:city','addr:postcode'].map(tag).filter(Boolean).join(', '),
      fuels: Object.keys(tags).filter(k => k.startsWith('fuel:') && tag(k) === 'yes').map(k => k.slice(5).replace(/_/g,' ')).join(', ') });
  }
  if (data.elements.length && !stations.length) throw new Error('No usable station coordinates in the response.');
  return stations;
}

export function nearby(stations: ReturnType<typeof normalize>, origin: Point, radius: Radius) {
  return stations.map(s => ({ ...s, km: distance(origin,s) })).filter(s => s.km <= radius).sort((a,b) => a.km-b.km);
}

export function searchArea(point: Point) {
  return [point.latitude.toFixed(2),point.longitude.toFixed(2)].join(',');
}

let nextRequest = 0;
let pending = false;
const endpoint = process.env.EXPO_PUBLIC_OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

export async function fetchArea(area: string, radius: Radius) {
  if (pending || Date.now() < nextRequest) throw new Error('Please wait a moment before refreshing stations.');
  pending = true;
  nextRequest = Date.now() + 4000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    // Rounding both coordinates shifts the centre by at most 0.79 km.
    const query = `[out:json][timeout:18];nwr["amenity"="fuel"](around:${radius*1000+800},${area});out center;`;
    const response = await fetch(endpoint + '?data=' + encodeURIComponent(query), {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'DriveSentry/1.0 (github.com/MrHassaanX/Drive-Sentry)' },
    });
    if (response.status === 429 || response.status === 406) {
      nextRequest = Date.now() + 60000;
      throw new Error('The station provider is limiting requests (HTTP ' + response.status + '). Retry in one minute.');
    }
    if (!response.ok) throw new Error('Station provider unavailable (HTTP '+response.status+').');
    const data: unknown = await response.json();
    normalize(data);
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The station search timed out. Please retry.');
    throw error;
  } finally {
    pending = false;
    clearTimeout(timeout);
  }
}
