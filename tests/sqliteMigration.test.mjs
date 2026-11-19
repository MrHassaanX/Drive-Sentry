import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import initSqlJs from 'sql.js';
import { DATABASE_VERSION, FUEL_ENTRIES_SCHEMA_SQL, INITIAL_SCHEMA_SQL, MAINTENANCE_SCHEMA_SQL, STABILIZATION_SCHEMA_SQL, migrateDbIfNeeded } from '../src/db/migrations.ts';
import {
  createVehicle,
  deleteVehicle,
  getSelectedVehicleId,
  getVehicle,
  listVehicles,
  setSelectedVehicleId,
  updateVehicle,
} from '../src/features/vehicles/repository.ts';
import { saveFuelEntry } from '../src/features/fuel/service.ts';
import { normalizeMetroPrices } from '../src/features/fuelPrices/provider.ts';
import { readMetroPrices, savePriceBatch } from '../src/features/fuelPrices/repository.ts';
import { calculateFuelInsights } from '../src/features/fuel/calculations.ts';
import { deleteFuelEntry, getFuelEntry, listFuelEntries } from '../src/features/fuel/repository.ts';
import { deleteMaintenanceRecord, deleteMaintenanceSchedule, getMaintenanceRecord, getMaintenanceSchedule, listMaintenanceRecords, listMaintenanceSchedules, saveMaintenanceRecord, saveMaintenanceSchedule } from '../src/features/maintenance/repository.ts';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });

function makeAdapter(database) {
  return {
    async execAsync(sql) {
      database.run(sql);
    },
    async withTransactionAsync(task) {
      database.run('BEGIN;');
      try {
        await task();
        database.run('COMMIT;');
      } catch (error) {
        database.run('ROLLBACK;');
        throw error;
      }
    },
    async getAllAsync(sql, ...params) {
      const statement = database.prepare(sql);
      try {
        statement.bind(params);
        const rows = [];
        while (statement.step()) rows.push(statement.getAsObject());
        return rows;
      } finally {
        statement.free();
      }
    },
    async getFirstAsync(sql, ...params) {
      const [row] = await this.getAllAsync(sql, ...params);
      return row ?? null;
    },
    async runAsync(sql, ...params) {
      database.run(sql, params);
      const changes = database.getRowsModified();
      const lastInsertRowId = database.exec('SELECT last_insert_rowid();')[0]?.values[0]?.[0] ?? 0;
      return { changes, lastInsertRowId };
    },
  };
}

function makeDatabase() {
  const database = new SQL.Database();
  return { database, adapter: makeAdapter(database) };
}

const sampleVehicle = {
  name: 'City car',
  manufacturer: 'Tata',
  model: 'Nexon',
  vehicleType: 'car',
  fuelType: 'petrol',
  registrationNumber: null,
  currentOdometerKm: 25000,
  modelYear: 2022,
};

function fuelInput(vehicleId, refuelledAt, odometerKm, quantityMilliunits, costPaise, isFullTank, quantityUnit = 'litre') {
  return { vehicleId, refuelledAt, odometerKm, quantityMilliunits, costPaise, isFullTank, quantityUnit };
}

test('version 0 database migrates to version 6 with maintenance tables and constrained fuel records', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, DATABASE_VERSION);
    assert.equal((await adapter.getFirstAsync('PRAGMA foreign_keys;')).foreign_keys, 1);
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);

    const vehicleId = await createVehicle(adapter, sampleVehicle);
    await adapter.runAsync(
      `INSERT INTO fuel_entries (vehicle_id, refuelled_at, odometer_km, quantity_milliunits, quantity_unit, cost_paise, is_full_tank, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      vehicleId, '2026-01-01T10:00:00.000Z', 25000, 35000, 'litre', 400000, 1, 't', 't',
    );
    for (const invalid of [
      [999, '2026-01-02T10:00:00.000Z', 25010, 1000, 'litre', 10000, 0, 't', 't'],
      [vehicleId, '2026-01-02T10:00:00.000Z', 25010, 0, 'litre', 10000, 0, 't', 't'],
      [vehicleId, '2026-01-02T10:00:00.000Z', 25010, 1000, 'gallon', 10000, 0, 't', 't'],
      [vehicleId, '2026-01-02T10:00:00.000Z', 25010, 1000, 'litre', -1, 0, 't', 't'],
      [vehicleId, '2026-01-02T10:00:00.000Z', 25010, 1000, 'litre', 10000, 2, 't', 't'],
    ]) {
      await assert.rejects(adapter.runAsync(
        `INSERT INTO fuel_entries (vehicle_id, refuelled_at, odometer_km, quantity_milliunits, quantity_unit, cost_paise, is_full_tank, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        ...invalid,
      ));
    }
  } finally {
    database.close();
  }
});

test('version 1 migration adds fuel storage without discarding existing vehicles', async () => {
  const { database, adapter } = makeDatabase();
  try {
    database.run('PRAGMA foreign_keys = ON;');
    database.run(INITIAL_SCHEMA_SQL);
    const vehicleId = await createVehicle(adapter, sampleVehicle);

    await migrateDbIfNeeded(adapter);

    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, DATABASE_VERSION);
    assert.equal((await getVehicle(adapter, vehicleId))?.name, sampleVehicle.name);
    assert.deepEqual(await listFuelEntries(adapter, vehicleId), []);
  } finally {
    database.close();
  }
});

test('version 2 migration preserves vehicle and fuel records and adds maintenance storage', async () => {
  const { database, adapter } = makeDatabase();
  try {
    database.run('PRAGMA foreign_keys = ON;');
    database.run(INITIAL_SCHEMA_SQL);
    database.run(FUEL_ENTRIES_SCHEMA_SQL);
    const vehicleId = await createVehicle(adapter, sampleVehicle);
    database.run("INSERT INTO fuel_entries VALUES (1, ?, '2026-01-01T10:00:00.000Z', 25000, 35000, 'litre', 400000, 1, 't', 't');", [vehicleId]);
    await migrateDbIfNeeded(adapter);
    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, DATABASE_VERSION);
    assert.equal((await listFuelEntries(adapter, vehicleId)).length, 1);
    assert.equal((await listFuelEntries(adapter, vehicleId))[0].recorded_fuel_type, null);
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);
    assert.deepEqual(await listMaintenanceRecords(adapter, vehicleId), []);
  } finally { database.close(); }
});

test('version 3 retains legacy records and uses a completed service until its baseline must be confirmed', async () => {
  const { database, adapter } = makeDatabase();
  try {
    database.run('PRAGMA foreign_keys = ON;');
    database.run(INITIAL_SCHEMA_SQL + FUEL_ENTRIES_SCHEMA_SQL + MAINTENANCE_SCHEMA_SQL);
    const vehicleId = await createVehicle(adapter, sampleVehicle);
    await setSelectedVehicleId(adapter, vehicleId);
    database.run("INSERT INTO maintenance_schedules VALUES (1, ?, 'Oil', 3000, 6, 9000, '2026-02-01', 1, 't', 't');", [vehicleId]);
    database.run("INSERT INTO maintenance_records VALUES (1, ?, 1, 'Oil', '2026-02-01', 9000, 1234, NULL, NULL, 1, 't', 't');", [vehicleId]);
    await migrateDbIfNeeded(adapter);
    await migrateDbIfNeeded(adapter);
    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, DATABASE_VERSION);
    assert.equal(await getSelectedVehicleId(adapter), vehicleId);
    assert.equal((await getMaintenanceRecord(adapter, 1, vehicleId)).cost_paise, 1234);
    const effective = () => getMaintenanceSchedule(adapter, 1, vehicleId);
    assert.equal((await effective()).baseline_odometer_km, 9000);
    assert.equal((await effective()).configured_odometer_km, null);
    await deleteMaintenanceRecord(adapter, 1, vehicleId);
    assert.equal((await effective()).baseline_odometer_km, null);
    assert.equal((await effective()).baseline_date, null);
    assert.deepEqual(await adapter.getFirstAsync('SELECT baseline_odometer_km, baseline_date FROM maintenance_schedules WHERE id = 1;'),
      { baseline_odometer_km: 9000, baseline_date: '2026-02-01' });
    await saveMaintenanceSchedule(adapter, { vehicleId, category: 'Oil', intervalKm: 3000, intervalMonths: 6, baselineOdometerKm: 8000, baselineDate: '2026-01-01', enabled: true }, 1);
    assert.equal((await effective()).baseline_odometer_km, 8000);
    assert.equal((await effective()).baseline_date, '2026-01-01');
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);
  } finally { database.close(); }
});

test('maintenance CRUD isolates vehicles and retains service history when a schedule is deleted', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const firstVehicle = await createVehicle(adapter, sampleVehicle);
    const secondVehicle = await createVehicle(adapter, { ...sampleVehicle, name: 'Other vehicle', model: 'Altroz' });
    const scheduleId = await saveMaintenanceSchedule(adapter, { vehicleId: firstVehicle, category: 'Engine oil', intervalKm: 3000, intervalMonths: 6, baselineOdometerKm: 8000, baselineDate: '2026-01-31', enabled: true });
    await assert.rejects(saveMaintenanceRecord(adapter, { vehicleId: secondVehicle, scheduleId, category: 'Engine oil', serviceDate: '2026-02-01', odometerKm: 1, costPaise: 0, workshop: null, notes: null, completed: true }), /same vehicle/);
    const recordId = await saveMaintenanceRecord(adapter, { vehicleId: firstVehicle, scheduleId, category: 'Engine oil', serviceDate: '2026-02-02', odometerKm: 8500, costPaise: 123456, workshop: 'Local garage', notes: 'Filter replaced', completed: true });
    assert.equal((await listMaintenanceSchedules(adapter, firstVehicle))[0].baseline_odometer_km, 8500);
    assert.equal((await listMaintenanceRecords(adapter, secondVehicle)).length, 0);
    assert.equal(await getMaintenanceRecord(adapter, recordId, secondVehicle), null);
    assert.equal(await getMaintenanceSchedule(adapter, scheduleId, secondVehicle), null);
    await assert.rejects(deleteMaintenanceRecord(adapter, recordId, secondVehicle), /no longer available/);
    await assert.rejects(deleteMaintenanceSchedule(adapter, scheduleId, secondVehicle), /no longer available/);
    assert.equal((await listMaintenanceRecords(adapter, firstVehicle))[0].cost_paise, 123456);
    await deleteMaintenanceSchedule(adapter, scheduleId, firstVehicle);
    assert.equal((await listMaintenanceRecords(adapter, firstVehicle))[0].schedule_id, null);
    await deleteMaintenanceRecord(adapter, recordId, firstVehicle);
    assert.deepEqual(await listMaintenanceRecords(adapter, firstVehicle), []);
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);
  } finally { database.close(); }
});

test('editing, replanning, moving and deleting completed services recalculates both schedules', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const vehicleId = await createVehicle(adapter, sampleVehicle);
    const base = { vehicleId, category: 'Oil', intervalKm: 3000, intervalMonths: 6, baselineOdometerKm: 8000, baselineDate: '2026-01-01', enabled: true };
    const first = await saveMaintenanceSchedule(adapter, base);
    const second = await saveMaintenanceSchedule(adapter, { ...base, category: 'Tyres', baselineOdometerKm: 7000, baselineDate: '2025-12-01' });
    const service = { vehicleId, scheduleId: first, category: 'Oil', serviceDate: '2026-02-01', odometerKm: 9000, costPaise: 1234, workshop: null, notes: null, completed: true };
    const oldId = await saveMaintenanceRecord(adapter, service);
    const recent = { ...service, serviceDate: '2026-03-01', odometerKm: 9500 };
    const recentId = await saveMaintenanceRecord(adapter, recent);
    const baselines = async () => (await listMaintenanceSchedules(adapter, vehicleId)).map(({ baseline_odometer_km, baseline_date }) => [baseline_odometer_km, baseline_date]);

    await saveMaintenanceRecord(adapter, { ...recent, completed: false }, recentId);
    assert.deepEqual(await baselines(), [[9000, '2026-02-01'], [7000, '2025-12-01']]);
    await saveMaintenanceRecord(adapter, { ...recent, serviceDate: '2026-01-25', odometerKm: 8800 }, recentId);
    assert.equal((await baselines())[0][0], 9000);
    await saveMaintenanceRecord(adapter, { ...recent, odometerKm: 9600 }, recentId);
    assert.deepEqual((await baselines())[0], [9600, '2026-03-01']);
    await deleteMaintenanceRecord(adapter, recentId, vehicleId);
    assert.deepEqual((await baselines())[0], [9000, '2026-02-01']);
    await saveMaintenanceRecord(adapter, { ...service, scheduleId: second, category: 'Tyres' }, oldId);
    assert.deepEqual(await baselines(), [[8000, '2026-01-01'], [9000, '2026-02-01']]);
    await deleteMaintenanceRecord(adapter, oldId, vehicleId);
    assert.deepEqual(await baselines(), [[8000, '2026-01-01'], [7000, '2025-12-01']]);
  } finally { database.close(); }
});

test('record writes do not depend on a separate schedule update', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const vehicleId = await createVehicle(adapter, sampleVehicle);
    const scheduleId = await saveMaintenanceSchedule(adapter, { vehicleId, category: 'Oil', intervalKm: 3000, intervalMonths: null, baselineOdometerKm: 8000, baselineDate: null, enabled: true });
    database.run("CREATE TRIGGER reject_schedule_update BEFORE UPDATE ON maintenance_schedules BEGIN SELECT RAISE(ABORT, 'Unexpected schedule write'); END;");
    await saveMaintenanceRecord(adapter, { vehicleId, scheduleId, category: 'Oil', serviceDate: '2026-02-01', odometerKm: 9000, costPaise: 0, workshop: null, notes: null, completed: true });
    assert.equal((await listMaintenanceRecords(adapter, vehicleId)).length, 1);
    assert.equal((await listMaintenanceSchedules(adapter, vehicleId))[0].baseline_odometer_km, 9000);
  } finally { database.close(); }
});

test('vehicle repository keeps CRUD and active selection working with the upgraded schema', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const firstId = await createVehicle(adapter, sampleVehicle);
    const secondId = await createVehicle(adapter, { ...sampleVehicle, name: 'Family car', model: 'Altroz' });

    assert.equal((await getVehicle(adapter, firstId))?.name, 'City car');
    assert.deepEqual((await listVehicles(adapter)).map(({ name }) => name), ['City car', 'Family car']);
    await setSelectedVehicleId(adapter, secondId);
    assert.equal(await getSelectedVehicleId(adapter), secondId);
    await saveFuelEntry(adapter, fuelInput(secondId, '2026-01-01T10:00:00.000Z', 26000, 30000, 350000, true));
    const scheduleId = await saveMaintenanceSchedule(adapter, { vehicleId: secondId, category: 'Oil', intervalKm: 3000, intervalMonths: null, baselineOdometerKm: 25000, baselineDate: null, enabled: true });
    await saveMaintenanceRecord(adapter, { vehicleId: secondId, scheduleId, category: 'Oil', serviceDate: '2026-02-01', odometerKm: 26000, costPaise: 1234, workshop: null, notes: null, completed: true });

    await updateVehicle(adapter, secondId, { ...sampleVehicle, name: 'Updated car', currentOdometerKm: 26000 });
    assert.equal((await getVehicle(adapter, secondId))?.current_odometer_km, 26000);
    await deleteVehicle(adapter, secondId);
    assert.equal(await getVehicle(adapter, secondId), null);
    assert.deepEqual(await listFuelEntries(adapter, secondId), []);
    assert.deepEqual(await listMaintenanceSchedules(adapter, secondId), []);
    assert.deepEqual(await listMaintenanceRecords(adapter, secondId), []);
    assert.equal(await getSelectedVehicleId(adapter), null);
    assert.deepEqual((await listVehicles(adapter)).map(({ id }) => id), [firstId]);
  } finally {
    database.close();
  }
});

test('fuel service records partial refills and computes mileage only between full tanks', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const vehicleId = await createVehicle(adapter, sampleVehicle);
    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-01T10:00:00.000Z', 10000, 35000, 400000, true));
    const partialId = await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-05T10:00:00.000Z', 10200, 20000, 230000, false));
    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-10T10:00:00.000Z', 10500, 30000, 350000, true));

    const entries = await listFuelEntries(adapter, vehicleId);
    const insights = calculateFuelInsights(entries, '2026-01');
    assert.equal(insights.mileageSegments.length, 1);
    assert.equal(insights.latestMileage?.distanceKm, 500);
    assert.equal(insights.latestMileage?.quantityMilliunits, 50000);
    assert.equal(insights.latestMileage?.efficiencyKmPerUnit, 10);
    assert.equal(insights.latestMileage?.costPerKmRupees, 11.6);
    assert.equal(insights.monthSpendPaise, 980000);

    await assert.rejects(
      saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-12T10:00:00.000Z', 9000, 10000, 100000, true)),
      /Odometer readings must not go backwards/,
    );
    assert.equal((await listFuelEntries(adapter, vehicleId)).length, 3);

    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-05T10:00:00.000Z', 10200, 24000, 250000, false), partialId);
    const updated = calculateFuelInsights(await listFuelEntries(adapter, vehicleId), '2026-01');
    assert.equal(updated.latestMileage?.quantityMilliunits, 54000);
    assert.equal(updated.monthSpendPaise, 1000000);

    await deleteFuelEntry(adapter, partialId, vehicleId);
    const afterDelete = calculateFuelInsights(await listFuelEntries(adapter, vehicleId), '2026-01');
    assert.equal(afterDelete.entries.length, 2);
    assert.equal(afterDelete.latestMileage?.quantityMilliunits, 30000);
    assert.equal(afterDelete.latestMileage?.efficiencyKmPerUnit, 500 / 30);
  } finally {
    database.close();
  }
});

test('fuel edits preserve historical fuel type and vehicle ownership after profile changes', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const vehicleId = await createVehicle(adapter, sampleVehicle);
    const otherId = await createVehicle(adapter, { ...sampleVehicle, name: 'Other car' });
    const petrol = fuelInput(vehicleId, '2026-01-01T10:00:00.000Z', 1000, 10000, 1234, true);
    const petrolId = await saveFuelEntry(adapter, petrol);
    await updateVehicle(adapter, vehicleId, { ...sampleVehicle, fuelType: 'diesel' });
    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-02T10:00:00.000Z', 1100, 10000, 1234, true));
    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-03T10:00:00.000Z', 1200, 10000, 1234, true));
    await updateVehicle(adapter, vehicleId, { ...sampleVehicle, fuelType: 'electric' });
    await saveFuelEntry(adapter, { ...petrol, costPaise: 4321 }, petrolId);
    await assert.rejects(saveFuelEntry(adapter, { ...petrol, refuelledAt: '2026-01-04T10:00:00.000Z' }), /Electric charging/);
    assert.equal(await getFuelEntry(adapter, petrolId, otherId), null);
    await assert.rejects(deleteFuelEntry(adapter, petrolId, otherId), /no longer available/);
    await assert.rejects(saveFuelEntry(adapter, { ...petrol, vehicleId: otherId }, petrolId), /no longer available/);
    const entries = await listFuelEntries(adapter, vehicleId);
    assert.deepEqual(entries.map((entry) => entry.recorded_fuel_type), ['petrol', 'diesel', 'diesel']);
    assert.equal(calculateFuelInsights(entries, '2026-01').mileageSegments.length, 1);
    assert.equal((await getVehicle(adapter, vehicleId)).current_odometer_km, sampleVehicle.currentOdometerKm);
    assert.deepEqual(await listFuelEntries(adapter, otherId), []);
  } finally { database.close(); }
});

test('concurrent fuel saves cannot introduce a backwards reading', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const id = await createVehicle(adapter, sampleVehicle);
    const results = await Promise.allSettled([
      saveFuelEntry(adapter, fuelInput(id, '2026-01-01T10:00:00.000Z', 1200, 10000, 1234, true)),
      saveFuelEntry(adapter, fuelInput(id, '2026-01-02T10:00:00.000Z', 1100, 10000, 1234, true)),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.match(results.find(({ status }) => status === 'rejected').reason.message, /Odometer readings must not go backwards/);
    assert.equal((await listFuelEntries(adapter, id)).length, 1);
  } finally { database.close(); }
});

test('CNG fuel logs store kilograms and reject a mismatched unit', async () => {
  const { database, adapter } = makeDatabase();
  try {
    await migrateDbIfNeeded(adapter);
    const vehicleId = await createVehicle(adapter, { ...sampleVehicle, name: 'CNG car', fuelType: 'cng' });
    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-01T10:00:00.000Z', 1000, 8000, 60000, true, 'kg'));
    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-02T10:00:00.000Z', 1100, 8000, 68000, true, 'kg'));
    const cngInsight = calculateFuelInsights(await listFuelEntries(adapter, vehicleId), '2026-01');
    assert.equal(cngInsight.latestMileage?.quantityUnit, 'kg');
    assert.equal(cngInsight.latestMileage?.efficiencyKmPerUnit, 12.5);
    await assert.rejects(
      saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-03T10:00:00.000Z', 1200, 9000, 68000, true, 'litre')),
      /Record this vehicle's fuel quantity in kilograms/,
    );
  } finally {
    database.close();
  }
});
test('version 4 upgrade adds both caches without changing existing garage rows', async () => {
  const { database, adapter } = makeDatabase();
  try {
    for (const schema of [INITIAL_SCHEMA_SQL, FUEL_ENTRIES_SCHEMA_SQL, MAINTENANCE_SCHEMA_SQL, STABILIZATION_SCHEMA_SQL]) {
      await adapter.execAsync(schema);
    }
    const id = await createVehicle(adapter, sampleVehicle);
    await setSelectedVehicleId(adapter, id);
    await saveFuelEntry(adapter, fuelInput(id, '2026-01-01T10:00:00.000Z', 25000, 35000, 400000, true));
    await adapter.runAsync(
      "INSERT INTO maintenance_records(vehicle_id, category, service_date, odometer_km, completed, created_at, updated_at) VALUES (?, 'Oil change', '2026-01-01', 25000, 1, 't', 't')",
      id,
    );
    const tables = ['vehicles', 'vehicle_selection', 'fuel_entries', 'maintenance_schedules', 'maintenance_records'];
    const before = tables.map(table => database.exec('SELECT * FROM ' + table));
    await migrateDbIfNeeded(adapter);
    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, DATABASE_VERSION);
    await adapter.runAsync('INSERT INTO station_search_cache VALUES (?, ?, ?)', '12.31,76.66/5', '{"elements":[]}', '2026-11-19T00:00:00Z');
    assert.equal((await adapter.getFirstAsync('SELECT COUNT(*) AS count FROM station_search_cache')).count, 1);
    assert.deepEqual(tables.map(table => database.exec('SELECT * FROM ' + table)), before);
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);
  } finally {
    database.close();
  }
});

test('version 5 stations survive migration and the price cache rejects older and invalid rows', async () => {
  const { database, adapter } = makeDatabase();
  try {
    for (const schema of [INITIAL_SCHEMA_SQL, FUEL_ENTRIES_SCHEMA_SQL, MAINTENANCE_SCHEMA_SQL, STABILIZATION_SCHEMA_SQL]) {
      await adapter.execAsync(schema);
    }
    await adapter.execAsync(`
      CREATE TABLE station_search_cache (
        area_radius TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, fetched TEXT NOT NULL
      );
      PRAGMA user_version = 5;
    `);
    const stationCache = ['geoapify/12.31,76.66/5', '{"test":"stations"}', '2026-11-19T00:00:00Z'];
    await adapter.runAsync('INSERT INTO station_search_cache VALUES (?, ?, ?)', ...stationCache);
    await migrateDbIfNeeded(adapter);
    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, 6);
    assert.deepEqual(database.exec('SELECT * FROM station_search_cache')[0].values[0], stationCache);

    const data = { date: '2026-11-19', petrol: { delhi: 100, mumbai: 110.25, chennai: 106, kolkata: 112 },
      diesel: { delhi: 91, mumbai: 97, chennai: 98, kolkata: 99 } };
    const payload = { success: true, data, meta: { source_posted_date: '2026-11-19' } };
    const original = normalizeMetroPrices(payload, '2026-11-19T04:30:00.000Z');
    await savePriceBatch(adapter, original);
    const first = original.find(price => price.cityId === 'mumbai' && price.fuel === 'petrol');
    assert.deepEqual((await readMetroPrices(adapter)).find(price => price.cityId === 'mumbai' && price.fuel === 'petrol'), first);
    await savePriceBatch(adapter, [{ ...first, paisePerLitre: 10, effectiveDate: '2026-11-18' }]);
    assert.deepEqual((await readMetroPrices(adapter)).find(price => price.cityId === 'mumbai' && price.fuel === 'petrol'), first);
    const previous = await readMetroPrices(adapter);
    await assert.rejects(savePriceBatch(adapter, [
      { ...first, paisePerLitre: 11000, retrievedAt: '2026-11-19T05:30:00.000Z' },
      { ...original[0], paisePerLitre: 0 },
    ]), /CHECK constraint failed/);
    assert.deepEqual(await readMetroPrices(adapter), previous);
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);
  } finally {
    database.close();
  }
});
