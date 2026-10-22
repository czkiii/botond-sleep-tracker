-- Separate D1 database. NEVER apply to or restore together with the diary DB.
CREATE TABLE journal_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  source_database_id TEXT NOT NULL UNIQUE
);
-- Provision identity explicitly before enabling deletion. No user PII/content.
CREATE TABLE deletion_journal (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  family_id TEXT,
  requested_at INTEGER NOT NULL,
  purge_after INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'ERASE', 'RESTORE')),
  resolved_at INTEGER,
  CHECK ((state = 'PENDING') = (resolved_at IS NULL)),
  CHECK (purge_after = requested_at OR purge_after = requested_at + 2592000000)
);
CREATE INDEX journal_account ON deletion_journal(account_id, requested_at, request_id);
CREATE TRIGGER journal_no_delete BEFORE DELETE ON deletion_journal
BEGIN SELECT RAISE(ABORT, 'JOURNAL_APPEND_ONLY'); END;
CREATE TRIGGER journal_terminal BEFORE UPDATE ON deletion_journal
WHEN OLD.state <> 'PENDING'
  OR NEW.sequence <> OLD.sequence
  OR NEW.request_id <> OLD.request_id OR NEW.account_id <> OLD.account_id
  OR NEW.family_id IS NOT OLD.family_id OR NEW.requested_at <> OLD.requested_at
  OR NEW.purge_after <> OLD.purge_after
BEGIN SELECT RAISE(ABORT, 'JOURNAL_IMMUTABLE'); END;
