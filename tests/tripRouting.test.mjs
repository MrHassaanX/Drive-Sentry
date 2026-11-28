import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOsrmRouteUrl, createOsrmRoutingProvider, googleMapsDirectionsUrl, isValidCoordinate,
  MAX_ROUTE_WAYPOINTS, OSRM_DEMO_BASE_URL, parseOsrmResponse,
} from '../src/features/trips/routing.ts';

const source = { provider: 'FOSSGIS OSRM academic demo', attribution: '© OpenStreetMap contributors', calculatedAt: '2026-11-28T12:00:00.000Z' };
const mysuru = { latitude: 12.3052, longitude: 76.6552 };
const mandya = { latitude: 12.5239, longitude: 76.8955 };
const bengaluru = { latitude: 12.9716, longitude: 77.5946 };
const chennai = { latitude: 13.0827, longitude: 80.2707 };
const points = [mysuru, mandya, bengaluru];
const coordinates = [[76.6552, 12.3052], [76.66876, 12.325614], [76.8955, 12.5239],
  [77.41167, 12.840877], [77.5946, 12.9716]];
const route = { distance: 144326.2, duration: 7153.3, geometry: { type: 'LineString', coordinates } };
const payload = { code: 'Ok', routes: [route] };
const provider = (options = {}) => createOsrmRoutingProvider({ baseUrl: OSRM_DEMO_BASE_URL, name: source.provider, ...options });
const status = code => error => error.code === code;

test('routing accepts only finite geographic coordinates and bounds waypoint count', () => {
  assert.equal(isValidCoordinate(mysuru), true);
  assert.equal(isValidCoordinate({ latitude: -90, longitude: 180 }), true);
  for (const invalid of [null, [], {}, { latitude: Number.NaN, longitude: 75 }, { latitude: 91, longitude: 75 },
    { latitude: 12, longitude: -181 }, { latitude: '12', longitude: 75 }]) {
    assert.equal(isValidCoordinate(invalid), false);
  }
  assert.throws(() => buildOsrmRouteUrl(OSRM_DEMO_BASE_URL, [mysuru]), status('input'));
  assert.throws(() => buildOsrmRouteUrl(OSRM_DEMO_BASE_URL, [mysuru, mysuru]), status('input'));
  assert.throws(() => buildOsrmRouteUrl(OSRM_DEMO_BASE_URL, [...Array(MAX_ROUTE_WAYPOINTS + 1).fill(mandya), mysuru, bengaluru]), status('input'));
});

test('OSRM requests long-lat coordinates in input order and full driving geometry', () => {
  const multi = new URL(buildOsrmRouteUrl(OSRM_DEMO_BASE_URL, points));
  assert.equal(multi.pathname, '/routed-car/route/v1/driving/76.655200,12.305200;76.895500,12.523900;77.594600,12.971600');
  assert.equal(multi.searchParams.get('overview'), 'full');
  assert.equal(multi.searchParams.get('geometries'), 'geojson');
  assert.equal(multi.searchParams.get('alternatives'), 'false');
  assert.equal(multi.searchParams.get('radiuses'), '2000;2000;2000');
  assert.equal(new URL(buildOsrmRouteUrl(OSRM_DEMO_BASE_URL, [bengaluru, chennai])).searchParams.get('alternatives'), '2');
  for (const base of ['https://demo.example/?key=private', 'https://user:secret@demo.example', 'http://demo.example']) {
    assert.throws(() => buildOsrmRouteUrl(base, points), status('configuration'));
  }
});

test('parses OSRM distances, estimated durations, alternatives, and winding road geometry', () => {
  const results = parseOsrmResponse({ ...payload, routes: [route, { ...route, distance: 155106.1 }] }, source);
  assert.equal(results[0].distanceMetres, 144326.2);
  assert.equal(results[0].durationSeconds, 7153.3);
  assert.equal(results[0].geometry.length, coordinates.length);
  assert.deepEqual(results[0].geometry[0], mysuru);
  assert.deepEqual(results[0].geometry[2], mandya);
  assert.equal(results[0].provider, source.provider);
  assert.equal(results[0].calculatedAt, source.calculatedAt);
  assert.notEqual(results[0].id, results[1].id);
  assert.equal(results[1].distanceMetres, 155106.1);
});

test('rejects missing geometry, invalid vertices and nonpositive measurements', () => {
  for (const invalid of [{ ...route, distance: '144326.2' }, { ...route, distance: 0 }, { ...route, duration: Infinity },
    { ...route, geometry: { type: 'Point', coordinates: coordinates[0] } },
    { ...route, geometry: { type: 'LineString', coordinates: [[76, 12]] } },
    { ...route, geometry: { type: 'LineString', coordinates: [[76, 12], [190, 12]] } },
    { ...route, geometry: { type: 'LineString', coordinates: [[76, 12], [76, 12]] } }]) {
    assert.throws(() => parseOsrmResponse({ code: 'Ok', routes: [invalid] }, source), status('response'));
  }
  assert.throws(() => parseOsrmResponse({ code: 'Ok', routes: [] }, source), status('response'));
});

test('exposes provider errors without returning made-up road metrics', async () => {
  for (const code of ['NoRoute', 'NoSegment']) {
    await assert.rejects(provider({ fetcher: async () => Response.json({ code }, { status: 400 }) }).route(points), status('no-route'));
  }
  await assert.rejects(provider({ fetcher: async () => { throw Error('offline'); } }).route(points), status('network'));
  await assert.rejects(provider({ fetcher: async () => new Response('broken', { status: 200 }) }).route(points), status('response'));
});

test('rate limits requests and honors provider Retry-After without automatic retries', async () => {
  let now = 10_000;
  let calls = 0;
  const client = provider({
    now: () => now,
    fetcher: async (_, init) => {
      assert.match(init.headers['User-Agent'], /^DriveSentry\//);
      calls++;
      if (calls === 2) return new Response(null, { status: 429, headers: { 'Retry-After': '90' } });
      return Response.json(payload);
    },
  });
  await client.route(points);
  await assert.rejects(client.route(points), status('busy'));
  assert.equal(calls, 1);
  now += 1200;
  await assert.rejects(client.route(points), status('busy'));
  now += 89_999;
  await assert.rejects(client.route(points), status('busy'));
  assert.equal(calls, 2);
  now++;
  assert.equal((await client.route(points)).length, 1);
  assert.equal(calls, 3);
});

test('times out and cancels without waiting for a stuck transport', async () => {
  let signal;
  const fetcher = (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  await assert.rejects(provider({ fetcher, timeoutMs: 8 }).route(points), status('timeout'));
  assert.equal(signal.aborted, true);
  const controller = new AbortController();
  const request = provider({ fetcher }).route(points, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, status('aborted'));
  assert.equal(signal.aborted, true);
});

test('Google Maps gets driving mode and every supported waypoint in travel order', () => {
  const url = new URL(googleMapsDirectionsUrl([mysuru, mandya, bengaluru, chennai]));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  assert.equal(url.searchParams.get('origin'), '12.305200,76.655200');
  assert.equal(url.searchParams.get('destination'), '13.082700,80.270700');
  assert.equal(url.searchParams.get('waypoints'), '12.523900,76.895500|12.971600,77.594600');
  assert.throws(() => googleMapsDirectionsUrl([mysuru, mandya, bengaluru, chennai, mandya, mysuru]), /up to 3 intermediate stops/);
});
