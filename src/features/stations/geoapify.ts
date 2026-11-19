import { type Radius, type Station } from './provider.ts';

const ENDPOINT = 'https://api.geoapify.com/v2/places';
const PAGE_SIZE = 100;
const MAX_PAGES = 2;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function label(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function featuresFrom(data: unknown): unknown[] {
  const collection = object(data);
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Geoapify returned an invalid Places response.');
  }
  return collection.features;
}

export function normalizeGeoapify(data: unknown): Station[] {
  const features = featuresFrom(data);
  const stations = new Map<string, Station>();

  for (const item of features) {
    const feature = object(item);
    const props = object(feature?.properties);
    const geometry = object(feature?.geometry);
    if (feature?.type !== 'Feature' || geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates) || !props) continue;

    const [longitude, latitude] = geometry.coordinates;
    const placeId = label(props.place_id);
    if (!placeId || typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) continue;
    const id = 'geoapify/' + placeId;
    if (stations.has(id)) continue;

    const raw = object(object(props.datasource)?.raw) ?? {};
    const brand = label(props.brand) || label(raw.brand) || label(props.operator) || label(raw.operator);
    const fuels = [...new Set([...Object.keys(raw), ...Object.keys(props)])]
      .filter(key => key.startsWith('fuel:') && (props[key] ?? raw[key]) === 'yes')
      .map(key => key.slice(5).replaceAll('_', ' ')).join(', ');
    stations.set(id, {
      id, latitude, longitude, brand, fuels,
      name: label(props.name) || label(raw.name) || 'Unnamed fuel station',
      address: label(props.formatted) || [label(props.address_line1), label(props.address_line2)].filter(Boolean).join(', '),
      hours: label(props.opening_hours) || label(raw.opening_hours),
      source: 'Geoapify',
    });
  }

  if (features.length && !stations.size) throw new Error('Geoapify returned no usable station coordinates.');
  return [...stations.values()];
}

export function createGeoapifyClient(apiKey: string | undefined) {
  const key = apiKey?.trim();
  let retryAt = 0;
  return async (area: string, radius: Radius) => {
    if (!key) throw new Error('A Geoapify Places key is required to show stations.');
    if (Date.now() < retryAt) throw new Error('Geoapify is cooling down after a request limit. Try again later.');

    const [latitude, longitude] = area.split(',');
    const centre = longitude + ',' + latitude;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16000);
    const features: unknown[] = [];
    let limited = false;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          categories: 'service.vehicle.fuel',
          filter: 'circle:' + centre + ',' + (radius * 1000 + 800),
          bias: 'proximity:' + centre,
          limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE),
          apiKey: key,
        });
        let response: Response;
        try {
          response = await fetch(ENDPOINT + '?' + params.toString(), { signal: controller.signal });
        } catch {
          // Network exceptions can contain the request URL. Keep credentials out of UI and diagnostics.
          throw new Error('Geoapify could not connect. Check your network and retry.');
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('Geoapify rejected the Places key (HTTP ' + response.status + '). Check the project key and restrictions.');
        }
        if (response.status === 429) {
          const header = response.headers.get('Retry-After');
          const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header ?? '') - Date.now();
          retryAt = Date.now() + Math.max(60000, delay || 0);
          throw new Error('Geoapify request limit reached (HTTP 429). Try again later.');
        }
        if (!response.ok) throw new Error('Geoapify Places is unavailable (HTTP ' + response.status + ').');

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new Error('Geoapify returned unreadable Places data.');
        }
        const batch = featuresFrom(payload);
        features.push(...batch.slice(0, PAGE_SIZE));
        limited = batch.length >= PAGE_SIZE;
        if (!limited) break;
      }
      const data = { type: 'FeatureCollection', features };
      normalizeGeoapify(data);
      return { data, source: 'Geoapify', limited };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Geoapify Places timed out. Try again.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}
