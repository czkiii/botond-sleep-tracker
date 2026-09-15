import { SignJWT, jwtVerify } from 'jose'
import { AccountStore } from './accountStore'
import type { AccountRow, SessionAccess } from './accountStore'
import { verifyGoogleToken } from './googleAuth'
import type { GoogleIdentity } from './googleAuth'

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000
export const CHALLENGE_MS = 10 * 60 * 1000
export const ACCESS_SECONDS = 300
const encoder = new TextEncoder()

export class AuthError extends Error {
  constructor(readonly code: string, readonly status = 401, readonly data?: unknown) { super(code) }
}

export function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
}
export async function secretHash(secret: string, pepper: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const hash = await crypto.subtle.sign('HMAC', key, encoder.encode(secret))
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
function id(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}` }
function publicAccount(account: AccountRow) {
  return { id: account.id, email: account.email, name: account.display_name }
}

export class AuthService {
  private store: AccountStore
  constructor(private db: D1Database, private config: { clientId: string; secret: string },
    private verify: typeof verifyGoogleToken = verifyGoogleToken) {
    this.store = new AccountStore(db)
  }

  async challenge(now = Date.now()) {
    const nonce = randomSecret()
    await this.db.batch([
      this.db.prepare('DELETE FROM auth_challenges WHERE expires_at <= ?').bind(now),
      this.db.prepare('INSERT INTO auth_challenges VALUES (?, ?, ?)')
        .bind(await secretHash(`nonce:${nonce}`, this.config.secret), now, now + CHALLENGE_MS)
    ])
    return nonce
  }

  private async resolveAccount(identity: GoogleIdentity, now: number) {
    let account = await this.store.findGoogleAccount(identity.issuer, identity.subject)
    if (!account) {
      try {
        await this.store.createGoogleAccount({ accountId: id('acc'), identityId: id('identity'),
          issuer: identity.issuer, subject: identity.subject, email: identity.email,
          displayName: identity.name, avatarUrl: identity.picture, locale: null, now })
      } catch (error) {
        // A concurrent first login may have created this exact Google identity.
        account = await this.store.findGoogleAccount(identity.issuer, identity.subject)
        if (!account) throw error
      }
      account = await this.store.findGoogleAccount(identity.issuer, identity.subject)
    }
    if (!account || account.status !== 'ACTIVE') throw new AuthError('ACCOUNT_UNAVAILABLE', 403)
    await this.db.batch([
      this.db.prepare(`UPDATE accounts SET email = ?, display_name = ?, avatar_url = ?,
        updated_at = ?, last_login_at = ? WHERE id = ? AND status = 'ACTIVE'`)
        .bind(identity.email, identity.name, identity.picture, now, now, account.id),
      this.db.prepare(`UPDATE account_identities SET email_at_login = ?, last_verified_at = ?
        WHERE account_id = ? AND provider = 'GOOGLE'`).bind(identity.email, now, account.id)
    ])
    return { ...account, email: identity.email, display_name: identity.name }
  }

  async login(input: { credential: string; nonce: string; installationSecret: string; deviceName: string;
    replaceDeviceId?: string }, now = Date.now()) {
    if (!/^[a-f0-9]{64}$/.test(input.nonce) || !/^[a-f0-9]{64}$/.test(input.installationSecret)) {
      throw new AuthError('INVALID_REQUEST', 400)
    }
    let identity: GoogleIdentity
    try { identity = await this.verify(input.credential, this.config.clientId, input.nonce, { now }) }
    catch { throw new AuthError('GOOGLE_TOKEN_INVALID') }
    const used = await this.db.prepare('DELETE FROM auth_challenges WHERE nonce_hash = ? AND expires_at > ?')
      .bind(await secretHash(`nonce:${input.nonce}`, this.config.secret), now).run()
    if (used.meta.changes !== 1) throw new AuthError('LOGIN_CHALLENGE_INVALID')
    const account = await this.resolveAccount(identity, now)
    // One browser installation can sign in to different accounts without ever
    // reassigning a device or inheriting another account's credentials.
    const installationHash = await secretHash(`installation:${account.id}:${input.installationSecret}`, this.config.secret)
    const existing = await this.db.prepare('SELECT id, revoked_at FROM account_devices WHERE installation_hash = ? AND account_id = ?')
      .bind(installationHash, account.id).first<{ id: string; revoked_at: number | null }>()
    const deviceId = existing?.id ?? id('dev')
    const statements: D1PreparedStatement[] = []
    if (input.replaceDeviceId) {
      if (input.replaceDeviceId === deviceId) throw new AuthError('INVALID_DEVICE_REPLACEMENT', 409)
      const selected = await this.db.prepare('SELECT id FROM account_devices WHERE id = ? AND account_id = ? AND revoked_at IS NULL')
        .bind(input.replaceDeviceId, account.id).first()
      if (!selected) throw new AuthError('INVALID_DEVICE_REPLACEMENT', 409)
      statements.push(
        this.db.prepare('UPDATE account_sessions SET revoked_at = ? WHERE account_id = ? AND device_id = ? AND revoked_at IS NULL')
          .bind(now, account.id, input.replaceDeviceId),
        this.db.prepare(`UPDATE devices SET revoked_at = ? WHERE id IN (
          SELECT legacy_device_id FROM account_family_devices
          WHERE account_id = ? AND account_device_id = ?
        ) AND revoked_at IS NULL`).bind(new Date(now).toISOString(), account.id, input.replaceDeviceId),
        this.db.prepare(`UPDATE account_devices SET revoked_at = ?, revoke_reason = 'USER_REPLACED'
          WHERE account_id = ? AND id = ? AND revoked_at IS NULL`).bind(now, account.id, input.replaceDeviceId)
      )
    }
    const credentialHash = await secretHash(`device:${randomSecret()}`, this.config.secret)
    if (existing) {
      statements.push(this.db.prepare(`UPDATE account_devices SET revoked_at = NULL, revoke_reason = NULL,
        credential_hash = ?, name = ?, last_seen_at = ? WHERE id = ? AND account_id = ?`)
        .bind(credentialHash, input.deviceName.slice(0, 80), now, deviceId, account.id))
    } else {
      statements.push(this.db.prepare(`INSERT INTO account_devices
        (id, account_id, installation_hash, credential_hash, name, platform, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, 'WEB', ?, ?)`)
        .bind(deviceId, account.id, installationHash, credentialHash, input.deviceName.slice(0, 80), now, now))
    }
    // Fresh Google proof replaces this device's old sessions as a single batch.
    statements.push(this.db.prepare('UPDATE account_sessions SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL').bind(now, deviceId))
    const refresh = randomSecret()
    const sessionId = id('ses')
    statements.push(this.db.prepare(`INSERT INTO account_sessions
      (id, account_id, device_id, refresh_hash, created_at, last_used_at, expires_at)
      SELECT ?, d.account_id, d.id, ?, ?, ?, ? FROM account_devices d JOIN accounts a ON a.id = d.account_id
      WHERE d.id = ? AND d.account_id = ? AND d.revoked_at IS NULL AND a.status = 'ACTIVE'`)
      .bind(sessionId, await secretHash(`refresh:${refresh}`, this.config.secret), now, now, now + SESSION_MS, deviceId, account.id))
    try {
      const result = await this.db.batch(statements)
      if (result[result.length - 1].meta.changes !== 1) throw new AuthError('ACCOUNT_UNAVAILABLE', 403)
    } catch (error) {
      if (error instanceof Error && error.message.includes('ACCOUNT_DEVICE_LIMIT')) {
        throw new AuthError('DEVICE_LIMIT_REACHED', 409, { devices: await this.store.listActiveDevices(account.id) })
      }
      throw error
    }
    return { refresh, account: publicAccount(account), deviceId,
      accessToken: await this.accessToken({ id: sessionId, account_id: account.id, device_id: deviceId }, now),
      accessExpiresAt: now + ACCESS_SECONDS * 1000, expiresAt: now + SESSION_MS }
  }

  private accessToken(session: Pick<SessionAccess, 'id' | 'account_id' | 'device_id'>, now: number) {
    return new SignJWT({ sid: session.id, did: session.device_id }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('solemi-auth').setAudience('solemi-account').setSubject(session.account_id)
      .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + ACCESS_SECONDS)
      .sign(encoder.encode(this.config.secret))
  }

  async authenticate(token: string, now = Date.now()) {
    let claims
    try {
      claims = (await jwtVerify(token, encoder.encode(this.config.secret), {
        algorithms: ['HS256'], issuer: 'solemi-auth', audience: 'solemi-account',
        requiredClaims: ['sub', 'exp', 'iat', 'sid', 'did'], currentDate: new Date(now)
      })).payload
    } catch { throw new AuthError('SESSION_INVALID') }
    if (typeof claims.sid !== 'string' || typeof claims.did !== 'string') throw new AuthError('SESSION_INVALID')
    const result = await this.db.prepare(`SELECT a.* FROM accounts a
      JOIN account_sessions s ON s.account_id = a.id
      JOIN account_devices d ON d.id = s.device_id AND d.account_id = a.id
      WHERE s.id = ? AND a.id = ? AND d.id = ? AND a.status = 'ACTIVE'
        AND d.revoked_at IS NULL AND s.revoked_at IS NULL AND s.expires_at > ?`)
      .bind(claims.sid, claims.sub!, claims.did, now).first<AccountRow>()
    if (!result) throw new AuthError('SESSION_INVALID')
    return { account: publicAccount(result), deviceId: claims.did, sessionId: claims.sid }
  }

  async refresh(token: string, now = Date.now()) {
    const hash = await secretHash(`refresh:${token}`, this.config.secret)
    const current = await this.store.findActiveSession(hash, now)
    if (!current) { await this.rejectReplay(hash, now); throw new AuthError('SESSION_INVALID') }
    const refresh = randomSecret()
    const nextHash = await secretHash(`refresh:${refresh}`, this.config.secret)
    try {
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO used_refresh_tokens (token_hash, session_id, used_at)
          SELECT refresh_hash, id, ? FROM account_sessions
          WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL AND expires_at > ?`)
          .bind(now, current.id, hash, now),
        this.db.prepare(`UPDATE account_sessions SET refresh_hash = ?, last_used_at = ?, rotation_counter = rotation_counter + 1
          WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL AND expires_at > ?`)
          .bind(nextHash, now, current.id, hash, now)
      ])
      if (results[1].meta.changes !== 1) { await this.rejectReplay(hash, now); throw new AuthError('SESSION_INVALID') }
    } catch (error) {
      await this.rejectReplay(hash, now)
      throw error instanceof AuthError ? error : new AuthError('SESSION_INVALID')
    }
    const accessToken = await this.accessToken(current, now)
    const access = await this.authenticate(accessToken, now)
    return { ...access, refresh, accessToken,
      accessExpiresAt: now + ACCESS_SECONDS * 1000, expiresAt: current.expires_at }
  }

  private async rejectReplay(hash: string, now: number) {
    const replay = await this.db.prepare(`SELECT s.account_id, s.device_id FROM used_refresh_tokens u
      JOIN account_sessions s ON s.id = u.session_id WHERE u.token_hash = ? AND s.expires_at > ?`)
      .bind(hash, now).first<{ account_id: string; device_id: string }>()
    if (replay) {
      await this.db.prepare('UPDATE account_sessions SET revoked_at = ? WHERE account_id = ? AND device_id = ? AND revoked_at IS NULL')
        .bind(now, replay.account_id, replay.device_id).run()
      throw new AuthError('REFRESH_REUSED')
    }
  }

  async logout(token: string, now = Date.now()) {
    await this.db.prepare('UPDATE account_sessions SET revoked_at = ? WHERE refresh_hash = ? AND revoked_at IS NULL')
      .bind(now, await secretHash(`refresh:${token}`, this.config.secret)).run()
  }
}
