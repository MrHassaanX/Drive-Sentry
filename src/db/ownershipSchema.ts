export const OWNERSHIP_SCHEMA_SQL = `
  CREATE TABLE ownership_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
    description TEXT NOT NULL DEFAULT '',
    issued_on TEXT,
    expires_on TEXT,
    document_number TEXT,
    attachment TEXT UNIQUE,
    CHECK (issued_on IS NULL OR expires_on IS NULL OR issued_on <= expires_on)
  );
  CREATE INDEX ownership_documents_vehicle_idx ON ownership_documents(vehicle_id);
  CREATE TABLE ownership_file_cleanup (filename TEXT PRIMARY KEY NOT NULL);
  CREATE TRIGGER ownership_attachment_deleted AFTER DELETE ON ownership_documents
    WHEN OLD.attachment IS NOT NULL
    BEGIN INSERT OR IGNORE INTO ownership_file_cleanup VALUES (OLD.attachment); END;
  CREATE TRIGGER ownership_attachment_replaced AFTER UPDATE OF attachment ON ownership_documents
    WHEN OLD.attachment IS NOT NULL AND OLD.attachment IS NOT NEW.attachment
    BEGIN INSERT OR IGNORE INTO ownership_file_cleanup VALUES (OLD.attachment); END;
  CREATE TABLE ownership_reminder_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    intervals TEXT NOT NULL DEFAULT '30,15,7,1,0'
  );
  INSERT INTO ownership_reminder_settings (id) VALUES (1);
  CREATE TABLE ownership_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    spent_on TEXT NOT NULL CHECK (length(spent_on) = 10),
    category TEXT NOT NULL,
    cost_paise INTEGER NOT NULL CHECK (typeof(cost_paise) = 'integer' AND cost_paise >= 0),
    vendor TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX ownership_expenses_vehicle_date_idx ON ownership_expenses(vehicle_id, spent_on, id);
  PRAGMA user_version = 7;
`;
