-- Apply ONLY to the independent erasure journal, after schema.sql.
-- Provision the programme key check using a separate secret. Never rotate it
-- by overwriting this row: all existing markers must remain recognisable.
CREATE TABLE trial_program (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  key_version TEXT NOT NULL,
  key_check TEXT NOT NULL CHECK (length(key_check) = 64),
  reviewed_at INTEGER NOT NULL,
  ended_at INTEGER,
  CHECK ((active = 0) = (ended_at IS NOT NULL))
);
CREATE TRIGGER trial_program_key_immutable BEFORE UPDATE ON trial_program
WHEN NEW.key_version <> OLD.key_version OR NEW.key_check <> OLD.key_check OR NEW.active > OLD.active
BEGIN SELECT RAISE(ABORT, 'TRIAL_PROGRAM_IMMUTABLE'); END;
CREATE TRIGGER trial_program_no_delete BEFORE DELETE ON trial_program
BEGIN SELECT RAISE(ABORT, 'TRIAL_PROGRAM_IMMUTABLE'); END;
CREATE TABLE used_trial_identities (
  digest TEXT PRIMARY KEY CHECK (length(digest) = 64),
  key_version TEXT NOT NULL
);
CREATE TRIGGER trial_marker_no_update BEFORE UPDATE ON used_trial_identities
BEGIN SELECT RAISE(ABORT, 'TRIAL_MARKER_IMMUTABLE'); END;
CREATE TRIGGER trial_marker_no_delete BEFORE DELETE ON used_trial_identities
WHEN EXISTS (SELECT 1 FROM trial_program WHERE active = 1)
BEGIN SELECT RAISE(ABORT, 'TRIAL_PROGRAM_ACTIVE'); END;
CREATE TRIGGER trial_program_end AFTER UPDATE OF active ON trial_program WHEN NEW.active = 0
BEGIN DELETE FROM used_trial_identities; END;

-- The operator verifies all backup locations/provider retention, not just this
-- inventory. Expired verification blocks journal cleanup, never bypasses it.
CREATE TABLE retention_inventory (
  id INTEGER PRIMARY KEY CHECK (id = 1), verified_until INTEGER NOT NULL, cleanup_clock INTEGER,
  provider_window_ms INTEGER NOT NULL DEFAULT 2592000000 CHECK (provider_window_ms BETWEEN 0 AND 2592000000)
);
CREATE TABLE managed_backups (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, destroyed_at INTEGER,
  CHECK (expires_at <= created_at + 2592000000 AND expires_at >= created_at),
  CHECK (destroyed_at IS NULL OR destroyed_at >= created_at)
);
CREATE TRIGGER backup_age_immutable BEFORE UPDATE ON managed_backups
WHEN NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at OR NEW.expires_at > OLD.expires_at
  OR (OLD.destroyed_at IS NOT NULL AND NEW.destroyed_at IS NOT OLD.destroyed_at)
BEGIN SELECT RAISE(ABORT, 'BACKUP_AGE_IMMUTABLE'); END;
CREATE TABLE restore_jobs (
  id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, completed_at INTEGER,
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE TABLE deletion_completion (
  request_id TEXT PRIMARY KEY REFERENCES deletion_journal(request_id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL, cleanup_after INTEGER
);
CREATE TABLE completion_attempts (
  request_id TEXT PRIMARY KEY REFERENCES deletion_journal(request_id) ON DELETE CASCADE,
  next_attempt_at INTEGER NOT NULL
);
CREATE TRIGGER deletion_completion_immutable BEFORE UPDATE OF completed_at ON deletion_completion
BEGIN SELECT RAISE(ABORT, 'COMPLETION_IMMUTABLE'); END;
DROP TRIGGER journal_no_delete;
CREATE TRIGGER journal_no_delete BEFORE DELETE ON deletion_journal
WHEN OLD.state = 'PENDING' OR NOT EXISTS (
  SELECT 1 FROM deletion_completion c, retention_inventory i WHERE c.request_id = OLD.request_id
    AND c.cleanup_after IS NOT NULL AND i.id = 1 AND i.verified_until >= i.cleanup_clock
    AND c.cleanup_after <= i.cleanup_clock AND c.completed_at + i.provider_window_ms + 2592000000 <= i.cleanup_clock
    AND NOT EXISTS (SELECT 1 FROM managed_backups WHERE created_at <= c.completed_at
      AND (destroyed_at IS NULL OR destroyed_at + 2592000000 > i.cleanup_clock))
    AND NOT EXISTS (SELECT 1 FROM restore_jobs WHERE completed_at IS NULL OR completed_at + 2592000000 > i.cleanup_clock)
)
BEGIN SELECT RAISE(ABORT, 'JOURNAL_RETENTION_REQUIRED'); END;
