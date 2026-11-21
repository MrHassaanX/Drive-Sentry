import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useSQLiteContext } from 'expo-sqlite';
import { bengaluru, mysuru, type Point, type Radius } from './provider';
import { searchStations } from './search';

type Origin = Point & { label: string };
export type StationSearchSource = 'gps' | 'demo' | 'bengaluru' | 'reuse';

export function useStationSearch() {
  const db = useSQLiteContext();
  const [permission, setPermission] = useState('not checked');
  const [origin, setOrigin] = useState<Origin>();
  const [deviceLocation, setDeviceLocation] = useState<Point>();
  const [radius, setRadius] = useState<Radius>(5);
  const [result, setResult] = useState<Awaited<ReturnType<typeof searchStations>>>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    let active = true;
    void Location.getForegroundPermissionsAsync().then(p => {
      if (active) setPermission(p.status);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function run(source: StationSearchSource, km: Radius, refresh = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    setRadius(km);
    // Manual refresh keeps the current in-memory results visible while underway.
    if (!refresh) setResult(undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let center = origin;
      if (source === 'demo') center = { ...mysuru, label: 'Mysuru, Karnataka · demo' };
      if (source === 'bengaluru') center = { ...bengaluru, label: 'Bengaluru, Karnataka · demo' };
      if (source === 'gps') {
        const p = await Location.requestForegroundPermissionsAsync();
        setPermission(p.status);
        if (!p.granted) {
          setDeviceLocation(undefined);
          throw new Error(p.canAskAgain
            ? 'Location permission denied. Retry or select Mysuru.'
            : 'Allow location in device settings or select Mysuru.');
        }
        if (!await Location.hasServicesEnabledAsync()) {
          setDeviceLocation(undefined);
          throw new Error('Location services are off. Enable GPS or select Mysuru.');
        }
        const recent = await Location.getLastKnownPositionAsync({ maxAge: 60000, requiredAccuracy: 250 });
        const fix = recent ?? await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Location timed out. Retry or select Mysuru.')), 15000);
          }),
        ]);
        const { latitude, longitude } = fix.coords;
        setDeviceLocation({ latitude, longitude });
        center = { latitude, longitude, label: 'Current device location' };
      }
      if (!center) return;
      setOrigin(center);
      setResult(await searchStations(db, center, km, refresh));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Station search unavailable. Please retry.');
    } finally {
      clearTimeout(timer);
      locked.current = false;
      setBusy(false);
    }
  }

  return { permission, origin, deviceLocation, radius, result, message, busy, run };
}
