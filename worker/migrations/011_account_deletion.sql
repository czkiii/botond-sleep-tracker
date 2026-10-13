-- Additive. Enable ACCOUNT_DELETION_ENABLED only after migration, recovery UI,
-- scheduled purge and the independent backup-erasure journal are operational.
CREATE TABLE account_deletions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('IMMEDIATE', 'RECOVERY')),
  requested_at INTEGER NOT NULL,
  purge_after INTEGER NOT NULL,
  held_family_id TEXT,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'RESTORED', 'FINALIZED')),
  finalized_at INTEGER,
  CHECK (purge_after = requested_at + CASE mode WHEN 'RECOVERY' THEN 2592000000 ELSE 0 END),
  CHECK ((state = 'FINALIZED') = (finalized_at IS NOT NULL))
);
CREATE UNIQUE INDEX idx_one_pending_account_deletion ON account_deletions(account_id) WHERE state = 'PENDING';
CREATE INDEX idx_due_account_deletions ON account_deletions(purge_after) WHERE state = 'PENDING';

-- These are minimal deletion receipts, not backups of profile/diary content.
-- Export to a separately retained erasure journal before any database restore.
CREATE TABLE erasure_receipts (
  account_id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT,
  erased_at INTEGER NOT NULL
);

-- A late billing callback cannot revive access while deletion/recovery is pending.
CREATE TRIGGER account_entitlements_active_insert BEFORE INSERT ON account_entitlements
WHEN NEW.revoked_at IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND status <> 'ACTIVE')
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_UNAVAILABLE'); END;
CREATE TRIGGER account_entitlements_active_update BEFORE UPDATE ON account_entitlements
WHEN NEW.revoked_at IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND status <> 'ACTIVE')
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_UNAVAILABLE'); END;
