import { sourceText } from './displayName.ts';
import { distance, type Point, type Radius, type Station } from './provider.ts';
import type { OutletFuelPrice, PriceFuel } from '../fuelPrices/model.ts';

const base = 'https://raw.githubusercontent.com/ForceGT/india-fuel-pumps/main/dataset/';
export const INDIA_FUEL_PUMPS = 'India Fuel Pumps · ForceGT';
export const INDIA_FUEL_PUMPS_SOURCE = 'https://github.com/ForceGT/india-fuel-pumps';
const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
const brands = ['HPCL', 'IOCL', 'BPCL', 'JioBP', 'Nayara', 'Shell'] as const;
type Brand = typeof brands[number];
const hosts: Record<Brand, string> = {
  HPCL: 'petrolpump.hpretail.in', IOCL: 'locator.iocl.com', BPCL: 'api.cep.bpcl.in',
  JioBP: 'netmanager.ril.com', Nayara: 'nayaraenergy.com', Shell: 'shellretaillocator.geoapp.me',
};
type Shard = { prefix: string; file: string; count: number };
type Product = { name: string; fuel: PriceFuel; type: OutletFuelPrice['productClass']; paise: number | null };
export type OutletListing = {
  brand: Brand; outletId: string; stationId: string; sourceUrl: string;
  capturedAt: string; retrievedAt: string; products: Product[];
};

// See docs/FUEL_MAP_V2_AND_COLLEGE_DEMO.md. Add only brands with documented
// rights covering this distinct upstream feed, in-app display and local caching.
export const approvedIndiaFuelPumpsBrands: ReadonlySet<Brand> = new Set();

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function parseIndiaFuelIndex(data: unknown, approved: ReadonlySet<Brand> = new Set()) {
  const index = record(data);
  if (index?.schemaVersion !== 1 || !Array.isArray(index.shards) || index.shards.length > 32768 ||
      !Number.isFinite(Date.parse(sourceText(index.generatedAt)))) throw Error('Unsupported India Fuel Pumps index.');
  const counts = record(index.brands);
  for (const brand of approved) {
    const count = counts?.[brand.toLowerCase()];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) {
      throw Error('India Fuel Pumps index is missing an approved brand.');
    }
  }
  const seen = new Set<string>();
  return index.shards.map((candidate: unknown): Shard => {
    const row = record(candidate);
    const prefix = sourceText(row?.prefix);
    const file = sourceText(row?.file);
    const count = row?.count;
    if (!/^[0-9bcdefghjkmnpqrstuvwxyz]{3}$/.test(prefix) || seen.has(prefix) ||
        !new RegExp('^shards/' + prefix + '\\.[a-f0-9]{16}\\.json$').test(file) ||
        typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) throw Error('Invalid India Fuel Pumps shard index.');
    seen.add(prefix);
    return { prefix, file, count };
  });
}

function bounds(prefix: string) {
  const longitude = [-180, 180];
  const latitude = [-90, 90];
  let odd = false;
  for (const letter of prefix) {
    for (const bit of [16, 8, 4, 2, 1]) {
      const axis = odd ? latitude : longitude;
      const midpoint = (axis[0] + axis[1]) / 2;
      axis[alphabet.indexOf(letter) & bit ? 0 : 1] = midpoint;
      odd = !odd;
    }
  }
  return { latitude, longitude };
}

export function indiaFuelShards(shards: Shard[], origin: Point, radius: Radius) {
  // A 0.01-degree cache bucket can move the exact origin up to 800 metres.
  const lat = (radius + 0.8) / 110;
  const lon = lat / Math.cos((Math.abs(origin.latitude) + lat) * Math.PI / 180);
  return shards.filter(shard => {
    const box = bounds(shard.prefix);
    return box.latitude[0] <= origin.latitude + lat && box.latitude[1] >= origin.latitude - lat &&
      box.longitude[0] <= origin.longitude + lon && box.longitude[1] >= origin.longitude - lon;
  });
}

const regularPetrol = /^(petrol|regularpetrol|unleaded|ms|motorspirit)$/;
const regularDiesel = /^(diesel|regulardiesel|hsd|highspeeddiesel)$/;
const premiumPetrol = /^(xp95|xp100|xtrapremium|speed(?:97|100(?:bsiv)?)?|power(?:95|99|100)?|vpowerpetrol)$/;
const premiumDiesel = /^(turbojet|xtragreen(?:diesel)?|hi?speeddiesel|vpowerdiesel)$/;

export function indiaFuelProduct(value: unknown): Product | undefined {
  const row = record(value);
  const name = sourceText(row?.name);
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const type = regularPetrol.test(key) ? 'petrol' : regularDiesel.test(key) ? 'diesel'
    : premiumPetrol.test(key) || premiumDiesel.test(key) ? 'premium' : undefined;
  if (!type) return;
  const fuel = type === 'diesel' || premiumDiesel.test(key) ? 'diesel' : 'petrol';
  const price = row?.priceInr;
  const paise = typeof price === 'number' && Number.isFinite(price) && price > 0 && price <= 1000
    ? Math.round(price * 100) : null;
  return { name, fuel, type, paise: paise || null };
}

function sourceHref(value: unknown, brand: Brand) {
  try {
    const url = new URL(sourceText(value));
    if (url.protocol === 'https:' && url.hostname.replace(/^www\./, '') === hosts[brand] &&
        !url.username && !url.password && !url.port) return url.href;
  } catch { /* Unusable provenance. */ }
}

function outletKey(listing: OutletListing) {
  return listing.brand + '/' + listing.outletId;
}

export function readIndiaFuelShard(data: unknown, expected: Shard, approved: ReadonlySet<Brand>, retrievedAt: string): Station[] {
  const shard = record(data);
  if (shard?.prefix !== expected.prefix || !Array.isArray(shard.outlets) || shard.outlets.length !== expected.count) {
    throw Error('Incomplete India Fuel Pumps shard.');
  }
  const stations: Station[] = [];
  for (const candidate of shard.outlets) {
    const row = record(candidate);
    if (row?.schemaVersion !== 1) throw Error('Unsupported India Fuel Pumps outlet schema.');
    const brand = brands.find(item => item === row.brand);
    if (!brand || !approved.has(brand)) continue;
    const { lat, lng } = row;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180 || !sourceText(row.geohash).startsWith(expected.prefix)) continue;
    const point = { latitude: lat, longitude: lng };
    const outletId = sourceText(row.outletId);
    const stationId = sourceText(row.stationId);
    const sourceUrl = sourceHref(row.sourceUrl, brand);
    const capturedAt = sourceText(row.capturedAt);
    const date = Date.parse(capturedAt);
    if (!outletId || !/^[0-9a-f]{16}$/.test(stationId) || !sourceUrl ||
        !Number.isFinite(date) || date > Date.parse(retrievedAt)) continue;
    const products = Array.isArray(row.products) ? row.products.flatMap(item => indiaFuelProduct(item) ?? []) : [];
    const listing = { brand, outletId, stationId, sourceUrl, capturedAt, retrievedAt, products };
    const id = 'india-fuel-pumps/' + stationId;
    stations.push({
      ...point, id, brand, name: sourceText(row.name), hours: sourceText(row.hours), source: INDIA_FUEL_PUMPS,
      address: [row.address, row.city, row.state, row.pincode].map(sourceText).filter(Boolean).join(', '),
      locality: sourceText(row.city), city: sourceText(row.city), fuels: products.map(product => product.name).join(', '),
      outletListing: listing,
      references: [{ id, source: INDIA_FUEL_PUMPS, omcOutlet: outletKey(listing) }],
    });
  }
  return stations;
}

function normalizeIndiaListings(stations: Station[]) {
  const distinct = new Map<string, Station>();
  const owners = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const station of stations) {
    const listing = station.outletListing!;
    const key = outletKey(listing);
    const previous = distinct.get(key);
    const owner = owners.get(station.id);
    if (owner && owner !== key) {
      ambiguous.add(owner);
      ambiguous.add(key);
    }
    owners.set(station.id, key);
    if (previous && distance(previous, station) > 0.06) ambiguous.add(key);
    if (!previous || Date.parse(previous.outletListing!.capturedAt) < Date.parse(listing.capturedAt)) distinct.set(key, station);
  }
  // An outlet ID reported at incompatible locations is unsafe to price.
  return [...distinct.entries()].filter(([key]) => !ambiguous.has(key)).map(([, station]) => station);
}

export function createIndiaFuelPumps(approved = approvedIndiaFuelPumpsBrands) {
  let manifest: { shards: Shard[]; expires: number } | undefined;
  let pausedUntil = 0;
  let queue = Promise.resolve();
  const files = new Map<string, Station[]>();

  async function get(path: string) {
    if (Date.now() < pausedUntil) throw Error('India Fuel Pumps is temporarily unavailable.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(base + path, { signal: controller.signal });
      if (!response.ok) throw Error('India Fuel Pumps HTTP ' + response.status + '.');
      return await response.json() as unknown;
    } catch (error) {
      pausedUntil = Date.now() + 60000;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function load(area: string, radius: Radius) {
    if (!approved.size) return [];
    const [latitude, longitude] = area.split(',').map(Number);
    const origin = { latitude, longitude };
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < 6 || latitude > 38 || longitude < 67 || longitude > 99) return [];
    if (!manifest || manifest.expires <= Date.now()) {
      manifest = { shards: parseIndiaFuelIndex(await get('index.json'), approved), expires: Date.now() + 15 * 60000 };
    }
    const shards = indiaFuelShards(manifest.shards, origin, radius);
    if (shards.length > 6) throw Error('India Fuel Pumps search exceeds the shard limit.');
    const stations: Station[] = [];
    for (const shard of shards) {
      let saved = files.get(shard.file);
      if (!saved) {
        saved = readIndiaFuelShard(await get(shard.file), shard, approved, new Date().toISOString());
        if (files.size === 6) files.delete(files.keys().next().value!);
        files.set(shard.file, saved);
      }
      stations.push(...saved.filter(station => distance(origin, station) <= radius + 0.8));
    }
    return normalizeIndiaListings(stations);
  }

  return {
    cachePrefix: 'india-fuel-pumps/' + [...approved].sort().join('+') + '/',
    normalize(data: unknown): Station[] {
      if (!Array.isArray(data)) throw Error('Invalid saved India Fuel Pumps results.');
      return (data as Station[]).filter(({ outletListing }) => outletListing && approved.has(outletListing.brand) &&
        Array.isArray(outletListing.products) && !!sourceHref(outletListing.sourceUrl, outletListing.brand));
    },
    fetch(area: string, radius: Radius) {
      const task = queue.then(() => load(area, radius)).catch((error: unknown) => {
        if (pausedUntil <= Date.now()) pausedUntil = Date.now() + 60000;
        throw error;
      });
      queue = task.then(() => undefined, () => undefined);
      return task.then(data => ({ data, source: INDIA_FUEL_PUMPS }));
    },
  };
}

export function pricesForOutlet(station: Station): OutletFuelPrice[] {
  const listing = station.outletListing;
  if (!listing) return [];
  return listing.products.flatMap(product => !product.paise ? [] : [{
    coverage: 'outlet-observation', provider: INDIA_FUEL_PUMPS, source: listing.brand + ' via ' + INDIA_FUEL_PUMPS,
    sourceUrl: listing.sourceUrl, outletId: station.id, providerOutletId: outletKey(listing),
    productName: product.name, fuel: product.fuel, productClass: product.type,
    currency: 'INR', paisePerLitre: product.paise, matchConfidence: 'shared-id',
    observedAt: listing.capturedAt, retrievedAt: listing.retrievedAt, effectiveDate: null,
  }]);
}
