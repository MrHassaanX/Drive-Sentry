import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCorridorRequest, corridorStations, filterCorridorStations, insertFuelStops, projectOntoRoute,
  routedDetourMetres, searchTripCorridor,
} from '../src/features/trips/corridor.ts';

const point = (latitude, longitude) => ({ latitude, longitude });
const mysuru = point(12.2958, 76.6394);
const mandya = point(12.5223, 76.8976);
const maddur = point(12.5829, 77.0439);
const bengaluru = point(12.9716, 77.5946);
const hosur = point(12.7409, 77.8253);
const krishnagiri = point(12.5266, 78.2141);
const vellore = point(12.9165, 79.1325);
const chennai = point(13.0827, 80.2707);
const road = [mysuru, mandya, maddur, bengaluru, hosur, krishnagiri, vellore, chennai];

function station(id, where, fields = {}) {
  return { ...where, id, name: id, brand: '', address: '', fuels: '', hours: '', source: 'OpenStreetMap', ...fields };
}

test('projects to every road segment instead of matching the straight origin-to-destination chord', () => {
  const nearMandya = point(mandya.latitude + 0.008, mandya.longitude);
  const pointOnChord = point(12.53187, 77.72879);
  const local = projectOntoRoute(nearMandya, road);
  assert.ok(local.proximityKm < 1);
  assert.ok(local.alongKm > 25 && local.alongKm < 42);
  assert.ok(projectOntoRoute(pointOnChord, [mysuru, chennai]).proximityKm < 1);
  assert.ok(projectOntoRoute(pointOnChord, road).proximityKm > 10);
  assert.deepEqual(corridorStations([
    station('Vellore outlet', vellore),
    station('Remote outlet', pointOnChord),
    station('Mandya outlet', nearMandya),
  ], road, 3).map(candidate => candidate.station.id), ['Mandya outlet', 'Vellore outlet']);
});

test('bounds route projection at endpoints and handles wrapped longitudes and invalid geometry', () => {
  const short = [point(0, 179.97), point(0, -179.97)];
  const projection = projectOntoRoute(point(0.01, 180), short);
  assert.ok(Math.abs(projection.proximityKm - 1.112) < 0.01);
  assert.ok(Math.abs(projection.alongKm - 3.336) < 0.02);
  const beyond = projectOntoRoute(point(0, 179.95), short);
  assert.equal(beyond.alongKm, 0);
  assert.ok(beyond.proximityKm > 2.2);
  assert.equal(projectOntoRoute(mysuru, [point(91, 80), chennai]), undefined);
  assert.equal(projectOntoRoute(mysuru, [mysuru, mysuru]), undefined);
  assert.equal(projectOntoRoute(point(0, 181), short), undefined);
});

test('reuses outlet identity and filters explicit fuel, brand, proximity and premium evidence', () => {
  const shared = { osmRef: 'node/8', brand: 'IndianOil', fuelTags: ['fuel:xp95'] };
  const mapped = corridorStations([
    station('node/8', mandya, shared),
    station('geoapify/alias', mandya, { ...shared, source: 'Geoapify' }),
    station('cng', maddur, { fuelTags: ['fuel:cng'] }),
    station('mapped community claim', vellore, { fuelTags: ['fuel:e0'] }),
    station('diesel', hosur, { fuelTags: ['fuel:diesel'] }),
  ], road, 5);
  assert.equal(mapped.length, 4);
  assert.equal(filterCorridorStations(mapped, { fuel: 'petrol', brand: 'IndianOil', premium: 'premium' }).length, 1);
  assert.deepEqual(filterCorridorStations(mapped, { fuel: 'cng' }).map(item => item.station.id), ['cng']);
  assert.deepEqual(filterCorridorStations(mapped, { fuel: 'diesel' }).map(item => item.station.id), ['diesel']);
  assert.deepEqual(filterCorridorStations(mapped, { premium: 'e0' }), []);
  assert.deepEqual(filterCorridorStations(mapped.map(item => ({ ...item, proximityKm: 3 })), { maxProximityKm: 1 }), []);
});

test('bounds route requests geographically and labels sampled long routes', () => {
  const short = buildCorridorRequest(road.slice(0, 4), 3);
  assert.equal(short.partial, false);
  assert.match(short.query, /around:4000,12\.2958,76\.6394/);
  assert.match(short.query, /13?2\.9716,77\.5946|12\.9716,77\.5946/);
  const long = buildCorridorRequest(road, 5);
  assert.ok(long.lengthKm > 400);
  assert.equal(long.partial, true);
  assert.ok(long.mappedVertices <= 160);
  assert.ok(long.centres.length <= 36);
  assert.match(long.query, /\[maxsize:67108864\]/);
  assert.match(long.query, /out geom 1200/);
  assert.throws(() => buildCorridorRequest([point(99, 80), chennai], 5), /valid road route/);
});

test('inserts refuelling stops in road order and only compares actual routed metres', () => {
  const intermediate = [{ ...bengaluru, id: 'Requested Bengaluru stop' }, { ...vellore, id: 'Requested Vellore stop' }];
  const chosen = [{ ...krishnagiri, id: 'Krishnagiri pump' }, { ...mandya, id: 'Mandya pump' }];
  assert.deepEqual(insertFuelStops(road, intermediate, chosen).map(stop => stop.id), [
    'Mandya pump', 'Requested Bengaluru stop', 'Krishnagiri pump', 'Requested Vellore stop',
  ]);
  assert.equal(routedDetourMetres(147_832, 149_446), 1614);
  assert.equal(routedDetourMetres(147_832, 146_500), -1332);
  assert.equal(routedDetourMetres(147_832, NaN), undefined);
});

test('limits returned outlet selection and retains the route cache without using academic data in release', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    assert.match(url, /interpreter/);
    assert.equal(options.method, 'POST');
    assert.match(decodeURIComponent(options.body), /around:4000/);
    const elements = Array.from({ length: 1200 }, (_, index) => ({
      type: 'node', id: index + 1, lat: 12.2958 + index / 1e6, lon: 76.6394 + index / 1e6,
      tags: { amenity: 'fuel', name: 'Fixture ' + index },
    }));
    return Response.json({ elements });
  });
  const rows = new Map();
  const database = {
    getFirstAsync: async (_sql, key) => rows.get(key) ?? null,
    runAsync: async (_sql, key, payload, fetched) => { rows.set(key, { payload, fetched }); },
    execAsync: async () => undefined,
  };
  const geometry = road.slice(0, 4);
  const results = await searchTripCorridor(database, geometry, 3, 'release');
  assert.equal(results.candidates.length, 400);
  assert.equal(results.partial, true);
  assert.equal(results.sources.length, 1);
  assert.ok(results.candidates.every(item => item.retrievedAt && item.proximityKm <= 3));
  const reopened = await searchTripCorridor(database, geometry, 3, 'release');
  assert.match(reopened.messages.at(-1), /Previously retrieved/);
  assert.equal(calls.length, 1);

  const abort = new AbortController();
  abort.abort();
  await assert.rejects(searchTripCorridor(database, geometry, 3, 'release', abort.signal), /cancelled/);
});
