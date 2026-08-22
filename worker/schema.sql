PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE INDEX IF NOT EXISTS idx_devices_family ON devices(family_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  code_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (created_by_device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_invites_family ON invite_codes(family_id);
CREATE INDEX IF NOT EXISTS idx_invites_expires ON invite_codes(expires_at);

CREATE TABLE IF NOT EXISTS sleep_sessions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_family_revision ON sleep_sessions(family_id, revision);
CREATE INDEX IF NOT EXISTS idx_sessions_family_start ON sleep_sessions(family_id, start_time);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_sleep_per_family
ON sleep_sessions(family_id)
WHERE end_time IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_operations_family ON operations(family_id);
CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at);
