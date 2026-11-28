import type { SQLiteDatabase } from 'expo-sqlite';
import { expiryStatus, localDate, validDate } from '../ownership/dates.ts';

export type Warranty = {
  id: number; vehicle_id: number; component: string; provider_type: 'manufacturer' | 'workshop' | 'other';
  brand: string | null; vendor: string | null; installed_on: string | null; expires_on: string | null;
  duration_months: number | null; installed_km: number | null; limit_km: number | null;
  notes: string | null; remind: number; document_id: number | null; service_id: number | null;
};
export type WarrantyDraft = Omit<Warranty, 'id'>;

export function warrantyExpiry(item: Pick<Warranty, 'expires_on' | 'installed_on' | 'duration_months'>) {
  if (item.expires_on) return item.expires_on;
  if (!item.installed_on || !item.duration_months || !validDate(item.installed_on)) return null;
  const [year, month, day] = item.installed_on.split('-').map(Number);
  const last = new Date(Date.UTC(year, month + item.duration_months, 0));
  last.setUTCDate(Math.min(day, last.getUTCDate()));
  return last.toISOString().slice(0, 10);
}

export function warrantyStatus(item: WarrantyDraft, odometer: number | null, today = localDate()) {
  const expires = warrantyExpiry(item);
  if (expires && expires < today) return 'Expired';
  if (item.installed_on && item.installed_on > today) return 'Unknown';
  const mileageKnown = odometer !== null && item.installed_km !== null && odometer >= item.installed_km;
  if (item.limit_km && mileageKnown && odometer - item.installed_km! >= item.limit_km) return 'Mileage limit reached';
  if (expires && expiryStatus(expires, today) === 'Expiring soon') return 'Expiring soon';
  if (item.limit_km !== null && !mileageKnown) return 'Unknown';
  return expires || (item.limit_km && mileageKnown) ? 'Active' : 'Unknown';
}

export function validateWarranty(item: WarrantyDraft) {
  if (!item.component.trim() || item.component.trim().length > 100) throw Error('Enter a component name with up to 100 characters.');
  for (const value of [item.installed_on, item.expires_on]) if (value !== null && !validDate(value)) throw Error('Use valid dates in YYYY-MM-DD format.');
  if (item.installed_on && item.expires_on && item.installed_on > item.expires_on) throw Error('Expiry must follow the installation date.');
  if (item.installed_on && item.installed_on > localDate()) throw Error('Installation date cannot be in the future.');
  for (const [value, min, max] of [[item.duration_months, 1, 240], [item.installed_km, 0, 100_000_000], [item.limit_km, 1, 100_000_000]]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < min! || value > max!)) throw Error('Check duration and odometer limits.');
  }
  if (item.remind && !warrantyExpiry(item)) throw Error('Set a date or a duration and installation date to get expiry reminders.');
  if ((item.notes?.length ?? 0) > 2000 || (item.vendor?.length ?? 0) > 120 || (item.brand?.length ?? 0) > 120) {
    throw Error('Check the length of the warranty details.');
  }
}

const fields = 'component, provider_type, brand, vendor, installed_on, expires_on, duration_months, installed_km, limit_km, notes, remind, document_id, service_id';
export const listWarranties = (db: SQLiteDatabase, vehicleId: number) =>
  db.getAllAsync<Warranty>('SELECT * FROM component_warranties WHERE vehicle_id = ? ORDER BY component COLLATE NOCASE, id', vehicleId);
export const listWarrantyAlerts = (db: SQLiteDatabase) =>
  db.getAllAsync<Warranty>('SELECT * FROM component_warranties WHERE remind = 1');
export async function saveWarranty(db: SQLiteDatabase, item: WarrantyDraft, id?: number) {
  validateWarranty(item);
  const values = [item.component.trim(), item.provider_type, item.brand, item.vendor, item.installed_on,
    item.expires_on, item.duration_months, item.installed_km, item.limit_km, item.notes, item.remind, item.document_id, item.service_id];
  const result = id === undefined
    ? await db.runAsync(`INSERT INTO component_warranties (vehicle_id, ${fields}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item.vehicle_id, ...values)
    : await db.runAsync(`UPDATE component_warranties SET ${fields.split(', ').map(name => name + ' = ?').join(', ')}
        WHERE id = ? AND vehicle_id = ?`, ...values, id, item.vehicle_id);
  if (!result.changes) throw Error('This warranty is no longer available.');
  return id ?? result.lastInsertRowId;
}
export const deleteWarranty = (db: SQLiteDatabase, id: number, vehicleId: number) =>
  db.runAsync('DELETE FROM component_warranties WHERE id = ? AND vehicle_id = ?', id, vehicleId);
