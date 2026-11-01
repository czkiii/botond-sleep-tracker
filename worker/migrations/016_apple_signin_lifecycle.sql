-- Provider credentials are NOT account exports. No FK cascade: revocation must
-- survive erasure of the account. Successful revocation removes the ciphertext.
CREATE TABLE apple_signin_credentials (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  subject_key TEXT NOT NULL,
  client_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  token_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('STAGED','ACTIVE','REVOKE')),
  next_attempt_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX apple_signin_credentials_due ON apple_signin_credentials(state,next_attempt_at);
CREATE INDEX apple_signin_credentials_account ON apple_signin_credentials(account_id);
CREATE INDEX apple_signin_credentials_subject ON apple_signin_credentials(subject_key,token_key);
CREATE TABLE apple_signin_state (
  subject_key TEXT PRIMARY KEY,
  account_id TEXT,
  revoked_before INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  email_event_at INTEGER NOT NULL DEFAULT 0,
  email_enabled INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE apple_signin_notices (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);
ALTER TABLE account_sessions ADD COLUMN apple_auth_time INTEGER;
CREATE TABLE apple_signin_maintenance (
  id INTEGER PRIMARY KEY CHECK(id=1), completed_at INTEGER NOT NULL,
  processed INTEGER NOT NULL, failed INTEGER NOT NULL, pending INTEGER NOT NULL
);
-- Same transaction as the real erasure, including offline deletion replay.
CREATE TRIGGER apple_signin_account_erasure AFTER UPDATE OF status ON accounts
WHEN NEW.status='DELETED'
BEGIN
  UPDATE apple_signin_credentials SET state='REVOKE', next_attempt_at=0
    WHERE account_id=NEW.id;
END;
CREATE TRIGGER apple_signin_identity_erasure AFTER DELETE ON account_identities
WHEN OLD.provider='APPLE'
BEGIN
  UPDATE apple_signin_credentials SET state='REVOKE', next_attempt_at=0
    WHERE account_id=OLD.account_id;
END;
CREATE TRIGGER apple_signin_account_purge BEFORE DELETE ON accounts
BEGIN
  UPDATE apple_signin_credentials SET state='REVOKE', next_attempt_at=0
    WHERE account_id=OLD.id;
END;
