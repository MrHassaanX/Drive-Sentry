# SQLite database design

> **Original Phase 0 proposal (13 November 2026).** The SQL below describes the proposed design. The [released migrations](../src/db/migrations.ts) define the actual schema. The [Phase 1–3 audit](PHASE_1_3_AUDIT.md) documents the version 4 upgrade and recovery policy.

This is the planned v1 schema contract for Phase 1 onward. It is specified now, not applied in Phase 0. Use Expo SQLite with versioned migrations, parameterized statements, and `PRAGMA foreign_keys = ON` for every connection. Set `PRAGMA journal_mode = WAL` during initialization. Expo SQLite documents that an exclusive transaction uses another connection, so verify foreign-key enforcement on that connection or use the normal transaction API when it matters. Do not interpolate user values into `execAsync` SQL.

## Storage conventions

- IDs are locally generated UUID strings (`TEXT`) so records can later be synced. No server IDs are required.
- Money is positive or zero integer **paise** (`INTEGER`); fuel volume is positive integer **millilitres**; odometer and distances are nonnegative integer **kilometres**. Convert for display with explicit rounding. INR is the only currency in v1.
- Event instants and audit timestamps are UTC ISO-8601 `YYYY-MM-DDTHH:MM:SS.sssZ` text. Calendar due and expiry dates are local `YYYY-MM-DD` text; the UI chooses the local calendar day. Validate real dates in TypeScript before writing. SQL length/pattern checks below are a second guard, not full calendar validation.
- `created_at` and `updated_at` are set by repositories on every write. Dates of historical events may precede creation. An edit changes `updated_at`, not `created_at`.
- Do not store derived mileage, monthly totals, readiness scores, or forecasts as facts. Recalculate from records, including after edits/deletes.
- Nullable columns below mean genuinely unknown or not applicable. Never replace unknown with zero. The primary and foreign keys in the DDL define relationships.

## Entity inventory

| Table | Purpose and key fields | Nullable fields | Relationship / index intent |
| --- | --- | --- | --- |
| `vehicles` | Vehicle profile; `id` PK, name, kind, fuel type, current odometer | make, model, year, registration label, tank capacity, rated economy | Parent for all owned records; name index for garage sorting. Registration is optional and can be a user-chosen label, not a required government number. |
| `refuelling_records` | Purchase facts, liquid fuel type, full-tank marker, optional mileage-baseline reset, odometer, quantity, total | station name, note | FK vehicle; ordered vehicle/time/odometer index for segments. |
| `maintenance_plans` | Per-vehicle service type and recurring months/km threshold | one of interval months/km, start date/km, note | FK vehicle; active plan index. At least one interval is mandatory. |
| `service_records` | Completed service/repair with actual cost and odometer | plan ID, invoice document ID, note | FK vehicle and optional plan/document; vehicle/time index. A service may be unscheduled. |
| `service_items` | Part or labour lines under a service | part number | FK service; service index. Item sum may differ from receipt total because tax/discounts exist. |
| `expenses` | Standalone non-fuel, non-service costs | note | FK vehicle; vehicle/date index. Never mirror fuel or service totals here. |
| `documents` | Insurance/RC/PUC/other metadata and private file path | expiry date, issuer, reference label, file path, note | FK vehicle; type/expiry indexes. File bytes live in app-private storage, not SQLite. |
| `warranties` | Coverage tied to a replaced service item | expiry date, distance limit, note | FK service item; due index through item. |
| `alerts` | Dismissal/scheduling state for derived or manual reminders | plan ID, document ID, due date/km, notification ID | FK vehicle; unique dedupe key per vehicle; due/status index. Reconcile after source edits. |
| `app_settings` | One row for selected vehicle, units/notification preference | selected vehicle ID | ID fixed to 1; optional FK vehicle. No personal account fields. |
| `fuel_price_cache` | Historical city/fuel observations with provenance | none | Unique city/fuel/source/observation date; freshness index. This is not station price history. |
| `station_cache` | Bounded OSM response for a rounded area/radius | none | Keyed by area/radius; expiry index. Cache JSON is untrusted and validated on read. |

## Proposed SQLite DDL

Migrations create tables in this order. SQLite `CHECK` constraints handle local row rules; repository validation handles cross-row rules. `ON DELETE CASCADE` on a vehicle is intentional, but the UI must confirm and explain deletion. A plan deletion preserves completed services by setting their `plan_id` to null. Document deletion must also remove its private file through a staged cleanup after the database commit.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('car','motorcycle')),
  make TEXT,
  model TEXT,
  model_year INTEGER CHECK (model_year BETWEEN 1900 AND 2100),
  registration_label TEXT,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol','diesel','cng','electric','other')),
  current_odometer_km INTEGER NOT NULL DEFAULT 0 CHECK (current_odometer_km >= 0),
  tank_capacity_ml INTEGER CHECK (tank_capacity_ml > 0),
  rated_efficiency_km_per_litre REAL CHECK (rated_efficiency_km_per_litre > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_vehicles_name ON vehicles(name);

CREATE TABLE refuelling_records (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol','diesel')),
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  total_paise INTEGER NOT NULL CHECK (total_paise > 0),
  is_full_tank INTEGER NOT NULL CHECK (is_full_tank IN (0,1)),
  resets_mileage_baseline INTEGER NOT NULL DEFAULT 0 CHECK (resets_mileage_baseline IN (0,1)),
  station_name TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (resets_mileage_baseline = 0 OR is_full_tank = 1)
);
CREATE INDEX idx_refuels_vehicle_time ON refuelling_records(vehicle_id, occurred_at, id);
CREATE INDEX idx_refuels_vehicle_odo ON refuelling_records(vehicle_id, odometer_km);

CREATE TABLE maintenance_plans (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  interval_months INTEGER CHECK (interval_months > 0),
  interval_km INTEGER CHECK (interval_km > 0),
  start_on TEXT,
  start_odometer_km INTEGER CHECK (start_odometer_km >= 0),
  estimated_cost_paise INTEGER CHECK (estimated_cost_paise >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (interval_months IS NOT NULL OR interval_km IS NOT NULL)
);
CREATE INDEX idx_plans_vehicle_active ON maintenance_plans(vehicle_id, is_active);

CREATE TABLE service_records (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES maintenance_plans(id) ON DELETE SET NULL,
  invoice_document_id TEXT UNIQUE REFERENCES documents(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL,
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  category TEXT NOT NULL CHECK (category IN ('scheduled','repair','inspection','other')),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_services_vehicle_time ON service_records(vehicle_id, occurred_at, id);
CREATE INDEX idx_services_plan_time ON service_records(plan_id, occurred_at);

CREATE TABLE service_items (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('part','labour','other')),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 160),
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  part_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_items_service ON service_items(service_id);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('parking','toll','tax','insurance','accessory','other')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_expenses_vehicle_time ON expenses(vehicle_id, occurred_at);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('insurance','rc','puc','invoice','other')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  issued_on TEXT,
  expires_on TEXT,
  issuer TEXT,
  reference_label TEXT,
  private_file_path TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (issued_on IS NULL OR expires_on IS NULL OR issued_on <= expires_on)
);
CREATE INDEX idx_documents_vehicle_kind ON documents(vehicle_id, kind);
CREATE INDEX idx_documents_expiry ON documents(expires_on) WHERE expires_on IS NOT NULL;

CREATE TABLE warranties (
  id TEXT PRIMARY KEY,
  service_item_id TEXT NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
  expires_on TEXT,
  until_odometer_km INTEGER CHECK (until_odometer_km >= 0),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (expires_on IS NOT NULL OR until_odometer_km IS NOT NULL)
);
CREATE INDEX idx_warranties_item ON warranties(service_item_id);
CREATE INDEX idx_warranties_expiry ON warranties(expires_on) WHERE expires_on IS NOT NULL;

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('maintenance','document','manual')),
  dedupe_key TEXT NOT NULL,
  due_on TEXT,
  due_odometer_km INTEGER CHECK (due_odometer_km >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','completed')),
  notification_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(vehicle_id, dedupe_key),
  CHECK ((kind = 'maintenance' AND plan_id IS NOT NULL AND document_id IS NULL)
      OR (kind = 'document' AND document_id IS NOT NULL AND plan_id IS NULL)
      OR (kind = 'manual' AND plan_id IS NULL AND document_id IS NULL))
);
CREATE INDEX idx_alerts_vehicle_status_due ON alerts(vehicle_id, status, due_on);

CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  selected_vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0,1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE fuel_price_cache (
  id TEXT PRIMARY KEY,
  city_code TEXT NOT NULL,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol','diesel')),
  price_paise_per_litre INTEGER NOT NULL CHECK (price_paise_per_litre > 0),
  observed_on TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  UNIQUE(city_code, fuel_type, source_name, observed_on)
);
CREATE INDEX idx_prices_lookup ON fuel_price_cache(city_code, fuel_type, observed_on DESC);

CREATE TABLE station_cache (
  area_key TEXT PRIMARY KEY,
  radius_m INTEGER NOT NULL CHECK (radius_m BETWEEN 100 AND 10000),
  response_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  CHECK (expires_at > fetched_at)
);
CREATE INDEX idx_station_expiry ON station_cache(expires_at);
```

## Cross-row rules enforced in repositories

1. Every mutation first verifies the selected or supplied `vehicle_id` exists. When linking `service_records.plan_id` or `invoice_document_id`, verify that the plan/document belongs to the same vehicle; the simple foreign keys cannot enforce this cross-table ownership. When creating an alert, verify the linked plan/document belongs to its `vehicle_id` too. An invoice document linked to a service must have `kind = 'invoice'`.
   Liquid-fuel refuelling records are allowed only for petrol/diesel vehicle profiles in v1. Save the entry's fuel type so history retains its meaning; if the vehicle's fuel type is corrected, do not calculate segments across unlike types. Electric charging and CNG purchases need different measurement units and are outside this schema's fuel-economy calculation; garage and non-fuel records still work for those profiles.
2. Sort a vehicle's fuel and service odometer observations by event instant (and stable ID to break ties). A new or edited observation must not create a falling odometer against chronological neighbours. Reject conflicting backdated entries and explain which record to correct. Same odometer values can be retained as expense/service facts but cannot form a positive-distance mileage segment. The vehicle's displayed current odometer must be at least its greatest saved fuel or service reading; advancing it does not rewrite historical records.
3. Validate fuel volume and total against sensible UI bounds and arithmetic overflow. Preserve exact integer facts. Do not require `volume_ml` to be below tank capacity: cumulative partial refuels, station errors, and tank-capacity uncertainty make that an unreliable hard constraint; flag implausible values for review.
4. Validate `YYYY-MM-DD` and UTC timestamps before writing; do not rely on SQLite lexical checks for calendar validity. Compare month intervals using calendar arithmetic with end-of-month clamping. A plan requires `start_on` for a date interval and `start_odometer_km` for a distance interval unless a completed linked service already supplies that anchor.
5. Reconcile `alerts` after source edits/deletes, use stable dedupe keys such as `plan:<id>:<due-threshold>` and `document:<id>:<expiry-date>`, and cancel old OS notification IDs. The in-app due list is recalculated from source facts even if notification scheduling fails.
6. An expense is standalone. Fuel spending comes from `refuelling_records.total_paise`; maintenance spending from `service_records.total_paise`; other spending from `expenses.amount_paise`. Service items are detail, not another amount to add. Avoid counting a scanned invoice as a fourth cost.

## Mileage and forecast algorithms

For each vehicle, consider adjacent **full-tank** refuel records A and B in chronological order. A usable segment requires B's odometer > A's, all intervening fuel entries to have valid positive volume, matching liquid fuel type, and consistent chronological odometers, and no known omitted fill-up. The litres consumed estimate is the sum of volumes for entries **after A through B**, including any partial fills and B. `km_per_litre = (B.odometer_km - A.odometer_km) / (sum(volume_ml) / 1000)`. Segment cost per km uses the sum of those same purchase costs divided by distance. A is the starting boundary, so its litres/cost are excluded. The first full tank alone yields no mileage. Two partial fills without a closing full tank yield no mileage. If the user reports an omitted purchase, mark the next full tank `resets_mileage_baseline = 1`: do not calculate a segment ending there, but use it as the new starting boundary. Do not equate a single fill-up's litres to consumption since the previous arbitrary fill-up.

Anomaly detection is deterministic: after at least three prior valid comparable segments, compare the new segment with their median; an illustrative threshold is a drop greater than 25%. Show segment count, baseline, and “possible anomaly.” This is a configurable rule to tune against demo data, not a diagnosis or trained model.

For each maintenance plan, use its latest linked completed service as anchor; otherwise use plan start values. Add interval months and/or kilometres. A plan is due when **either** threshold is reached; overdue status is based on date today or current recorded odometer. Estimate a date for a future distance threshold only with at least two nondecreasing odometer observations at least seven days apart; cap extreme rates and label it an estimate. When the rate is unavailable, show the distance threshold without a predicted date. An estimated expense is the plan's user-entered cost or the median of comparable past services, labelled accordingly.

## Migration and retention notes

Use `PRAGMA user_version` and ordered migration functions; create v1 atomically, then set version after success. Test migration from a fixture and `PRAGMA foreign_key_check`. Back up or export is later work, so the UI must warn that uninstalling the app can erase local data. Prune expired station cache entries and bound fuel-price history kept on device; never delete user-owned records automatically. If sync is introduced, add tombstones and a conflict policy in a new migration rather than silently changing cascade behavior.

## Released station search cache

Phase 4A migration 5 adds `station_search_cache` with a rounded area and radius primary key, JSON provider payload and UTC retrieval timestamp. Earlier migrations and vehicle-owned tables remain intact. The cache retains up to 20 results and treats results under 24 hours old as fresh. See [Phase 4A](PHASE_4A_FUEL_STATION_DISCOVERY.md) for failure behavior and privacy.
