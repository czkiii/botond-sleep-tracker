-- Apply after 003. Retain used refresh hashes until their session expires so
-- replay can revoke all sessions for that device without storing raw tokens.
CREATE TABLE auth_challenges (
  nonce_hash TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX idx_auth_challenges_expiry ON auth_challenges(expires_at);

CREATE TABLE used_refresh_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES account_sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_used_refresh_session ON used_refresh_tokens(session_id);
