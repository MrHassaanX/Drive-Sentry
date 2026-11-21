import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeoapifyClient, normalizeGeoapify } from '../src/features/stations/geoapify.ts';
import { nearby, normalize } from '../src/features/stations/provider.ts';
import { searchWithProvider } from '../src/features/stations/search.ts';

function feature(id, longitude, latitude, props = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: { place_id: id, ...props },
  };
}
const collection = (...features) => ({ type: 'FeatureCollection', features });
const centre = { latitude: 12.31, longitude: 76.66 };

test('Geoapify uses longitude-first geometry, deduplicates and leaves unknown metadata blank', () => {
  const mapped = feature('first', 76.67, 12.31, {
    name: 'Fixture station', formatted: 'Fixture address',
    datasource: { raw: { operator: 'Fixture operator', opening_hours: '24/7', 'fuel:diesel': 'yes', 'fuel:e0': 'no' } },
  });
  const items = normalizeGeoapify(collection(mapped, mapped, feature('second', 76.70, 12.31), feature('bad', 0, 91)));
  assert.deepEqual(items[0], {
    id: 'geoapify/first', longitude: 76.67, latitude: 12.31, name: 'Fixture station',
    address: 'Fixture address', brand: 'Fixture operator', hours: '24/7', fuels: 'diesel', fuelTags: ['fuel:diesel'], source: 'Geoapify',
  });
  assert.equal(items[1].name, 'Unnamed fuel station');
  assert.equal(items[1].fuels, '');
  assert.deepEqual(nearby(items, centre, 3).map(item => item.id), ['geoapify/first']);
  assert.deepEqual(nearby(items.reverse(), centre, 5).map(item => item.id), ['geoapify/first', 'geoapify/second']);
  assert.deepEqual(normalizeGeoapify(collection()), []);
  assert.throws(() => normalizeGeoapify({ elements: [] }), /invalid Places response/);
  assert.throws(() => normalizeGeoapify(collection(feature('bad', 181, 0))), /no usable station coordinates/);
});

test('Geoapify requests a rounded circle and proximity bias and caps offset pagination', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(new URL(url));
    return Response.json(collection(...Array.from({ length: 100 }, (_, i) =>
      feature(String((urls.length - 1) * 100 + i), 76.66, 12.31))));
  });
  const result = await createGeoapifyClient('test-key')('12.31,76.66', 10);
  assert.equal(result.source, 'Geoapify');
  assert.equal(result.limited, true);
  assert.equal(result.data.features.length, 200);
  assert.deepEqual(urls.map(url => url.searchParams.get('offset')), ['0', '100']);
  for (const url of urls) {
    assert.equal(url.origin + url.pathname, 'https://api.geoapify.com/v2/places');
    assert.equal(url.searchParams.get('categories'), 'service.vehicle.fuel');
    assert.equal(url.searchParams.get('filter'), 'circle:76.66,12.31,10800');
    assert.equal(url.searchParams.get('bias'), 'proximity:76.66,12.31');
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(url.searchParams.get('apiKey'), 'test-key');
  }
});

test('missing key avoids fetch and provider errors avoid leaking a key', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }));
  await assert.rejects(createGeoapifyClient(undefined)('12.31,76.66', 5), /key is required/);
  assert.equal(request.mock.callCount(), 0);
  const client = createGeoapifyClient('test-key');
  await assert.rejects(client('12.31,76.66', 5), /HTTP 401/);
  request.mock.mockImplementation(async url => { throw new Error(url); });
  await assert.rejects(client('12.31,76.66', 5), error => /could not connect/.test(error.message) && !error.message.includes('test-key'));
});

test('Geoapify cache and legacy Overpass cache stay isolated with stale source retained', async () => {
  const osm = { elements: [{ type: 'node', id: 42, lon: 76.66, lat: 12.31, tags: { amenity: 'fuel' } }] };
  const places = collection(feature('42', 76.66, 12.31));
  const fetched = new Date().toISOString();
  const rows = new Map([['12.31,76.66/5', { payload: JSON.stringify(osm), fetched }]]);
  const db = {
    getFirstAsync: async (_sql, key) => rows.get(key),
    runAsync: async (_sql, key, payload, savedAt) => { rows.set(key, { payload, fetched: savedAt }); },
    execAsync: async () => {},
  };
  const offline = async () => { throw new Error('offline'); };
  const provider = {
    cachePrefix: 'geoapify/', normalize: normalizeGeoapify,
    fetch: async () => ({ data: places, source: 'Geoapify' }),
  };
  const live = await searchWithProvider(db, centre, 5, provider);
  const cached = await searchWithProvider(db, centre, 5, { ...provider, fetch: offline }, true);
  const legacy = await searchWithProvider(db, centre, 5, { cachePrefix: '', normalize, fetch: offline });
  assert.equal(cached.stations[0].id, 'geoapify/42');
  assert.equal(cached.source, 'Geoapify');
  assert.equal(cached.fetched, live.fetched);
  assert.match(cached.status, /stale/);
  assert.equal(legacy.stations[0].id, 'node/42');
  assert.equal(legacy.source, 'OpenStreetMap');
});
