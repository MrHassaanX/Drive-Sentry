import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchArea, fresh, nearby, normalize, searchArea, type Point, type Radius } from './provider.ts';

export async function searchStations(db: SQLiteDatabase, origin: Point, radius: Radius, refresh = false) {
  const area = searchArea(origin);
  const key = area + '/' + radius;
  const row = await db.getFirstAsync<{payload:string; fetched:string}>(
    'SELECT payload, fetched FROM station_search_cache WHERE area_radius=?', key);
  let cached;
  if (row) {
    try {
      const payload = JSON.parse(row.payload);
      const hasProvider = typeof payload?.source === 'string' && 'data' in payload;
      const source = hasProvider ? payload.source : 'OpenStreetMap';
      const data = hasProvider ? payload.data : payload;
      cached = { stations: nearby(normalize(data), origin, radius), fetched: row.fetched, source };
    } catch { /* An invalid cache entry can be replaced by a successful search. */ }
  }
  if (cached && fresh(cached.fetched) && !refresh) return {...cached, status:'Saved results'};
  let response;
  try {
    response = await fetchArea(area, radius);
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
  return { stations: nearby(normalize(response.data), origin, radius), fetched, source: response.source, status: 'Updated from OpenStreetMap' };
}
