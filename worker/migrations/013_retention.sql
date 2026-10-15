-- Technical records only. Neither financial-document retention nor diary data.
CREATE TABLE billing_retention (
  subscription_id TEXT PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
  ended_at INTEGER,
  dispute_open INTEGER NOT NULL DEFAULT 0 CHECK (dispute_open IN (0,1)),
  dispute_closed_at INTEGER,
  dispute_event_at INTEGER,
  CHECK (dispute_closed_at IS NULL OR dispute_closed_at >= 0)
);
CREATE TABLE billing_legal_holds (
  subscription_id TEXT PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
  basis TEXT NOT NULL CHECK(length(basis) > 0),
  owner TEXT NOT NULL CHECK(length(owner) > 0),
  created_at INTEGER NOT NULL, review_at INTEGER NOT NULL, released_at INTEGER,
  CHECK(review_at >= created_at), CHECK(released_at IS NULL OR released_at >= created_at)
);
-- Terminal store snapshots start the clock at the end of access, not at the
-- receipt/retry time. CANCELED may still renew/resume: it is not final expiry.
CREATE TRIGGER billing_retention_insert AFTER INSERT ON subscriptions
BEGIN INSERT OR IGNORE INTO billing_retention(subscription_id, ended_at)
  VALUES (NEW.id, CASE WHEN NEW.status = 'REVOKED' THEN MIN(NEW.access_until,NEW.updated_at)
    WHEN NEW.status = 'EXPIRED' THEN NEW.access_until ELSE NULL END); END;
CREATE TRIGGER billing_retention_update AFTER UPDATE ON subscriptions
BEGIN
  UPDATE billing_retention SET ended_at = CASE WHEN NEW.status = 'REVOKED'
    THEN MIN(COALESCE(ended_at, NEW.updated_at), NEW.access_until, NEW.updated_at)
    WHEN NEW.status = 'EXPIRED' THEN MAX(COALESCE(ended_at,0), NEW.access_until)
    ELSE NULL END WHERE subscription_id = NEW.id;
END;
-- The applied verified event supplies the earlier actual revocation time.
-- A stale unrelated event cannot move the deadline or restart it.
CREATE TRIGGER billing_retention_revocation_event AFTER INSERT ON subscription_events
WHEN EXISTS (SELECT 1 FROM subscriptions s JOIN store_subscription_state st ON st.subscription_id=s.id
  WHERE s.id=NEW.subscription_id AND s.status='REVOKED' AND st.last_applied_event_id=NEW.provider_event_id)
BEGIN UPDATE billing_retention SET ended_at=MIN(ended_at,NEW.occurred_at) WHERE subscription_id=NEW.subscription_id; END;
INSERT INTO billing_retention(subscription_id, ended_at)
SELECT id, CASE WHEN status='REVOKED' THEN MIN(access_until,updated_at)
  WHEN status='EXPIRED' THEN access_until ELSE NULL END FROM subscriptions;
-- Restored diary copies cannot issue trials until current business ledgers have
-- been reconciled by the operator. This is never cleared by a public endpoint.
CREATE TABLE retention_restore_gate (id INTEGER PRIMARY KEY CHECK (id=1), blocked INTEGER NOT NULL CHECK (blocked IN (0,1)));
INSERT INTO retention_restore_gate VALUES (1,0);
DROP VIEW effective_entitlement_grants;
CREATE VIEW effective_entitlement_grants AS
SELECT account_id, feature_key, valid_from, valid_until, revoked_at, 0 AS is_trial, NULL AS trial_family_id
FROM account_entitlements WHERE (SELECT blocked FROM retention_restore_gate WHERE id=1) = 0
UNION ALL
SELECT t.account_id, f.feature_key, t.started_at, t.ends_at, NULL, 1, t.family_id
FROM account_trials t JOIN accounts a ON a.id = t.account_id AND a.status = 'ACTIVE'
CROSS JOIN (SELECT 'FAMILY_SYNC' AS feature_key UNION ALL SELECT 'PDF_EXPORT' UNION ALL SELECT 'FAMILY_PLUS_INSIGHTS') f
WHERE t.origin = 'SOLEMI' AND (t.product = 'FAMILY_PLUS' OR f.feature_key <> 'FAMILY_PLUS_INSIGHTS')
  AND (SELECT blocked FROM retention_restore_gate WHERE id=1) = 0;
