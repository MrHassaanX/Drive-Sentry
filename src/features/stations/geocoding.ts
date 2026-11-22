import { validLocation } from './deviceLocation.ts';
import type { Point } from './provider.ts';

export type SearchPlace = Point & { id: string; label: string; via?: 'map' };

export function parsePlaces(payload: unknown): SearchPlace[] {
  if (!Array.isArray((payload as { results?: unknown } | null)?.results)) {
    throw new Error('Address search returned an unreadable response.');
  }
  const seen = new Set<string>();
  const found: SearchPlace[] = [];
  for (const result of (payload as { results: unknown[] }).results.slice(0, 5)) {
    if (typeof result !== 'object' || result === null) continue;
    const { lon, lat, formatted, country_code, place_id } = result as Record<string, unknown>;
    if (typeof lat !== 'number' || typeof lon !== 'number' || typeof formatted !== 'string' ||
        typeof place_id !== 'string' || !place_id.trim() || !formatted.trim() || country_code !== 'in' ||
        !validLocation({ latitude: lat, longitude: lon }) || seen.has(place_id)) continue;
    seen.add(place_id);
    found.push({ id: place_id, label: formatted.trim(), latitude: lat, longitude: lon });
  }
  return found;
}

export function createAddressSearch(apiKey: string | undefined) {
  return async (text: string, signal?: AbortSignal) => {
    const query = text.trim();
    if (query.length < 3 || query.length > 160) throw new Error('Enter a city or address of 3 to 160 characters.');
    if (!apiKey?.trim()) throw new Error('Address search needs a configured Geoapify key.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, 10000);
    const params = new URLSearchParams({ text: query, filter: 'countrycode:in', format: 'json', limit: '5', apiKey: apiKey.trim() });
    try {
      const response = await fetch('https://api.geoapify.com/v1/geocode/search?' + params, { signal: controller.signal })
        .catch(() => { throw new Error('Address search could not connect. Check your connection and retry.'); });
      if (!response.ok) throw new Error(response.status === 429
        ? 'Address search is busy. Wait a moment and retry.' : 'Address search is unavailable right now.');
      const payload: unknown = await response.json().catch(() => { throw new Error('Address search returned an unreadable response.'); });
      return parsePlaces(payload);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}

export const searchAddress = createAddressSearch(process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY);

export function createAcademicAddressSearch(endpoint = 'https://nominatim.openstreetmap.org/search') {
  const saved = new Map<string, SearchPlace[]>();
  let nextRequest = 0;
  let active = false;
  return async (text: string, signal?: AbortSignal) => {
    const query = text.trim();
    if (query.length < 3 || query.length > 160) throw Error('Enter a city or address of 3 to 160 characters.');
    const key = query.toLowerCase();
    const cached = saved.get(key);
    if (cached) return cached;
    if (active || Date.now() < nextRequest) throw Error('Address search is busy. Wait a moment and retry.');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') throw Error('Address search is unavailable.');
    url.search = new URLSearchParams({ q: query, countrycodes: 'in', format: 'jsonv2', limit: '5' }).toString();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, 10000);
    active = true;
    nextRequest = Date.now() + 1100;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'DriveSentry/3.0 (+https://github.com/MrHassaanX/Drive-Sentry)', Accept: 'application/json' },
      });
      if (response.status === 429) nextRequest = Date.now() + Math.max(60, Number(response.headers.get('Retry-After')) || 0) * 1000;
      if (!response.ok) throw Error('Address search is unavailable.');
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw Error('Address search returned an unreadable response.');
      const matches: SearchPlace[] = [];
      for (const item of rows.slice(0, 5)) {
        const { lat, lon, display_name: label, place_id: id } = item ?? {};
        if (typeof lat !== 'string' || typeof lon !== 'string' || !lat.trim() || !lon.trim() ||
            typeof label !== 'string' || !label.trim() || !Number.isSafeInteger(id)) continue;
        const point = { latitude: Number(lat), longitude: Number(lon) };
        if (validLocation(point) && !matches.some(option => option.id === String(id))) {
          matches.push({ ...point, id: String(id), label });
        }
      }
      if (saved.size >= 30) saved.delete(saved.keys().next().value!);
      saved.set(key, matches);
      return matches;
    } catch {
      throw Error('Address search is unavailable. Try again, use GPS, or pan the map.');
    } finally {
      active = false;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
