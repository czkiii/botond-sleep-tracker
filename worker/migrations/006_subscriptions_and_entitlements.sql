PRAGMA foreign_keys = ON;

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('APPLE', 'GOOGLE_PLAY', 'STRIPE', 'MANUAL')),
  provider_subscription_id TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('FAMILY', 'FAMILY_PLUS')),
  status TEXT NOT NULL CHECK (status IN
    ('TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'REVOKED')),
  auto_renews INTEGER NOT NULL CHECK (auto_renews IN (0, 1)),
  trial_ends_at INTEGER,
  current_period_ends_at INTEGER NOT NULL,
  access_until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  canceled_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  UNIQUE (provider, provider_subscription_id),
  CHECK (access_until >= created_at),
  CHECK (trial_ends_at IS NULL OR trial_ends_at > created_at)
);

CREATE INDEX idx_subscriptions_account_access
ON subscriptions(account_id, access_until DESC);

CREATE TABLE subscription_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('APPLE', 'GOOGLE_PLAY', 'STRIPE', 'MANUAL')),
  provider_event_id TEXT NOT NULL,
  subscription_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  processed_at INTEGER,
  processing_error TEXT,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE account_entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  feature_key TEXT NOT NULL CHECK (feature_key IN
    ('FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS')),
  source_type TEXT NOT NULL CHECK (source_type IN ('SUBSCRIPTION', 'PROMO', 'ADMIN')),
  source_id TEXT NOT NULL,
  valid_from INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CHECK (valid_until > valid_from),
  UNIQUE (account_id, feature_key, source_type, source_id)
);

CREATE INDEX idx_account_entitlements_active
ON account_entitlements(account_id, feature_key, valid_until)
WHERE revoked_at IS NULL;
