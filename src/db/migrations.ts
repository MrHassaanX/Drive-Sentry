import type { SQLiteDatabase } from 'expo-sqlite';
import { OWNERSHIP_SCHEMA_SQL } from './ownershipSchema.ts';
import { INTELLIGENCE_SCHEMA_SQL } from './intelligenceSchema.ts';

export const DATABASE_VERSION = 8;

export const INITIAL_SCHEMA_SQL = `
  CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    manufacturer TEXT NOT NULL CHECK (length(trim(manufacturer)) > 0),
    model TEXT NOT NULL CHECK (length(trim(model)) > 0),
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('car', 'motorcycle')),
    fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol', 'diesel', 'cng', 'electric', 'hybrid')),
    registration_number TEXT UNIQUE,
    current_odometer_km INTEGER NOT NULL DEFAULT 0 CHECK (current_odometer_km >= 0),
    model_year INTEGER CHECK (model_year IS NULL OR model_year BETWEEN 1886 AND 2200),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (registration_number IS NULL OR length(trim(registration_number)) > 0)
  );

  CREATE INDEX vehicles_updated_at_idx ON vehicles(updated_at DESC);

  CREATE TABLE vehicle_selection (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL
  );

  PRAGMA user_version = 1;
`;

export const FUEL_ENTRIES_SCHEMA_SQL = `
  CREATE TABLE fuel_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    refuelled_at TEXT NOT NULL,
    odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
    quantity_milliunits INTEGER NOT NULL CHECK (quantity_milliunits BETWEEN 1 AND 1000000),
    quantity_unit TEXT NOT NULL CHECK (quantity_unit IN ('litre', 'kg')),
    cost_paise INTEGER NOT NULL CHECK (cost_paise >= 0),
    is_full_tank INTEGER NOT NULL DEFAULT 0 CHECK (is_full_tank IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX fuel_entries_vehicle_date_idx
    ON fuel_entries(vehicle_id, refuelled_at ASC, id ASC);

  PRAGMA user_version = 2;
`;

export const MAINTENANCE_SCHEMA_SQL = `
  CREATE TABLE maintenance_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 80),
    interval_km INTEGER CHECK (interval_km IS NULL OR interval_km BETWEEN 1 AND 1000000),
    interval_months INTEGER CHECK (interval_months IS NULL OR interval_months BETWEEN 1 AND 120),
    baseline_odometer_km INTEGER NOT NULL DEFAULT 0 CHECK (baseline_odometer_km >= 0),
    baseline_date TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (interval_km IS NOT NULL OR interval_months IS NOT NULL),
    UNIQUE(vehicle_id, category)
  );
  CREATE INDEX maintenance_schedules_vehicle_enabled_idx
    ON maintenance_schedules(vehicle_id, enabled, category COLLATE NOCASE);

  CREATE TABLE maintenance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 80),
    service_date TEXT NOT NULL,
    odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
    cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (cost_paise >= 0),
    workshop TEXT CHECK (workshop IS NULL OR length(trim(workshop)) <= 120),
    notes TEXT CHECK (notes IS NULL OR length(trim(notes)) <= 2000),
    completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX maintenance_records_vehicle_date_idx
    ON maintenance_records(vehicle_id, service_date DESC, id DESC);
  CREATE INDEX maintenance_records_schedule_idx
    ON maintenance_records(schedule_id, completed, service_date DESC, id DESC);
  CREATE TRIGGER maintenance_record_schedule_vehicle_insert
    BEFORE INSERT ON maintenance_records
    WHEN NEW.schedule_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM maintenance_schedules WHERE id = NEW.schedule_id AND vehicle_id = NEW.vehicle_id
    )
    BEGIN SELECT RAISE(ABORT, 'Maintenance schedule must belong to the same vehicle.'); END;
  CREATE TRIGGER maintenance_record_schedule_vehicle_update
    BEFORE UPDATE OF schedule_id, vehicle_id ON maintenance_records
    WHEN NEW.schedule_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM maintenance_schedules WHERE id = NEW.schedule_id AND vehicle_id = NEW.vehicle_id
    )
    BEGIN SELECT RAISE(ABORT, 'Maintenance schedule must belong to the same vehicle.'); END;
  PRAGMA user_version = 3;
`;

// Checking at the database write also covers two saves that both validated
// against the same earlier fuel history.
const FUEL_ODOMETER_CONFLICT = `
  EXISTS (
    SELECT 1 FROM fuel_entries f
    WHERE f.vehicle_id = NEW.vehicle_id AND f.id != NEW.id AND (
      ((f.refuelled_at, f.id) < (NEW.refuelled_at, NEW.id) AND f.odometer_km > NEW.odometer_km)
      OR ((f.refuelled_at, f.id) > (NEW.refuelled_at, NEW.id) AND f.odometer_km < NEW.odometer_km)
    )
  )
`;

export const STABILIZATION_SCHEMA_SQL = `
  ALTER TABLE maintenance_schedules ADD COLUMN baseline_confirmed INTEGER NOT NULL DEFAULT 0
    CHECK (baseline_confirmed IN (0, 1));
  ALTER TABLE fuel_entries ADD COLUMN recorded_fuel_type TEXT
    CHECK (recorded_fuel_type IN ('petrol', 'diesel', 'cng', 'hybrid'));
  CREATE TRIGGER fuel_entry_odometer_insert AFTER INSERT ON fuel_entries
    WHEN ${FUEL_ODOMETER_CONFLICT}
    BEGIN SELECT RAISE(ABORT, 'Odometer readings must not go backwards over time.'); END;
  CREATE TRIGGER fuel_entry_odometer_update AFTER UPDATE OF vehicle_id, refuelled_at, odometer_km ON fuel_entries
    WHEN ${FUEL_ODOMETER_CONFLICT}
    BEGIN SELECT RAISE(ABORT, 'Odometer readings must not go backwards over time.'); END;
  PRAGMA user_version = 4;
`;

export async function migrateDbIfNeeded(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  await database.execAsync('PRAGMA journal_mode = WAL;');

  const result = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error(
      `This app supports database version ${DATABASE_VERSION}, but this file is version ${currentVersion}.`,
    );
  }

  if (currentVersion < 1) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(INITIAL_SCHEMA_SQL);
    });
  }

  if (currentVersion < 2) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(FUEL_ENTRIES_SCHEMA_SQL);
    });
  }

  if (currentVersion < 3) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(MAINTENANCE_SCHEMA_SQL);
    });
  }

  if (currentVersion < 4) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(STABILIZATION_SCHEMA_SQL);
    });
  }

  if (currentVersion < 5) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(`
        CREATE TABLE station_search_cache (
          area_radius TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, fetched TEXT NOT NULL
        );
        PRAGMA user_version = 5;
      `);
    });
  }

  if (currentVersion < 6) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(`
        CREATE TABLE fuel_price_cache (
          provider TEXT NOT NULL,
          city_id TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          coverage TEXT NOT NULL CHECK (coverage IN ('metro-reference', 'city-reference', 'state-reference')),
          fuel TEXT NOT NULL CHECK (fuel IN ('petrol', 'diesel')),
          paise_per_litre INTEGER NOT NULL CHECK (typeof(paise_per_litre) = 'integer' AND paise_per_litre > 0),
          effective_date TEXT NOT NULL CHECK (length(effective_date) = 10),
          source_posted_date TEXT NOT NULL CHECK (length(source_posted_date) = 10),
          retrieved_at TEXT NOT NULL,
          source TEXT NOT NULL,
          source_url TEXT NOT NULL,
          PRIMARY KEY (provider, city_id, fuel)
        );
        PRAGMA user_version = 6;
      `);
    });
  }

  if (currentVersion < 7) {
    await database.withTransactionAsync(() => database.execAsync(OWNERSHIP_SCHEMA_SQL));
  }

  if (currentVersion < 8) {
    await database.withTransactionAsync(() => database.execAsync(INTELLIGENCE_SCHEMA_SQL));
  }

  const foreignKeys = await database.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error('SQLite foreign-key enforcement could not be enabled.');
  }
}
