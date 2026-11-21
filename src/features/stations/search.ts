import type { SQLiteDatabase } from 'expo-sqlite';
import { createGeoapifyClient, normalizeGeoapify } from './geoapify.ts';
import { fetchArea, fresh, nearby, normalize, searchArea, type Point, type Radius, type Station } from './provider.ts';

type Provider = {
  cachePrefix: string;
  normalize: (data: unknown) => Station[];
  fetch: (area: string, radius: Radius) => Promise<{ data: unknown; source: string; limited?: boolean }>;
};

const geoapify: Provider = {
  cachePrefix: 'geoapify/',
  normalize: normalizeGeoapify,
  fetch: createGeoapifyClient(process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY),
};

const overpass: Provider = { cachePrefix: '', normalize, fetch: fetchArea };

export async function searchWithProvider(db: SQLiteDatabase, origin: Point, radius: Radius, provider: Provider, refresh = false) {
  const area = searchArea(origin);
  const key = provider.cachePrefix + area + '/' + radius;
  const row = await db.getFirstAsync<{payload:string; fetched:string}>(
    'SELECT payload, fetched FROM station_search_cache WHERE area_radius=?', key);
  let cached;
  if (row) {
    try {
      const payload = JSON.parse(row.payload);
      const hasProvider = typeof payload?.source === 'string' && 'data' in payload;
      const source = hasProvider ? payload.source : 'OpenStreetMap';
      const data = hasProvider ? payload.data : payload;
      cached = {
        stations: nearby(provider.normalize(data), origin, radius),
        fetched: row.fetched,
        source,
        limited: hasProvider && payload.limited === true,
      };
    } catch { /* An invalid cache entry can be replaced by a successful search. */ }
  }
  if (cached && fresh(cached.fetched) && !refresh) return {...cached, status:'Saved results'};
  let response;
  try {
    response = await provider.fetch(area, radius);
  } catch (error) {
    if (cached) return {...cached, status:'Offline or stale cached results · '+(error instanceof Error ? error.message : 'Refresh unavailable')};
    throw error;
  }
  const fetched = new Date().toISOString();
  await db.runAsync(
    'INSERT OR REPLACE INTO station_search_cache(area_radius, payload, fetched) VALUES (?, ?, ?)',
    key, JSON.stringify(response), fetched,
  );
  await db.execAsync(`
    DELETE FROM station_search_cache WHERE area_radius IN (
      SELECT area_radius FROM station_search_cache ORDER BY fetched DESC LIMIT -1 OFFSET 20
    )
  `);
  return {
    stations: nearby(provider.normalize(response.data), origin, radius),
    fetched,
    source: response.source,
    limited: response.limited === true,
    status: 'Updated results',
  };
}

export async function searchStations(db: SQLiteDatabase, origin: Point, radius: Radius, refresh = false) {
  try {
    return await searchWithProvider(db, origin, radius, geoapify, refresh);
  } catch (error) {
    if (radius > 10 || process.env.EXPO_PUBLIC_ENABLE_OVERPASS_FALLBACK !== 'true') throw error;
    try {
      const result = await searchWithProvider(db, origin, radius, overpass, refresh);
      return { ...result, status: 'OpenStreetMap fallback · ' + result.status };
    } catch (fallbackError) {
      const primaryMessage = error instanceof Error ? error.message : 'Geoapify unavailable.';
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'OpenStreetMap fallback unavailable.';
      throw new Error(primaryMessage + ' ' + fallbackMessage);
    }
  }
}
