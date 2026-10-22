PRAGMA foreign_keys = OFF;

CREATE TABLE children (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  birth_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  UNIQUE (family_id, id),
  CHECK (birth_date IS NULL OR birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);

INSERT INTO children (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
SELECT 'child_legacy_' || id, id, '', NULL, created_at, created_at, NULL, 0
FROM families;

ALTER TABLE sleep_sessions RENAME TO sleep_sessions_v3;

CREATE TABLE sleep_sessions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  note TEXT NOT NULL DEFAULT '',
  day_night_override TEXT CHECK (day_night_override IS NULL OR day_night_override IN ('day', 'night')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (family_id, child_id) REFERENCES children(family_id, id)
);

INSERT INTO sleep_sessions
  (id, family_id, child_id, start_time, end_time, note, day_night_override, created_at, updated_at, deleted_at, revision)
SELECT
  id, family_id, 'child_legacy_' || family_id, start_time, end_time, note, NULL, created_at, updated_at, deleted_at, revision
FROM sleep_sessions_v3;

DROP TABLE sleep_sessions_v3;

CREATE INDEX idx_children_family_revision ON children(family_id, revision);
CREATE INDEX idx_children_family_active ON children(family_id, deleted_at);
CREATE INDEX idx_sessions_family_revision ON sleep_sessions(family_id, revision);
CREATE INDEX idx_sessions_family_child_start ON sleep_sessions(family_id, child_id, start_time);

CREATE UNIQUE INDEX idx_one_active_sleep_per_child
ON sleep_sessions(family_id, child_id)
WHERE end_time IS NULL AND deleted_at IS NULL;

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
