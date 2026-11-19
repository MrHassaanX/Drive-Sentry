import type { SQLiteDatabase } from 'expo-sqlite';
import { isFreshCache, METRO_CITIES, PRICE_FUELS, type PriceResult } from './model.ts';
import { fetchMetroPrices, PriceRateLimitError } from './provider.ts';
import { readMetroPrices, savePriceBatch } from './repository.ts';

export function createPriceService(fetchPrices = fetchMetroPrices) {
  const pending = new WeakMap<SQLiteDatabase, Promise<PriceResult>>();
  let cooldownUntil = 0;
  let lastFailure = '';

  return async function loadPrices(database: SQLiteDatabase, force = false): Promise<PriceResult> {
    const cached = await readMetroPrices(database);
    const fresh = cached.length === METRO_CITIES.length * PRICE_FUELS.length &&
      cached.every(price => isFreshCache(price.retrievedAt));
    if (!force && fresh) return { prices: cached, status: 'saved' };

    const active = pending.get(database);
    if (active) return active;
    if (Date.now() < cooldownUntil) {
      if (cached.length) return { prices: cached, status: 'stale', notice: lastFailure };
      throw new Error(lastFailure);
    }

    const flight = (async (): Promise<PriceResult> => {
      let incoming;
      try {
        incoming = await fetchPrices();
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : 'Unable to load metro prices.';
        cooldownUntil = error instanceof PriceRateLimitError ? error.retryAt : Date.now() + 30000;
        if (cached.length) return { prices: cached, status: 'stale', notice: lastFailure };
        throw new Error(lastFailure);
      }
      if (cached.some(price => price.effectiveDate > incoming[0].effectiveDate ||
          (price.effectiveDate === incoming[0].effectiveDate && price.sourcePostedDate > incoming[0].sourcePostedDate))) {
        return { prices: cached, status: 'stale', notice: 'The provider returned an older table. Keeping the latest saved prices.' };
      }
      try {
        await savePriceBatch(database, incoming);
        return { prices: incoming, status: 'live' };
      } catch {
        return { prices: incoming, status: 'live', notice: 'Prices could not be saved for offline use.' };
      }
    })();
    pending.set(database, flight);
    try {
      return await flight;
    } finally {
      pending.delete(database);
    }
  };
}

export const loadPrices = createPriceService();
