-- Preserve existing stable Google identities; no email-based account merging.
CREATE TABLE account_identities_next (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('GOOGLE', 'APPLE')),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (length(subject) > 0),
  email_at_login TEXT,
  email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  last_verified_at INTEGER NOT NULL,
  UNIQUE (provider, issuer, subject)
);
INSERT INTO account_identities_next SELECT * FROM account_identities;
DROP TABLE account_identities;
ALTER TABLE account_identities_next RENAME TO account_identities;
CREATE UNIQUE INDEX idx_one_google_identity_per_account ON account_identities(account_id) WHERE provider = 'GOOGLE';
CREATE UNIQUE INDEX idx_one_apple_identity_per_account ON account_identities(account_id) WHERE provider = 'APPLE';
