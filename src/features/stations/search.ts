import type { SQLiteDatabase } from 'expo-sqlite';
import { createGeoapifyClient, normalizeGeoapify } from './geoapify.ts';
import { createIndiaFuelPumps, indiaFuelPumpsBrands } from './indiaFuelPumps.ts';
import { fetchArea, fresh, nearby, normalize, searchArea, type Point, type Radius, type Station } from './provider.ts';

type Provider = {
  cachePrefix: string;
  normalize: (data: unknown) => Station[];
  currentCache?: (data: unknown) => boolean;
  fetch: (area: string, radius: Radius, refresh: boolean) => Promise<{ data: unknown; source: string; limited?: boolean }>;
};

const geoapify: Provider = {
  cachePrefix: 'geoapify/',
  normalize: normalizeGeoapify,
  currentCache: data => typeof data === 'object' && data !== null && 'outletFootprints' in data,
  fetch: createGeoapifyClient(process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY),
};

const overpass: Provider = { cachePrefix: '', normalize, fetch: fetchArea };
const indiaFuelPumps = createIndiaFuelPumps(indiaFuelPumpsBrands(true));

export async function searchWithProvider(db: SQLiteDatabase, origin: Point, radius: Radius, provider: Provider, refresh = false) {
  const area = searchArea(origin);
  const key = provider.cachePrefix + area + '/' + radius;
  const row = await db.getFirstAsync<{payload:string; fetched:string}>(
    'SELECT payload, fetched FROM station_search_cache WHERE area_radius=?', key);
  let cached;
  let current = true;
  if (row) {
    try {
      const payload = JSON.parse(row.payload);
      const hasProvider = typeof payload?.source === 'string' && 'data' in payload;
      const source = hasProvider ? payload.source : 'OpenStreetMap';
      const data = hasProvider ? payload.data : payload;
      current = provider.currentCache?.(data) ?? true;
      cached = {
        stations: nearby(provider.normalize(data), origin, radius),
        fetched: row.fetched,
        source,
        limited: hasProvider && payload.limited === true,
      };
    } catch { /* An invalid cache entry can be replaced by a successful search. */ }
  }
  if (cached && current && fresh(cached.fetched) && !refresh) return {...cached, status:'Saved results'};
  let response;
  try {
    response = await provider.fetch(area, radius, refresh);
  } catch (error) {
    if (cached) return {...cached, status:'Offline or stale cached results · Refresh unavailable'};
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

async function searchMappedStations(db: SQLiteDatabase, origin: Point, radius: Radius, refresh: boolean) {
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

type Search = (db: SQLiteDatabase, origin: Point, radius: Radius, refresh: boolean) =>
  ReturnType<typeof searchWithProvider>;

export function createStationSearch(primary?: Search, supplementary?: Search): Search {
  return async (db, origin, radius, refresh) => {
    if (!primary) {
      if (supplementary) return supplementary(db, origin, radius, refresh);
      throw Error('Outlet discovery is unavailable in this build.');
    }
    if (!supplementary) return primary(db, origin, radius, refresh);
    return searchCombined(db, origin, radius, refresh, primary, supplementary);
  };
}

async function searchCombined(db: SQLiteDatabase, origin: Point, radius: Radius, refresh: boolean,
  primary: Search, supplementary: Search) {
  const [catalogue, mapped] = await Promise.allSettled([
    primary(db, origin, radius, refresh),
    supplementary(db, origin, radius, refresh),
  ]);
  if (catalogue.status === 'rejected' || !catalogue.value.stations.length) {
    if (mapped.status === 'fulfilled') {
      if (catalogue.status === 'fulfilled') return mapped.value;
      return { ...mapped.value, status: mapped.value.status + ' · Outlet observations unavailable' };
    }
    if (catalogue.status === 'rejected') throw catalogue.reason;
    throw mapped.reason;
  }
  if (mapped.status === 'rejected') return catalogue.value;
  const catalogueStatus = catalogue.value.status.split(' · ')[0];
  const mappedStatus = mapped.value.status.split(' · ')[0];
  return {
    ...catalogue.value, limited: mapped.value.limited || catalogue.value.limited,
    source: catalogue.value.source + ' + ' + mapped.value.source,
    status: catalogueStatus === mappedStatus ? catalogueStatus : catalogueStatus + ' · Map: ' + mappedStatus,
    stations: nearby([...catalogue.value.stations, ...mapped.value.stations], origin, radius),
  };
}

const hasGeoapify = !!process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY?.trim();
const hasOverpass = process.env.EXPO_PUBLIC_ENABLE_OVERPASS_FALLBACK === 'true';
const supplementary = hasGeoapify ? searchMappedStations : hasOverpass
  ? (db: SQLiteDatabase, origin: Point, radius: Radius, refresh: boolean) => {
    if (radius > 10) throw Error('Supplementary station search supports up to 10 km.');
    return searchWithProvider(db, origin, radius, overpass, refresh);
  } : undefined;
const searchRelease = createStationSearch(undefined, supplementary);
const searchAcademic = createStationSearch((db, origin, radius, refresh) =>
  searchWithProvider(db, origin, radius, indiaFuelPumps, refresh), supplementary);

export function searchForProfile(profile: unknown) {
  return profile === 'academic-testing' ? searchAcademic : searchRelease;
}
