-- Operational scheduling only; ownership, events and grants stay in the existing ledger.
ALTER TABLE store_subscription_state ADD COLUMN next_reconcile_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE store_subscription_state ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE store_subscription_state ADD COLUMN reconcile_lease_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE store_subscription_state ADD COLUMN reconcile_lease_id TEXT;
CREATE INDEX idx_store_reconcile_due ON store_subscription_state(next_reconcile_at, reconcile_lease_until);
