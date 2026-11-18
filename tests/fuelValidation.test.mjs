import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fuelEntryToForm,
  isValidCalendarDate,
  toFuelEntryInput,
  validateFuelEntryForm,
} from '../src/features/fuel/validation.ts';

const now = new Date(2026, 4, 15, 12, 0);
const validForm = {
  date: '2026-05-15',
  time: '11:30',
  odometerKm: '25430',
  quantityAmount: '32.125',
  totalPaidRupees: '3200.50',
  fillType: 'full',
};

test('validates fuel input and stores quantity and rupees in precise integer units', () => {
  assert.deepEqual(validateFuelEntryForm(validForm, 'litre', now), {});
  const input = toFuelEntryInput(validForm, 7, 'litre');
  assert.equal(input.vehicleId, 7);
  assert.equal(input.odometerKm, 25430);
  assert.equal(input.quantityMilliunits, 32125);
  assert.equal(input.quantityUnit, 'litre');
  assert.equal(input.costPaise, 320050);
  assert.equal(input.isFullTank, true);

  const date = new Date(input.refuelledAt);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 4);
  assert.equal(date.getDate(), 15);
  assert.equal(date.getHours(), 11);
  assert.equal(date.getMinutes(), 30);
});

test('validates real calendar dates, time, odometer, quantity precision, and amount precision', () => {
  assert.equal(isValidCalendarDate('2024-02-29'), true);
  assert.equal(isValidCalendarDate('2026-02-29'), false);
  const errors = validateFuelEntryForm({
    ...validForm,
    date: '2026-02-30',
    time: '24:00',
    odometerKm: '100.5',
    quantityAmount: '1.1234',
    totalPaidRupees: '12.345',
    fillType: 'unknown',
  }, 'litre', now);
  assert.ok(errors.date);
  assert.ok(errors.time);
  assert.ok(errors.odometerKm);
  assert.ok(errors.quantityAmount);
  assert.ok(errors.totalPaidRupees);
  assert.ok(errors.fillType);
});

test('rejects future refills and handles CNG quantities in kilograms', () => {
  assert.ok(validateFuelEntryForm({ ...validForm, date: '2026-05-16' }, 'litre', now).date);
  assert.deepEqual(validateFuelEntryForm({ ...validForm, quantityAmount: '8.500' }, 'kg', now), {});

  const cngInput = toFuelEntryInput({ ...validForm, quantityAmount: '8.500' }, 4, 'kg');
  const form = fuelEntryToForm({
    refuelled_at: cngInput.refuelledAt,
    odometer_km: cngInput.odometerKm,
    quantity_milliunits: cngInput.quantityMilliunits,
    quantity_unit: cngInput.quantityUnit,
    cost_paise: cngInput.costPaise,
    is_full_tank: 1,
  });
  assert.equal(form.quantityAmount, '8.5');
  assert.equal(form.fillType, 'full');
});
