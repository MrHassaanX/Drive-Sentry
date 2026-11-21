import { FUEL_PRODUCT_NAMES, isIndianDate, sourceAgeDays,
  type CityFuelPrice, type OutletFuelPrice, type PersonalFuelPrice, type PriceFuel } from './model.ts';

export const priceLabels = {
  'outlet-reported': 'Outlet-reported price',
  'outlet-observation': 'Outlet observation',
  'metro-reference': 'City reference',
  'user-confirmed': 'User-provided price',
  unavailable: 'Outlet price unavailable',
} as const;

export function outletPriceView(outletId: string, fuel: PriceFuel,
  prices: readonly (OutletFuelPrice | CityFuelPrice | PersonalFuelPrice)[], now = Date.now()) {
  const available = prices.flatMap(price => {
    if (price.coverage !== 'outlet-reported' && price.coverage !== 'outlet-observation') return [];
    if (price.outletId !== outletId || !price.providerOutletId.trim() || price.fuel !== fuel ||
        !price.provider.trim() || !price.source.trim() || !price.productName.trim() ||
        price.currency !== 'INR' || !Number.isSafeInteger(price.paisePerLitre) || price.paisePerLitre <= 0) return [];
    try {
      if (new URL(price.sourceUrl).protocol !== 'https:') return [];
    } catch { return []; }
    const retrieval = Date.parse(price.retrievedAt);
    const observation = price.observedAt === null ? retrieval : Date.parse(price.observedAt);
    const age = price.effectiveDate === null ? null : sourceAgeDays(price.effectiveDate, now);
    if (!Number.isFinite(retrieval) || !Number.isFinite(observation) || observation > retrieval || retrieval > now ||
        (price.coverage === 'outlet-observation' && !price.observedAt) ||
        (price.effectiveDate !== null && (!isIndianDate(price.effectiveDate) || (age !== null && age < 0)))) return [];
    const stale = now - observation >= 86400000 || (age !== null && age > 1);
    return [{ price, freshness: stale ? 'stale' as const : 'recent' as const, observation }];
  }).sort((a, b) => Number(a.freshness === 'stale') - Number(b.freshness === 'stale') || b.observation - a.observation);
  return available[0] ?? { price: null, freshness: 'unavailable' as const };
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
