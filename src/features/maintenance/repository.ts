import type { SQLiteDatabase } from 'expo-sqlite';

import { validateMaintenanceRecord, validateMaintenanceSchedule } from './validation.ts';
import type { MaintenanceRecord, MaintenanceRecordInput, MaintenanceSchedule, MaintenanceScheduleInput } from './types';

const RECORD_FIELDS = 'id, vehicle_id, schedule_id, category, service_date, odometer_km, cost_paise, workshop, notes, completed, created_at, updated_at';
// Derive the active baseline in the same read as the schedule. Service writes never
// change the configured fallback or require a second statement to keep it in sync.
const SCHEDULE_QUERY = `
  SELECT s.id, s.vehicle_id, s.category, s.interval_km, s.interval_months, s.enabled, s.created_at, s.updated_at,
    CASE WHEN s.baseline_confirmed = 1 THEN s.baseline_odometer_km END AS configured_odometer_km,
    CASE WHEN s.baseline_confirmed = 1 THEN s.baseline_date END AS configured_date,
    COALESCE(r.odometer_km, CASE WHEN s.baseline_confirmed = 1 THEN s.baseline_odometer_km END) AS baseline_odometer_km,
    COALESCE(r.service_date, CASE WHEN s.baseline_confirmed = 1 THEN s.baseline_date END) AS baseline_date
  FROM maintenance_schedules s
  LEFT JOIN maintenance_records r ON r.id = (
    SELECT id FROM maintenance_records
    WHERE schedule_id = s.id AND vehicle_id = s.vehicle_id AND completed = 1
    ORDER BY service_date DESC, id DESC LIMIT 1
  )
`;

export async function listMaintenanceRecords(database: SQLiteDatabase, vehicleId: number): Promise<MaintenanceRecord[]> {
  return database.getAllAsync<MaintenanceRecord>(
    `SELECT ${RECORD_FIELDS} FROM maintenance_records WHERE vehicle_id = ? ORDER BY service_date DESC, id DESC;`, vehicleId,
  );
}

export async function getMaintenanceRecord(database: SQLiteDatabase, id: number, vehicleId: number): Promise<MaintenanceRecord | null> {
  return database.getFirstAsync<MaintenanceRecord>(`SELECT ${RECORD_FIELDS} FROM maintenance_records WHERE id = ? AND vehicle_id = ?;`, id, vehicleId);
}

export async function listMaintenanceSchedules(database: SQLiteDatabase, vehicleId: number, enabledOnly = false): Promise<MaintenanceSchedule[]> {
  return database.getAllAsync<MaintenanceSchedule>(
    `${SCHEDULE_QUERY} WHERE s.vehicle_id = ? ${enabledOnly ? 'AND s.enabled = 1' : ''} ORDER BY s.category COLLATE NOCASE ASC, s.id ASC;`, vehicleId,
  );
}

export async function getMaintenanceSchedule(database: SQLiteDatabase, id: number, vehicleId: number): Promise<MaintenanceSchedule | null> {
  return database.getFirstAsync<MaintenanceSchedule>(`${SCHEDULE_QUERY} WHERE s.id = ? AND s.vehicle_id = ?;`, id, vehicleId);
}

export async function saveMaintenanceSchedule(database: SQLiteDatabase, input: MaintenanceScheduleInput, id?: number): Promise<number> {
  const error = validateMaintenanceSchedule(input);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  if (id !== undefined) {
    const result = await database.runAsync(
      `UPDATE maintenance_schedules SET category = ?, interval_km = ?, interval_months = ?, baseline_odometer_km = ?, baseline_date = ?, baseline_confirmed = 1, enabled = ?, updated_at = ? WHERE id = ? AND vehicle_id = ?;`,
      input.category.trim(), input.intervalKm, input.intervalMonths, input.baselineOdometerKm, input.baselineDate, input.enabled ? 1 : 0, now, id, input.vehicleId,
    );
    if (result.changes === 0) throw new Error('That maintenance schedule is no longer available.');
    return id;
  }
  const result = await database.runAsync(
    `INSERT INTO maintenance_schedules (vehicle_id, category, interval_km, interval_months, baseline_odometer_km, baseline_date, baseline_confirmed, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?);`,
    input.vehicleId, input.category.trim(), input.intervalKm, input.intervalMonths, input.baselineOdometerKm, input.baselineDate, input.enabled ? 1 : 0, now, now,
  );
  return result.lastInsertRowId;
}

export async function deleteMaintenanceSchedule(database: SQLiteDatabase, id: number, vehicleId: number): Promise<void> {
  const result = await database.runAsync('DELETE FROM maintenance_schedules WHERE id = ? AND vehicle_id = ?;', id, vehicleId);
  if (result.changes === 0) throw new Error('That maintenance schedule is no longer available.');
}

export async function saveMaintenanceRecord(database: SQLiteDatabase, input: MaintenanceRecordInput, id?: number): Promise<number> {
  const error = validateMaintenanceRecord(input);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  if (id !== undefined) {
    const result = await database.runAsync(
      `UPDATE maintenance_records SET schedule_id = ?, category = ?, service_date = ?, odometer_km = ?, cost_paise = ?, workshop = ?, notes = ?, completed = ?, updated_at = ? WHERE id = ? AND vehicle_id = ?;`,
      input.scheduleId, input.category.trim(), input.serviceDate, input.odometerKm, input.costPaise, input.workshop?.trim() || null, input.notes?.trim() || null, input.completed ? 1 : 0, now, id, input.vehicleId,
    );
    if (result.changes === 0) throw new Error('That maintenance record is no longer available.');
    return id;
  }
  const result = await database.runAsync(
    `INSERT INTO maintenance_records (vehicle_id, schedule_id, category, service_date, odometer_km, cost_paise, workshop, notes, completed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    input.vehicleId, input.scheduleId, input.category.trim(), input.serviceDate, input.odometerKm, input.costPaise, input.workshop?.trim() || null, input.notes?.trim() || null, input.completed ? 1 : 0, now, now,
  );
  return result.lastInsertRowId;
}

export async function deleteMaintenanceRecord(database: SQLiteDatabase, id: number, vehicleId: number): Promise<void> {
  const result = await database.runAsync('DELETE FROM maintenance_records WHERE id = ? AND vehicle_id = ?;', id, vehicleId);
  if (result.changes === 0) throw new Error('That maintenance record is no longer available.');
}
