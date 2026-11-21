export const CITIES = {
  mysuru: { name: 'Mysuru', state: 'Karnataka' },
  bengaluru: { name: 'Bengaluru', state: 'Karnataka' },
  delhi: { name: 'Delhi', state: 'Delhi' },
  mumbai: { name: 'Mumbai', state: 'Maharashtra' },
  chennai: { name: 'Chennai', state: 'Tamil Nadu' },
  kolkata: { name: 'Kolkata', state: 'West Bengal' },
} as const;

export type CityId = keyof typeof CITIES;
export const METRO_CITIES = ['delhi', 'mumbai', 'chennai', 'kolkata'] as const;
export type MetroCity = typeof METRO_CITIES[number];
export const PRICE_FUELS = ['petrol', 'diesel'] as const;
export type PriceFuel = typeof PRICE_FUELS[number];
export const FUEL_PRODUCT_NAMES = { petrol: 'Petrol', diesel: 'Diesel' } as const;
export const METRO_PROVIDER = 'india-petroleum-api';
export const PPAC_SOURCE = 'Petroleum Planning & Analysis Cell (PPAC), Ministry of Petroleum and Natural Gas, Government of India';
export const PPAC_TABLE = 'https://ppac.gov.in/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/rsp-of-petrol-and-diesel-in-metro-cities-since-16-6-2017';

type INRPrice = {
  productName: string;
  currency: 'INR';
  paisePerLitre: number;
  retrievedAt: string;
  source: string;
  sourceUrl: string;
};

export type OutletFuelPrice = INRPrice & {
  coverage: 'outlet-specific';
  provider: string;
  outletId: string;
  effectiveDate: string | null;
};

export type CityFuelPrice = INRPrice & {
  provider: typeof METRO_PROVIDER;
  cityId: MetroCity;
  city: string;
  state: string;
  coverage: 'metro-reference';
  fuel: PriceFuel;
  effectiveDate: string;
  sourcePostedDate: string;
};

export type PriceResult = {
  prices: CityFuelPrice[];
  status: 'live' | 'saved' | 'stale';
  notice?: string;
};

const DAY_MS = 86400000;
const IST_OFFSET_MS = 330 * 60000;
export const CACHE_TTL_MS = 6 * 60 * 60000;

export function isMetroCity(value: string): value is MetroCity {
  return METRO_CITIES.some(city => city === value);
}

export function isIndianDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function sourceAgeDays(effectiveDate: string, nowMs = Date.now()) {
  const today = new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
  return (Date.parse(today) - Date.parse(effectiveDate)) / DAY_MS;
}

export function isFreshCache(retrievedAt: string, nowMs = Date.now()) {
  const elapsed = nowMs - Date.parse(retrievedAt);
  return elapsed >= 0 && elapsed < CACHE_TTL_MS;
}

export function cityPriceStatus(price: CityFuelPrice | undefined, offlineFallback: boolean, nowMs = Date.now()) {
  if (!price) return 'unavailable';
  const age = sourceAgeDays(price.effectiveDate, nowMs);
  return offlineFallback || !Number.isFinite(age) || age < 0 || age > 2 ? 'stale' : 'city-reference';
}
