-- Track which verified event actually advanced the subscription snapshot.
-- A later event with the same verification timestamp cannot reuse that
-- snapshot's entitlement writes.
ALTER TABLE store_subscription_state ADD COLUMN last_applied_event_id TEXT;
ALTER TABLE store_subscription_state ADD COLUMN last_applied_status TEXT;
