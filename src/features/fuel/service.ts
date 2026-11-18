import type { SQLiteDatabase } from 'expo-sqlite';

import { getVehicle } from '../vehicles/repository.ts';
import { findOdometerSequenceError } from './calculations.ts';
import { createFuelEntry, getFuelEntry, listFuelEntries, updateFuelEntry } from './repository.ts';
import type { FuelEntry, FuelEntryInput } from './types';

export async function saveFuelEntry(
  database: SQLiteDatabase,
  input: FuelEntryInput,
  editingId: number | null = null,
): Promise<number> {
  const vehicle = await getVehicle(database, input.vehicleId);
  if (!vehicle) throw new Error('Select a saved vehicle before recording a refill.');

  let existing: FuelEntry | null = null;
  if (editingId !== null) {
    existing = await getFuelEntry(database, editingId, input.vehicleId);
    if (!existing) {
      throw new Error('That fuel record is no longer available.');
    }
  }

  if (vehicle.fuel_type === 'electric' && !existing) throw new Error('Electric charging records are unavailable.');
  const expectedUnit = existing?.quantity_unit ?? (vehicle.fuel_type === 'cng' ? 'kg' : 'litre');
  if (input.quantityUnit !== expectedUnit) {
    throw new Error(`Record this vehicle's fuel quantity in ${expectedUnit === 'kg' ? 'kilograms' : 'litres'}.`);
  }

  const entries = await listFuelEntries(database, input.vehicleId);
  const sequenceError = findOdometerSequenceError(entries, input, editingId);
  if (sequenceError) throw new Error(sequenceError);

  if (editingId !== null) {
    await updateFuelEntry(database, editingId, input);
    return editingId;
  }

  if (vehicle.fuel_type === 'electric') throw new Error('Electric charging records are unavailable.');
  return createFuelEntry(database, input, vehicle.fuel_type);
}
