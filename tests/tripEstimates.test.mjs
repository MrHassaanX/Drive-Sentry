import test from 'node:test';
import assert from 'node:assert/strict';
import { metroTripPrice, parseTripDecimal, recordedEfficiency, resolveTripFuel, tripEstimate, tripRange } from '../src/features/trips/estimates.ts';

test('trip fuel estimates use routed kilometres, correct units and rounded integer paise', () => {
  assert.deepEqual(tripEstimate(144326, 'petrol', 15, 10500), { consumed: 144.326 / 15, unit: 'L', totalPaise: 101028 });
  assert.equal(tripEstimate(326074, 'diesel', 20)?.unit, 'L');
  assert.deepEqual(tripEstimate(156500, 'cng', 25, 8300), { consumed: 6.26, unit: 'kg', totalPaise: 51958 });
  assert.equal(tripEstimate(1000, 'petrol', 0), undefined);
  assert.equal(tripEstimate(1000, 'diesel', 20, 1.1)?.totalPaise, undefined);
  assert.equal(parseTripDecimal('105.30', 10000), 105.3);
  assert.equal(parseTripDecimal('105.305', 10000), undefined);
});

test('recorded mileage comes from complete matching full-tank intervals', () => {
  const entry = (id, km, quantity, fuel, full = 1) => ({
    id, refuelled_at: '2026-11-0' + id, odometer_km: km, quantity_milliunits: quantity,
    quantity_unit: fuel === 'cng' ? 'kg' : 'litre', cost_paise: 14000, is_full_tank: full, recorded_fuel_type: fuel,
  });
  const entries = [entry(1, 200, 3000, 'cng'), entry(2, 240, 1000, 'cng', 0),
    entry(3, 300, 3000, 'cng'), entry(4, 360, 2000, 'petrol', 0)];
  assert.equal(recordedEfficiency(entries, 'cng')?.efficiencyKmPerUnit, 25);
  assert.equal(recordedEfficiency(entries, 'petrol'), undefined);
  assert.equal(recordedEfficiency([entry(1, 200, 1000, 'diesel', 0), entry(2, 300, 3000, 'diesel', 0)], 'diesel'), undefined);
  assert.equal(resolveTripFuel('electric', 'petrol'), undefined);
  assert.equal(resolveTripFuel('hybrid'), undefined);
  assert.equal(resolveTripFuel('hybrid', 'diesel'), 'diesel');
  assert.equal(tripRange(undefined, 4, 25), 100);
  assert.equal(tripRange(74, 4, 25), 74);
  assert.equal(tripRange(undefined, undefined, 25), undefined);
});

test('city references require matching coverage, fuel and a recent effective date', () => {
  const current = { cityId: 'chennai', city: 'Chennai', fuel: 'diesel', paisePerLitre: 9800, effectiveDate: '2026-11-26' };
  const now = Date.parse('2026-11-28T06:00:00Z');
  assert.deepEqual(metroTripPrice([current], 'chennai', 'diesel', now), {
    paise: 9800, source: 'PPAC via India Petroleum API', coverage: 'Chennai city reference', observedAt: '2026-11-26',
  });
  assert.equal(metroTripPrice([current], 'mysuru', 'diesel', now), undefined);
  assert.equal(metroTripPrice([current], 'chennai', 'petrol', now), undefined);
  assert.equal(metroTripPrice([{ ...current, effectiveDate: '2026-11-25' }], 'chennai', 'diesel', now), undefined);
  assert.equal(metroTripPrice([{ ...current, effectiveDate: '2026-11-29' }], 'chennai', 'diesel', now), undefined);
});
