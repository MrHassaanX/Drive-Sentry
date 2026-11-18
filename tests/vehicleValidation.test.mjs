import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRegistrationNumber, toVehicleWriteInput, validateVehicleForm } from '../src/features/vehicles/validation.ts';

const validForm = {
  name: '  Daily car ',
  manufacturer: ' Tata ',
  model: ' Nexon ',
  vehicleType: 'car',
  fuelType: 'petrol',
  registrationNumber: ' mh 12 ab 1234 ',
  currentOdometerKm: '25000',
  modelYear: '2022',
};

test('accepts a valid vehicle and normalizes the saved values', () => {
  assert.deepEqual(validateVehicleForm(validForm), {});
  assert.deepEqual(toVehicleWriteInput(validForm), {
    name: 'Daily car',
    manufacturer: 'Tata',
    model: 'Nexon',
    vehicleType: 'car',
    fuelType: 'petrol',
    registrationNumber: 'MH12AB1234',
    currentOdometerKm: 25000,
    modelYear: 2022,
  });
});

test('requires the identifying fields and rejects unknown types', () => {
  const errors = validateVehicleForm({
    ...validForm,
    name: ' ',
    manufacturer: '',
    model: ' ',
    vehicleType: 'scooter',
    fuelType: 'unknown',
  });
  assert.ok(errors.name);
  assert.ok(errors.manufacturer);
  assert.ok(errors.model);
  assert.ok(errors.vehicleType);
  assert.ok(errors.fuelType);
});

test('requires a nonnegative whole-kilometre odometer', () => {
  for (const currentOdometerKm of ['', '-1', '1.5', 'not a number', '9007199254740992']) {
    assert.ok(validateVehicleForm({ ...validForm, currentOdometerKm }).currentOdometerKm);
  }
  assert.deepEqual(validateVehicleForm({ ...validForm, currentOdometerKm: '0' }), {});
});

test('allows optional registration and model year to remain empty', () => {
  assert.deepEqual(validateVehicleForm({ ...validForm, registrationNumber: '', modelYear: '' }), {});
  assert.equal(normalizeRegistrationNumber('  '), null);
});

test('rejects an impossible model year and an overlong registration', () => {
  const errors = validateVehicleForm({ ...validForm, modelYear: '1800', registrationNumber: 'A'.repeat(21) });
  assert.ok(errors.modelYear);
  assert.ok(errors.registrationNumber);
});
