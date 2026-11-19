import {
  CITIES, METRO_CITIES, METRO_PROVIDER, PPAC_SOURCE, PPAC_TABLE, PRICE_FUELS,
  isIndianDate, sourceAgeDays, type CityFuelPrice,
} from './model.ts';

export const INDIA_PETROLEUM_DOCS = 'https://india-petroleum-api.vercel.app/docs';
const LATEST_URL = 'https://india-petroleum-api.vercel.app/v1/prices/latest';
const INVALID = 'The metro price provider returned an invalid or incomplete reference table.';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function toPaise(value: unknown): number {
  // JSON numbers may have floating-point representation noise; accept only two decimal digits.
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000) throw new Error(INVALID);
  const exact = value * 100;
  const paise = Math.round(exact);
  if (paise < 1 || Math.abs(exact - paise) > 1e-7) throw new Error(INVALID);
  return paise;
}

export function normalizeMetroPrices(payload: unknown, retrievedAt: string): CityFuelPrice[] {
  const envelope = record(payload);
  const data = record(envelope?.data);
  const meta = record(envelope?.meta);
  const effectiveDate = data?.date;
  const sourcePostedDate = meta?.source_posted_date;
  const receivedMs = Date.parse(retrievedAt);
  if (envelope?.success !== true || !isIndianDate(effectiveDate) ||
      !isIndianDate(sourcePostedDate) || !Number.isFinite(receivedMs) ||
      sourcePostedDate < effectiveDate || sourceAgeDays(sourcePostedDate, receivedMs) < 0) {
    throw new Error(INVALID);
  }
  return METRO_CITIES.flatMap(cityId => PRICE_FUELS.map(fuel => ({
    provider: METRO_PROVIDER,
    cityId,
    city: CITIES[cityId].name,
    state: CITIES[cityId].state,
    coverage: 'metro-reference',
    fuel,
    paisePerLitre: toPaise(record(data?.[fuel])?.[cityId]),
    effectiveDate,
    sourcePostedDate,
    retrievedAt,
    source: PPAC_SOURCE,
    sourceUrl: PPAC_TABLE,
  })));
}

export class PriceRateLimitError extends Error {
  readonly retryAt: number;

  constructor(retryAt: number) {
    super('The metro price provider has limited requests. Please try again later.');
    this.retryAt = retryAt;
  }
}

function rateLimitUntil(value: string | null, now: number) {
  const seconds = value && /^\d+$/.test(value) ? Number(value) : NaN;
  const requested = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value ?? '');
  return Math.max(now + 15 * 60000, Number.isFinite(requested) ? requested : 0);
}

export async function fetchMetroPrices(): Promise<CityFuelPrice[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(LATEST_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    }).catch(() => {
      throw new Error(controller.signal.aborted ? 'The metro price request timed out.' : 'Unable to reach the metro price provider.');
    });
    if (response.status === 429) throw new PriceRateLimitError(rateLimitUntil(response.headers.get('Retry-After'), Date.now()));
    if (!response.ok) throw new Error(`The metro price provider is unavailable (HTTP ${response.status}).`);
    const payload: unknown = await response.json().catch(() => {
      throw new Error(controller.signal.aborted ? 'The metro price request timed out.' : INVALID);
    });
    return normalizeMetroPrices(payload, new Date().toISOString());
  } finally {
    clearTimeout(timeout);
  }
}
