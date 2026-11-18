import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { listFuelEntries } from '../fuel/repository';
import type { FuelEntry } from '../fuel/types';
import { listMaintenanceRecords, listMaintenanceSchedules } from './repository';
import type { MaintenanceRecord, MaintenanceSchedule } from './types';

export function useMaintenance() {
  const database = useSQLiteContext();
  const { selectedVehicle } = useSelectedVehicle();
  const vehicleId = selectedVehicle?.id ?? null;
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      setIsLoading(true);
      setError(null);
      if (vehicleId === null) {
        setRecords([]); setSchedules([]); setFuelEntries([]); setIsLoading(false); return;
      }
      try {
        const [nextRecords, nextSchedules, nextFuel] = await Promise.all([
          listMaintenanceRecords(database, vehicleId),
          listMaintenanceSchedules(database, vehicleId),
          listFuelEntries(database, vehicleId),
        ]);
        if (active) { setRecords(nextRecords); setSchedules(nextSchedules); setFuelEntries(nextFuel); }
      } catch {
        if (active) setError('Maintenance information could not be loaded. Please try again.');
      } finally { if (active) setIsLoading(false); }
    });
    return () => { active = false; };
  }, [database, vehicleId, reloadKey]));

  return { records, schedules, fuelEntries, isLoading, error, refresh };
}
