-- Apply after 009, before deploying trial-aware access queries.
-- IDs only: no email/device fingerprint. A17 must define account-erasure policy;
-- like subscriptions, this ledger intentionally prevents accidental hard delete.
CREATE TABLE account_trials (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('FAMILY', 'FAMILY_PLUS')),
  started_at INTEGER NOT NULL,
  ends_at INTEGER,
  activation_family_id TEXT,
  family_id TEXT,
  family_bound_at INTEGER,
  origin TEXT NOT NULL DEFAULT 'SOLEMI' CHECK (origin IN ('SOLEMI', 'LEGACY_STORE')),
  CHECK ((origin = 'SOLEMI' AND ends_at IS NOT NULL AND ends_at = started_at + 604800000)
    OR (origin = 'LEGACY_STORE' AND ends_at IS NULL AND family_id IS NULL AND activation_family_id IS NULL)),
  CHECK ((family_id IS NULL) = (family_bound_at IS NULL)),
  CHECK (activation_family_id IS NULL OR activation_family_id = family_id),
  CHECK (family_bound_at IS NULL OR (family_bound_at >= started_at AND family_bound_at < ends_at))
);
CREATE INDEX idx_account_trials_family ON account_trials(family_id, ends_at);

-- Earlier verified store trials consume the lifetime account right. Their old
-- Family is unknown: do not guess it or create new access from this backfill.
INSERT INTO account_trials (account_id, operation_id, product, started_at, ends_at, origin)
SELECT account_id, 'legacy-store', MIN(product), MIN(created_at), NULL, 'LEGACY_STORE'
FROM subscriptions WHERE trial_ends_at IS NOT NULL OR status = 'TRIALING' GROUP BY account_id;

CREATE TRIGGER account_trials_validate_insert BEFORE INSERT ON account_trials
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND status = 'ACTIVE')
    THEN RAISE(ABORT, 'TRIAL_ACCOUNT_UNAVAILABLE') END;
  SELECT CASE WHEN NEW.origin = 'SOLEMI' AND NEW.activation_family_id IS NOT
    (SELECT family_id FROM legacy_family_memberships WHERE account_id = NEW.account_id AND status = 'ACTIVE')
    THEN RAISE(ABORT, 'TRIAL_MEMBERSHIP_CHANGED') END;
  SELECT CASE WHEN NEW.origin = 'SOLEMI' AND NEW.family_id IS NOT NEW.activation_family_id
    THEN RAISE(ABORT, 'TRIAL_MEMBERSHIP_CHANGED') END;
  SELECT CASE WHEN NEW.family_id IS NOT NULL AND
    (SELECT COUNT(*) FROM account_trials WHERE family_id = NEW.family_id) >= 4
    THEN RAISE(ABORT, 'TRIAL_FAMILY_LIMIT') END;
  SELECT CASE WHEN NEW.family_id IS NOT NULL AND EXISTS
    (SELECT 1 FROM account_trials WHERE family_id = NEW.family_id AND ends_at > NEW.started_at)
    THEN RAISE(ABORT, 'TRIAL_FAMILY_ACTIVE') END;
END;

CREATE TRIGGER account_trials_immutable BEFORE UPDATE ON account_trials
BEGIN
  SELECT CASE WHEN NEW.account_id IS NOT OLD.account_id OR NEW.operation_id IS NOT OLD.operation_id
    OR NEW.product IS NOT OLD.product OR NEW.started_at IS NOT OLD.started_at OR NEW.ends_at IS NOT OLD.ends_at
    OR NEW.origin IS NOT OLD.origin OR NEW.activation_family_id IS NOT OLD.activation_family_id
    OR OLD.family_id IS NOT NULL OR NEW.family_id IS NULL
    THEN RAISE(ABORT, 'TRIAL_IMMUTABLE') END;
  SELECT CASE WHEN NEW.origin <> 'SOLEMI' OR NOT EXISTS
    (SELECT 1 FROM legacy_family_memberships WHERE account_id = NEW.account_id AND status = 'ACTIVE' AND family_id = NEW.family_id)
    THEN RAISE(ABORT, 'TRIAL_MEMBERSHIP_CHANGED') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM account_trials WHERE family_id = NEW.family_id) >= 4
    THEN RAISE(ABORT, 'TRIAL_FAMILY_LIMIT') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM account_trials WHERE family_id = NEW.family_id AND ends_at > NEW.family_bound_at)
    THEN RAISE(ABORT, 'TRIAL_FAMILY_ACTIVE') END;
END;

-- Membership and first binding commit together. A full/busy family still accepts
-- membership but receives no extra trial; no account right/time is reset.
CREATE TRIGGER account_trials_bind_on_join AFTER INSERT ON legacy_family_memberships
WHEN NEW.status = 'ACTIVE'
BEGIN
  UPDATE account_trials SET family_id = NEW.family_id, family_bound_at = NEW.joined_at
  WHERE account_id = NEW.account_id AND origin = 'SOLEMI' AND family_id IS NULL
    AND started_at <= NEW.joined_at AND ends_at > NEW.joined_at
    AND (SELECT COUNT(*) FROM account_trials WHERE family_id = NEW.family_id) < 4
    AND NOT EXISTS (SELECT 1 FROM account_trials WHERE family_id = NEW.family_id AND ends_at > NEW.joined_at);
END;

-- Preserve historical store usage even if a later paid renewal clears trial_ends_at.
CREATE TRIGGER account_trials_record_store_insert AFTER INSERT ON subscriptions
WHEN NEW.trial_ends_at IS NOT NULL OR NEW.status = 'TRIALING'
BEGIN
  INSERT OR IGNORE INTO account_trials (account_id, operation_id, product, started_at, ends_at, origin)
  VALUES (NEW.account_id, 'legacy-store', NEW.product, NEW.created_at, NULL, 'LEGACY_STORE');
END;
CREATE TRIGGER account_trials_record_store_update AFTER UPDATE ON subscriptions
WHEN NEW.trial_ends_at IS NOT NULL OR NEW.status = 'TRIALING'
BEGIN
  INSERT OR IGNORE INTO account_trials (account_id, operation_id, product, started_at, ends_at, origin)
  VALUES (NEW.account_id, 'legacy-store', NEW.product, NEW.created_at, NULL, 'LEGACY_STORE');
END;

-- Single read model for online and signed offline access. A bound trial can only
-- contribute to its one Family, through its owner's current active membership.
CREATE VIEW effective_entitlement_grants AS
SELECT account_id, feature_key, valid_from, valid_until, revoked_at, 0 AS is_trial, NULL AS trial_family_id
FROM account_entitlements
UNION ALL
SELECT t.account_id, f.feature_key, t.started_at, t.ends_at, NULL, 1, t.family_id
FROM account_trials t JOIN accounts a ON a.id = t.account_id AND a.status = 'ACTIVE'
CROSS JOIN (SELECT 'FAMILY_SYNC' AS feature_key UNION ALL SELECT 'PDF_EXPORT' UNION ALL SELECT 'FAMILY_PLUS_INSIGHTS') f
WHERE t.origin = 'SOLEMI' AND (t.product = 'FAMILY_PLUS' OR f.feature_key <> 'FAMILY_PLUS_INSIGHTS');
