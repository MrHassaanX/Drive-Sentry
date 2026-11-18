import assert from 'node:assert/strict';
import test from 'node:test';

import { addCalendarMonths, calculateMaintenanceStatus, estimateDailyDistance, resolveMaintenanceOdometer } from '../src/features/maintenance/calculations.ts';
import { validateMaintenanceRecord, validateMaintenanceSchedule } from '../src/features/maintenance/validation.ts';

function schedule(overrides = {}) {
  return { id: 1, vehicle_id: 1, category: 'Engine oil', interval_km: 3000, interval_months: null,
    baseline_odometer_km: 8000, baseline_date: '2026-01-01', enabled: 1, created_at: '', updated_at: '', ...overrides };
}

test('distance schedule calculates next odometer and due soon threshold', () => {
  const status = calculateMaintenanceStatus(schedule(), 10850, '2026-04-01');
  assert.equal(status.nextOdometerKm, 11000);
  assert.equal(status.remainingKm, 150);
  assert.equal(status.state, 'due-soon');
});

test('distance schedules distinguish upcoming, due now and overdue', () => {
  assert.equal(calculateMaintenanceStatus(schedule(), 10000, '2026-04-01').state, 'upcoming');
  assert.equal(calculateMaintenanceStatus(schedule(), 11000, '2026-04-01').state, 'due-now');
  assert.equal(calculateMaintenanceStatus(schedule(), 11001, '2026-04-01').state, 'overdue');
});

test('date-only schedules use calendar days and 7-day due soon threshold', () => {
  const dateOnlySchedule = schedule({ interval_km: null, interval_months: 6, baseline_date: '2026-01-31' });
  assert.equal(calculateMaintenanceStatus(dateOnlySchedule, 0, '2026-07-24').state, 'due-soon');
  assert.equal(calculateMaintenanceStatus(dateOnlySchedule, 0, '2026-07-31').state, 'due-now');
  assert.equal(calculateMaintenanceStatus(dateOnlySchedule, 0, '2026-08-01').state, 'overdue');
  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29');
});

test('combined schedule becomes due as soon as distance or time limit is reached', () => {
  const combined = schedule({ interval_months: 6 });
  assert.equal(calculateMaintenanceStatus(combined, 9000, '2026-06-23').state, 'upcoming');
  assert.equal(calculateMaintenanceStatus(combined, 9000, '2026-06-24').state, 'due-soon');
  assert.equal(calculateMaintenanceStatus(combined, 9000, '2026-07-01').state, 'due-now');
  assert.equal(calculateMaintenanceStatus(combined, 11000, '2026-02-01').state, 'due-now');
});

test('forecasting needs reliable chronological odometer history', () => {
  const readings = [{ date: '2026-01-01', odometerKm: 8000 }, { date: '2026-01-11', odometerKm: 9000 }];
  assert.equal(estimateDailyDistance(readings), 100);
  const status = calculateMaintenanceStatus(schedule(), 10000, '2026-01-11', readings);
  assert.equal(status.estimatedDueDate, '2026-01-21');
  assert.equal(estimateDailyDistance([{ date: '2026-01-01', odometerKm: 8000 }]), null);
  assert.equal(calculateMaintenanceStatus(schedule(), 10000, '2026-01-11').estimatedDueDate, null);
  assert.equal(estimateDailyDistance([{ date: 'bad', odometerKm: 10 }, { date: 'bad', odometerKm: 20 }]), null);
});

test('invalid date baselines do not produce false date deadlines and odometer uses highest known source', () => {
  const invalid = schedule({ interval_km: null, interval_months: 3, baseline_date: '2026-02-30' });
  const status = calculateMaintenanceStatus(invalid, 0, '2026-03-01');
  assert.equal(status.nextDate, null);
  assert.equal(status.remainingDays, null);
  assert.equal(status.state, 'upcoming');
  assert.equal(resolveMaintenanceOdometer(9000, [8500, 9500, -10]), 9500);
});

test('maintenance validators reject invalid calendar dates and empty intervals', () => {
  assert.equal(validateMaintenanceSchedule({ vehicleId: 1, category: 'Engine oil', intervalKm: null, intervalMonths: null, baselineOdometerKm: 0, baselineDate: null, enabled: true }), 'Set a distance interval, a time interval, or both.');
  assert.equal(validateMaintenanceSchedule({ vehicleId: 1, category: 'Engine oil', intervalKm: 3000, intervalMonths: null, baselineOdometerKm: 0, baselineDate: '2026-02-30', enabled: true }), 'Enter a valid baseline date.');
  assert.equal(validateMaintenanceRecord({ vehicleId: 1, scheduleId: null, category: 'Oil', serviceDate: '2026-02-30', odometerKm: 1, costPaise: 0, workshop: null, notes: null, completed: true }), 'Enter a valid service date.');
});
