import type { SQLiteDatabase } from 'expo-sqlite';

import { validateMaintenanceRecord, validateMaintenanceSchedule } from './validation';
import type { MaintenanceRecord, MaintenanceRecordInput, MaintenanceSchedule, MaintenanceScheduleInput } from './types';

const RECORD_FIELDS = 'id, vehicle_id, schedule_id, category, service_date, odometer_km, cost_paise, workshop, notes, completed, created_at, updated_at';
const SCHEDULE_FIELDS = 'id, vehicle_id, category, interval_km, interval_months, baseline_odometer_km, baseline_date, enabled, created_at, updated_at';

export async function listMaintenanceRecords(database: SQLiteDatabase, vehicleId: number): Promise<MaintenanceRecord[]> {
  return database.getAllAsync<MaintenanceRecord>(
    `SELECT ${RECORD_FIELDS} FROM maintenance_records WHERE vehicle_id = ? ORDER BY service_date DESC, id DESC;`, vehicleId,
  );
}

export async function getMaintenanceRecord(database: SQLiteDatabase, id: number): Promise<MaintenanceRecord | null> {
  return database.getFirstAsync<MaintenanceRecord>(`SELECT ${RECORD_FIELDS} FROM maintenance_records WHERE id = ?;`, id);
}

export async function listMaintenanceSchedules(database: SQLiteDatabase, vehicleId: number, enabledOnly = false): Promise<MaintenanceSchedule[]> {
  return database.getAllAsync<MaintenanceSchedule>(
    `SELECT ${SCHEDULE_FIELDS} FROM maintenance_schedules WHERE vehicle_id = ? ${enabledOnly ? 'AND enabled = 1' : ''} ORDER BY category COLLATE NOCASE ASC, id ASC;`, vehicleId,
  );
}

export async function getMaintenanceSchedule(database: SQLiteDatabase, id: number): Promise<MaintenanceSchedule | null> {
  return database.getFirstAsync<MaintenanceSchedule>(`SELECT ${SCHEDULE_FIELDS} FROM maintenance_schedules WHERE id = ?;`, id);
}

export async function saveMaintenanceSchedule(database: SQLiteDatabase, input: MaintenanceScheduleInput, id?: number): Promise<number> {
  const error = validateMaintenanceSchedule(input);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  if (id !== undefined) {
    const result = await database.runAsync(
      `UPDATE maintenance_schedules SET category = ?, interval_km = ?, interval_months = ?, baseline_odometer_km = ?, baseline_date = ?, enabled = ?, updated_at = ? WHERE id = ? AND vehicle_id = ?;`,
      input.category.trim(), input.intervalKm, input.intervalMonths, input.baselineOdometerKm, input.baselineDate, input.enabled ? 1 : 0, now, id, input.vehicleId,
    );
    if (result.changes === 0) throw new Error('That maintenance schedule is no longer available.');
    return id;
  }
  const result = await database.runAsync(
    `INSERT INTO maintenance_schedules (vehicle_id, category, interval_km, interval_months, baseline_odometer_km, baseline_date, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    input.vehicleId, input.category.trim(), input.intervalKm, input.intervalMonths, input.baselineOdometerKm, input.baselineDate, input.enabled ? 1 : 0, now, now,
  );
  return result.lastInsertRowId;
}

export async function deleteMaintenanceSchedule(database: SQLiteDatabase, id: number, vehicleId: number): Promise<void> {
  const result = await database.runAsync('DELETE FROM maintenance_schedules WHERE id = ? AND vehicle_id = ?;', id, vehicleId);
  if (result.changes === 0) throw new Error('That maintenance schedule is no longer available.');
}

async function refreshScheduleBaseline(database: SQLiteDatabase, scheduleId: number, vehicleId: number): Promise<void> {
  const latest = await database.getFirstAsync<{ service_date: string; odometer_km: number }>(
    `SELECT service_date, odometer_km FROM maintenance_records WHERE schedule_id = ? AND vehicle_id = ? AND completed = 1 ORDER BY service_date DESC, id DESC LIMIT 1;`,
    scheduleId, vehicleId,
  );
  if (latest) {
    await database.runAsync(
      'UPDATE maintenance_schedules SET baseline_date = ?, baseline_odometer_km = ?, updated_at = ? WHERE id = ? AND vehicle_id = ?;',
      latest.service_date, latest.odometer_km, new Date().toISOString(), scheduleId, vehicleId,
    );
  }
}

export async function saveMaintenanceRecord(database: SQLiteDatabase, input: MaintenanceRecordInput, id?: number): Promise<number> {
  const error = validateMaintenanceRecord(input);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  let savedId = id;
  if (id !== undefined) {
    const previous = await getMaintenanceRecord(database, id);
    if (!previous || previous.vehicle_id !== input.vehicleId) throw new Error('That maintenance record is no longer available.');
    const result = await database.runAsync(
      `UPDATE maintenance_records SET schedule_id = ?, category = ?, service_date = ?, odometer_km = ?, cost_paise = ?, workshop = ?, notes = ?, completed = ?, updated_at = ? WHERE id = ? AND vehicle_id = ?;`,
      input.scheduleId, input.category.trim(), input.serviceDate, input.odometerKm, input.costPaise, input.workshop?.trim() || null, input.notes?.trim() || null, input.completed ? 1 : 0, now, id, input.vehicleId,
    );
    if (result.changes === 0) throw new Error('That maintenance record is no longer available.');
    if (previous.schedule_id !== null && previous.schedule_id !== input.scheduleId) await refreshScheduleBaseline(database, previous.schedule_id, input.vehicleId);
  } else {
    const result = await database.runAsync(
      `INSERT INTO maintenance_records (vehicle_id, schedule_id, category, service_date, odometer_km, cost_paise, workshop, notes, completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      input.vehicleId, input.scheduleId, input.category.trim(), input.serviceDate, input.odometerKm, input.costPaise, input.workshop?.trim() || null, input.notes?.trim() || null, input.completed ? 1 : 0, now, now,
    );
    savedId = result.lastInsertRowId;
  }
  if (input.scheduleId !== null && input.completed) await refreshScheduleBaseline(database, input.scheduleId, input.vehicleId);
  return savedId!;
}

export async function deleteMaintenanceRecord(database: SQLiteDatabase, id: number, vehicleId: number): Promise<void> {
  const record = await getMaintenanceRecord(database, id);
  if (!record || record.vehicle_id !== vehicleId) throw new Error('That maintenance record is no longer available.');
  await database.runAsync('DELETE FROM maintenance_records WHERE id = ? AND vehicle_id = ?;', id, vehicleId);
  if (record.schedule_id !== null) await refreshScheduleBaseline(database, record.schedule_id, vehicleId);
}
