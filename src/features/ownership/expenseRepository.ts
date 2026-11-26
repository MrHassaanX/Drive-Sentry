import type { SQLiteDatabase } from 'expo-sqlite';
import { listFuelEntries } from '../fuel/repository.ts';
import { type Expense, type ServiceSpend, validateExpense } from './spending.ts';

export async function readOwnership(db: SQLiteDatabase, vehicleId: number) {
  const [fuel, service, expenses] = await Promise.all([
    listFuelEntries(db, vehicleId),
    db.getAllAsync<ServiceSpend>(`SELECT service_date, category, cost_paise, completed, odometer_km, notes, workshop
      FROM maintenance_records WHERE vehicle_id = ? ORDER BY service_date, id`, vehicleId),
    db.getAllAsync<Expense>(`SELECT id, spent_on, category, cost_paise, vendor, notes FROM ownership_expenses
      WHERE vehicle_id = ? ORDER BY spent_on DESC, id DESC`, vehicleId),
  ]);
  return { fuel, service, expenses };
}
export async function saveExpense(db: SQLiteDatabase, vehicleId: number, input: Parameters<typeof validateExpense>[0], id?: number) {
  const values = [input.date, input.category, validateExpense(input), input.vendor.trim(), input.notes.trim()];
  const result = id === undefined
    ? await db.runAsync('INSERT INTO ownership_expenses (spent_on, category, cost_paise, vendor, notes, vehicle_id) VALUES (?, ?, ?, ?, ?, ?)', ...values, vehicleId)
    : await db.runAsync('UPDATE ownership_expenses SET spent_on = ?, category = ?, cost_paise = ?, vendor = ?, notes = ? WHERE vehicle_id = ? AND id = ?', ...values, vehicleId, id);
  if (!result.changes) throw Error('That expense is no longer available for this vehicle.');
}
export async function removeExpense(db: SQLiteDatabase, vehicleId: number, id: number) {
  await db.runAsync('DELETE FROM ownership_expenses WHERE vehicle_id = ? AND id = ?', vehicleId, id);
}
