import assert from 'node:assert/strict';
import test from 'node:test';
import { grades } from '../src/features/premium/catalog.ts';
import { communityEvidence, evidenceForStation, gradeName, matchesPremium, verifiedE0 } from '../src/features/premium/evidence.ts';
import { createGeoapifyClient, normalizeGeoapify } from '../src/features/stations/geoapify.ts';
import { distance, nearby } from '../src/features/stations/provider.ts';
import { searchWithProvider } from '../src/features/stations/search.ts';

const now = Date.parse('2026-11-21T06:00:00Z');
const fetched = new Date(now).toISOString();
const point = { latitude: 12.31, longitude: 76.66 };
function fixture(id, raw) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
    properties: { place_id: id, brand: 'HPCL', name: 'Fixture petrol pump', datasource: { raw } },
  };
}
const collection = (...features) => ({ type: 'FeatureCollection', features });

test('catalog separates official octane data from unverified figures', () => {
  assert.equal(grades.xp95.octane, 95);
  assert.equal(grades.power100.octane, 100);
  assert.equal(grades.speed.octane, null);
  assert.equal(grades.speed100.octane, 100);
});

test('normalizes real tag shapes without inferring named grades, E0 or availability from brand', () => {
  const payload = collection(
    fixture('1', { osm_type: 'n', osm_id: 42, 'fuel:octane_100': 'yes', 'fuel:power100': 'no', 'fuel:e0': 'yes' }),
    fixture('2', { osm_type: 'w', osm_id: 'unsafe/path', 'fuel:octane_100': 'unknown', 'fuel:poWer100': 'yes' }),
    fixture('3', {}),
  );
  const stations = normalizeGeoapify(payload);
  const first = communityEvidence(stations[0], fetched);
  assert.deepEqual(first.map(item => item.grade), ['octane100', 'unspecified']);
  assert.equal(gradeName(first[0].grade), '100 octane · brand unspecified');
  assert.equal(first[0].source.url, 'https://www.openstreetmap.org/node/42');
  assert.equal(first[0].source.verifiedOn, null);
  assert.equal(matchesPremium('power100', first, now), false);
  assert.equal(matchesPremium('speed100', first, now), false);
  assert.equal(matchesPremium('e0', first, now), false);
  assert.equal(matchesPremium('power100', communityEvidence(stations[1], fetched), now), true);
  assert.equal(communityEvidence(stations[1], fetched)[0].source.publisher, 'Geoapify source tags');
  assert.equal(stations[1].osmRef, undefined);
  assert.deepEqual(communityEvidence(stations[2], fetched), []);
  assert.equal(matchesPremium('stations', [], now), true);
  assert.equal(matchesPremium('premium', [], now), false);
});

test('only fresh, linked and explicit official ethanol proof enables the verified E0 filter', () => {
  const outlet = { url: grades.power100.url, publisher: grades.power100.company, sourceRecordId: 'fixture-outlet', verifiedOn: '2026-11-20' };
  const item = { stationId: 'fixture', grade: 'power100', availability: 'official', source: outlet, retrievedAt: fetched };
  const composition = { ...outlet, sourceRecordId: 'fixture-composition', ethanol: 'e0', scope: 'product', outletGradeRecordId: 'fixture-outlet' };
  assert.equal(verifiedE0(item, now), false);
  assert.equal(verifiedE0({ ...item, composition }, now), true);
  assert.equal(matchesPremium('e0', [{ ...item, composition }], now), true);
  assert.equal(verifiedE0({ ...item, availability: 'community', composition }, now), false);
  assert.equal(verifiedE0({ ...item, composition: { ...composition, verifiedOn: '2026-04-01' } }, now), false);
  assert.equal(verifiedE0({ ...item, composition: { ...composition, verifiedOn: '2026-02-31' } }, now), false);
  assert.equal(verifiedE0({ ...item, composition: { ...composition, outletGradeRecordId: 'someone-else' } }, now), false);
  assert.equal(verifiedE0({ ...item, composition: { ...composition, url: 'https://hindustanpetroleum.com.example.org/' } }, now), false);
});

test('deduplicates source records while keeping same-name pump identities at the same coordinates distinct', () => {
  const mapped = normalizeGeoapify(collection(
    fixture('a', { 'fuel:speed_97': 'yes', 'fuel:speed97': 'yes', 'fuel:speed_100': 'yes' }),
    fixture('b', {}),
    fixture('a', {}),
  ));
  assert.equal(mapped.length, 2);
  assert.equal(distance(mapped[0], mapped[1]), 0);
  const evidence = communityEvidence(mapped[0], fetched);
  assert.equal(evidence.length, 2);
  assert.equal(evidenceForStation(mapped[0], [...evidence, ...evidence]).length, 2);
  assert.deepEqual(evidenceForStation(mapped[1], evidence), []);
  assert.equal(matchesPremium('speed-family', evidence, now), true);
  assert.equal(matchesPremium('speed100', evidence, now), true);
});

test('wide Places request is bounded, while true distance still controls the map radius', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => Response.json(collection(fixture('wide', {}))));
  await createGeoapifyClient('test-key')('12.31,76.66', 50);
  const query = new URL(mocked.mock.calls[0].arguments[0]).searchParams;
  assert.equal(query.get('filter'), 'circle:76.66,12.31,50800');
  assert.equal(query.get('limit'), '100');
  assert.equal(mocked.mock.callCount(), 1);
  const [station] = normalizeGeoapify(collection(fixture('near', {})));
  assert.deepEqual(nearby([{ ...station, latitude: 12.61 }], point, 25), []);
  assert.equal(nearby([{ ...station, latitude: 12.61 }], point, 50).length, 1);
});

test('offline stale cache preserves community provenance without promoting it to verified E0', async () => {
  const data = collection(fixture('cached', { osm_type: 'n', osm_id: 70, 'fuel:octane_95': 'yes', 'fuel:e0': 'yes' }));
  const database = {
    getFirstAsync: async (_query, key) => {
      assert.equal(key, 'geoapify/12.31,76.66/25');
      return { payload: JSON.stringify({ source: 'Geoapify', data }), fetched };
    },
  };
  const result = await searchWithProvider(database, point, 25, {
    cachePrefix: 'geoapify/', normalize: normalizeGeoapify,
    fetch: async () => { throw Error('offline'); },
  }, true);
  assert.match(result.status, /Offline or stale/);
  assert.equal(result.fetched, fetched);
  const mapped = communityEvidence(result.stations[0], result.fetched);
  assert.equal(mapped[0].retrievedAt, fetched);
  assert.equal(matchesPremium('e0', mapped, now), false);
  assert.equal(matchesPremium('premium', mapped, now), true);
  assert.throws(() => normalizeGeoapify({ type: 'FeatureCollection', features: [{ invalid: true }] }), /no usable/);
});
