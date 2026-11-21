import { normalizeBrand, stationBrand } from './brands.ts';
import type { Station } from './provider.ts';

export function sourceText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/g, ' ');
  return /^(?:unknown|unnamed(?: fuel station)?|n\/?a|not available|null|-+)$/i.test(text) ? '' : text;
}

export function sourceKey(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function outletName(station: Station, candidate: unknown) {
  const title = sourceText(candidate);
  const key = sourceKey(title);
  const base = key.replace(/(?:fuelstation|petrolpump|petrolbunk|gasstation)$/, '');
  const brand = stationBrand(station);
  if (!base || /^(?:fuel|petrol|diesel|gas|station|pump)$/.test(base) ||
      (brand && sourceKey(normalizeBrand(base)) === sourceKey(brand))) return '';
  return title;
}

export function stationDisplay(station: Station) {
  const specific = outletName(station, station.name) || outletName(station, station.alternateName);
  const operator = stationBrand(station) || sourceText(station.operator);
  const locality = sourceText(station.road) || sourceText(station.locality);
  return {
    title: specific || (operator ? [operator, locality].filter(Boolean).join(' · ') : 'Fuel station'),
    exact: !!specific,
    secondary: sourceText(station.address) || locality,
  };
}
