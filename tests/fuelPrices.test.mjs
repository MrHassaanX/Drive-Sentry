import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CACHE_TTL_MS, cityPriceStatus, isFreshCache, isMetroCity, sourceAgeDays } from '../src/features/fuelPrices/model.ts';
import { readMetroPrices } from '../src/features/fuelPrices/repository.ts';
import { fetchMetroPrices, normalizeMetroPrices, PriceRateLimitError } from '../src/features/fuelPrices/provider.ts';
import { createPriceService } from '../src/features/fuelPrices/service.ts';
import { matchOutletPriceLocation, nearbyPriceRows, officialPriceCheck, outletPriceView, personalEstimate } from '../src/features/fuelPrices/outletPrices.ts';
import { createIndiaFuelPumps, indiaFuelProduct, indiaFuelPumpsBrands, indiaFuelShards, parseIndiaFuelIndex, pricesForOutlet, readIndiaFuelShard } from '../src/features/stations/indiaFuelPumps.ts';
import { nearby } from '../src/features/stations/provider.ts';
import { searchWithProvider } from '../src/features/stations/search.ts';
import { listingEvidence, verifiedE0 } from '../src/features/premium/evidence.ts';

function fixture(date = '2026-11-18') {
  return {
    success: true,
    data: { date, petrol: { delhi: 100.01, mumbai: 105.20, chennai: 110.35, kolkata: 115.40 },
      diesel: { delhi: 90.02, mumbai: 91.10, chennai: 92.35, kolkata: 93.40 } },
    meta: { source_posted_date: date },
  };
}

const retrieved = '2026-11-18T03:00:00.000Z';
const retrievedMs = Date.parse(retrieved);

const sampleShard = { prefix: 'tdn', file: 'shards/tdn.0123456789abcdef.json', count: 1 };
const sampleIndex = { schemaVersion: 1, generatedAt: retrieved, brands: { hpcl: 1, bpcl: 1 }, shards: [sampleShard,
  { prefix: 'tdr', file: 'shards/tdr.0123456789abcdef.json', count: 1 }] };
const sampleOutlet = {
  schemaVersion: 1, brand: 'HPCL', outletId: '001', stationId: '0123456789abcdef',
  sourceUrl: 'https://petrolpump.hpretail.in/outlet-001/Home', capturedAt: '2026-11-17T08:00:00Z', geohash: 'tdnw01d',
  lat: 12.305198, lng: 76.655198, name: 'Test Outlet', address: '1 Test Street', city: 'Mysuru',
  products: [{ name: 'Petrol', priceInr: 102.15 }, { name: 'Diesel', priceInr: 88.1 },
    { name: 'poWer100', priceInr: 151.25 }, { name: 'TurboJet', priceInr: 102.5 }, { name: 'poWer95', priceInr: null }],
};
const sampleOrigin = { latitude: 12.3052, longitude: 76.6552 };
const approvedFixture = new Set(['HPCL']);

test('academic outlet observations cover the published brands and release keeps the source disabled', () => {
  assert.deepEqual([...indiaFuelPumpsBrands(true)], ['HPCL', 'IOCL', 'BPCL', 'JioBP', 'Nayara', 'Shell']);
  assert.deepEqual([...indiaFuelPumpsBrands(false)], []);
});

test('India Fuel Pumps validates the manifest and selects only geographically relevant shards', () => {
  const shards = parseIndiaFuelIndex(sampleIndex);
  assert.deepEqual(indiaFuelShards(shards, sampleOrigin, 10), [sampleShard]);
  assert.deepEqual(indiaFuelShards(shards, { latitude: 12.9716, longitude: 77.5946 }, 5), [sampleIndex.shards[1]]);
  assert.throws(() => parseIndiaFuelIndex({ ...sampleIndex, schemaVersion: 2 }), /Unsupported/);
  assert.throws(() => parseIndiaFuelIndex({ ...sampleIndex, brands: { bpcl: 1 } }, approvedFixture), /missing an approved brand/);
  assert.throws(() => parseIndiaFuelIndex({ ...sampleIndex, shards: [sampleShard, sampleShard] }), /Invalid/);
  assert.throws(() => parseIndiaFuelIndex({ ...sampleIndex, shards: [{ ...sampleShard, file: '../index.json' }] }), /Invalid/);
});

test('a search across a cell edge retains a successful shard and reports partial coverage', async t => {
  const origin = { latitude: 12.65, longitude: 77.30 };
  assert.deepEqual(indiaFuelShards(sampleIndex.shards, origin, 5).map(shard => shard.prefix), ['tdn', 'tdr']);
  const request = t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('index.json')) return Response.json(sampleIndex);
    if (url.endsWith(sampleShard.file)) return Response.json({
      prefix: 'tdn', outlets: [{ ...sampleOutlet, lat: 12.65, lng: 77.29 }],
    });
    return new Response(null, { status: 503 });
  });
  const provider = createIndiaFuelPumps(approvedFixture);
  const result = await provider.fetch('12.65,77.30', 5);
  assert.equal(result.data.length, 1);
  assert.equal(result.partial, true);
  assert.equal(result.limited, true);
  assert.equal((await provider.coverage()).total, 2);
  assert.equal(request.mock.callCount(), 3);
});

test('India Fuel Pumps verifies outlet provenance, classes, freshness and original product names', () => {
  const parse = (outlet, brands = approvedFixture) =>
    readIndiaFuelShard({ prefix: 'tdn', outlets: [outlet] }, sampleShard, brands, retrieved);
  const [station] = parse(sampleOutlet);
  assert.equal(station.id, 'india-fuel-pumps/0123456789abcdef');
  assert.equal(station.references[0].omcOutlet, 'HPCL/001');
  assert.deepEqual(parse(sampleOutlet, new Set()), []);
  assert.deepEqual(parse({ ...sampleOutlet, sourceUrl: 'https://example.test/outlet-001' }), []);
  assert.throws(() => parse({ ...sampleOutlet, schemaVersion: 2 }), /schema/);
  assert.throws(() => readIndiaFuelShard({ prefix: 'tdn', outlets: [] }, sampleShard, approvedFixture, retrieved), /Incomplete/);
  const prices = pricesForOutlet(station);
  assert.deepEqual(prices.map(p => [p.productName, p.productClass, p.fuel, p.paisePerLitre]), [
    ['Petrol', 'petrol', 'petrol', 10215], ['Diesel', 'diesel', 'diesel', 8810],
    ['poWer100', 'premium', 'petrol', 15125], ['TurboJet', 'premium', 'diesel', 10250],
  ]);
  assert.ok(prices.every(p => p.observedAt === sampleOutlet.capturedAt && p.effectiveDate === null && p.retrievedAt === retrieved));
  assert.equal(indiaFuelProduct({ name: 'CNG', priceInr: 81 }), undefined);
  assert.equal(indiaFuelProduct({ name: 'Petrol', priceInr: 0 }).paise, null);
  const evidence = listingEvidence(station);
  assert.deepEqual(evidence.map(item => item.listedProduct), ['poWer100', 'poWer95']);
  assert.ok(evidence.every(item => item.availability === 'listing' && !verifiedE0(item, retrievedMs)));
  assert.equal(outletPriceView(station.id, 'petrol', prices, retrievedMs + 86400000).freshness, 'older');
  assert.equal(outletPriceView(station.id, 'petrol', prices, retrievedMs + 3 * 86400000).freshness, 'stale');
});

test('India Fuel Pumps writes only approved local results and recovers the right cache offline', async t => {
  const request = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.github.com');
    assert.equal(options.headers.Accept, 'application/vnd.github.raw+json');
    if (url.endsWith('index.json')) return Response.json(sampleIndex);
    if (url.endsWith(sampleShard.file)) return Response.json({ prefix: 'tdn', outlets: [sampleOutlet] });
    return Response.json({ prefix: 'tdr', outlets: [{ ...sampleOutlet, brand: 'BPCL' }] });
  });
  const provider = createIndiaFuelPumps(approvedFixture);
  assert.deepEqual((await createIndiaFuelPumps().fetch('12.31,76.66', 5)).data, []);
  assert.equal(request.mock.callCount(), 0);
  const rows = new Map();
  const db = {
    getFirstAsync: async (_sql, key) => rows.get(key),
    runAsync: async (_sql, key, payload, fetched) => { rows.set(key, { payload, fetched }); },
    execAsync: async () => {},
  };
  const live = await searchWithProvider(db, sampleOrigin, 5, provider);
  assert.equal(live.stations.length, 1);
  assert.equal(request.mock.callCount(), 2);
  assert.equal((await searchWithProvider(db, { latitude: 12.9716, longitude: 77.5946 }, 5, provider)).stations.length, 0);
  request.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  const offline = await searchWithProvider(db, sampleOrigin, 5, provider, true);
  assert.equal(offline.fetched, live.fetched);
  assert.match(offline.status, /Offline or stale/);
  assert.deepEqual(pricesForOutlet(offline.stations[0]), pricesForOutlet(live.stations[0]));
  const other = await searchWithProvider(db, { latitude: 12.9716, longitude: 77.5946 }, 5, createIndiaFuelPumps(approvedFixture), true);
  assert.deepEqual(other.stations, []);
});

test('India Fuel Pumps respects the public GitHub API rate-limit reset', async t => {
  let now = retrievedMs;
  t.mock.method(Date, 'now', () => now);
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(null, {
    status: 403,
    headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(retrievedMs / 1000 + 125) },
  }));
  const provider = createIndiaFuelPumps(approvedFixture);
  await assert.rejects(provider.fetch('12.31,76.66', 5), /HTTP 403/);
  now += 61000;
  await assert.rejects(provider.fetch('12.31,76.66', 5), /temporarily unavailable/);
  assert.equal(request.mock.callCount(), 1);
  now += 65000;
  await assert.rejects(provider.fetch('12.31,76.66', 5), /HTTP 403/);
  assert.equal(request.mock.callCount(), 2);
});

test('outlet matching keeps price observations on their pump and sorting excludes old and premium prices', () => {
  const [station] = readIndiaFuelShard({ prefix: 'tdn', outlets: [sampleOutlet] }, sampleShard, approvedFixture, retrieved);
  const mapped = { ...station, id: 'mapped/a', source: 'Geoapify', outletListing: undefined, references: undefined };
  const other = { ...mapped, id: 'mapped/b', address: '2 Test Street', longitude: mapped.longitude + 0.00005 };
  const result = nearby([mapped, other, station], sampleOrigin, 5);
  assert.equal(result.length, 2);
  assert.equal(result.find(s => s.id === other.id).outletListing, undefined);
  assert.equal(pricesForOutlet(result.find(s => s.id === station.id))[0].providerOutletId, 'HPCL/001');
  assert.equal(matchOutletPriceLocation(station, [{ ...mapped, references: [{ id: 'other', source: 'Geoapify', omcOutlet: 'HPCL/999' }] }]), null);
  const cheapest = { ...station, id: 'second', km: 2, outletListing: { ...station.outletListing,
    products: [{ name: 'Petrol', fuel: 'petrol', type: 'petrol', paise: 9999 }] } };
  const old = { ...cheapest, id: 'old', km: 0.5, outletListing: { ...cheapest.outletListing, capturedAt: '2026-11-16T00:00:00Z' } };
  const rows = nearbyPriceRows([old, { ...station, km: 1 }, cheapest], 'petrol', true, retrievedMs);
  assert.equal(rows.comparable, true);
  assert.deepEqual(rows.rows.map(row => row.station.id), ['second', station.id, 'old']);
  assert.equal(nearbyPriceRows([old, { ...station, km: 1 }, cheapest], 'diesel', true, retrievedMs).comparable, false);
  const premium = nearbyPriceRows([{ ...station, km: 1 }], 'premium', true, retrievedMs);
  assert.deepEqual(premium.rows[0].quotes.map(row => row.price.productName), ['poWer100', 'TurboJet']);
  assert.equal(premium.comparable, false);
});

test('station prices require matching outlet identity, INR and observation provenance', () => {
  const price = {
    coverage: 'outlet-observation', provider: 'fixture', outletId: 'mapped/a', providerOutletId: '003',
    fuel: 'petrol', productClass: 'petrol', matchConfidence: 'shared-id',
    productName: 'Regular petrol', paisePerLitre: 10450, currency: 'INR',
    observedAt: '2026-11-17T08:00:00Z', retrievedAt: retrieved, effectiveDate: null,
    source: 'Fixture provider', sourceUrl: 'https://example.test/outlet/003',
  };
  const recent = outletPriceView('mapped/a', 'petrol', [price], retrievedMs);
  assert.equal(recent.price.effectiveDate, null);
  assert.equal(recent.freshness, 'recent');
  assert.equal(recent.currentOfficial, false);
  const recopied = { ...price, retrievedAt: '2026-11-20T08:00:00Z' };
  const stale = outletPriceView('mapped/a', 'petrol', [recopied], Date.parse(recopied.retrievedAt));
  assert.equal(stale.freshness, 'stale');
  for (const row of [
    { ...price, outletId: 'mapped/b' }, { ...price, fuel: 'diesel' }, { ...price, observedAt: null },
    { ...price, effectiveDate: '2026-02-30' }, { ...price, effectiveDate: '2026-12-01' },
    { ...price, sourceUrl: 'http://example.test' }, { ...price, paisePerLitre: 99.2 }, { ...price, providerOutletId: '' },
    { ...price, matchConfidence: undefined }, { ...price, productClass: 'premium' },
    normalizeMetroPrices(fixture(), retrieved)[0],
    personalEstimate('mapped/a', 'petrol', '104.50', '2', retrievedMs).price,
  ]) assert.equal(outletPriceView('mapped/a', 'petrol', [row], retrievedMs).freshness, 'unavailable');
  const undated = outletPriceView('mapped/a', 'petrol', [{ ...price, coverage: 'outlet-reported', observedAt: null }], retrievedMs);
  assert.equal(undated.price.coverage, 'outlet-reported');
  assert.equal(undated.currentOfficial, false);
  assert.equal(outletPriceView('mapped/a', 'petrol', [{ ...price, coverage: 'outlet-reported', effectiveDate: '2026-11-18' }], retrievedMs)
    .currentOfficial, true);
  assert.equal(outletPriceView('mapped/a', 'premium', [{ ...price, productClass: 'premium', coverage: 'community-reported' }], retrievedMs)
    .price.coverage, 'community-reported');
});

test('price matching prefers an unambiguous shared identity and requires corroboration otherwise', () => {
  const record = { id: 'provider/003', source: 'Provider', latitude: 12.3, longitude: 76.65,
    name: 'Vijaya Petrol Bunk', brand: 'IOCL', address: '1 Diwan Road, Mysuru 570001', hours: '', fuels: '' };
  const station = { ...record, id: 'geoapify/a', source: 'Geoapify', longitude: 76.6501 };
  assert.deepEqual(matchOutletPriceLocation(record, [station]), { outletId: station.id, matchConfidence: 'corroborated' });
  assert.equal(matchOutletPriceLocation(record, [{ ...station, name: 'IndianOil' }]), null);
  assert.equal(matchOutletPriceLocation(record, [{ ...station, address: '2 Diwan Road, Mysuru 570001' }]), null);
  assert.equal(matchOutletPriceLocation(record, [station, { ...station, id: 'geoapify/b' }]), null);
  const linked = { ...station, references: [record] };
  assert.deepEqual(matchOutletPriceLocation(record, [linked, { ...station, id: 'geoapify/b' }]),
    { outletId: station.id, matchConfidence: 'shared-id' });
});

test('personal estimates store integer paise and official actions require a sourced brand', () => {
  const estimate = personalEstimate('mapped/a', 'diesel', '104.50', '2.125', retrievedMs);
  assert.equal(estimate.price.coverage, 'user-confirmed');
  assert.equal(estimate.price.providerOutletId, null);
  assert.equal(estimate.price.effectiveDate, null);
  assert.equal(estimate.totalPaise, 22206);
  assert.equal(personalEstimate('mapped/a', 'diesel', '104.501', '2', retrievedMs), null);
  assert.equal(personalEstimate('mapped/a', 'diesel', '100', '2.0001', retrievedMs), null);
  assert.match(officialPriceCheck('IndianOil').guidance, /dealer code/);
  assert.match(officialPriceCheck('Bharat Petroleum').url, /com\.bpcl\.hellob2c/);
  assert.equal(officialPriceCheck(''), undefined);
});

function adapter(rows) {
  return {
    writes: [],
    async getAllAsync(_sql, provider) {
      assert.equal(provider, 'india-petroleum-api');
      return rows;
    },
    async runAsync(sql, ...params) { this.writes.push({ sql, params }); },
  };
}

test('normalizes only supported metro city prices with integer paise and distinct source dates', () => {
  const payload = fixture();
  payload.meta.source_posted_date = '2026-11-19';
  const actual = normalizeMetroPrices(payload, '2026-11-19T01:00:00.000Z');
  assert.equal(actual.length, 8);
  const delhi = actual.find(price => price.cityId === 'delhi' && price.fuel === 'petrol');
  assert.equal(delhi.paisePerLitre, 10001);
  assert.equal(delhi.effectiveDate, '2026-11-18');
  assert.equal(delhi.sourcePostedDate, '2026-11-19');
  assert.equal(delhi.retrievedAt, '2026-11-19T01:00:00.000Z');
  assert.equal(delhi.coverage, 'metro-reference');
  assert.equal(delhi.productName, 'Petrol');
  assert.equal(delhi.currency, 'INR');
  assert.equal(Object.hasOwn(delhi, 'outletId'), false);
  assert.match(delhi.source, /PPAC/);
  assert.equal(isMetroCity('mysuru'), false);
  assert.equal(isMetroCity('bengaluru'), false);
  assert.equal(isMetroCity('mumbai'), true);
  assert.equal(actual.some(price => price.cityId === 'mysuru' || price.cityId === 'bengaluru'), false);
});

test('version 6 metro cache restores product and currency without changing the effective date', async () => {
  const original = normalizeMetroPrices(fixture(), retrieved).find(price => price.fuel === 'diesel');
  const { productName, currency, ...stored } = original;
  const [restored] = await readMetroPrices(adapter([stored]));
  assert.deepEqual(restored, { ...stored, productName, currency });
  assert.equal(cityPriceStatus(restored, false, retrievedMs), 'city-reference');
  assert.equal(cityPriceStatus(restored, true, retrievedMs), 'stale');
  assert.equal(cityPriceStatus(restored, false, Date.parse('2026-11-20T18:30:00Z')), 'stale');
  assert.equal(cityPriceStatus(undefined, false, retrievedMs), 'unavailable');
});

test('invalid, missing, non-precise, and future rates never normalize to zero', () => {
  for (const price of [undefined, null, '104.21', 0, -3, 100.111, NaN, Infinity]) {
    const payload = fixture();
    payload.data.petrol.delhi = price;
    assert.throws(() => normalizeMetroPrices(payload, retrieved), /invalid or incomplete/);
  }
  for (const date of ['2026-02-29', '2026-11-19', undefined]) {
    assert.throws(() => normalizeMetroPrices(fixture(date ?? 'missing'), retrieved), /invalid or incomplete/);
  }
  assert.throws(() => normalizeMetroPrices({ success: false }, retrieved), /invalid or incomplete/);
});

test('cache expiration is based on retrieval time and source age uses the Indian date', () => {
  assert.equal(isFreshCache(retrieved, retrievedMs + CACHE_TTL_MS - 1), true);
  assert.equal(isFreshCache(retrieved, retrievedMs + CACHE_TTL_MS), false);
  assert.equal(isFreshCache(retrieved, retrievedMs - 1), false);
  assert.equal(sourceAgeDays('2026-11-18', Date.parse('2026-11-18T18:29:59Z')), 0);
  assert.equal(sourceAgeDays('2026-11-18', Date.parse('2026-11-18T18:30:00Z')), 1);
});

test('fresh cache avoids provider requests, force refresh preserves original timestamp offline', async t => {
  t.mock.method(Date, 'now', () => retrievedMs + 1000);
  const db = adapter(normalizeMetroPrices(fixture(), retrieved));
  let attempts = 0;
  const service = createPriceService(async () => {
    attempts += 1;
    throw new Error('Offline demo fixture');
  });
  assert.equal((await service(db)).status, 'saved');
  assert.equal(attempts, 0);
  const fallback = await service(db, true);
  assert.equal(fallback.status, 'stale');
  assert.equal(fallback.prices[0].retrievedAt, retrieved);
  assert.match(fallback.notice, /Offline demo fixture/);
  assert.equal(db.writes.length, 0);
  await service(db, true);
  assert.equal(attempts, 1);
});

test('stale cache triggers a single shared provider fetch for both fuels and all supported cities', async t => {
  t.mock.method(Date, 'now', () => retrievedMs + CACHE_TTL_MS);
  const db = adapter(normalizeMetroPrices(fixture(), retrieved));
  const updated = normalizeMetroPrices(fixture(), '2026-11-18T09:00:00.000Z');
  let attempts = 0;
  const service = createPriceService(async () => { attempts += 1; return updated; });
  const [first, second] = await Promise.all([service(db), service(db)]);
  assert.strictEqual(first, second);
  assert.equal(first.status, 'live');
  assert.equal(first.prices.length, 8);
  assert.equal(attempts, 1);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].params.length, 8 * 12);
});

test('an older provider publication cannot replace the latest saved values', async t => {
  t.mock.method(Date, 'now', () => retrievedMs + CACHE_TTL_MS);
  const db = adapter(normalizeMetroPrices(fixture(), retrieved));
  const earlier = normalizeMetroPrices(fixture('2026-11-17'), '2026-11-18T09:00:00.000Z');
  const result = await createPriceService(async () => earlier)(db);
  assert.equal(result.status, 'stale');
  assert.equal(result.prices[0].effectiveDate, '2026-11-18');
  assert.equal(result.prices[0].retrievedAt, retrieved);
  assert.equal(db.writes.length, 0);
});

test('HTTP rate limits respect Retry-After and unavailable responses do not create a price', async t => {
  t.mock.method(Date, 'now', () => retrievedMs);
  const request = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.match(url, /\/v1\/prices\/latest$/);
    return new Response(null, { status: 429, headers: { 'Retry-After': '1800' } });
  });
  await assert.rejects(fetchMetroPrices, error => error instanceof PriceRateLimitError && error.retryAt === retrievedMs + 1800000);
  const db = adapter([]);
  const service = createPriceService();
  await assert.rejects(service(db), /limited requests/);
  await assert.rejects(service(db), /limited requests/);
  assert.equal(request.mock.callCount(), 2);
  assert.equal(db.writes.length, 0);
  request.mock.mockImplementation(async () => new Response(null, { status: 502 }));
  await assert.rejects(fetchMetroPrices, /HTTP 502/);
  request.mock.mockImplementation(async () => new Response('invalid JSON', { status: 200 }));
  await assert.rejects(fetchMetroPrices, /invalid or incomplete/);
});
