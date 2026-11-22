import { FUEL_PRODUCT_NAMES, isIndianDate, sourceAgeDays,
  type CityFuelPrice, type OutletFuelPrice, type PersonalFuelPrice, type PriceFuel } from './model.ts';
import { corroboratedOutlet, stationReferences } from '../stations/identity.ts';
import { distance, type Station } from '../stations/provider.ts';
import { pricesForOutlet } from '../stations/indiaFuelPumps.ts';

export const priceLabels = {
  'outlet-reported': 'Outlet-reported price',
  'outlet-observation': 'Outlet price observation',
  'community-reported': 'Community-reported price',
  'metro-reference': 'City reference',
  'user-confirmed': 'User-provided price',
  unavailable: 'Outlet price unavailable',
} as const;

export function matchOutletPriceLocation(record: Station, stations: readonly Station[]) {
  const references = stationReferences(record);
  const exact = stations.filter(station => stationReferences(station).some(mapped => references.some(source =>
    (mapped.id && mapped.id === source.id && mapped.source === source.source) ||
    (mapped.omcOutlet && mapped.omcOutlet === source.omcOutlet && distance(station, record) <= 0.06) ||
    (mapped.osmRef && mapped.osmRef === source.osmRef && distance(station, record) <= 0.06))));
  if (exact.length) return exact.length === 1 ? { outletId: exact[0].id, matchConfidence: 'shared-id' as const } : null;
  const corroborated = stations.filter(station => corroboratedOutlet(station, record, distance));
  return corroborated.length === 1 ? { outletId: corroborated[0].id, matchConfidence: 'corroborated' as const } : null;
}

export function outletPriceQuotes(outletId: string, productClass: OutletFuelPrice['productClass'],
  prices: readonly (OutletFuelPrice | CityFuelPrice | PersonalFuelPrice)[], now = Date.now()) {
  const available = prices.flatMap(price => {
    if (price.coverage === 'metro-reference' || price.coverage === 'user-confirmed') return [];
    if (price.outletId !== outletId || !price.providerOutletId.trim() || price.productClass !== productClass ||
        (productClass !== 'premium' && price.fuel !== productClass) ||
        (price.matchConfidence !== 'shared-id' && price.matchConfidence !== 'corroborated') ||
        !price.provider.trim() || !price.source.trim() || !price.productName.trim() ||
        price.currency !== 'INR' || !Number.isSafeInteger(price.paisePerLitre) || price.paisePerLitre <= 0) return [];
    try {
      if (new URL(price.sourceUrl).protocol !== 'https:') return [];
    } catch { return []; }
    const retrieval = Date.parse(price.retrievedAt);
    const observation = price.observedAt === null ? retrieval : Date.parse(price.observedAt);
    const age = price.effectiveDate === null ? null : sourceAgeDays(price.effectiveDate, now);
    if (!Number.isFinite(retrieval) || !Number.isFinite(observation) || observation > retrieval || retrieval > now ||
        (price.coverage !== 'outlet-reported' && !price.observedAt) ||
        (price.effectiveDate !== null && (!isIndianDate(price.effectiveDate) || (age !== null && age < 0)))) return [];
    const elapsed = now - observation;
    const freshness = elapsed >= 3 * 86400000 || (age !== null && age > 1) ? 'stale'
      : elapsed >= 86400000 ? 'older' : 'recent';
    const currentOfficial = price.coverage === 'outlet-reported' && age === 0 && freshness === 'recent';
    return [{ price, freshness, observation, ageHours: Math.floor(elapsed / 3600000), currentOfficial } as const];
  }).sort((a, b) => b.observation - a.observation);
  const names = new Set<string>();
  return available.filter(({ price }) => {
    const key = price.fuel + '/' + price.productName.trim().toLowerCase();
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
}

export function outletPriceView(outletId: string, productClass: OutletFuelPrice['productClass'],
  prices: readonly (OutletFuelPrice | CityFuelPrice | PersonalFuelPrice)[], now = Date.now()) {
  return outletPriceQuotes(outletId, productClass, prices, now)[0] ??
    { price: null, freshness: 'unavailable' as const, currentOfficial: false };
}

export function nearbyPriceRows<T extends Station & { km: number }>(stations: readonly T[], fuel: OutletFuelPrice['productClass'],
  lowestFirst: boolean, now = Date.now()) {
  const rows = stations.map(station => {
    const quotes = outletPriceQuotes(station.id, fuel, pricesForOutlet(station), now);
    return { station, quotes };
  });
  const comparable = fuel !== 'premium' && rows.filter(row => row.quotes[0]?.freshness === 'recent').length >= 2;
  if (lowestFirst && comparable) {
    rows.sort((a, b) => {
      const price = (row: typeof a) => row.quotes[0]?.freshness === 'recent' ? row.quotes[0].price.paisePerLitre : Infinity;
      return price(a) - price(b) || a.station.km - b.station.km;
    });
  }
  return { rows, comparable };
}

function positiveDecimal(text: string, pattern: RegExp, multiplier: number) {
  const value = text.trim();
  const number = pattern.test(value) ? Math.round(Number(value) * multiplier) : 0;
  return number > 0 && number <= 1000 * multiplier ? number : 0;
}

export function personalEstimate(outletId: string, fuel: PriceFuel, rupees: string, litres: string, now = Date.now()) {
  const paisePerLitre = positiveDecimal(rupees, /^\d{1,4}(?:\.\d{1,2})?$/, 100);
  const milliLitres = positiveDecimal(litres, /^\d{1,4}(?:\.\d{1,3})?$/, 1000);
  if (!paisePerLitre || !milliLitres) return null;
  const timestamp = new Date(now).toISOString();
  const price: PersonalFuelPrice = {
    outletId, providerOutletId: null, fuel, productName: FUEL_PRODUCT_NAMES[fuel],
    coverage: 'user-confirmed', provider: 'user', source: 'Your entry', sourceUrl: null,
    paisePerLitre, currency: 'INR', observedAt: timestamp, retrievedAt: timestamp, effectiveDate: null,
  };
  return { price, totalPaise: Math.round(paisePerLitre * milliLitres / 1000) };
}

export function officialPriceCheck(brand: string) {
  switch (brand) {
    case 'IndianOil':
      return { label: 'Open IndianOil price check', url: 'https://www.iocl.com/petrol-diesel-price',
        guidance: 'Find the dealer code at this pump. Send RSP followed by the dealer code to 92249 92249 for indicative petrol and diesel prices.' };
    case 'Bharat Petroleum':
      return { label: 'View Hello BPCL app', url: 'https://play.google.com/store/apps/details?id=com.bpcl.hellob2c',
        guidance: 'In Hello BPCL, select the retail outlet to check the prices shown for it.' };
    case 'Hindustan Petroleum':
      return { label: 'Open HPCL price information', url: 'https://www.hindustanpetroleum.com/PriceBuildup',
        guidance: 'HPCL posts indicative prices for selected locations. Confirm the rate at this outlet.',
        appUrl: 'https://play.google.com/store/apps/details?id=com.drivetrackplusrefuel' };
  }
}
