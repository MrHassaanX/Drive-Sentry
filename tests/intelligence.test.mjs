import assert from 'node:assert/strict';
import test from 'node:test';
import { likelyDuplicate, parseReceipt, receiptDate, singleCandidate } from '../src/features/intelligence/parsing.ts';
import { warrantyExpiry, warrantyStatus } from '../src/features/intelligence/warranties.ts';
import { defaultRule, normalizeComponent, repairInsights } from '../src/features/intelligence/repairs.ts';
import { planReminders, reminderChanges } from '../src/features/ownership/reminderPlan.ts';

const today = '2026-11-26';
const parse = text => parseReceipt(text, today);

test('petrol receipt separates quantity, rate, total, transaction, time and grouped odometer readings', () => {
  const result = parse('Example Fuel Station\nDate: 22/11/2026 3:40 pm\nPETROL 4.520 L\nRate/Ltr 110.62\nTotal INR 500\nReceipt No FP-10402\nVehicle KA-09-ZZ-0001\nOdometer: 12,345 km');
  assert.equal(result.kind, 'fuel');
  const values = Object.fromEntries(Object.keys(result.fields).map(field => [field, singleCandidate(result, field)]));
  assert.deepEqual(values, { merchant: 'Example Fuel Station', date: '2026-11-22', time: '15:40', fuel: 'petrol',
    quantity: '4.520 L', rate: '110.62', total: '500', reference: 'FP-10402', registration: 'KA09ZZ0001', odometer: '12345' });
  assert.equal(singleCandidate(parse('Odometer: 12, 345 km'), 'odometer'), '12345');
  assert.equal(singleCandidate(parse('Odometer: 1, 23, 456 km'), 'odometer'), '123456');
  assert.equal(singleCandidate(parse('Odometer: 12, 34 km'), 'odometer'), '');
  assert.equal(singleCandidate(parse('Odometer: 12,, 345 km'), 'odometer'), '');
  assert.equal(singleCandidate(parse('Odometer: 12.5 km'), 'odometer'), '');
});

test('diesel and CNG keep physical units and Indian comma totals', () => {
  const diesel = parse('DIESEL 12.35 litres\nAmount Rs. 1,234.50');
  assert.equal(singleCandidate(diesel, 'quantity'), '12.35 L');
  assert.equal(singleCandidate(diesel, 'total'), '1234.50');
  assert.equal(singleCandidate(diesel, 'fuel'), 'diesel');
  const cng = parse('CNG 4.521 kgs\nTotal ₹500.00');
  assert.equal(singleCandidate(cng, 'quantity'), '4.521 kg');
  assert.equal(singleCandidate(cng, 'odometer'), '');
});

test('missing and conflicting fuel fields require manual review', () => {
  const result = parse('Receipt No FD-342\nAmount ₹500.00\nTotal ₹510.00\nTotal ₹510.00\nCGST: 99.00');
  assert.equal(result.fields.total.length, 2);
  assert.equal(singleCandidate(result, 'total'), '');
  assert.equal(singleCandidate(result, 'quantity'), '');
  assert.equal(singleCandidate(result, 'fuel'), '');
  assert.equal(singleCandidate(result, 'odometer'), '');
  assert.equal(parse('Petrol 4.5 L\nDiesel 6 L').fields.quantity.length, 2);
  assert.equal(singleCandidate(parse('Total items 2\nTotal 500.005\nAmount -₹100.00'), 'total'), '');
});

test('Indian, ISO and named invoice dates work only when valid and no later than today', () => {
  for (const text of ['25/11/26', '25.11.2026', '25 Nov, 2026', '2026-11-25']) {
    assert.equal(receiptDate(text, today), '2026-11-25');
  }
  for (const value of ['30/02/2026', '2026-11-27', '08/18/2026']) assert.equal(receiptDate(value, today), undefined);
});

test('service invoice preserves reviewed item candidates, GST, discounts and unknown descriptions', () => {
  const result = parse('Sample Service Centre\nInvoice no: WS-A10-2\nDate: 22 Nov 2026\nEngine oil  2  900.00\nSpecial actuator assembly  1  400.00\nGeneral labour 500.00\nGST 60.00\nDiscount 10.00\nGrand Total ₹1850.00');
  assert.equal(result.kind, 'service');
  assert.deepEqual(result.items.map(x => [x.description, x.quantity, x.cost]), [
    ['Engine oil', '2', '900.00'], ['Special actuator assembly', '1', '400.00'], ['General labour', '', '500.00'],
  ]);
  assert.equal(singleCandidate(result, 'reference'), 'WS-A10-2');
  assert.equal(singleCandidate(result, 'labour'), '500.00');
  assert.equal(singleCandidate(result, 'gst'), '60.00');
  assert.equal(singleCandidate(result, 'discount'), '10.00');
  assert.equal(singleCandidate(result, 'total'), '1850.00');
  assert.equal(singleCandidate(parse('Grand Total INR 1, 850.00'), 'total'), '1850.00');
  assert.equal(singleCandidate(parse('Grand Total INR 1,, 850.00'), 'total'), '');
  assert.deepEqual(parse('Vehicle battery 1,, 500.00').items, [{ description: 'Vehicle battery', quantity: '', cost: '' }]);
  const partial = parse('Oil filter x 1 ₹300.00\nSubtotal 300.00\nUnreadable @@@');
  assert.equal(partial.items.length, 1);
  assert.equal(singleCandidate(partial, 'total'), '');
});

test('same amounts alone do not flag transactions as duplicate', () => {
  const receipt = { vehicleId: 1, paise: 50000, quantity: 4500, time: '2026-11-22T00:00:00Z', fingerprint: 'sample' };
  assert.equal(likelyDuplicate(receipt, { ...receipt }), true);
  assert.equal(likelyDuplicate(receipt, { ...receipt, vehicleId: 2 }), false);
  assert.equal(likelyDuplicate(receipt, { ...receipt, fingerprint: null, time: '2026-11-22T02:00:00Z' }), false);
  assert.equal(likelyDuplicate({ ...receipt, reference: 'RC1' }, { ...receipt, fingerprint: null, reference: 'rc1', time: '2026-11-22T02:00:00Z' }), true);
});

const warranty = { id: 1, vehicle_id: 1, component: 'Vehicle battery', installed_on: '2026-01-31',
  expires_on: null, duration_months: 6, installed_km: 1000, limit_km: 5000, service_id: 1 };

test('warranties use calendar months, recorded mileage limits and unknown information', () => {
  assert.equal(warrantyExpiry({ ...warranty, duration_months: 1 }), '2026-02-28');
  assert.equal(warrantyStatus(warranty, 1001, '2026-02-01'), 'Active');
  assert.equal(warrantyStatus(warranty, 1001, '2026-07-15'), 'Expiring soon');
  assert.equal(warrantyStatus(warranty, 6000, '2026-02-01'), 'Mileage limit reached');
  assert.equal(warrantyStatus(warranty, 1010, '2026-08-01'), 'Expired');
  assert.equal(warrantyStatus({ ...warranty, installed_km: null }, null, '2026-02-01'), 'Unknown');
});

test('wallet and warranty notifications use distinct keys and removing a warranty cancels its reminder', () => {
  const now = new Date(2026, 0, 1);
  const docs = [{ id: 1, expires_on: '2026-01-08' }];
  const plan = planReminders([...docs, { id: -1, expires_on: '2026-01-08' }], [0], now);
  assert.equal(new Set(plan.map(item => item.key)).size, 2);
  const existing = plan.map(item => ({ id: String(item.documentId), key: item.key }));
  assert.deepEqual(reminderChanges(planReminders(docs, [0], now), existing), { cancel: ['-1'], schedule: [] });
});

const service = (id, date, km, category = 'Battery replacement', vehicle_id = 1) =>
  ({ id, service_date: date, odometer_km: km, category, vehicle_id, completed: 1 });

test('repeat repair matches equivalent parts, explains interval and locates a possible warranty', () => {
  const records = [service(1, '2026-02-01', 1200), service(2, '2026-03-01', 1500, 'Vehicle battery')];
  const [found] = repairInsights(1, records, [], [warranty], defaultRule, []);
  assert.equal(found.component, 'Battery');
  assert.equal(found.days, 28);
  assert.equal(found.km, 300);
  assert.equal(found.warranty, warranty);
  assert.deepEqual(repairInsights(1, records, [], [], defaultRule, [found.key]), []);
});

test('repeat rules avoid mixing vehicles, positions, inspections, same-visit items and routine services', () => {
  assert.equal(normalizeComponent('Front brake pad replacement'), 'Brake pads · front');
  assert.notEqual(normalizeComponent('Brake pads'), normalizeComponent('Front brake pads'));
  assert.equal(normalizeComponent('Battery and tyre'), null);
  assert.equal(normalizeComponent('Battery check'), null);
  assert.equal(normalizeComponent('Front brake inspection'), null);
  assert.equal(normalizeComponent('Rear brake servicing'), 'Brake service · rear');
  const past = service(1, '2026-01-01', 1200);
  for (const current of [service(2, '2026-01-01', 1200), service(2, '2026-02-01', 1500, 'Rear tyre'),
    service(2, '2026-02-01', 1400, 'Battery replacement', 2), service(2, '2026-10-01', 1400), service(2, '2026-02-01', 5000)]) {
    assert.deepEqual(repairInsights(1, [past, current], [], [], defaultRule, []), []);
  }
  assert.deepEqual(repairInsights(1, [service(1, '2026-01-01', 1000, 'Engine oil'),
    service(2, '2026-04-01', 4000, 'Engine oil change')], [], [], defaultRule, []), []);
});
