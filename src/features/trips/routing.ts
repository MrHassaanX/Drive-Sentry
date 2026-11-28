import { validLocation } from '../stations/deviceLocation.ts';
import type { Point } from '../stations/provider.ts';

export type Coordinates = Point;
export type TripRoute = {
  id: string;
  distanceMetres: number;
  durationSeconds: number;
  geometry: Coordinates[];
  provider: string;
  attribution: string;
  calculatedAt: string;
};

export type RoutingOptions = { signal?: AbortSignal; alternatives?: boolean };
export type RoutingProvider = {
  readonly name: string;
  readonly attribution: string;
  route(points: readonly Coordinates[], options?: RoutingOptions): Promise<TripRoute[]>;
};

type ErrorCode = 'aborted' | 'busy' | 'configuration' | 'input' | 'network' | 'no-route' | 'provider' | 'response' | 'timeout';

export class TripRoutingError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'TripRoutingError';
  }
}

export const MAX_ROUTE_WAYPOINTS = 8;
export const MAX_ROUTE_GEOMETRY_POINTS = 50_000;
export const GOOGLE_MAPS_MOBILE_WAYPOINTS = 3;
export const OSRM_DEMO_NAME = 'FOSSGIS OSRM academic demo';
export const OSRM_DEMO_BASE_URL = 'https://routing.openstreetmap.de/routed-car';
export const OPENSTREETMAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
export const OPENSTREETMAP_FIX_MAP_URL = 'https://www.openstreetmap.org/fixthemap';
const attribution = '© OpenStreetMap contributors';
const userAgent = 'DriveSentry/3.0 (+https://github.com/MrHassaanX/Drive-Sentry)';

export function isValidCoordinate(value: unknown): value is Coordinates {
  return !!value && typeof value === 'object' && !Array.isArray(value) && validLocation(value as Coordinates);
}

function validatePoints(points: readonly Coordinates[], intermediateLimit: number, label: string) {
  if (points.length > intermediateLimit + 2) {
    throw new TripRoutingError('input', label + ' supports up to ' + intermediateLimit + ' intermediate stops.');
  }
  if (points.length < 2 || !Array.from(points).every(isValidCoordinate)) {
    throw new TripRoutingError('input', 'Choose valid coordinates for the start, destination and each stop.');
  }
}

function coordinateText(point: Coordinates, order: 'lat-first' | 'lon-first') {
  const latitude = point.latitude.toFixed(6);
  const longitude = point.longitude.toFixed(6);
  return order === 'lat-first' ? latitude + ',' + longitude : longitude + ',' + latitude;
}

export function googleMapsDirectionsUrl(points: readonly Coordinates[]) {
  validatePoints(points, GOOGLE_MAPS_MOBILE_WAYPOINTS, 'Google Maps mobile links');
  const [origin, ...rest] = points.map(point => coordinateText(point, 'lat-first'));
  const destination = rest.pop()!;
  const query = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (rest.length) query.set('waypoints', rest.join('|'));
  const url = 'https://www.google.com/maps/dir/?' + query;
  if (url.length > 2048) throw new TripRoutingError('input', 'The Google Maps link is too long for these stops.');
  return url;
}

export function buildOsrmRouteUrl(baseUrl: string, points: readonly Coordinates[], alternatives = true) {
  validatePoints(points, MAX_ROUTE_WAYPOINTS, 'Trip planning');
  let url: URL;
  try {
    url = new URL(baseUrl);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) throw Error();
  } catch {
    throw new TripRoutingError('configuration', 'Configure an HTTPS OSRM base URL without credentials or query parameters.');
  }
  const positions = points.map(point => coordinateText(point, 'lon-first'));
  if (positions.every(position => position === positions[0])) {
    throw new TripRoutingError('input', 'Choose different trip locations before requesting a route.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/route/v1/driving/' + positions.join(';');
  url.search = new URLSearchParams({
    overview: 'full', geometries: 'geojson', steps: 'false', generate_hints: 'false',
    alternatives: alternatives && points.length === 2 ? '2' : 'false',
    radiuses: positions.map(() => '2000').join(';'),
  }).toString();
  return url.toString();
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new TripRoutingError('response', 'The route provider returned incomplete or invalid driving directions.');
}

export function parseOsrmResponse(
  payload: unknown, source: Pick<TripRoute, 'provider' | 'attribution' | 'calculatedAt'>,
): TripRoute[] {
  if (!record(payload)) return invalidResponse();
  if (payload.code === 'NoRoute' || payload.code === 'NoSegment') {
    throw new TripRoutingError('no-route', 'No driving route found. Try moving the start or stops closer to a drivable road.');
  }
  if (payload.code === 'TooBig') {
    throw new TripRoutingError('provider', 'The route provider cannot calculate a trip this large. Try fewer stops or split the trip.');
  }
  if (payload.code !== 'Ok' || !Array.isArray(payload.routes) || !payload.routes.length) return invalidResponse();
  return payload.routes.slice(0, 3).map((route: unknown, index) => {
    if (!record(route) || typeof route.distance !== 'number' || !Number.isFinite(route.distance) ||
        route.distance <= 0 || typeof route.duration !== 'number' || !Number.isFinite(route.duration) ||
        route.duration <= 0 || !record(route.geometry) || route.geometry.type !== 'LineString' ||
        !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 ||
        route.geometry.coordinates.length > MAX_ROUTE_GEOMETRY_POINTS) return invalidResponse();
    const geometry = route.geometry.coordinates.map((position: unknown): Coordinates => {
      if (!Array.isArray(position) || position.length !== 2) return invalidResponse();
      const coordinate = { longitude: position[0], latitude: position[1] };
      if (!isValidCoordinate(coordinate)) return invalidResponse();
      return coordinate;
    });
    if (geometry.every(point => point.latitude === geometry[0].latitude && point.longitude === geometry[0].longitude)) {
      return invalidResponse();
    }
    return { ...source, id: 'route-' + (index + 1), distanceMetres: route.distance, durationSeconds: route.duration, geometry };
  });
}

function retryAfter(header: string | null, now: number) {
  if (!header?.trim()) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  return Math.max(0, Date.parse(header) - now) || 0;
}

type OsrmConfig = {
  baseUrl: string;
  name: string;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

export function createOsrmRoutingProvider({
  baseUrl, name, fetcher = fetch, now = Date.now, timeoutMs = 15_000,
}: OsrmConfig): RoutingProvider {
  let pending = false;
  let nextRequest = Number.NEGATIVE_INFINITY;
  return {
    name,
    attribution,
    async route(points, options = {}) {
      const { signal, alternatives = true } = options;
      const abortError = new TripRoutingError('aborted', 'Route request cancelled.');
      if (signal?.aborted) throw abortError;
      const url = buildOsrmRouteUrl(baseUrl, points, alternatives);
      if (pending || now() < nextRequest) {
        throw new TripRoutingError('busy', 'The route service is busy. Wait a moment before trying again.');
      }
      pending = true;
      nextRequest = now() + 1200;
      const controller = new AbortController();
      let rejectInterrupted: (error: TripRoutingError) => void = () => {};
      const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
      function interrupt(error: TripRoutingError) {
        rejectInterrupted(error);
        controller.abort();
      }
      const onAbort = () => interrupt(abortError);
      const timer = setTimeout(() => {
        interrupt(new TripRoutingError('timeout', 'The route request timed out. Check your connection or try later.'));
      }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });

      const request = async () => {
        let response: Response;
        try {
          response = await fetcher(url, {
            signal: controller.signal, redirect: 'error',
            headers: { Accept: 'application/json', 'User-Agent': userAgent },
          });
        } catch {
          throw new TripRoutingError('network', 'Could not reach the route provider. Check your internet connection.');
        }
        if (controller.signal.aborted) throw abortError;
        if (response.status === 429 || response.status === 503) {
          const wait = Math.max(response.status === 429 ? 60_000 : 15_000,
            retryAfter(response.headers.get('Retry-After'), now()));
          nextRequest = Math.max(nextRequest, now() + wait);
          throw new TripRoutingError('busy', 'The route provider is busy. Wait before trying again.');
        }
        if (!response.ok && response.status !== 400) {
          throw new TripRoutingError('provider', 'The route provider is unavailable (HTTP ' + response.status + ').');
        }
        let payload: unknown;
        try { payload = await response.json(); }
        catch { return invalidResponse(); }
        if (controller.signal.aborted) throw abortError;
        if (response.status === 400 && (!record(payload) || !['NoRoute', 'NoSegment', 'TooBig'].includes(String(payload.code)))) {
          throw new TripRoutingError('provider', 'The route provider could not calculate this trip. Check the selected locations.');
        }
        return parseOsrmResponse(payload, { provider: name, attribution, calculatedAt: new Date(now()).toISOString() });
      };

      try { return await Promise.race([request(), interrupted]); }
      finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        pending = false;
      }
    },
  };
}

const unavailable: RoutingProvider = {
  name: 'Routing unavailable', attribution,
  async route() {
    throw new TripRoutingError('configuration', 'Online routing has no configured provider. You can open the selected stops in Google Maps.');
  },
};
const academicRouting = createOsrmRoutingProvider({ baseUrl: OSRM_DEMO_BASE_URL, name: OSRM_DEMO_NAME });
const configuredBase = process.env.EXPO_PUBLIC_OSRM_BASE_URL?.trim();
export const tripRoutingProvider = configuredBase
  ? createOsrmRoutingProvider({ baseUrl: configuredBase, name: 'Configured OSRM' })
  : unavailable;

export function routingProviderForProfile(profile: unknown): RoutingProvider {
  return configuredBase ? tripRoutingProvider : profile === 'academic-testing' ? academicRouting : unavailable;
}
