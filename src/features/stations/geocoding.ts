import { validLocation } from './deviceLocation.ts';
import type { Point } from './provider.ts';

export type SearchPlace = Point & { id: string; label: string };

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
