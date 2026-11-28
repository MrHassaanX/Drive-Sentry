export const INTELLIGENCE_SCHEMA_SQL = `
  CREATE UNIQUE INDEX fuel_record_owner_idx ON fuel_entries(id, vehicle_id);
  CREATE UNIQUE INDEX service_record_owner_idx ON maintenance_records(id, vehicle_id);
  CREATE UNIQUE INDEX wallet_document_owner_idx ON ownership_documents(id, vehicle_id);

  CREATE TABLE receipt_links (
    document_id INTEGER PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    fuel_id INTEGER UNIQUE,
    service_id INTEGER UNIQUE,
    fingerprint TEXT,
    reference TEXT,
    merchant TEXT,
    CHECK ((fuel_id IS NULL) <> (service_id IS NULL)),
    FOREIGN KEY (document_id, vehicle_id) REFERENCES ownership_documents(id, vehicle_id) ON DELETE CASCADE,
    FOREIGN KEY (fuel_id, vehicle_id) REFERENCES fuel_entries(id, vehicle_id) ON DELETE CASCADE,
    FOREIGN KEY (service_id, vehicle_id) REFERENCES maintenance_records(id, vehicle_id) ON DELETE CASCADE
  );
  CREATE INDEX receipt_vehicle_fingerprint_idx ON receipt_links(vehicle_id, fingerprint);

  CREATE TABLE service_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 160),
    quantity_text TEXT,
    cost_paise INTEGER CHECK(cost_paise IS NULL OR (typeof(cost_paise) = 'integer' AND cost_paise >= 0)),
    FOREIGN KEY(service_id, vehicle_id) REFERENCES maintenance_records(id, vehicle_id) ON DELETE CASCADE
  );
  CREATE INDEX service_invoice_vehicle_idx ON service_invoice_items(vehicle_id, service_id);

  CREATE TABLE component_warranties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    component TEXT NOT NULL CHECK(length(trim(component)) BETWEEN 1 AND 100),
    provider_type TEXT NOT NULL CHECK(provider_type IN ('manufacturer', 'workshop', 'other')),
    brand TEXT, vendor TEXT, installed_on TEXT, expires_on TEXT,
    duration_months INTEGER CHECK(duration_months > 0 AND duration_months <= 240),
    installed_km INTEGER CHECK(installed_km >= 0),
    limit_km INTEGER CHECK(limit_km > 0),
    notes TEXT,
    remind INTEGER NOT NULL DEFAULT 0 CHECK(remind IN (0, 1)),
    document_id INTEGER REFERENCES ownership_documents(id) ON DELETE SET NULL,
    service_id INTEGER REFERENCES maintenance_records(id) ON DELETE SET NULL
  );
  CREATE INDEX component_warranties_vehicle_idx ON component_warranties(vehicle_id);
  CREATE TRIGGER warranty_scope_insert BEFORE INSERT ON component_warranties
    WHEN (NEW.document_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ownership_documents WHERE id = NEW.document_id AND vehicle_id = NEW.vehicle_id))
    OR (NEW.service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM maintenance_records WHERE id = NEW.service_id AND vehicle_id = NEW.vehicle_id))
    BEGIN SELECT RAISE(ABORT, 'Warranty links must belong to the same vehicle.'); END;
  CREATE TRIGGER warranty_scope_update BEFORE UPDATE OF vehicle_id, document_id, service_id ON component_warranties
    WHEN (NEW.document_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ownership_documents WHERE id = NEW.document_id AND vehicle_id = NEW.vehicle_id))
    OR (NEW.service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM maintenance_records WHERE id = NEW.service_id AND vehicle_id = NEW.vehicle_id))
    BEGIN SELECT RAISE(ABORT, 'Warranty links must belong to the same vehicle.'); END;
  CREATE TRIGGER warranty_document_scope BEFORE UPDATE OF vehicle_id ON ownership_documents
    WHEN OLD.vehicle_id IS NOT NEW.vehicle_id AND EXISTS (
      SELECT 1 FROM component_warranties WHERE document_id = OLD.id)
    BEGIN SELECT RAISE(ABORT, 'Unlink this document from its warranty before moving it.'); END;
  CREATE TRIGGER warranty_service_scope BEFORE UPDATE OF vehicle_id ON maintenance_records
    WHEN OLD.vehicle_id != NEW.vehicle_id AND EXISTS (
      SELECT 1 FROM component_warranties WHERE service_id = OLD.id)
    BEGIN SELECT RAISE(ABORT, 'Unlink this service from its warranty before moving it.'); END;

  CREATE TABLE repair_preferences (
    vehicle_id INTEGER PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
    max_days INTEGER NOT NULL CHECK(max_days BETWEEN 1 AND 730),
    max_km INTEGER NOT NULL CHECK(max_km BETWEEN 1 AND 100000)
  );
  CREATE TABLE repair_dismissals (
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    observation TEXT NOT NULL,
    PRIMARY KEY(vehicle_id, observation)
  );
  PRAGMA user_version = 8;
`;
