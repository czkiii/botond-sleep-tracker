-- Claim the irreversible decision before writing to the independent journal.
-- Retried/overlapping recovery and purge jobs cannot choose different outcomes.
ALTER TABLE account_deletions ADD COLUMN resolution TEXT CHECK (resolution IN ('ERASE', 'RESTORE'));
ALTER TABLE account_deletions ADD COLUMN resolution_at INTEGER;
ALTER TABLE account_deletions ADD COLUMN journaled_at INTEGER;
ALTER TABLE account_deletions ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE deletion_maintenance_runs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at INTEGER NOT NULL,
  processed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  due_remaining INTEGER NOT NULL,
  oldest_due_at INTEGER
);
