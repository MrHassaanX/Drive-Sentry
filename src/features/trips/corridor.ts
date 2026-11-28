import type { SQLiteDatabase } from 'expo-sqlite';
import { communityEvidence, listingEvidence, matchesPremium } from '../premium/evidence.ts';
import { stationBrand } from '../stations/brands.ts';
import { stationSupportsFuel } from '../stations/fuelAvailability.ts';
import { resolveOutlets, stationReferences } from '../stations/identity.ts';
import { distance, fresh, normalize, type Point, type Station } from '../stations/provider.ts';
import { fetchAcademicCorridorCatalogue, fetchCorridorOpenMap } from '../stations/search.ts';

export type CorridorRadius = 3 | 5;
export type CorridorFuel = 'petrol' | 'diesel' | 'cng';
export type CorridorProjection = { proximityKm: number; alongKm: number };
export type CorridorStation = CorridorProjection & { station: Station; retrievedAt?: string };
export type CorridorResult = { candidates: CorridorStation[]; sources: string[]; partial: boolean; messages: string[] };
type CorridorFilter = {
  fuel?: CorridorFuel;
  brand?: string;
  maxProximityKm?: number;
  premium?: 'premium' | 'e0';
};

const radians = Math.PI / 180;
const earthKm = 6371;
const maxResultStations = 400;
const maxMappedStations = 1200;
const maxQueryVertices = 160;
const maxQueryKm = 400;
type Vector = readonly [number, number, number];
type Segment = { start: Point; end: Point; a: Vector; tangent: Vector; angle: number; fromKm: number; lengthKm: number; minCorridorDot?: number };

function validPoint(point: Point) {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

function unit(point: Point): Vector {
  const latitude = point.latitude * radians;
  const longitude = point.longitude * radians;
  return [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
}

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

function segmentBetween(start: Point, end: Point, a: Vector, b: Vector, fromKm: number): Segment | undefined {
  const normal = cross(a, b);
  const norm = Math.hypot(...normal);
  if (norm < 1e-12) return;
  const angle = Math.atan2(norm, dot(a, b));
  const tangent = cross([normal[0] / norm, normal[1] / norm, normal[2] / norm], a);
  return { start, end, a, tangent, angle, fromKm, lengthKm: angle * earthKm };
}

function segmentsOf(geometry: readonly Point[]) {
  if (geometry.length < 2 || !geometry.every(validPoint)) return [];
  let fromKm = 0;
  let previous = unit(geometry[0]);
  const segments: Segment[] = [];
  for (let i = 1; i < geometry.length; i++) {
    const next = unit(geometry[i]);
    const segment = segmentBetween(geometry[i - 1], geometry[i], previous, next, fromKm);
    previous = next;
    if (segment) {
      segments.push(segment);
      fromKm += segment.lengthKm;
    }
  }
  return segments;
}

function onSegment(segment: Segment, angle: number): Vector {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const a = segment.a;
  const b = segment.tangent;
  return [a[0] * cosine + b[0] * sine, a[1] * cosine + b[1] * sine, a[2] * cosine + b[2] * sine];
}

function nearestOnSegment(point: Vector, segment: Segment): CorridorProjection {
  let angle = Math.atan2(dot(point, segment.tangent), dot(point, segment.a));
  if (angle < 0 || angle > segment.angle) {
    angle = dot(point, segment.a) >= dot(point, onSegment(segment, segment.angle)) ? 0 : segment.angle;
  }
  const nearest = onSegment(segment, angle);
  return {
    proximityKm: Math.atan2(Math.hypot(...cross(point, nearest)), dot(point, nearest)) * earthKm,
    alongKm: segment.fromKm + angle * earthKm,
  };
}

function project(point: Point, segments: readonly Segment[], maxKm = Infinity) {
  if (!validPoint(point)) return;
  let best: CorridorProjection | undefined;
  const vector = unit(point);
  for (const segment of segments) {
    // Latitude alone is a conservative lower bound on the distance to this arc.
    const latKm = Math.abs(point.latitude - segment.start.latitude) * radians * earthKm;
    if (latKm > segment.lengthKm + Math.min(maxKm, best?.proximityKm ?? Infinity)) continue;
    if (segment.minCorridorDot !== undefined && dot(vector, segment.a) < segment.minCorridorDot) continue;
    const result = nearestOnSegment(vector, segment);
    if (result.proximityKm <= maxKm && (!best || result.proximityKm < best.proximityKm)) best = result;
  }
  return best;
}

export function projectOntoRoute(point: Point, geometry: readonly Point[]) {
  return project(point, segmentsOf(geometry));
}

function coordAt(segment: Segment, km: number): Point {
  const [x, y, z] = onSegment(segment, (km - segment.fromKm) / earthKm);
  return { latitude: Math.atan2(z, Math.hypot(x, y)) / radians, longitude: Math.atan2(y, x) / radians };
}

function sampleSegments(segments: readonly Segment[], startKm: number, endKm: number) {
  const overlap = segments.filter(segment => segment.fromKm < endKm && segment.fromKm + segment.lengthKm > startKm);
  if (!overlap.length) return [];
  return [coordAt(overlap[0], startKm), ...overlap.slice(0, -1).map(segment => segment.end), coordAt(overlap.at(-1)!, endKm)];
}

function simplify(points: readonly Point[], toleranceKm: number) {
  if (points.length <= 2) return [...points];
  const keep = new Set([0,points.length - 1]);
  const pending = [[0,points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const straight = segmentBetween(points[start], points[end], unit(points[start]), unit(points[end]), 0);
    let split = start;
    let furthest = toleranceKm;
    for (let i = start + 1; i < end; i++) {
      const deviation = straight ? nearestOnSegment(unit(points[i]), straight).proximityKm : distance(points[start], points[i]);
      if (deviation > furthest) {
        split = i;
        furthest = deviation;
      }
    }
    if (split === start) continue;
    keep.add(split);
    if (split - start > 1) pending.push([start, split]);
    if (end - split > 1) pending.push([split, end]);
  }
  return points.filter((_, index) => keep.has(index));
}

export function buildCorridorRequest(geometry: readonly Point[], radiusKm: CorridorRadius) {
  if (radiusKm !== 3 && radiusKm !== 5) throw Error('Choose a route corridor of 3 or 5 km.');
  const segments = segmentsOf(geometry);
  const last = segments.at(-1);
  if (!last) throw Error('A valid road route is required for station discovery.');
  const lengthKm = last.fromKm + last.lengthKm;
  const sampleCount = lengthKm <= maxQueryKm ? 1 : 6;
  const sectionKm = sampleCount === 1 ? lengthKm : maxQueryKm / sampleCount;
  const sections = Array.from({ length: sampleCount }, (_, index) => {
    const start = sampleCount === 1 ? 0 : index * (lengthKm - sectionKm) / (sampleCount - 1);
    return { start, end: start + sectionKm };
  });
  let partial = sampleCount > 1;
  const paths: Point[][] = [];
  const centres: Point[] = [];
  let usedVertices = 0;
  for (const { start, end } of sections) {
    const source = sampleSegments(segments, start, end);
    const path = simplify(source, 0.9);
    if (usedVertices + path.length <= maxQueryVertices) {
      paths.push(path);
      usedVertices += path.length;
    } else {
      partial = true;
    }
    const centreCount = Math.max(1, Math.ceil((end - start) / 20));
    for (let i = 0; i <= centreCount; i++) {
      const km = start + (end - start) * i / centreCount;
      const segment = segments.find(item => km <= item.fromKm + item.lengthKm) ?? last;
      centres.push(coordAt(segment, km));
    }
  }
  // The 1 km request margin covers simplification and coordinate rounding.
  // Every displayed result is later tested against the original full geometry.
  const filters = paths.map(path => path.map(point =>
    point.latitude.toFixed(4) + ',' + point.longitude.toFixed(4)).join(','))
    .map(path => 'nwr["amenity"="fuel"](around:' + (radiusKm + 1) * 1000 + ',' + path + ');');
  const query = filters.length ? '[out:json][timeout:12][maxsize:67108864];(' + filters.join('') +
    ');out geom ' + maxMappedStations + ';' : undefined;
  return { centres, partial, query, mappedVertices: usedVertices, lengthKm };
}

export function corridorStations(stations: readonly Station[], geometry: readonly Point[], radiusKm: CorridorRadius) {
  const segments = segmentsOf(geometry).map(segment => ({
    ...segment, minCorridorDot: Math.cos(Math.min(Math.PI, segment.angle + radiusKm / earthKm)) - 1e-12,
  }));
  const within = stations.filter(station => !!project(station, segments, radiusKm));
  return resolveOutlets(within, distance).flatMap(station => {
    const position = project(station, segments, radiusKm);
    return position ? [{ station, ...position, retrievedAt: station.outletListing?.retrievedAt }] : [];
  }).sort((a, b) => a.alongKm - b.alongKm || a.proximityKm - b.proximityKm);
}

export function filterCorridorStations(candidates: readonly CorridorStation[], filters: CorridorFilter) {
  return candidates.filter(({ station, proximityKm, retrievedAt }) => {
    if (filters.brand && stationBrand(station) !== filters.brand) return false;
    if (filters.maxProximityKm !== undefined && proximityKm > filters.maxProximityKm) return false;
    if (filters.fuel === 'cng' && !stationReferences(station).some(reference =>
      reference.fuelTags?.some(tag => /^fuel:(cng|compressed_natural_gas)$/i.test(tag)))) return false;
    if (filters.fuel === 'petrol' && !stationSupportsFuel(station, 'Petrol')) return false;
    if (filters.fuel === 'diesel' && !stationSupportsFuel(station, 'Diesel')) return false;
    return !filters.premium || matchesPremium(filters.premium, [
      ...communityEvidence(station, retrievedAt ?? ''),
      ...listingEvidence(station),
    ]);
  });
}

export function insertFuelStops<T extends Point>(geometry: readonly Point[], intermediate: readonly T[], chosen: readonly T[]) {
  const segments = segmentsOf(geometry);
  const waiting = chosen.map((point, index) => ({ point, index, km: project(point, segments)?.alongKm ?? Infinity }))
    .sort((a, b) => a.km - b.km || a.index - b.index);
  const ordered: T[] = [];
  let next = 0;
  for (const stop of intermediate) {
    const km = project(stop, segments)?.alongKm ?? Infinity;
    while (next < waiting.length && waiting[next].km < km) ordered.push(waiting[next++].point);
    ordered.push(stop);
  }
  return ordered.concat(waiting.slice(next).map(item => item.point));
}

export function routedDetourMetres(originalMetres: number, revisedMetres: number) {
  if (![originalMetres, revisedMetres].every(value => Number.isFinite(value) && value > 0)) return;
  return revisedMetres - originalMetres;
}

function cacheId(geometry: readonly Point[], radius: CorridorRadius, academic: boolean) {
  let hash = 2166136261;
  let second = 5381;
  for (const point of geometry) {
    for (const coordinate of [point.latitude, point.longitude]) {
      const value = Math.round(coordinate * 1e6);
      hash = Math.imul(hash ^ value, 16777619);
      second = Math.imul(second, 33) ^ value;
    }
  }
  const endpoint = process.env.EXPO_PUBLIC_OVERPASS_URL ? 'configured' : 'asia';
  return ['trip-corridor-v1', academic ? 'academic' : 'mapped', endpoint, radius, geometry.length,
    (hash >>> 0).toString(16), (second >>> 0).toString(16)].join('/');
}

async function readSaved(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ payload: string; fetched: string }>(
    'SELECT payload, fetched FROM station_search_cache WHERE area_radius = ?', key);
  if (!row) return;
  try {
    const saved = JSON.parse(row.payload) as CorridorResult;
    if (Array.isArray(saved?.candidates) && Array.isArray(saved.sources) && Array.isArray(saved.messages) &&
        typeof saved.partial === 'boolean') return { result: saved, fetched: row.fetched };
  } catch { /* A corrupt cache row can be refreshed. */ }
}

export async function searchTripCorridor(db: SQLiteDatabase, geometry: readonly Point[], radiusKm: CorridorRadius,
  profile: unknown, signal?: AbortSignal): Promise<CorridorResult> {
  const request = buildCorridorRequest(geometry, radiusKm);
  const academic = profile === 'academic-testing';
  const key = cacheId(geometry, radiusKm, academic);
  const saved = await readSaved(db, key);
  if (signal?.aborted) throw Error('Station search cancelled.');
  if (saved && (saved.result.partial ? Date.now() - Date.parse(saved.fetched) < 60000 : fresh(saved.fetched))) {
    return { ...saved.result, messages: [...saved.result.messages, 'Previously retrieved station results.'] };
  }
  const lookups = [];
  if (request.query) {
    lookups.push(fetchCorridorOpenMap(request.query, signal).then(result => {
      const data = normalize(result.data);
      return { ...result, data, partial: data.length >= maxMappedStations };
    }));
  }
  if (academic) lookups.push(fetchAcademicCorridorCatalogue(request.centres, signal));
  const results = await Promise.allSettled(lookups);
  if (signal?.aborted) throw Error('Station search cancelled.');
  const fetched = new Date().toISOString();
  const found = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const messages = request.partial ? ['Coverage is limited to sampled sections of this road route.'] : [];
  if (!found.length) {
    if (saved) return { ...saved.result, partial: true, messages: [...saved.result.messages, 'Showing saved stations. A fresh search was unavailable.'] };
    return { candidates: [], sources: [], partial: true, messages: [
      ...messages, 'Station coverage is currently unavailable. The road route can still be used.',
    ] };
  }
  if (found.length < results.length) messages.push('Some station sources were unavailable.');
  if (found.some(result => result.partial)) messages.push('A station source returned limited coverage.');
  const matching = corridorStations(found.flatMap(result => result.data), geometry, radiusKm);
  if (matching.length > maxResultStations) messages.push('Showing a limited station selection distributed along the route.');
  const candidates = (matching.length > maxResultStations
    ? Array.from({ length: maxResultStations }, (_, index) => matching[Math.round(index * (matching.length - 1) / (maxResultStations - 1))])
    : matching).map(candidate => ({ ...candidate, retrievedAt: candidate.retrievedAt ?? fetched }));
  const result = {
    candidates, sources: found.map(feed => feed.source),
    partial: request.partial || found.length < results.length || found.some(feed => feed.partial) || matching.length > maxResultStations,
    messages,
  };
  // Keep route lookups in the existing Fuel Map cache and share its retention bound.
  if (!saved || !result.partial || saved.result.partial || !fresh(saved.fetched)) {
    await db.runAsync('INSERT OR REPLACE INTO station_search_cache(area_radius, payload, fetched) VALUES (?, ?, ?)', key,
      JSON.stringify(result), fetched);
    await db.execAsync(`DELETE FROM station_search_cache WHERE area_radius IN (
      SELECT area_radius FROM station_search_cache ORDER BY fetched DESC LIMIT -1 OFFSET 20
    )`);
  }
  return result;
}
