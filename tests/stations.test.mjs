import assert from 'node:assert/strict';
import test from 'node:test';
import { distance, normalize, nearby, searchArea, fresh, createOverpassClient, fetchArea } from '../src/features/stations/provider.ts';
import { searchWithProvider } from '../src/features/stations/search.ts';
import { groupMapMarkers } from '../src/features/stations/mapMarkers.ts';
import { stationBrand } from '../src/features/stations/brands.ts';

const searchStations = (db, origin, radius, refresh) => searchWithProvider(db, origin, radius, { cachePrefix: "", normalize, fetch: fetchArea }, refresh);

const origin = { latitude:0, longitude:0 };
const tags = {amenity:'fuel'};
const node = {type:'node',id:7,lat:0,lon:0.02,tags};
const way = {type:'way',id:7,center:{lat:0,lon:0.01},tags:{...tags,brand:'Fixture','fuel:diesel':'yes'}};
const fixture = {elements:[node,node,way,{...way,type:'relation',center:{lat:0,lon:0.08}}]};

test('Haversine and exact radius order preserve distinct OSM objects',()=>{
  assert.ok(Math.abs(distance(origin,{latitude:0,longitude:1})-111.195)<0.001);
  const stations=normalize(fixture);
  assert.deepEqual(nearby(stations,origin,3).map(s=>s.id),['way/7','node/7']);
  assert.equal(nearby(stations,origin,10).length,3);
  assert.equal(stations[0].name,'Unnamed fuel station');
  assert.equal(stations[0].fuels,'');
  assert.equal(stations[1].fuels,'diesel');
  assert.deepEqual(normalize({elements:[]}),[]);
  for(const invalid of [null,{}, {elements:[],remark:'timeout'}, {elements:[{...node,lat:91}]}]) assert.throws(()=>normalize(invalid));
});

test('deduplicates corroborated source identities while nearby pumps of the same brand stay separate', () => {
  const [first] = normalize(fixture);
  const outlet = { ...first, id: 'geoapify/1', brand: 'Indian Oil' };
  const copy = { ...outlet, id: 'geoapify/2', latitude: outlet.latitude + 0.0001 };
  const nearbyPump = { ...copy, id: 'geoapify/3', osmRef: 'way/2' };
  const conflictingCoordinates = { ...copy, id: 'geoapify/4', latitude: outlet.latitude + 0.001 };
  assert.deepEqual(nearby([outlet, outlet, copy, nearbyPump, conflictingCoordinates], origin, 3)
    .map(station => station.id), ['geoapify/1', 'geoapify/3', 'geoapify/4']);
  assert.equal(stationBrand(outlet), 'IndianOil');
  assert.equal(stationBrand({ ...outlet, brand: 'IOCL' }), 'IndianOil');
  assert.equal(stationBrand({ ...outlet, brand: '', name: 'IndianOil' }), '');
});

test('clustering preserves membership and always keeps the selected outlet individually visible', () => {
  const [first] = normalize(fixture);
  const close = { ...first, id: 'node/8', longitude: first.longitude + 0.001 };
  const far = { ...first, id: 'node/9', longitude: first.longitude + 0.1 };
  const wide = { latitudeDelta: 0.08, longitudeDelta: 0.09 };
  const markers = groupMapMarkers([first, close, far], wide);
  assert.deepEqual(markers.map(marker => marker.kind), ['cluster', 'station']);
  assert.deepEqual(markers[0].members.map(station => station.id), [first.id, close.id]);
  assert.ok(markers[0].center.longitude > first.longitude && markers[0].center.longitude < close.longitude);
  assert.equal(groupMapMarkers([first, close, far], wide, first.id).length, 3);
  assert.equal(groupMapMarkers([first, close, far], { latitudeDelta: 0.003, longitudeDelta: 0.003 }).length, 3);
});

test('cache is isolated by area/radius and stale results survive network errors',async(t)=>{
  let calls=0;
  const originKey=searchArea(origin)+'/3';
  const row={payload:JSON.stringify(fixture),fetched:new Date().toISOString()};
  const db={getFirstAsync:async(_,key)=>key===originKey ? row : null};
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('offline');});
  assert.equal((await searchStations(db,origin,3)).status,'Saved results');
  assert.equal(calls,0);
  row.fetched='2000-01-01T00:00:00Z';
  assert.equal(fresh(row.fetched),false);
  assert.match((await searchStations(db,origin,3)).status,/stale.*network connection failed/);
  await assert.rejects(searchStations(db,origin,5));
});

const endpoints = [
  { name: 'Primary', url: 'https://primary.example/interpreter' },
  { name: 'Fallback', url: 'https://fallback.example/interpreter' },
];

test('form POST falls back once on HTTP 406 and skips the rejecting provider during cooldown', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    calls.push(url);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.match(request.headers['User-Agent'], /DriveSentry/);
    assert.equal(new URLSearchParams(request.body).get('data'),
      '[out:json][timeout:12];nwr["amenity"="fuel"](around:3800,12.31,76.66);out center;');
    return url === endpoints[0].url ? new Response(null, { status: 406 }) : Response.json(fixture);
  });
  const client = createOverpassClient(endpoints);
  assert.deepEqual(await client('12.31,76.66', 3), { data: fixture, source: 'Fallback' });
  now += 5000;
  await client('12.31,76.66', 3);
  assert.deepEqual(calls, [endpoints[0].url, endpoints[1].url, endpoints[1].url]);
});

test('HTTP 429 respects Retry-After and has distinct diagnostics from HTTP 406', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const response = t.mock.method(globalThis, 'fetch', async () =>
    new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
  const client = createOverpassClient(endpoints.slice(0, 1));
  await assert.rejects(client('0,0', 3), /rate limited \(HTTP 429\)/);
  now += 61000;
  await assert.rejects(client('0,0', 3), /cooldown/);
  assert.equal(response.mock.callCount(), 1);
});

test('distinguishes timeouts, server errors and incomplete responses', async (t) => {
  const client = createOverpassClient(endpoints);
  t.mock.method(globalThis, 'fetch', async url => url === endpoints[0].url
    ? new Response(null, { status: 502 })
    : Response.json({ elements: [], remark: 'query timed out on server' }));
  await assert.rejects(client('0,0', 3), /Primary: HTTP 502.*Fallback: invalid or incomplete response/);
  t.mock.method(globalThis, 'setTimeout', callback => { callback(); return 0; });
  t.mock.method(globalThis, 'fetch', async (_, request) => {
    assert.equal(request.signal.aborted, true);
    throw Error('aborted');
  });
  await assert.rejects(createOverpassClient(endpoints.slice(0, 1))('0,0', 3), /request timed out/);
});

test('a successful provider response is sorted and restores its source and timestamp offline', async (t) => {
  let now = 2000000000000;
  t.mock.method(Date, 'now', () => now);
  const request = t.mock.method(globalThis, 'fetch', async () => Response.json(fixture));
  let saved;
  const db = {
    getFirstAsync: async (_query, key) => key === saved?.key ? saved : null,
    runAsync: async (_query, key, payload, fetched) => { saved = { key, payload, fetched }; },
    execAsync: async () => {},
  };
  const result = await searchStations(db, origin, 5);
  assert.deepEqual(result.stations.map(station => station.id), ['way/7', 'node/7']);
  assert.equal(saved.key, '0.00,0.00/5');
  assert.deepEqual(JSON.parse(saved.payload), { data: fixture, source: result.source });
  assert.equal(saved.fetched, result.fetched);
  request.mock.mockImplementation(async () => { throw new TypeError('Offline'); });
  now += 5000;
  const restored = await searchStations(db, origin, 5, true);
  assert.match(restored.status, /Offline or stale/);
  assert.equal(restored.fetched, result.fetched);
  assert.equal(restored.source, result.source);
  assert.deepEqual(restored.stations, result.stations);
});
