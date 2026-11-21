import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CACHE_TTL_MS, cityPriceStatus, isFreshCache, isMetroCity, sourceAgeDays } from '../src/features/fuelPrices/model.ts';
import { readMetroPrices } from '../src/features/fuelPrices/repository.ts';
import { fetchMetroPrices, normalizeMetroPrices, PriceRateLimitError } from '../src/features/fuelPrices/provider.ts';
import { createPriceService } from '../src/features/fuelPrices/service.ts';
import { officialPriceCheck, outletPriceView, personalEstimate } from '../src/features/fuelPrices/outletPrices.ts';

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

test('station prices require matching outlet identity, INR and observation provenance', () => {
  const price = {
    coverage: 'outlet-observation', provider: 'fixture', outletId: 'mapped/a', providerOutletId: '003',
    fuel: 'petrol', productName: 'Regular petrol', paisePerLitre: 10450, currency: 'INR',
    observedAt: '2026-11-17T08:00:00Z', retrievedAt: retrieved, effectiveDate: null,
    source: 'Fixture provider', sourceUrl: 'https://example.test/outlet/003',
  };
  const recent = outletPriceView('mapped/a', 'petrol', [price], retrievedMs);
  assert.equal(recent.price.effectiveDate, null);
  assert.equal(recent.freshness, 'recent');
  const recopied = { ...price, retrievedAt: '2026-11-20T08:00:00Z' };
  const stale = outletPriceView('mapped/a', 'petrol', [recopied], Date.parse(recopied.retrievedAt));
  assert.equal(stale.freshness, 'stale');
  for (const row of [
    { ...price, outletId: 'mapped/b' }, { ...price, fuel: 'diesel' }, { ...price, observedAt: null },
    { ...price, effectiveDate: '2026-02-30' }, { ...price, effectiveDate: '2026-12-01' },
    { ...price, sourceUrl: 'http://example.test' }, { ...price, paisePerLitre: 99.2 }, { ...price, providerOutletId: '' },
    normalizeMetroPrices(fixture(), retrieved)[0],
    personalEstimate('mapped/a', 'petrol', '104.50', '2', retrievedMs).price,
  ]) assert.equal(outletPriceView('mapped/a', 'petrol', [row], retrievedMs).freshness, 'unavailable');
  assert.equal(outletPriceView('mapped/a', 'petrol', [{ ...price, coverage: 'outlet-reported', observedAt: null }], retrievedMs)
    .price.coverage, 'outlet-reported');
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
