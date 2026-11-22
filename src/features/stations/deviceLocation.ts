import type { Point } from './provider.ts';

type Permission = { granted: boolean; canAskAgain: boolean; status: string };
type LocationReader = {
  permission(): Promise<Permission>;
  requestPermission(): Promise<Permission>;
  servicesEnabled(): Promise<boolean>;
  position(): Promise<Point>;
};

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
    const point = await Promise.race([
      reader.position(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Location timed out. Try My Location or search for a city or address.')), timeoutMs);
      }),
    ]);
    if (!validLocation(point)) throw new Error('The location fix was invalid. Try My Location or search for a city or address.');
    return point;
  } finally {
    clearTimeout(timer);
  }
}
