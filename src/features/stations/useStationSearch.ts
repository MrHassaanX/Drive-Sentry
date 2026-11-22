import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useSQLiteContext } from 'expo-sqlite';
import { readDeviceLocation } from './deviceLocation';
import type { SearchPlace } from './geocoding';
import type { Point, Radius } from './provider';
import { searchStations } from './search';

type Origin = Point & { label: string };
export type StationSearchSource = 'gps' | 'reuse' | SearchPlace;
const defaultRadius = 5;
const deviceReader = {
  permission: Location.getForegroundPermissionsAsync,
  requestPermission: Location.requestForegroundPermissionsAsync,
  servicesEnabled: Location.hasServicesEnabledAsync,
  position: async () => (await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: false,
  })).coords,
};

export function useStationSearch() {
  const db = useSQLiteContext();
  const [origin, setOrigin] = useState<Origin>();
  const originRef = useRef<Origin>(undefined);
  const [deviceLocation, setDeviceLocation] = useState<Point>();
  const [radius, setRadius] = useState<Radius>(defaultRadius);
  const [result, setResult] = useState<Awaited<ReturnType<typeof searchStations>>>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const operation = useRef<symbol>(undefined);

  const run = useCallback(async (source: StationSearchSource, km: Radius, refresh = false, retryGps = true) => {
    if (operation.current) return;
    const token = Symbol();
    operation.current = token;
    const active = () => operation.current === token;
    setBusy(true);
    setMessage('');
    setRadius(km);
    if (!refresh) setResult(undefined);
    if (source === 'gps') {
      originRef.current = undefined;
      setOrigin(undefined);
      setDeviceLocation(undefined);
    }

    try {
      let center = source === 'reuse' ? originRef.current : undefined;
      if (typeof source === 'object') center = source;
      if (source === 'gps') {
        const { latitude, longitude } = await readDeviceLocation(deviceReader, retryGps);
        if (!active()) return;
        const point = { latitude, longitude };
        setDeviceLocation(point);
        center = { ...point, label: 'Current device location' };
      }
      if (!center) return;
      originRef.current = center;
      setOrigin(center);
      const nearby = await searchStations(db, center, km, refresh);
      if (active()) setResult(nearby);
    } catch (error) {
      if (active()) setMessage(error instanceof Error ? error.message : 'Station search unavailable. Please retry.');
    } finally {
      if (active()) {
        operation.current = undefined;
        setBusy(false);
      }
    }
  }, [db]);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) return run('gps', defaultRadius, false, false);
    });
    return () => { mounted = false; operation.current = undefined; };
  }, [run]);

  return { origin, deviceLocation, radius, result, message, busy, run };
}
