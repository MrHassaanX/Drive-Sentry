import type { SQLiteDatabase } from 'expo-sqlite';

import type { Vehicle, VehicleWriteInput } from './types';

const SELECT_VEHICLE_FIELDS = `
  id, name, manufacturer, model, vehicle_type, fuel_type, registration_number,
  current_odometer_km, model_year, created_at, updated_at
`;

export async function listVehicles(database: SQLiteDatabase): Promise<Vehicle[]> {
  return database.getAllAsync<Vehicle>(
    `SELECT ${SELECT_VEHICLE_FIELDS} FROM vehicles ORDER BY name COLLATE NOCASE ASC, id ASC;`,
  );
}

export async function getVehicle(database: SQLiteDatabase, id: number): Promise<Vehicle | null> {
  return database.getFirstAsync<Vehicle>(
    `SELECT ${SELECT_VEHICLE_FIELDS} FROM vehicles WHERE id = ?;`,
    id,
  );
}

export async function createVehicle(database: SQLiteDatabase, input: VehicleWriteInput): Promise<number> {
  const now = new Date().toISOString();
  const result = await database.runAsync(
    `INSERT INTO vehicles (
      name, manufacturer, model, vehicle_type, fuel_type, registration_number,
      current_odometer_km, model_year, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    input.name,
    input.manufacturer,
    input.model,
    input.vehicleType,
    input.fuelType,
    input.registrationNumber,
    input.currentOdometerKm,
    input.modelYear,
    now,
    now,
  );
  return result.lastInsertRowId;
}

export async function updateVehicle(
  database: SQLiteDatabase,
  id: number,
  input: VehicleWriteInput,
): Promise<void> {
  const result = await database.runAsync(
    `UPDATE vehicles SET
      name = ?, manufacturer = ?, model = ?, vehicle_type = ?, fuel_type = ?,
      registration_number = ?, current_odometer_km = ?, model_year = ?, updated_at = ?
      WHERE id = ?;`,
    input.name,
    input.manufacturer,
    input.model,
    input.vehicleType,
    input.fuelType,
    input.registrationNumber,
    input.currentOdometerKm,
    input.modelYear,
    new Date().toISOString(),
    id,
  );
  if (result.changes === 0) throw new Error('That vehicle is no longer available.');
}

export async function deleteVehicle(database: SQLiteDatabase, id: number): Promise<void> {
  await database.runAsync('DELETE FROM vehicles WHERE id = ?;', id);
}

export async function getSelectedVehicleId(database: SQLiteDatabase): Promise<number | null> {
  const result = await database.getFirstAsync<{ vehicle_id: number | null }>(
    'SELECT vehicle_id FROM vehicle_selection WHERE id = 1;',
  );
  return result?.vehicle_id ?? null;
}

export async function setSelectedVehicleId(database: SQLiteDatabase, id: number | null): Promise<void> {
  await database.runAsync(
    `INSERT INTO vehicle_selection (id, vehicle_id, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET vehicle_id = excluded.vehicle_id, updated_at = excluded.updated_at;`,
    id,
    new Date().toISOString(),
  );
}
