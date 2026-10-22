-- Additive identity foundation. Apply once, after the V4 schema.
-- No legacy family/device/session records are changed or claimed.
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  locale TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DELETION_PENDING', 'DELETED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK ((status = 'DELETED') = (deleted_at IS NOT NULL))
);

CREATE TABLE account_identities (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'GOOGLE'),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (length(subject) > 0),
  email_at_login TEXT,
  email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  last_verified_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE (provider, issuer, subject)
);

CREATE UNIQUE INDEX idx_one_google_identity_per_account
ON account_identities(account_id) WHERE provider = 'GOOGLE';

CREATE TABLE account_devices (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  installation_hash TEXT NOT NULL UNIQUE,
  credential_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  platform TEXT CHECK (platform IN ('WEB', 'IOS', 'ANDROID', 'OTHER')),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoke_reason TEXT CHECK (revoke_reason IS NULL OR revoke_reason IN
    ('USER_REPLACED', 'USER_REVOKED', 'SECURITY', 'ACCOUNT_DELETED')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE (account_id, id),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);

CREATE INDEX idx_account_devices_active
ON account_devices(account_id, last_seen_at DESC) WHERE revoked_at IS NULL;

CREATE TRIGGER account_devices_max_two_insert
BEFORE INSERT ON account_devices
WHEN NEW.revoked_at IS NULL AND
  (SELECT COUNT(*) FROM account_devices
   WHERE account_id = NEW.account_id AND revoked_at IS NULL) >= 2
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNT_DEVICE_LIMIT');
END;

CREATE TRIGGER account_devices_max_two_update
BEFORE UPDATE OF revoked_at, account_id ON account_devices
WHEN NEW.revoked_at IS NULL AND
  (SELECT COUNT(*) FROM account_devices
   WHERE account_id = NEW.account_id AND revoked_at IS NULL AND id != OLD.id) >= 2
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNT_DEVICE_LIMIT');
END;

CREATE TABLE account_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  rotation_counter INTEGER NOT NULL DEFAULT 0 CHECK (rotation_counter >= 0),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, device_id) REFERENCES account_devices(account_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at)
);

CREATE INDEX idx_account_sessions_device_active
ON account_sessions(device_id, expires_at) WHERE revoked_at IS NULL;
