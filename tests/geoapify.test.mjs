import assert from 'node:assert/strict';
import test from 'node:test';
import { createAcademicAddressSearch, createAddressSearch, parsePlaces } from '../src/features/stations/geocoding.ts';
import { createGeoapifyClient, normalizeGeoapify } from '../src/features/stations/geoapify.ts';
import { nearby, normalize } from '../src/features/stations/provider.ts';
import { searchWithProvider } from '../src/features/stations/search.ts';
import { stationDisplay } from '../src/features/stations/displayName.ts';

function feature(id, longitude, latitude, props = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: { place_id: id, ...props },
  };
}
const collection = (...features) => ({ type: 'FeatureCollection', features });
const centre = { latitude: 12.31, longitude: 76.66 };

test('configured academic address lookup is explicit, India-scoped, identified and cached', async t => {
  const request = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.searchParams.get('q'), 'Mysuru');
    assert.equal(url.searchParams.get('countrycodes'), 'in');
    assert.match(options.headers['User-Agent'], /DriveSentry/);
    return Response.json([{ place_id: 1, display_name: 'Mysuru, India', lat: '12.31', lon: '76.66' }]);
  });
  const lookup = createAcademicAddressSearch('https://example.org/search');
  const results = await lookup('Mysuru');
  assert.deepEqual(results, [{ ...centre, id: '1', label: 'Mysuru, India' }]);
  assert.deepEqual(await lookup(' mysuru '), results);
  await assert.rejects(lookup('Bengaluru'), /busy/);
  assert.equal(request.mock.callCount(), 1);
});

test('address lookup is India-scoped, returns explicit choices and keeps keys out of errors', async t => {
  const candidate = { lat: 12.31, lon: 76.66, country_code: 'in', formatted: 'Mysuru, India', place_id: 'alpha' };
  const request = t.mock.method(globalThis, 'fetch', async uri => {
    const url = new URL(uri);
    assert.equal(url.pathname, '/v1/geocode/search');
    assert.equal(url.searchParams.get('filter'), 'countrycode:in');
    assert.equal(url.searchParams.get('text'), 'Mysuru');
    return Response.json({ results: [candidate, candidate, { ...candidate, country_code: 'us' }] });
  });
  const lookup = createAddressSearch('example-key');
  assert.deepEqual(await lookup(' Mysuru '), [{ ...centre, id: 'alpha', label: 'Mysuru, India' }]);
  assert.throws(() => parsePlaces({}), /unreadable/);
  assert.deepEqual(parsePlaces({ results: [{ ...candidate, lat: 93 }] }), []);
  request.mock.mockImplementation(async url => { throw new Error(url); });
  await assert.rejects(lookup('Mysuru'), error => /could not connect/.test(error.message) && !error.message.includes('example-key'));
});

test('Geoapify uses longitude-first geometry, deduplicates and leaves unknown metadata blank', () => {
  const mapped = feature('first', 76.67, 12.31, {
    name: 'Fixture station', formatted: 'Fixture address',
    datasource: { raw: { operator: 'Fixture operator', opening_hours: '24/7', 'fuel:diesel': 'yes', 'fuel:e0': 'no' } },
  });
  const items = normalizeGeoapify(collection(mapped, mapped, feature('second', 76.70, 12.31), feature('bad', 0, 91)));
  assert.deepEqual(items[0], {
    id: 'geoapify/first', longitude: 76.67, latitude: 12.31, name: 'Fixture station',
    address: 'Fixture address', brand: '', operator: 'Fixture operator', hours: '24/7', fuels: 'diesel', fuelTags: ['fuel:diesel'], source: 'Geoapify',
  });
  assert.equal(items[1].name, '');
  assert.equal(stationDisplay(items[1]).title, 'Fuel station');
  assert.equal(items[1].fuels, '');
  assert.deepEqual(nearby(items, centre, 3).map(item => item.id), ['geoapify/first']);
  assert.deepEqual(nearby(items.reverse(), centre, 5).map(item => item.id), ['geoapify/first', 'geoapify/second']);
  assert.deepEqual(normalizeGeoapify(collection()), []);
  assert.throws(() => normalizeGeoapify({ elements: [] }), /invalid Places response/);
  assert.throws(() => normalizeGeoapify(collection(feature('bad', 181, 0))), /no usable station coordinates/);
});

test('takes alternate names and sourced road or address without turning arbitrary metadata into a name', () => {
  const [alternate, brandOnly, addressOnly, blank] = normalizeGeoapify(collection(
    feature('a', 76.65, 12.31, { name: 'N/A', datasource: { raw: { alt_name: 'Vijaya Petrol Bunk' } } }),
    feature('b', 76.65, 12.31, { name: 'Indian Oil', brand: 'IOCL', street: 'Jhansi Lakshmibai Road' }),
    feature('c', 76.65, 12.31, { name: { translated: 'Unsupported' }, owner: 'Invented brand', formatted: 'Ring Road, Bogadi' }),
    feature('d', 76.65, 12.31, { name: 'Unnamed fuel station', street: 123, formatted: ['Unsupported'] }),
  )).map(stationDisplay);
  assert.deepEqual(alternate, { title: 'Vijaya Petrol Bunk', exact: true, secondary: '' });
  assert.deepEqual(brandOnly, { title: 'IndianOil · Jhansi Lakshmibai Road', exact: false, secondary: 'Jhansi Lakshmibai Road' });
  assert.deepEqual(addressOnly, { title: 'Fuel station', exact: false, secondary: 'Ring Road, Bogadi' });
  assert.deepEqual(blank, { title: 'Fuel station', exact: false, secondary: '' });
});

test('only requests bounded corroborating footprints, checks returned OSM identity and reuses valid geometry', async t => {
  const address = 'Ashoka Road, Mysuru 570001';
  const mapRecord = (kind, id, x, y) => feature(kind + id, x, y, {
    formatted: address, datasource: { raw: { osm_id: id, osm_type: kind } },
  });
  const outer = [[[76.6599, 12.3099], [76.6602, 12.3099], [76.6602, 12.3102], [76.6599, 12.3099]]];
  const request = t.mock.method(globalThis, 'fetch', async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/v2/places') return Response.json(collection(
      mapRecord('n', 10, 76.66002, 12.31), mapRecord('w', 20, 76.66003, 12.31),
      mapRecord('w', 30, 76.66007, 12.31), mapRecord('w', 40, 76.66008, 12.31),
    ));
    assert.equal(parsed.searchParams.get('features'), 'details.full_geometry');
    const wayId = parsed.searchParams.get('id') === 'w20' ? 20 : 999;
    const detail = mapRecord('w', wayId, 0, 0);
    detail.geometry = { type: 'Polygon', coordinates: outer };
    return Response.json(collection(detail));
  });
  const client = createGeoapifyClient('test-key');
  const result = await client('12.31,76.66', 5);
  assert.equal(request.mock.callCount(), 3);
  assert.deepEqual(result.data.outletFootprints, { 'way/20': outer });
  const stations = nearby(normalizeGeoapify(result.data), centre, 5);
  assert.equal(stations.length, 3);
  assert.equal(stations[0].references.length, 2);
  await client('12.31,76.66', 5);
  assert.equal(request.mock.calls.filter(call => new URL(call.arguments[0]).searchParams.get('id') === 'w20').length, 1);
});

test('older footprint-free cache entries are upgraded online and retained during offline fallback', async () => {
  const data = collection(feature('a', 76.66, 12.31));
  let row = { payload: JSON.stringify({ data, source: 'Geoapify' }), fetched: new Date(Date.now() - 1000).toISOString() };
  let online = false;
  let attempts = 0;
  const db = {
    getFirstAsync: async () => row,
    runAsync: async (_sql, _key, payload, fetched) => { row = { payload, fetched }; },
    execAsync: async () => {},
  };
  const provider = {
    cachePrefix: 'geoapify/', normalize: normalizeGeoapify,
    currentCache: data => 'outletFootprints' in data,
    fetch: async () => {
      attempts++;
      if (!online) throw new Error('offline');
      return { data: { ...data, outletFootprints: {} }, source: 'Geoapify' };
    },
  };
  const original = row.fetched;
  const stale = await searchWithProvider(db, centre, 5, provider);
  assert.match(stale.status, /Offline or stale/);
  assert.equal(stale.fetched, original);
  assert.equal(stale.stations[0].id, 'geoapify/a');
  online = true;
  assert.equal((await searchWithProvider(db, centre, 5, provider)).status, 'Updated results');
  assert.equal((await searchWithProvider(db, centre, 5, provider)).status, 'Saved results');
  assert.equal(attempts, 2);
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

test('new GPS areas change the Geoapify circle and stay isolated in offline fallback', async (t) => {
  const mysuru = { latitude: 12.305198, longitude: 76.655198 };
  const bengaluru = { latitude: 12.9716, longitude: 77.594598 };
  const circles = [];
  const request = t.mock.method(globalThis, 'fetch', async (uri) => {
    const circle = new URL(uri).searchParams.get('filter');
    circles.push(circle);
    return Response.json(circle === 'circle:76.66,12.31,5800'
      ? collection(feature('mysuru', mysuru.longitude, mysuru.latitude))
      : collection(feature('bengaluru', bengaluru.longitude, bengaluru.latitude)));
  });
  const rows = new Map();
  const db = {
    getFirstAsync: async (_sql, key) => rows.get(key),
    runAsync: async (_sql, key, payload, fetched) => { rows.set(key, { payload, fetched }); },
    execAsync: async () => {},
  };
  const provider = {
    cachePrefix: 'geoapify/', normalize: normalizeGeoapify, fetch: createGeoapifyClient('test-key'),
  };
  await searchWithProvider(db, mysuru, 5, provider);
  await searchWithProvider(db, bengaluru, 5, provider);
  assert.deepEqual(circles, ['circle:76.66,12.31,5800', 'circle:77.59,12.97,5800']);
  assert.deepEqual([...rows.keys()], ['geoapify/12.31,76.66/5', 'geoapify/12.97,77.59/5']);
  request.mock.mockImplementation(async () => { throw Error('Offline'); });
  for (const [point, id] of [[mysuru, 'mysuru'], [bengaluru, 'bengaluru']]) {
    const result = await searchWithProvider(db, point, 5, provider, true);
    assert.deepEqual(result.stations.map(station => station.id), ['geoapify/' + id]);
    assert.match(result.status, /Offline or stale/);
  }
});
