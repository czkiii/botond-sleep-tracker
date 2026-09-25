-- Google Play links a replacement purchase to its previous purchase token.
-- The old token remains tombstoned even when that token was never seen here.
CREATE TABLE google_token_replacements (
  old_purchase_token TEXT PRIMARY KEY NOT NULL,
  replacement_subscription_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  external_account_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (replacement_subscription_id) REFERENCES subscriptions(id) ON DELETE RESTRICT
);

CREATE INDEX idx_google_token_replacements_subscription
ON google_token_replacements(replacement_subscription_id);

CREATE TRIGGER google_replacement_owner_guard
BEFORE INSERT ON google_token_replacements
BEGIN
  SELECT RAISE(ABORT, 'LINKED_TOKEN_OWNER_MISMATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions replacement
    JOIN store_subscription_state new_state ON new_state.subscription_id = replacement.id
    WHERE replacement.id = NEW.replacement_subscription_id
      AND replacement.provider = 'GOOGLE_PLAY'
      AND replacement.account_id = NEW.account_id
      AND new_state.environment = NEW.environment
      AND new_state.external_account_token = NEW.external_account_token
      AND replacement.provider_subscription_id <> NEW.old_purchase_token
  ) OR EXISTS (
    SELECT 1 FROM subscriptions old
    LEFT JOIN store_subscription_state old_state ON old_state.subscription_id = old.id
    WHERE old.provider = 'GOOGLE_PLAY'
      AND old.provider_subscription_id = NEW.old_purchase_token
      AND (old.account_id <> NEW.account_id
        OR old_state.subscription_id IS NULL
        OR old_state.environment <> NEW.environment
        OR old_state.external_account_token <> NEW.external_account_token)
  );
  SELECT RAISE(ABORT, 'LINKED_TOKEN_ALREADY_REPLACED')
  WHERE EXISTS (
    SELECT 1 FROM google_token_replacements prior
    WHERE prior.old_purchase_token = NEW.old_purchase_token
      AND (prior.replacement_subscription_id <> NEW.replacement_subscription_id
        OR prior.account_id <> NEW.account_id
        OR prior.environment <> NEW.environment
        OR prior.external_account_token <> NEW.external_account_token)
  );
END;

CREATE TRIGGER google_replaced_token_insert_guard
BEFORE INSERT ON subscriptions
WHEN NEW.provider = 'GOOGLE_PLAY' AND EXISTS (
  SELECT 1 FROM google_token_replacements replaced
  WHERE replaced.old_purchase_token = NEW.provider_subscription_id
)
BEGIN SELECT RAISE(ABORT, 'REPLACED_GOOGLE_TOKEN'); END;

CREATE TRIGGER google_replaced_token_update_guard
BEFORE UPDATE ON subscriptions
WHEN NEW.provider = 'GOOGLE_PLAY' AND EXISTS (
  SELECT 1 FROM google_token_replacements replaced
  WHERE replaced.old_purchase_token = NEW.provider_subscription_id
)
BEGIN SELECT RAISE(ABORT, 'REPLACED_GOOGLE_TOKEN'); END;
