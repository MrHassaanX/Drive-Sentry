import { calculateMileageSegments } from '../fuel/calculations.ts';
import type { FuelEntry } from '../fuel/types.ts';
import type { FuelType } from '../vehicles/types.ts';
import { cityPriceStatus, type CityFuelPrice } from '../fuelPrices/model.ts';
import { outletPriceQuotes } from '../fuelPrices/outletPrices.ts';
import { pricesForOutlet } from '../stations/indiaFuelPumps.ts';
import type { Station } from '../stations/provider.ts';

export type TripFuel = 'petrol' | 'diesel' | 'cng';
export type TripPrice = { paise: number; source: string; coverage: string; observedAt: string };

export function resolveTripFuel(vehicle: FuelType | undefined, selection?: TripFuel): TripFuel | undefined {
  if (vehicle === 'hybrid') return selection;
  if (vehicle === 'petrol' || vehicle === 'diesel' || vehicle === 'cng') return vehicle;
}

export function recordedEfficiency(entries: FuelEntry[], fuel: TripFuel) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  return calculateMileageSegments(entries).findLast(segment =>
    segment.quantityUnit === (fuel === 'cng' ? 'kg' : 'litre') && byId.get(segment.endEntryId)?.recorded_fuel_type === fuel);
}

export function parseTripDecimal(text: string, max: number, places = 2) {
  const trimmed = text.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed) || (trimmed.split('.')[1]?.length ?? 0) > places) return undefined;
  const value = Number(trimmed);
  return value > 0 && value <= max ? value : undefined;
}

export function tripEstimate(distanceMetres: number, fuel: TripFuel, efficiency: number, pricePaise?: number) {
  if (!Number.isFinite(distanceMetres) || distanceMetres < 0 || !Number.isFinite(efficiency) || efficiency <= 0) return undefined;
  const consumed = distanceMetres / 1000 / efficiency;
  const total = pricePaise && Number.isSafeInteger(pricePaise) && pricePaise > 0 ? Math.round(consumed * pricePaise) : undefined;
  return { consumed, unit: fuel === 'cng' ? 'kg' : 'L', totalPaise: Number.isSafeInteger(total) ? total : undefined };
}

export function tripRange(rangeKm: number | undefined, availableFuel: number | undefined, efficiency: number | undefined) {
  if (rangeKm) return rangeKm;
  if (availableFuel && efficiency) return availableFuel * efficiency;
}

export function metroTripPrice(entries: CityFuelPrice[], cityId: string | undefined, fuel: TripFuel, now = Date.now()): TripPrice | undefined {
  const quote = entries.find(entry => entry.cityId === cityId && entry.fuel === fuel);
  if (!quote || cityPriceStatus(quote, false, now) !== 'city-reference') return undefined;
  return { paise: quote.paisePerLitre, source: 'PPAC via India Petroleum API', coverage: quote.city + ' city reference', observedAt: quote.effectiveDate };
}

export function outletTripPrice(station: Station, fuel: TripFuel, now = Date.now()): TripPrice | undefined {
  if (fuel === 'cng') return undefined;
  const quote = outletPriceQuotes(station.id, fuel, pricesForOutlet(station), now).find(item => item.freshness === 'recent');
  if (!quote) return undefined;
  return { paise: quote.price.paisePerLitre, source: quote.price.source, coverage: station.name || station.brand || 'Selected outlet',
    observedAt: quote.price.observedAt ?? quote.price.effectiveDate ?? quote.price.retrievedAt };
}
