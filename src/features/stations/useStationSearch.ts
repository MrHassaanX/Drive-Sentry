import { useCallback, useEffect, useRef, useState } from 'react';
import { isDevice } from 'expo-device';
import * as Location from 'expo-location';
import { useSQLiteContext } from 'expo-sqlite';
import { Platform } from 'react-native';
import { readDeviceLocation, resolveSearchOrigin, type SearchOrigin, type StationSearchSource } from './deviceLocation';
import type { Radius } from './provider';
import { searchStations } from './search';

const defaultRadius = 5;
const isEmulator = (Platform.OS === 'android' || Platform.OS === 'ios') && !isDevice;
const deviceReader = {
  permission: Location.getForegroundPermissionsAsync,
  requestPermission: Location.requestForegroundPermissionsAsync,
  servicesEnabled: Location.hasServicesEnabledAsync,
  position: () => Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: false,
    timeInterval: 1000,
  }),
};

export function useStationSearch() {
  const db = useSQLiteContext();
  const [origin, setOrigin] = useState<SearchOrigin>();
  const originRef = useRef<SearchOrigin>(undefined);
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
    }

    try {
      const center = await resolveSearchOrigin(source, originRef.current,
        () => readDeviceLocation(deviceReader, retryGps), isEmulator);
      if (!active() || !center) return;
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

  return { origin, radius, result, message, busy, run };
}
