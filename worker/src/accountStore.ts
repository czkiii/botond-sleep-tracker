// Persistence only: callers must verify Google assertions and authenticate the
// account before using mutations. No public route imports this module yet.
export type AccountRow = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  locale: string | null
  status: 'ACTIVE' | 'DELETION_PENDING' | 'DELETED'
  created_at: number
  updated_at: number
  last_login_at: number
  deleted_at: number | null
}

export type DeviceSummary = {
  id: string
  name: string | null
  platform: 'WEB' | 'IOS' | 'ANDROID' | 'OTHER' | null
  last_seen_at: number
}

export type SessionAccess = {
  id: string
  account_id: string
  device_id: string
  expires_at: number
  rotation_counter: number
}

type NewDevice = {
  id: string
  installationHash: string
  credentialHash: string
  name: string | null
  platform: DeviceSummary['platform']
}

export class AccountStoreError extends Error {
  constructor(readonly code: 'ACCOUNT_DEVICE_LIMIT' | 'ACCOUNT_UNAVAILABLE' | 'DEVICE_UNAVAILABLE') {
    super(code)
  }
}

export class AccountStore {
  constructor(private readonly db: D1Database) {}

  findGoogleAccount(issuer: string, subject: string) {
    // Email is deliberately not an identity key.
    return this.db.prepare(`SELECT a.* FROM accounts a
      JOIN account_identities i ON i.account_id = a.id
      WHERE i.provider = 'GOOGLE' AND i.issuer = ? AND i.subject = ?`)
      .bind(issuer, subject).first<AccountRow>()
  }

  async createGoogleAccount(input: {
    accountId: string; identityId: string; issuer: string; subject: string
    email: string | null; displayName: string | null; avatarUrl: string | null
    locale: string | null; now: number
  }) {
    // Only call with server-verified claims and server-generated IDs/timestamps.
    await this.db.batch([
      this.db.prepare(`INSERT INTO accounts
        (id, email, display_name, avatar_url, locale, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(input.accountId, input.email,
        input.displayName, input.avatarUrl, input.locale, input.now, input.now, input.now),
      this.db.prepare(`INSERT INTO account_identities
        (id, account_id, provider, issuer, subject, email_at_login, email_verified, created_at, last_verified_at)
        VALUES (?, ?, 'GOOGLE', ?, ?, ?, 1, ?, ?)`).bind(input.identityId,
        input.accountId, input.issuer, input.subject, input.email, input.now, input.now)
    ])
  }

  async listActiveDevices(accountId: string) {
    const result = await this.db.prepare(`SELECT id, name, platform, last_seen_at
      FROM account_devices WHERE account_id = ? AND revoked_at IS NULL
      ORDER BY last_seen_at DESC, id`).bind(accountId).all<DeviceSummary>()
    return result.results
  }

  private insertDevice(accountId: string, device: NewDevice, now: number) {
    return this.db.prepare(`INSERT INTO account_devices
      (id, account_id, installation_hash, credential_hash, name, platform, created_at, last_seen_at)
      SELECT ?, id, ?, ?, ?, ?, ?, ? FROM accounts WHERE id = ? AND status = 'ACTIVE'`)
      .bind(device.id, device.installationHash, device.credentialHash,
        device.name, device.platform, now, now, accountId)
  }

  async registerDevice(accountId: string, device: NewDevice, now: number) {
    try {
      const result = await this.insertDevice(accountId, device, now).run()
      if (result.meta.changes !== 1) throw new AccountStoreError('ACCOUNT_UNAVAILABLE')
    } catch (error) {
      if (error instanceof Error && error.message.includes('ACCOUNT_DEVICE_LIMIT')) {
        throw new AccountStoreError('ACCOUNT_DEVICE_LIMIT')
      }
      throw error
    }
  }

  async createSession(input: {
    id: string; accountId: string; deviceId: string
    refreshHash: string; now: number; expiresAt: number
  }) {
    const result = await this.db.prepare(`INSERT INTO account_sessions
      (id, account_id, device_id, refresh_hash, created_at, last_used_at, expires_at)
      SELECT ?, d.account_id, d.id, ?, ?, ?, ? FROM account_devices d
      JOIN accounts a ON a.id = d.account_id
      WHERE d.id = ? AND d.account_id = ? AND d.revoked_at IS NULL AND a.status = 'ACTIVE'`)
      .bind(input.id, input.refreshHash, input.now, input.now, input.expiresAt,
        input.deviceId, input.accountId).run()
    if (result.meta.changes !== 1) throw new AccountStoreError('DEVICE_UNAVAILABLE')
  }

  findActiveSession(refreshHash: string, now: number) {
    // Check revocation on every lookup, including account and device status.
    return this.db.prepare(`SELECT s.id, s.account_id, s.device_id, s.expires_at, s.rotation_counter
      FROM account_sessions s
      JOIN account_devices d ON d.id = s.device_id AND d.account_id = s.account_id
      JOIN accounts a ON a.id = s.account_id
      WHERE s.refresh_hash = ? AND s.revoked_at IS NULL
        AND s.created_at <= ? AND s.expires_at > ?
        AND d.revoked_at IS NULL AND a.status = 'ACTIVE'`)
      .bind(refreshHash, now, now).first<SessionAccess>()
  }

  async revokeDevice(accountId: string, deviceId: string, now: number) {
    // One D1 batch is a transaction: sessions and device are revoked together.
    const results = await this.db.batch([
      this.db.prepare(`UPDATE account_sessions SET revoked_at = ?
        WHERE account_id = ? AND device_id = ? AND revoked_at IS NULL`)
        .bind(now, accountId, deviceId),
      this.db.prepare(`UPDATE account_devices SET revoked_at = ?, revoke_reason = 'USER_REVOKED'
        WHERE account_id = ? AND id = ? AND revoked_at IS NULL`)
        .bind(now, accountId, deviceId)
    ])
    return results[1].meta.changes === 1
  }
}
