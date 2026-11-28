export const TRIP_SCHEMA_SQL = `
  CREATE TABLE trip_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
    fuel_type TEXT CHECK (fuel_type IN ('petrol', 'diesel', 'cng')),
    efficiency REAL CHECK (efficiency > 0),
    efficiency_source TEXT,
    price_paise_per_unit INTEGER CHECK (typeof(price_paise_per_unit) = 'integer' AND price_paise_per_unit > 0 OR price_paise_per_unit IS NULL),
    price_source TEXT,
    price_coverage TEXT,
    price_observed_at TEXT,
    range_km REAL CHECK (range_km >= 0),
    available_fuel REAL CHECK (available_fuel >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX trip_plans_vehicle_updated_idx ON trip_plans(vehicle_id, updated_at DESC, id DESC);

  CREATE TABLE trip_waypoints (
    trip_id INTEGER NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 9),
    kind TEXT NOT NULL CHECK (kind IN ('origin', 'destination', 'via', 'fuel')),
    label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 300),
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    PRIMARY KEY (trip_id, position)
  );
  CREATE UNIQUE INDEX trip_waypoints_endpoint_idx
    ON trip_waypoints(trip_id, kind) WHERE kind IN ('origin', 'destination');

  CREATE TABLE trip_refuel_stops (
    trip_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    station_id TEXT NOT NULL CHECK (length(trim(station_id)) BETWEEN 1 AND 300),
    brand TEXT,
    source TEXT,
    fuel_tags TEXT,
    observed_at TEXT,
    PRIMARY KEY (trip_id, position),
    UNIQUE (trip_id, station_id),
    FOREIGN KEY (trip_id, position) REFERENCES trip_waypoints(trip_id, position) ON DELETE CASCADE
  );

  CREATE TABLE trip_routes (
    trip_id INTEGER NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('base', 'active')),
    route_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    attribution TEXT NOT NULL,
    calculated_at TEXT NOT NULL,
    distance_metres REAL NOT NULL CHECK (distance_metres > 0),
    duration_seconds REAL NOT NULL CHECK (duration_seconds > 0),
    geometry TEXT NOT NULL CHECK (json_valid(geometry) AND json_array_length(geometry) BETWEEN 2 AND 50000),
    PRIMARY KEY (trip_id, role)
  );

  PRAGMA user_version = 9;
`;
