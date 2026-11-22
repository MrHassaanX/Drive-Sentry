import { useCallback, useEffect, useRef, useState } from 'react';
import { isDevice } from 'expo-device';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Platform } from 'react-native';
import { readDeviceLocation, resolveSearchOrigin, type SearchOrigin, type StationSearchSource } from './deviceLocation';
import type { Radius } from './provider';
import { searchForProfile } from './search';

const defaultRadius = 5;
const searchStations = searchForProfile(Constants.expoConfig?.extra?.buildProfile);
// Keep the explicit location choice in the Fuel Assistant session. GPS fixes
// themselves are reacquired and never saved as a preferred coordinate.
let preference: { source: Exclude<StationSearchSource, 'reuse'> } = { source: 'gps' };
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
  const appliedPreference = useRef<typeof preference>(undefined);
  const radiusRef = useRef(defaultRadius as Radius);

  const search = useCallback(async (source: StationSearchSource, km: Radius, refresh = false, retryGps = true) => {
    const token = Symbol();
    operation.current = token;
    const active = () => operation.current === token;
    setBusy(true);
    setMessage('');
    setRadius(km);
    radiusRef.current = km;
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

  useFocusEffect(useCallback(() => {
    let focused = true;
    void Promise.resolve().then(() => {
      if (!focused || appliedPreference.current === preference) return;
      appliedPreference.current = preference;
      return search(preference.source, radiusRef.current, false, false);
    });
    return () => { focused = false; };
  }, [search]));

  useEffect(() => () => { operation.current = undefined; appliedPreference.current = undefined; }, []);

  function run(source: StationSearchSource, km: Radius, refresh = false) {
    if (operation.current) return;
    if (source !== 'reuse') {
      preference = { source };
      appliedPreference.current = preference;
    }
    void search(source, km, refresh);
  }

  return { origin, radius, result, message, busy, run };
}
