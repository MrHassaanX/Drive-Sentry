import type { Point } from './provider.ts';
import type { SearchPlace } from './geocoding.ts';

type Permission = { granted: boolean; canAskAgain: boolean; status: string };
export type DeviceFix = { coords: Point & { accuracy: number | null }; timestamp: number; mocked?: boolean };
export type SearchOrigin = Point & { label: string } & (
  { kind: 'address' | 'map' } | { kind: 'device' | 'emulator' | 'mock'; fix: DeviceFix }
);
export type StationSearchSource = 'gps' | 'reuse' | SearchPlace;

type LocationReader = {
  permission(): Promise<Permission>;
  requestPermission(): Promise<Permission>;
  servicesEnabled(): Promise<boolean>;
  position(): Promise<DeviceFix>;
};

export async function resolveSearchOrigin(source: StationSearchSource, previous: SearchOrigin | undefined,
  read: () => Promise<DeviceFix>, isEmulator: boolean): Promise<SearchOrigin | undefined> {
  if (source === 'reuse') return previous;
  if (source !== 'gps') return { ...source, kind: source.via ?? 'address' };
  const fix = await read();
  const { latitude, longitude } = fix.coords;
  if (isEmulator) return { latitude, longitude, fix, kind: 'emulator', label: 'Simulated emulator location' };
  if (fix.mocked) return { latitude, longitude, fix, kind: 'mock', label: 'Mock device location' };
  return { latitude, longitude, fix, kind: 'device', label: 'Device location' };
}

export function validLocation(point: Point) {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export async function readDeviceLocation(reader: LocationReader, retry: boolean, timeoutMs = 15000) {
  let permission = await reader.permission();
  if (!permission.granted && permission.canAskAgain && (permission.status === 'undetermined' || retry)) {
    permission = await reader.requestPermission();
  }
  if (!permission.granted) throw new Error(permission.canAskAgain
    ? 'Location permission denied. Try My Location or search for a city or address.'
    : 'Enable location permission in device settings or search for a city or address.');
  if (!await reader.servicesEnabled()) throw new Error('Location services are off. Turn them on or search for a city or address.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await Promise.race([
      reader.position(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Location timed out. Try My Location or search for a city or address.')), timeoutMs);
      }),
    ]);
    if (!validLocation(fix.coords)) throw new Error('The location fix was invalid. Try My Location or search for a city or address.');
    const age = Date.now() - fix.timestamp;
    if (!Number.isFinite(age) || age > 30_000 || age < -5_000) {
      throw new Error('The device returned an old or invalid location. Try My Location again.');
    }
    return fix;
  } finally {
    clearTimeout(timer);
  }
}
