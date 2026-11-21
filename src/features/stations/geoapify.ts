import { distance, fresh, type Radius, type Station } from './provider.ts';
import { sourceText } from './displayName.ts';
import { footprintCandidates } from './identity.ts';

const ENDPOINT = 'https://api.geoapify.com/v2/places';
const DETAILS_ENDPOINT = 'https://api.geoapify.com/v2/place-details';
const PAGE_SIZE = 100;
const MAX_PAGES = 2;
const MAX_DETAILS = 2;
const MAX_SAVED_FOOTPRINTS = 24;
const osmTypes: Record<string, string> = { n: 'node', w: 'way', r: 'relation', node: 'node', way: 'way', relation: 'relation' };

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function label(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function osmReference(raw: Record<string, unknown>) {
  const type = label(raw.osm_type).toLowerCase();
  const id = String(raw.osm_id ?? '');
  return Object.hasOwn(osmTypes, type) && /^[1-9]\d*$/.test(id) ? osmTypes[type] + '/' + id : undefined;
}

function polygon(value: unknown): number[][][] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 16) return;
  for (const ring of value) {
    if (!Array.isArray(ring) || ring.length < 4 || ring.length > 256 || ring.some(p =>
      !Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' ||
      !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return;
    const [first, last] = [ring[0], ring.at(-1)];
    if (first[0] !== last[0] || first[1] !== last[1]) return;
  }
  return value;
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
  const footprints = object(object(data)?.outletFootprints);
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
    const brand = sourceText(props.brand) || sourceText(raw.brand);
    const operator = sourceText(props.operator) || sourceText(raw.operator);
    const road = sourceText(props.street) || sourceText(raw['addr:street']);
    const locality = sourceText(props.suburb) || sourceText(props.district) || sourceText(raw['addr:suburb']) ||
      sourceText(props.city) || sourceText(raw['addr:city']);
    const alternateName = sourceText(props.alt_name) || sourceText(raw.alt_name);
    const fuelTags = [...new Set([...Object.keys(raw), ...Object.keys(props)])]
      .filter(key => key.startsWith('fuel:') && (props[key] ?? raw[key]) === 'yes');
    const fuels = fuelTags.map(key => key.slice(5).replaceAll('_', ' ')).join(', ');
    const osmRef = osmReference(raw);
    const footprint = osmRef ? polygon(footprints?.[osmRef]) : undefined;
    stations.set(id, {
      id, latitude, longitude, brand, fuels, fuelTags, ...(osmRef ? { osmRef } : {}),
      ...(operator ? { operator } : {}), ...(road ? { road } : {}), ...(locality ? { locality } : {}),
      ...(alternateName ? { alternateName } : {}), ...(footprint ? { footprint } : {}),
      name: sourceText(props.name) || sourceText(raw.name),
      address: sourceText(props.formatted) || [sourceText(props.address_line1), sourceText(props.address_line2)].filter(Boolean).join(', '),
      hours: label(props.opening_hours) || label(raw.opening_hours),
      source: 'Geoapify',
    });
  }

  if (features.length && !stations.size) throw new Error('Geoapify returned no usable station coordinates.');
  return [...stations.values()];
}

function footprintFromDetails(data: unknown, expected: string) {
  for (const item of featuresFrom(data)) {
    const feature = object(item);
    const props = object(feature?.properties);
    const raw = object(object(props?.datasource)?.raw);
    const geometry = object(feature?.geometry);
    if (raw && osmReference(raw) === expected && geometry?.type === 'Polygon') {
      return polygon(geometry.coordinates);
    }
  }
}

export function createGeoapifyClient(apiKey: string | undefined) {
  const key = apiKey?.trim();
  let retryAt = 0;
  let detailsRetryAt = 0;
  const known = new Map<string, { rings: number[][][]; checked: string }>();
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
      const data = { type: 'FeatureCollection', features, outletFootprints: {} as Record<string, number[][][]> };
      const candidates = footprintCandidates(normalizeGeoapify(data), distance);
      const outstanding = candidates.filter(way => {
        const cached = known.get(way.osmRef!);
        if (!cached || !fresh(cached.checked)) return true;
        data.outletFootprints[way.osmRef!] = cached.rings;
        return false;
      });
      if (Date.now() >= detailsRetryAt && !controller.signal.aborted) {
        await Promise.all(outstanding.slice(0, MAX_DETAILS).map(async way => {
          const expected = way.osmRef!;
          const params = new URLSearchParams({ id: way.id.slice('geoapify/'.length), features: 'details.full_geometry', apiKey: key });
          try {
            const response = await fetch(DETAILS_ENDPOINT + '?' + params, { signal: controller.signal });
            if ([401, 403, 429].includes(response.status)) {
              const header = response.headers.get('Retry-After');
              const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header ?? '') - Date.now();
              detailsRetryAt = Date.now() + Math.max(3600000, delay || 0);
            }
            if (!response.ok) return;
            const rings = footprintFromDetails(await response.json(), expected);
            if (!rings) return;
            data.outletFootprints[expected] = rings;
            known.delete(expected);
            known.set(expected, { rings, checked: new Date().toISOString() });
            if (known.size > MAX_SAVED_FOOTPRINTS) known.delete(known.keys().next().value!);
          } catch {
            // Without verified geometry, the records stay separate.
          }
        }));
      }
      return { data, source: 'Geoapify', limited };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Geoapify Places timed out. Try again.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}
