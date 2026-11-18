import type { SQLiteDatabase } from 'expo-sqlite';

import type { FuelEntry, FuelEntryInput } from './types';

const FUEL_ENTRY_FIELDS = `
  id, vehicle_id, refuelled_at, odometer_km, quantity_milliunits, quantity_unit, cost_paise,
  is_full_tank, created_at, updated_at
`;

export async function listFuelEntries(database: SQLiteDatabase, vehicleId: number): Promise<FuelEntry[]> {
  return database.getAllAsync<FuelEntry>(
    `SELECT ${FUEL_ENTRY_FIELDS} FROM fuel_entries
     WHERE vehicle_id = ? ORDER BY refuelled_at ASC, id ASC;`,
    vehicleId,
  );
}

export async function getFuelEntry(database: SQLiteDatabase, id: number): Promise<FuelEntry | null> {
  return database.getFirstAsync<FuelEntry>(
    `SELECT ${FUEL_ENTRY_FIELDS} FROM fuel_entries WHERE id = ?;`,
    id,
  );
}

export async function createFuelEntry(database: SQLiteDatabase, input: FuelEntryInput): Promise<number> {
  const now = new Date().toISOString();
  const result = await database.runAsync(
    `INSERT INTO fuel_entries (
      vehicle_id, refuelled_at, odometer_km, quantity_milliunits, quantity_unit,
      cost_paise, is_full_tank, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    input.vehicleId,
    input.refuelledAt,
    input.odometerKm,
    input.quantityMilliunits,
    input.quantityUnit,
    input.costPaise,
    input.isFullTank ? 1 : 0,
    now,
    now,
  );
  return result.lastInsertRowId;
}

export async function updateFuelEntry(
  database: SQLiteDatabase,
  id: number,
  input: FuelEntryInput,
): Promise<void> {
  const result = await database.runAsync(
    `UPDATE fuel_entries SET
      refuelled_at = ?, odometer_km = ?, quantity_milliunits = ?, quantity_unit = ?, cost_paise = ?,
      is_full_tank = ?, updated_at = ?
      WHERE id = ? AND vehicle_id = ?;`,
    input.refuelledAt,
    input.odometerKm,
    input.quantityMilliunits,
    input.quantityUnit,
    input.costPaise,
    input.isFullTank ? 1 : 0,
    new Date().toISOString(),
    id,
    input.vehicleId,
  );
  if (result.changes === 0) throw new Error('That fuel record is no longer available.');
}

export async function deleteFuelEntry(database: SQLiteDatabase, id: number): Promise<void> {
  const result = await database.runAsync('DELETE FROM fuel_entries WHERE id = ?;', id);
  if (result.changes === 0) throw new Error('That fuel record is no longer available.');
}
