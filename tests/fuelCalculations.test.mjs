import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateFuelInsights, calculateMileageSegments } from '../src/features/fuel/calculations.ts';

function entry(id, day, odometer, quantity, cost, isFull, unit = 'litre') {
  return {
    id,
    vehicle_id: 1,
    refuelled_at: `2026-01-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    odometer_km: odometer,
    quantity_milliunits: quantity,
    quantity_unit: unit,
    cost_paise: cost,
    is_full_tank: isFull ? 1 : 0,
    created_at: '',
    updated_at: '',
  };
}

test('mileage starts at the first full tank and includes intervening partial refills', () => {
  const rows = [
    entry(1, 1, 900, 5000, 70000, false),
    entry(2, 2, 1000, 35000, 450000, true),
    entry(3, 3, 1200, 20000, 250000, false),
    entry(4, 4, 1400, 30000, 360000, true),
    entry(5, 5, 1500, 12000, 145000, false),
  ];

  const [segment] = calculateMileageSegments(rows);
  assert.equal(calculateMileageSegments(rows).length, 1);
  assert.equal(segment.startEntryId, 2);
  assert.equal(segment.endEntryId, 4);
  assert.equal(segment.distanceKm, 400);
  assert.equal(segment.quantityMilliunits, 50000);
  assert.equal(segment.efficiencyKmPerUnit, 8);
  assert.equal(segment.costPaise, 610000);
  assert.equal(segment.costPerKmRupees, 15.25);
});

test('does not calculate mileage without two full tanks or across an odometer rollback', () => {
  assert.deepEqual(calculateMileageSegments([entry(1, 1, 1000, 30000, 400000, true)]), []);

  const rows = [
    entry(1, 1, 1000, 30000, 400000, true),
    entry(2, 2, 900, 10000, 120000, false),
    entry(3, 3, 1200, 28000, 360000, true),
    entry(4, 4, 1300, 10000, 120000, false),
    entry(5, 5, 1400, 20000, 250000, true),
  ];
  const segments = calculateMileageSegments(rows);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].startEntryId, 3);
  assert.equal(segments[0].distanceKm, 200);
  assert.equal(segments[0].quantityMilliunits, 30000);
});

test('preserves CNG efficiency as kilometres per kilogram and separates mixed-unit intervals', () => {
  const rows = [
    entry(1, 1, 1000, 8000, 60000, true, 'kg'),
    entry(2, 2, 1100, 8000, 68000, true, 'kg'),
    entry(3, 3, 1200, 10000, 100000, false, 'litre'),
    entry(4, 4, 1300, 10000, 100000, true, 'litre'),
  ];
  const segments = calculateMileageSegments(rows);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].quantityUnit, 'kg');
  assert.equal(segments[0].efficiencyKmPerUnit, 12.5);
  const next = calculateMileageSegments([...rows, entry(5, 5, 1450, 10000, 100000, true, 'litre')]);
  assert.equal(next.length, 2);
  assert.equal(next[1].quantityUnit, 'litre');
  assert.equal(next[1].efficiencyKmPerUnit, 15);
});

test('calculates month and all-time expenditure from recorded entries', () => {
  const rows = [
    entry(1, 1, 1000, 8000, 60000, true),
    entry(2, 2, 1100, 9000, 68000, true),
  ];
  const insights = calculateFuelInsights(rows, '2026-01');
  assert.equal(insights.monthSpendPaise, 128000);
  assert.equal(insights.allTimeSpendPaise, 128000);
  assert.equal(insights.latestMileage?.efficiencyKmPerUnit, 11.11111111111111);
});
