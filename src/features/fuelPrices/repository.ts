import type { SQLiteDatabase } from 'expo-sqlite';
import { METRO_PROVIDER, type CityFuelPrice } from './model.ts';

export async function readMetroPrices(database: SQLiteDatabase) {
  return database.getAllAsync<CityFuelPrice>(
    `SELECT provider, city_id AS cityId, city, state, coverage, fuel,
            paise_per_litre AS paisePerLitre, effective_date AS effectiveDate,
            source_posted_date AS sourcePostedDate, retrieved_at AS retrievedAt,
            source, source_url AS sourceUrl
       FROM fuel_price_cache WHERE provider = ? ORDER BY city_id, fuel DESC`,
    METRO_PROVIDER,
  );
}

export async function savePriceBatch(database: SQLiteDatabase, prices: CityFuelPrice[]) {
  if (!prices.length) return;
  // One SQLite statement writes all cities and both fuels atomically.
  const values = prices.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  await database.runAsync(
    `INSERT INTO fuel_price_cache (
       provider, city_id, city, state, coverage, fuel, paise_per_litre,
       effective_date, source_posted_date, retrieved_at, source, source_url
     ) VALUES ${values}
     ON CONFLICT(provider, city_id, fuel) DO UPDATE SET
       city = excluded.city, state = excluded.state, coverage = excluded.coverage,
       paise_per_litre = excluded.paise_per_litre, effective_date = excluded.effective_date,
       source_posted_date = excluded.source_posted_date, retrieved_at = excluded.retrieved_at,
       source = excluded.source, source_url = excluded.source_url
     WHERE (excluded.effective_date, excluded.source_posted_date, excluded.retrieved_at) >=
           (fuel_price_cache.effective_date, fuel_price_cache.source_posted_date, fuel_price_cache.retrieved_at)`,
    ...prices.flatMap(price => [
      price.provider, price.cityId, price.city, price.state, price.coverage, price.fuel,
      price.paisePerLitre, price.effectiveDate, price.sourcePostedDate, price.retrievedAt, price.source, price.sourceUrl,
    ]),
  );
}
