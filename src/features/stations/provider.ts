export type Point = { latitude: number; longitude: number };
export type Radius = 3 | 5 | 10;
export type Station = Point & {
  id: string;
  name: string;
  brand: string;
  hours: string;
  address: string;
  fuels: string;
  source: string;
};
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

export function normalize(data: unknown): Station[] {
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

export function nearby(stations: Station[], origin: Point, radius: Radius) {
  return stations.map(s => ({ ...s, km: distance(origin,s) })).filter(s => s.km <= radius).sort((a,b) => a.km-b.km);
}

export function searchArea(point: Point) {
  return [point.latitude.toFixed(2),point.longitude.toFixed(2)].join(',');
}

type Endpoint = { name: string; url: string };
const defaultEndpoints: Endpoint[] = [
  { name: 'FOSSGIS Overpass', url: 'https://overpass-api.de/api/interpreter' },
  { name: 'Private.coffee Overpass', url: 'https://overpass.private.coffee/api/interpreter' },
];

function retryDelay(header: string | null) {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  return Math.max(0, Date.parse(header) - Date.now()) || 0;
}

export function createOverpassClient(endpoints: readonly Endpoint[] = defaultEndpoints) {
  const cooldown = new Map<string, { until: number; reason: string }>();
  let pending = false;
  let nextSearch = 0;

  return async (area: string, radius: Radius) => {
    if (pending || Date.now() < nextSearch) throw new Error('Please wait a moment before refreshing stations.');
    pending = true;
    nextSearch = Date.now() + 4000;
    const failures: string[] = [];
    // Rounding both coordinates shifts the centre by at most 0.79 km.
    const query = `[out:json][timeout:12];nwr["amenity"="fuel"](around:${radius * 1000 + 800},${area});out center;`;
    try {
      for (const provider of endpoints) {
        const previous = cooldown.get(provider.url);
        if (previous && Date.now() < previous.until) {
          failures.push(previous.reason + ' (cooldown)');
          continue;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 18000);
        let delay = 30000;
        let reason = 'network connection failed';
        try {
          const response = await fetch(provider.url, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'DriveSentry/1.0 (github.com/MrHassaanX/Drive-Sentry)',
            },
          });
          if (!response.ok) {
            const status = response.status;
            reason = status === 429 ? 'rate limited (HTTP 429)'
              : status === 406 || status === 403 ? 'request rejected (HTTP ' + status + ')'
              : 'HTTP ' + status;
            delay = Math.max(status === 429 || status === 406 || status === 403 ? 60000 : delay,
              retryDelay(response.headers.get('Retry-After')));
          } else {
            reason = 'invalid or incomplete response';
            const data: unknown = await response.json();
            normalize(data);
            cooldown.delete(provider.url);
            return { data, source: provider.name };
          }
        } catch {
          if (controller.signal.aborted) reason = 'request timed out';
        } finally {
          clearTimeout(timer);
        }
        const failure = provider.name + ': ' + reason;
        cooldown.set(provider.url, { until: Date.now() + delay, reason: failure });
        failures.push(failure);
      }
      throw new Error('Station search unavailable. ' + failures.join(' · '));
    } finally {
      pending = false;
    }
  };
}

const configuredUrl = process.env.EXPO_PUBLIC_OVERPASS_URL;
export const fetchArea = createOverpassClient(configuredUrl
  ? [{ name: 'Configured Overpass', url: configuredUrl }]
  : undefined);
