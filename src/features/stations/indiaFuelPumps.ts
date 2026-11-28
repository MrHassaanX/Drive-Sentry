import { sourceText } from './displayName.ts';
import { distance, type Point, type Radius, type Station } from './provider.ts';
import type { OutletFuelPrice, PriceFuel } from '../fuelPrices/model.ts';

const base = 'https://api.github.com/repos/ForceGT/india-fuel-pumps/contents/dataset/';
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
export type CatalogueCoverage = { total: number; shards: number; cells: (Point & { count: number })[] };
type Product = { name: string; fuel: PriceFuel; type: OutletFuelPrice['productClass']; paise: number | null };
export type OutletListing = {
  brand: Brand; outletId: string; stationId: string; sourceUrl: string;
  capturedAt: string; retrievedAt: string; products: Product[];
};

// Use the public publisher snapshot for the scoped academic build. This adapter
// never polls the upstream oil-company websites or mobile app APIs.
export function indiaFuelPumpsBrands(academicDemo: boolean): ReadonlySet<Brand> {
  return new Set(academicDemo ? brands : []);
}

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

export function catalogueCoverage(shards: Shard[]): CatalogueCoverage {
  const grid = new Map<string, Point & { count: number }>();
  for (const shard of shards) {
    const box = bounds(shard.prefix);
    const latitude = 4 * Math.floor((box.latitude[0] + box.latitude[1]) / 8) + 2;
    const longitude = 4 * Math.floor((box.longitude[0] + box.longitude[1]) / 8) + 2;
    const key = latitude + ',' + longitude;
    const cell = grid.get(key) ?? { latitude, longitude, count: 0 };
    cell.count += shard.count;
    grid.set(key, cell);
  }
  return { total: shards.reduce((sum, shard) => sum + shard.count, 0), shards: shards.length, cells: [...grid.values()] };
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

export function createIndiaFuelPumps(approved = indiaFuelPumpsBrands(false)) {
  let manifest: { shards: Shard[]; expires: number } | undefined;
  let pausedUntil = 0;
  let queue = Promise.resolve();
  const files = new Map<string, Station[]>();

  async function get(path: string, signal?: AbortSignal) {
    if (signal?.aborted) throw Error('Station search cancelled.');
    if (Date.now() < pausedUntil) throw Error('India Fuel Pumps is temporarily unavailable.');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(base + path, {
        headers: { Accept: 'application/vnd.github.raw+json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const exhausted = response.headers.get('X-RateLimit-Remaining') === '0';
        const reset = exhausted ? Number(response.headers.get('X-RateLimit-Reset')) * 1000 : 0;
        pausedUntil = Math.max(Date.now() + 60000, Date.now() + (retryAfter || 0) * 1000, reset || 0);
        throw Error('India Fuel Pumps HTTP ' + response.status + '.');
      }
      return await response.json() as unknown;
    } catch (error) {
      if (signal?.aborted) throw Error('Station search cancelled.');
      pausedUntil = Math.max(pausedUntil, Date.now() + 60000);
      if (controller.signal.aborted) {
        throw Error(path === 'index.json' ? 'India Fuel Pumps index timed out.' : 'India Fuel Pumps shard timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }

  async function loadManifest(refresh: boolean, signal?: AbortSignal) {
    if (signal?.aborted) throw Error('Station search cancelled.');
    if (!manifest || manifest.expires <= Date.now() || refresh) {
      try {
        manifest = { shards: parseIndiaFuelIndex(await get('index.json', signal), approved), expires: Date.now() + 15 * 60000 };
      } catch (error) {
        if (!manifest || refresh || signal?.aborted) throw error;
      }
    }
    return manifest;
  }

  async function readShards(shards: readonly Shard[], include: (station: Station) => boolean, signal?: AbortSignal) {
    const stations: Station[] = [];
    let loaded = 0;
    let failure: unknown;
    for (const shard of shards.slice(0, 12)) {
      if (signal?.aborted) throw Error('Station search cancelled.');
      try {
        let saved = files.get(shard.file);
        if (!saved) saved = readIndiaFuelShard(await get(shard.file, signal), shard, approved, new Date().toISOString());
        files.delete(shard.file);
        files.set(shard.file, saved);
        if (files.size > 12) files.delete(files.keys().next().value!);
        stations.push(...saved.filter(include));
        loaded++;
      } catch (error) {
        if (signal?.aborted) throw error;
        failure ??= error;
      }
    }
    if (!loaded && failure) throw failure;
    return { data: normalizeIndiaListings(stations), limited: loaded < shards.length, partial: loaded < shards.length };
  }

  async function load(area: string, radius: Radius, refresh: boolean) {
    if (!approved.size) return { data: [], limited: false };
    const [latitude, longitude] = area.split(',').map(Number);
    const origin = { latitude, longitude };
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < 6 || latitude > 38 || longitude < 67 || longitude > 99) return { data: [], limited: false };
    const index = await loadManifest(refresh);
    return readShards(indiaFuelShards(index.shards, origin, radius), station => distance(origin, station) <= radius + 0.8);
  }

  return {
    cachePrefix: 'india-fuel-pumps/' + [...approved].sort().join('+') + '/',
    coverage() {
      const task = queue.then(async () => catalogueCoverage((await loadManifest(false)).shards));
      queue = task.then(() => undefined, () => undefined);
      return task;
    },
    normalize(data: unknown): Station[] {
      if (!Array.isArray(data)) throw Error('Invalid saved India Fuel Pumps results.');
      return (data as Station[]).filter(({ outletListing }) => outletListing && approved.has(outletListing.brand) &&
        Array.isArray(outletListing.products) && !!sourceHref(outletListing.sourceUrl, outletListing.brand));
    },
    fetch(area: string, radius: Radius, refresh = false) {
      const task = queue.then(() => load(area, radius, refresh)).catch((error: unknown) => {
        if (pausedUntil <= Date.now()) pausedUntil = Date.now() + 60000;
        throw error;
      });
      queue = task.then(() => undefined, () => undefined);
      return task.then(result => ({ ...result, source: INDIA_FUEL_PUMPS }));
    },
    fetchCorridor(centres: readonly Point[], signal?: AbortSignal) {
      const task = queue.then(async () => {
        if (!approved.size || !centres.length) return { data: [], partial: true, limited: true };
        const index = await loadManifest(false, signal);
        const shards = new Map<string, Shard>();
        for (const centre of centres) {
          // Centres are at most 20 km apart. Twenty-five kilometres retains
          // candidates near either edge, before exact route filtering.
          for (const shard of indiaFuelShards(index.shards, centre, 25)) shards.set(shard.file, shard);
        }
        const selected = [...shards.values()];
        const evenlySpaced = selected.length > 12 ? Array.from({ length: 12 },
          (_, i) => selected[Math.round(i * (selected.length - 1) / 11)]) : selected;
        const result = await readShards(evenlySpaced, station => centres.some(centre => distance(centre, station) <= 25), signal);
        const partial = result.partial || evenlySpaced.length < selected.length;
        return { ...result, partial, limited: partial };
      });
      queue = task.then(() => undefined, () => undefined);
      return task.then(result => ({ ...result, source: INDIA_FUEL_PUMPS }));
    },
  };
}

export function pricesForOutlet(station: Station): OutletFuelPrice[] {
  const listing = station.outletListing;
  if (!listing) return [];
  return listing.products.flatMap(product => !product.paise ? [] : [{
    coverage: 'outlet-observation', provider: INDIA_FUEL_PUMPS, source: listing.brand + ' outlet locator',
    sourceUrl: listing.sourceUrl, outletId: station.id, providerOutletId: outletKey(listing),
    productName: product.name, fuel: product.fuel, productClass: product.type,
    currency: 'INR', paisePerLitre: product.paise, matchConfidence: 'shared-id',
    observedAt: listing.capturedAt, retrievedAt: listing.retrievedAt, effectiveDate: null,
  }]);
}
