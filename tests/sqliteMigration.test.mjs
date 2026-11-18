import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import initSqlJs from 'sql.js';
import { DATABASE_VERSION, FUEL_ENTRIES_SCHEMA_SQL, INITIAL_SCHEMA_SQL, migrateDbIfNeeded } from '../src/db/migrations.ts';
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
import { calculateFuelInsights } from '../src/features/fuel/calculations.ts';
import { deleteFuelEntry, listFuelEntries } from '../src/features/fuel/repository.ts';
import { deleteMaintenanceRecord, deleteMaintenanceSchedule, listMaintenanceRecords, listMaintenanceSchedules, saveMaintenanceRecord, saveMaintenanceSchedule } from '../src/features/maintenance/repository.ts';

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

test('version 0 database migrates to version 3 with maintenance tables and constrained fuel records', async () => {
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

    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, 3);
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
    await saveFuelEntry(adapter, fuelInput(vehicleId, '2026-01-01T10:00:00.000Z', 25000, 35000, 400000, true));
    await migrateDbIfNeeded(adapter);
    assert.equal((await adapter.getFirstAsync('PRAGMA user_version;')).user_version, 3);
    assert.equal((await listFuelEntries(adapter, vehicleId)).length, 1);
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);
    assert.deepEqual(await listMaintenanceRecords(adapter, vehicleId), []);
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
    assert.equal((await listMaintenanceRecords(adapter, firstVehicle))[0].cost_paise, 123456);
    await deleteMaintenanceSchedule(adapter, scheduleId, firstVehicle);
    assert.equal((await listMaintenanceRecords(adapter, firstVehicle))[0].schedule_id, null);
    await deleteMaintenanceRecord(adapter, recordId, firstVehicle);
    assert.deepEqual(await listMaintenanceRecords(adapter, firstVehicle), []);
    assert.deepEqual(database.exec('PRAGMA foreign_key_check;'), []);
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

    await updateVehicle(adapter, secondId, { ...sampleVehicle, name: 'Updated car', currentOdometerKm: 26000 });
    assert.equal((await getVehicle(adapter, secondId))?.current_odometer_km, 26000);
    await deleteVehicle(adapter, secondId);
    assert.equal(await getVehicle(adapter, secondId), null);
    assert.deepEqual(await listFuelEntries(adapter, secondId), []);
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

    await deleteFuelEntry(adapter, partialId);
    const afterDelete = calculateFuelInsights(await listFuelEntries(adapter, vehicleId), '2026-01');
    assert.equal(afterDelete.entries.length, 2);
    assert.equal(afterDelete.latestMileage?.quantityMilliunits, 30000);
    assert.equal(afterDelete.latestMileage?.efficiencyKmPerUnit, 500 / 30);
  } finally {
    database.close();
  }
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
