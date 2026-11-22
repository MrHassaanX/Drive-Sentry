import type { SQLiteDatabase } from 'expo-sqlite';

type Row = { id: number; name: string; area: string; lat: number; lon: number };
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export async function findIndianPlaces(db: Pick<SQLiteDatabase, 'getAllAsync'>, text: string) {
  const [query, ...qualifiers] = text.split(',').map(normalize).filter(Boolean);
  if (!query || query.length < 2 || text.length > 160) return [];
  const clauses = qualifiers.map(() => 'AND lower(a.label) LIKE ?').join(' ');
  const rows = await db.getAllAsync<Row>(`
    SELECT p.id, p.name, a.label AS area, p.lat, p.lon
    FROM lookup k JOIN place p ON k.id = p.id JOIN area a ON p.area = a.id
    WHERE k.key >= ? AND k.key < ? ${clauses}
    GROUP BY p.id
    ORDER BY MAX(k.key = ?) DESC, lower(p.name) = ? DESC, p.rank DESC, p.name
    LIMIT 30
  `, query, query + '\u{10ffff}', ...qualifiers.map(part => '%' + part + '%'), query, query);
  const seen = new Set<string>();
  return rows.flatMap(row => {
    const label = [row.name, row.area].filter(Boolean).join(', ');
    const key = normalize(label) + '/' + Math.round(row.lat / 250) + '/' + Math.round(row.lon / 250);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: 'geonames/' + row.id, label, latitude: row.lat / 1e5, longitude: row.lon / 1e5,
      source: 'GeoNames' as const }];
  }).slice(0, 12);
}
