import type { SQLiteDatabase } from 'expo-sqlite';
import type { FuelEntryInput } from '../fuel/types.ts';
import type { MaintenanceRecordInput } from '../maintenance/types.ts';
import { saveFuelEntry } from '../fuel/service.ts';
import { listFuelEntries } from '../fuel/repository.ts';
import { saveMaintenanceRecord, listMaintenanceRecords } from '../maintenance/repository.ts';
import { parseServiceCostPaise } from '../maintenance/validation.ts';
import { saveDocument } from '../ownership/documents.ts';
import { likelyDuplicate, type LineItem } from './parsing.ts';
import { type InvoiceItem, type RepairRule, defaultRule } from './repairs.ts';

export type ReceiptLink = { document_id: number; vehicle_id: number; fuel_id: number | null; service_id: number | null; fingerprint: string | null; reference: string | null; merchant: string | null };
export type ReviewInput =
  | { kind: 'fuel'; record: FuelEntryInput; date: string }
  | { kind: 'service'; record: MaintenanceRecordInput; items: LineItem[]; editingId?: number };
type ReceiptData = { attachment: string | null; fingerprint: string | null; reference: string; merchant: string };
export class DuplicateReceiptError extends Error {
  constructor() { super('A similar receipt or record already exists for this vehicle. Check it before saving another.'); }
}

export const listReceiptLinks = (db: SQLiteDatabase, vehicleId?: number) => vehicleId === undefined
  ? db.getAllAsync<ReceiptLink>('SELECT * FROM receipt_links')
  : db.getAllAsync<ReceiptLink>('SELECT * FROM receipt_links WHERE vehicle_id = ?', vehicleId);

export async function saveReviewedReceipt(db: SQLiteDatabase, review: ReviewInput, receipt: ReceiptData, confirmedDuplicate: boolean) {
  const vehicleId = review.record.vehicleId;
  const links = await listReceiptLinks(db, vehicleId);
  const ref = receipt.reference.trim();
  const merchant = receipt.merchant.trim();
  if (ref.length > 100 || merchant.length > 120) throw Error('Check the receipt reference and merchant length.');
  const basic = { vehicleId, fingerprint: receipt.fingerprint, reference: ref, paise: review.record.costPaise };
  const duplicate = review.kind === 'fuel'
    ? (await listFuelEntries(db, vehicleId)).some(item => {
      const link = links.find(row => row.fuel_id === item.id);
      return likelyDuplicate({ ...basic, time: review.record.refuelledAt, quantity: review.record.quantityMilliunits }, {
        vehicleId, time: item.refuelled_at, paise: item.cost_paise, quantity: item.quantity_milliunits,
        reference: link?.reference, fingerprint: link?.fingerprint,
      });
    })
    : (await listMaintenanceRecords(db, vehicleId)).some(item => {
      if (item.id === review.editingId) return false;
      const link = links.find(row => row.service_id === item.id);
      const sameBill = !!basic.fingerprint && basic.fingerprint === link?.fingerprint ||
        !!ref && ref.toLowerCase() === link?.reference?.toLowerCase() && item.service_date === review.record.serviceDate;
      const similarService = item.service_date === review.record.serviceDate && item.cost_paise === basic.paise
        && item.category.toLowerCase() === review.record.category.trim().toLowerCase()
        && (item.workshop ?? '').toLowerCase() === (review.record.workshop ?? '').trim().toLowerCase();
      return sameBill || similarService;
    });
  if (duplicate && !confirmedDuplicate) throw new DuplicateReceiptError();

  const previousLink = review.kind === 'service' && review.editingId
    ? links.find(link => link.service_id === review.editingId) : undefined;
  const id = review.kind === 'fuel' ? await saveFuelEntry(db, review.record)
    : await saveMaintenanceRecord(db, review.record, review.editingId);
  if (review.kind === 'service') {
    if (review.items.length > 30) throw Error('Keep at most 30 line items.');
    await db.runAsync('DELETE FROM service_invoice_items WHERE service_id = ? AND vehicle_id = ?', id, vehicleId);
    for (const item of review.items) {
      const name = item.description.trim();
      const quantity = item.quantity.trim();
      const cost = item.cost.trim() ? parseServiceCostPaise(item.cost) : null;
      if (!name || name.length > 160 || (quantity && !/^\d{1,5}(?:\.\d{1,3})?$/.test(quantity)) ||
        (item.cost.trim() && cost === null)) throw Error('Check the description, quantity and cost of each invoice item.');
      await db.runAsync('INSERT INTO service_invoice_items (service_id, vehicle_id, description, quantity_text, cost_paise) VALUES (?, ?, ?, ?, ?)',
        id, vehicleId, name, quantity || null, cost);
    }
  }
  if (previousLink && !receipt.attachment) return id;
  if (previousLink) await db.runAsync('DELETE FROM receipt_links WHERE service_id = ? AND vehicle_id = ?', id, vehicleId);
  const docId = await saveDocument(db, {
    vehicle_id: vehicleId, title: ((review.kind === 'fuel' ? 'Fuel receipt' : 'Service invoice') + (merchant ? ' · ' + merchant : '')).slice(0, 100),
    category: review.kind === 'fuel' ? 'Other' : 'Service-related document',
    description: '', issued_on: review.kind === 'fuel' ? review.date : review.record.serviceDate,
    expires_on: null, document_number: ref || null, attachment: receipt.attachment,
  } satisfies Parameters<typeof saveDocument>[1]);
  await db.runAsync('INSERT INTO receipt_links (document_id, vehicle_id, fuel_id, service_id, fingerprint, reference, merchant) VALUES (?, ?, ?, ?, ?, ?, ?)',
    docId, vehicleId, review.kind === 'fuel' ? id : null, review.kind === 'service' ? id : null,
    receipt.fingerprint, ref || null, merchant || null);
  return id;
}

export async function readServiceIntelligence(db: SQLiteDatabase, vehicleId: number) {
  const [records, links, items, rule, dismissed] = await Promise.all([
    listMaintenanceRecords(db, vehicleId), listReceiptLinks(db, vehicleId),
    db.getAllAsync<InvoiceItem>('SELECT * FROM service_invoice_items WHERE vehicle_id = ? ORDER BY service_id, id', vehicleId),
    db.getFirstAsync<RepairRule>('SELECT max_days, max_km FROM repair_preferences WHERE vehicle_id = ?', vehicleId),
    db.getAllAsync<{ observation: string }>('SELECT observation FROM repair_dismissals WHERE vehicle_id = ?', vehicleId),
  ]);
  return { records, links, items, rule: rule ?? defaultRule, dismissed: dismissed.map(item => item.observation) };
}

export function saveRepairRule(db: SQLiteDatabase, vehicleId: number, rule: RepairRule) {
  if (!Number.isInteger(rule.max_days) || rule.max_days < 1 || rule.max_days > 730 ||
    !Number.isInteger(rule.max_km) || rule.max_km < 1 || rule.max_km > 100000) throw Error('Enter whole limits of 1–730 days and 1–100,000 km.');
  return db.runAsync(`INSERT INTO repair_preferences VALUES (?, ?, ?)
    ON CONFLICT(vehicle_id) DO UPDATE SET max_days = excluded.max_days, max_km = excluded.max_km`,
    vehicleId, rule.max_days, rule.max_km);
}
export const dismissRepair = (db: SQLiteDatabase, vehicleId: number, key: string) =>
  db.runAsync('INSERT OR IGNORE INTO repair_dismissals VALUES (?, ?)', vehicleId, key);
