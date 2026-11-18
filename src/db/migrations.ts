import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 2;

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

  const foreignKeys = await database.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error('SQLite foreign-key enforcement could not be enabled.');
  }
}
