import type { SQLiteDatabase } from 'expo-sqlite';

import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useFocusedVehicleData } from '../../hooks/useFocusedVehicleData';
import { listFuelEntries } from '../fuel/repository';
import { listMaintenanceRecords, listMaintenanceSchedules } from './repository';

async function loadMaintenance(database: SQLiteDatabase, vehicleId: number) {
  const [records, schedules, fuelEntries] = await Promise.all([
    listMaintenanceRecords(database, vehicleId),
    listMaintenanceSchedules(database, vehicleId),
    listFuelEntries(database, vehicleId),
  ]);
  return { records, schedules, fuelEntries };
}

const emptyMaintenance: Awaited<ReturnType<typeof loadMaintenance>> = { records: [], schedules: [], fuelEntries: [] };

export function useMaintenance() {
  const { selectedVehicle } = useSelectedVehicle();
  const { data, ...status } = useFocusedVehicleData(
    selectedVehicle?.id ?? null,
    loadMaintenance,
    'Maintenance information could not be loaded. Please try again.',
  );
  return { ...(data ?? emptyMaintenance), ...status };
}
