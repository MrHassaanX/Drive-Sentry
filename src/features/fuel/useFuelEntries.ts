import { useMemo } from 'react';

import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useFocusedVehicleData } from '../../hooks/useFocusedVehicleData';
import { calculateFuelInsights, localMonthKey } from './calculations';
import { listFuelEntries } from './repository';
import type { FuelEntry } from './types';

const emptyEntries: FuelEntry[] = [];

export function useFuelEntries() {
  const { selectedVehicle } = useSelectedVehicle();
  const { data, ...status } = useFocusedVehicleData(
    selectedVehicle?.id ?? null,
    listFuelEntries,
    'Fuel records could not be loaded. Please try again.',
  );
  const entries = data ?? emptyEntries;
  const month = localMonthKey(new Date().toISOString());
  const insights = useMemo(() => calculateFuelInsights(entries, month), [entries, month]);
  return { entries, insights, ...status };
}
