import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { getSelectedVehicleId, getVehicle, listVehicles, setSelectedVehicleId } from '../features/vehicles/repository';
import type { Vehicle } from '../features/vehicles/types';

interface SelectedVehicleContextValue {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectVehicle: (id: number) => Promise<void>;
  clearError: () => void;
}

const SelectedVehicleContext = createContext<SelectedVehicleContextValue | null>(null);

export function SelectedVehicleProvider({ children }: { children: React.ReactNode }) {
  const database = useSQLiteContext();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextVehicles, storedId] = await Promise.all([
        listVehicles(database),
        getSelectedVehicleId(database),
      ]);
      setError(null);
      const nextSelection = nextVehicles.find((vehicle) => vehicle.id === storedId) ?? nextVehicles[0] ?? null;
      if (storedId !== (nextSelection?.id ?? null)) {
        await setSelectedVehicleId(database, nextSelection?.id ?? null);
      }
      setVehicles(nextVehicles);
      setSelectedVehicle(nextSelection);
    } catch {
      setError('Your saved vehicles could not be loaded. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [database]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const selectVehicle = useCallback(
    async (id: number) => {
      try {
        const vehicle = await getVehicle(database, id);
        if (!vehicle) {
          setError('That vehicle is no longer available. Refresh your garage and try again.');
          return;
        }
        await setSelectedVehicleId(database, id);
        setSelectedVehicle(vehicle);
        setError(null);
      } catch {
        setError('Your active vehicle could not be saved. Please try again.');
      }
    },
    [database],
  );

  const value = useMemo(
    () => ({
      vehicles,
      selectedVehicle,
      isLoading,
      error,
      refresh,
      selectVehicle,
      clearError: () => setError(null),
    }),
    [vehicles, selectedVehicle, isLoading, error, refresh, selectVehicle],
  );

  return <SelectedVehicleContext.Provider value={value}>{children}</SelectedVehicleContext.Provider>;
}

export function useSelectedVehicle(): SelectedVehicleContextValue {
  const context = useContext(SelectedVehicleContext);
  if (!context) throw new Error('useSelectedVehicle must be used inside SelectedVehicleProvider.');
  return context;
}
