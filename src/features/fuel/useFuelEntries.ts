import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { calculateFuelInsights } from './calculations';
import { listFuelEntries } from './repository';
import type { FuelEntry, FuelInsights } from './types';

function getCurrentLocalMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const emptyInsights = (): FuelInsights => calculateFuelInsights([], getCurrentLocalMonthKey());

export function useFuelEntries() {
  const database = useSQLiteContext();
  const { selectedVehicle } = useSelectedVehicle();
  const vehicleId = selectedVehicle?.id ?? null;
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [insights, setInsights] = useState<FuelInsights>(emptyInsights);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // This value is an intentional refresh signal after a write on the focused screen.
      void reloadKey;
      void Promise.resolve().then(async () => {
        if (!active) return;
        setIsLoading(true);
        setError(null);

        if (vehicleId === null) {
          setEntries([]);
          setInsights(emptyInsights());
          setIsLoading(false);
          return;
        }

        try {
          const nextEntries = await listFuelEntries(database, vehicleId);
          if (!active) return;
          setEntries(nextEntries);
          setInsights(calculateFuelInsights(nextEntries, getCurrentLocalMonthKey()));
        } catch {
          if (active) setError('Fuel records could not be loaded. Please try again.');
        } finally {
          if (active) setIsLoading(false);
        }
      });
      return () => { active = false; };
    }, [database, vehicleId, reloadKey]),
  );

  return { entries, insights, isLoading, error, refresh };
}
