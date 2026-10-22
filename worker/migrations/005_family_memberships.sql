-- Transitional account-to-legacy-family bridge. This keeps the existing sync
-- tables intact while making family ownership recoverable from an account.
PRAGMA foreign_keys = ON;

CREATE TABLE legacy_family_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
  joined_at INTEGER NOT NULL,
  ended_at INTEGER,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CHECK ((status = 'ACTIVE') = (ended_at IS NULL))
);

CREATE UNIQUE INDEX idx_one_active_legacy_family_per_account
ON legacy_family_memberships(account_id) WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX idx_one_active_legacy_membership_per_family_account
ON legacy_family_memberships(family_id, account_id) WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX idx_one_active_legacy_family_admin
ON legacy_family_memberships(family_id) WHERE status = 'ACTIVE' AND role = 'ADMIN';

CREATE TABLE account_family_devices (
  account_device_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  legacy_device_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id, account_device_id)
    REFERENCES account_devices(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (legacy_device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX idx_account_family_devices_family
ON account_family_devices(family_id, account_id);

CREATE TRIGGER account_family_devices_require_membership
BEFORE INSERT ON account_family_devices
WHEN NOT EXISTS (
  SELECT 1 FROM legacy_family_memberships m
  WHERE m.family_id = NEW.family_id
    AND m.account_id = NEW.account_id
    AND m.status = 'ACTIVE'
)
BEGIN
  SELECT RAISE(ABORT, 'ACTIVE_FAMILY_MEMBERSHIP_REQUIRED');
END;

CREATE TRIGGER account_family_devices_match_legacy_family
BEFORE INSERT ON account_family_devices
WHEN NOT EXISTS (
  SELECT 1 FROM devices d
  WHERE d.id = NEW.legacy_device_id AND d.family_id = NEW.family_id
)
BEGIN
  SELECT RAISE(ABORT, 'LEGACY_DEVICE_FAMILY_MISMATCH');
END;
