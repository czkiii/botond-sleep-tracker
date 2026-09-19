-- Provider-specific account aliases and verified store state. Existing
-- subscription and entitlement rows remain unchanged.
PRAGMA foreign_keys = ON;

CREATE TABLE billing_account_links (
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('APPLE', 'GOOGLE_PLAY')),
  external_account_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, provider),
  UNIQUE (provider, external_account_token),
  UNIQUE (account_id, provider, external_account_token),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CHECK (length(external_account_token) BETWEEN 20 AND 64),
  CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX idx_subscriptions_store_state_identity
ON subscriptions(id, account_id, provider);

CREATE TABLE store_subscription_state (
  subscription_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('APPLE', 'GOOGLE_PLAY')),
  environment TEXT NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  provider_transaction_id TEXT NOT NULL,
  external_account_token TEXT NOT NULL,
  last_verified_at INTEGER NOT NULL,
  acknowledgement_state TEXT NOT NULL
    CHECK (acknowledgement_state IN ('NOT_REQUIRED', 'PENDING', 'ACKNOWLEDGED')),
  acknowledged_at INTEGER,
  replacement_provider_subscription_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (subscription_id, account_id, provider)
    REFERENCES subscriptions(id, account_id, provider) ON DELETE CASCADE,
  FOREIGN KEY (account_id, provider, external_account_token)
    REFERENCES billing_account_links(account_id, provider, external_account_token)
    ON DELETE RESTRICT,
  CHECK (updated_at >= created_at),
  CHECK (last_verified_at >= 0),
  CHECK (
    (acknowledgement_state = 'ACKNOWLEDGED' AND acknowledged_at IS NOT NULL)
    OR (acknowledgement_state <> 'ACKNOWLEDGED' AND acknowledged_at IS NULL)
  ),
  CHECK (provider = 'GOOGLE_PLAY' OR acknowledgement_state = 'NOT_REQUIRED')
);

CREATE INDEX idx_store_subscription_state_account
ON store_subscription_state(account_id, provider, last_verified_at DESC);

CREATE INDEX idx_store_subscription_state_acknowledgement
ON store_subscription_state(provider, acknowledgement_state)
WHERE acknowledgement_state = 'PENDING';
