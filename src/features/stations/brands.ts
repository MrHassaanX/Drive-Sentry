import type { Station } from './provider.ts';

const brandAliases: Record<string, string> = {
  iocl: 'IndianOil', indianoil: 'IndianOil', indianoilcorporation: 'IndianOil',
  indianoilcorporationlimited: 'IndianOil',
  bpcl: 'Bharat Petroleum', bharatpetroleum: 'Bharat Petroleum', bharathpetroleum: 'Bharat Petroleum',
  bharatpetroleumcorporationlimited: 'Bharat Petroleum',
  hp: 'Hindustan Petroleum', hpcl: 'Hindustan Petroleum', hindustanpetroleum: 'Hindustan Petroleum',
  hindustanpetroleumcorporationlimited: 'Hindustan Petroleum',
  jiobp: 'Jio-bp', reliancebpmobilitylimited: 'Jio-bp',
  nayara: 'Nayara', nayaraenergy: 'Nayara', shell: 'Shell',
};

export function normalizeBrand(value: string) {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.hasOwn(brandAliases, key) ? brandAliases[key] : '';
}

export function stationBrand(station: Station) {
  const value = station.brand.trim().replace(/\s+/g, ' ');
  return normalizeBrand(value) || normalizeBrand(station.operator ?? '') || value;
}
