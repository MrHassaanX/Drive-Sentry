import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

export function useFocusedVehicleData<T>(
  vehicleId: number | null,
  load: (database: SQLiteDatabase, vehicleId: number) => Promise<T>,
  errorMessage: string,
) {
  const database = useSQLiteContext();
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{ vehicleId: number; request: number; data?: T; error?: string }>();
  const refresh = useCallback(() => setRequest((value) => value + 1), []);

  useFocusEffect(useCallback(() => {
    if (vehicleId === null) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setResult({ vehicleId, request });
      try {
        const data = await load(database, vehicleId);
        if (active) setResult({ vehicleId, request, data });
      } catch {
        if (active) setResult({ vehicleId, request, error: errorMessage });
      }
    });
    return () => { active = false; };
  }, [database, errorMessage, load, request, vehicleId]));

  const current = result?.vehicleId === vehicleId && result.request === request ? result : undefined;
  return {
    data: current?.data,
    error: current?.error ?? null,
    isLoading: vehicleId !== null && current?.data === undefined && !current?.error,
    refresh,
  };
}
