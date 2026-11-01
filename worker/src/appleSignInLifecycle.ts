import { base64url, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { appleKeys, type AppleIdentity } from './appleAuth'
import { AppleSignInError, AppleSignInProvider, appleSignInConfig, type AppleSignInConfig, type AppleSignInEnv, type AppleSignInExchange } from './appleSignInProvider'

export const APPLE_SIGN_IN_CRON = '4-59/5 * * * *'
const encoder = new TextEncoder(), DAY = 86_400_000
type Credential = { id: string; account_id: string | null; subject_key: string; client_id: string; issued_at: number;
  ciphertext: string; token_key: string; state: string; attempts: number }
export type AppleNotice = { id: string; subject: string; type: 'consent-revoked' | 'account-deleted' | 'email-disabled' | 'email-enabled'; at: number }

export async function verifyAppleNotice(token: string, clientId: string, now = Date.now(), keys: JWTVerifyGetKey = appleKeys): Promise<AppleNotice> {
  try {
    if (!token || token.length > 16_384) throw new Error('size')
    // Apple notifications do not require exp. Delayed authentic events are safe
    // because their occurrence watermark cannot revoke a later authentication.
    const { payload } = await jwtVerify(token, keys, { algorithms: ['RS256'], issuer: 'https://appleid.apple.com', audience: clientId,
      requiredClaims: ['iss', 'aud', 'iat', 'jti', 'events'], currentDate: new Date(now), clockTolerance: 0 })
    const event = typeof payload.events === 'string' ? JSON.parse(payload.events) : payload.events
    const at = event?.event_time
    if (!Number.isSafeInteger(payload.iat) || payload.iat! <= 0 || payload.iat! * 1000 > now + 60_000
      || typeof payload.jti !== 'string' || !payload.jti || payload.jti.length > 512
      || !event || typeof event !== 'object' || Array.isArray(event)
      || typeof event.sub !== 'string' || !event.sub || event.sub.length > 255
      || !['consent-revoked', 'account-deleted', 'email-disabled', 'email-enabled'].includes(event.type)
      || !Number.isSafeInteger(at) || at <= 0 || at * 1000 > now + 60_000 || at > payload.iat! + 60) throw new Error('claims')
    return { id: payload.jti, subject: event.sub, type: event.type, at: at * 1000 }
  } catch { throw new AppleSignInError('APPLE_NOTIFICATION_INVALID', 401) }
}

export class AppleSignInLifecycle {
  private config: AppleSignInConfig
  private provider: AppleSignInExchange
  constructor(private db: D1Database, env: AppleSignInEnv, provider?: AppleSignInExchange) {
    this.config = appleSignInConfig(env); this.provider = provider ?? new AppleSignInProvider(this.config)
  }
  private async key(purpose: 'encryption' | 'identity') {
    const bytes = Uint8Array.from(this.config.tokenKey.match(/../g)!, x => parseInt(x, 16))
    const key = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey'])
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('solemi-apple-signin-v1'), info: encoder.encode(purpose) }, key,
      purpose === 'encryption' ? { name: 'AES-GCM', length: 256 } : { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false, purpose === 'encryption' ? ['encrypt', 'decrypt'] : ['sign'])
  }
  private async digest(value: string) {
    return base64url.encode(new Uint8Array(await crypto.subtle.sign('HMAC', await this.key('identity'), encoder.encode(value))))
  }
  private subjectKey(subject: string) { return this.digest(JSON.stringify(['subject', this.config.clientId, subject])) }
  private aad(row: Pick<Credential, 'id' | 'subject_key' | 'client_id' | 'issued_at'>) {
    return encoder.encode(JSON.stringify(['solemi-apple-credential-v1', row.id, row.subject_key, row.client_id, row.issued_at]))
  }
  private async encrypt(token: string, row: Pick<Credential, 'id' | 'subject_key' | 'client_id' | 'issued_at'>) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: this.aad(row) }, await this.key('encryption'), encoder.encode(token))
    return `v1.${base64url.encode(iv)}.${base64url.encode(new Uint8Array(encrypted))}`
  }
  private async decrypt(row: Credential) {
    try {
      const [version, iv, encrypted, extra] = row.ciphertext.split('.')
      if (version !== 'v1' || !iv || !encrypted || extra || row.client_id !== this.config.clientId) throw new Error('invalid')
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(base64url.decode(iv)), additionalData: this.aad(row) },
        await this.key('encryption'), new Uint8Array(base64url.decode(encrypted))))
    } catch { throw new AppleSignInError('APPLE_CREDENTIAL_UNAVAILABLE') }
  }
  async stage(code: string, nonce: string, expected: AppleIdentity, now = Date.now()) {
    const exchanged = await this.provider.exchange(code, nonce, expected, now)
    const issuedAt = Math.min(expected.authenticatedAt ?? NaN, exchanged.identity.authenticatedAt ?? NaN)
    if (!Number.isSafeInteger(issuedAt) || issuedAt > now || issuedAt < now - 600_000) throw new AppleSignInError('APPLE_TOKEN_INVALID', 401)
    const row = { id: crypto.randomUUID(), subject_key: await this.subjectKey(expected.subject), client_id: this.config.clientId, issued_at: issuedAt }
    try {
      const ciphertext = await this.encrypt(exchanged.token, row)
      await this.db.prepare(`INSERT INTO apple_signin_credentials
        (id,subject_key,client_id,issued_at,ciphertext,token_key,state,next_attempt_at,created_at)
        VALUES (?,?,?,?,?,?,'STAGED',?,?)`).bind(row.id, row.subject_key, row.client_id, issuedAt, ciphertext,
          await this.digest('token:' + exchanged.token), now + 600_000, now).run()
    } catch {
      // If local persistence fails, do not issue a Solemi session. Best-effort
      // immediate cleanup; no provider token or response is ever logged.
      await this.provider.revoke(exchanged.token).catch(() => {})
      throw new AppleSignInError('APPLE_CREDENTIAL_PERSIST_FAILED')
    }
    return row.id
  }
  async bind(id: string, accountId: string, now = Date.now()) {
    const result = await this.db.prepare(`UPDATE apple_signin_credentials SET account_id=?,state='ACTIVE',next_attempt_at=0
      WHERE id=? AND state='STAGED' AND lease_until=0 AND next_attempt_at>?
      AND EXISTS (SELECT 1 FROM accounts WHERE id=? AND status IN ('ACTIVE','DELETION_PENDING'))
      AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE account_id=? AND state='PENDING' AND resolution='ERASE')
      AND NOT EXISTS (SELECT 1 FROM apple_signin_credentials pending WHERE pending.subject_key=apple_signin_credentials.subject_key
        AND (pending.state='REVOKE' OR pending.lease_until>?))
      AND NOT EXISTS (SELECT 1 FROM apple_signin_state s WHERE s.subject_key=apple_signin_credentials.subject_key
        AND (s.deleted=1 OR s.revoked_before>=apple_signin_credentials.issued_at))`)
      .bind(accountId, id, now, accountId, accountId, now).run()
    if (result.meta.changes !== 1) throw new AppleSignInError('APPLE_AUTHORIZATION_REVOKED', 401)
    await this.db.prepare(`INSERT INTO apple_signin_state(subject_key,account_id,updated_at)
      SELECT subject_key,?,? FROM apple_signin_credentials WHERE id=?
      ON CONFLICT(subject_key) DO UPDATE SET account_id=excluded.account_id,updated_at=excluded.updated_at`)
      .bind(accountId, now, id).run()
  }
  private revokeStatements(subjectKey: string, at: number, now: number, deleted = false, providerNotice = true) {
    return [
      this.db.prepare(`UPDATE account_sessions SET revoked_at=COALESCE(revoked_at,?)
        WHERE account_id IN (SELECT account_id FROM apple_signin_state WHERE subject_key=?)
        AND (COALESCE(apple_auth_time,created_at)<=? OR ?=1)`).bind(now, subjectKey, at, deleted ? 1 : 0),
      this.db.prepare(`UPDATE account_devices SET revoked_at=?,revoke_reason='SECURITY'
        WHERE account_id IN (SELECT account_id FROM apple_signin_state WHERE subject_key=?) AND revoked_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM account_sessions s WHERE s.device_id=account_devices.id AND s.revoked_at IS NULL AND s.expires_at>?)`)
        .bind(now, subjectKey, now),
      this.db.prepare(`UPDATE devices SET revoked_at=COALESCE(revoked_at,?) WHERE id IN
        (SELECT f.legacy_device_id FROM account_family_devices f JOIN account_devices d ON d.id=f.account_device_id
          WHERE f.account_id IN (SELECT account_id FROM apple_signin_state WHERE subject_key=?) AND d.revoked_at IS NOT NULL)`)
        .bind(new Date(now).toISOString(), subjectKey),
      this.db.prepare(providerNotice
        ? 'DELETE FROM apple_signin_credentials WHERE subject_key=? AND (issued_at<=? OR ?=1)'
        : "UPDATE apple_signin_credentials SET state='REVOKE',next_attempt_at=0 WHERE subject_key=? AND (issued_at<=? OR ?=1)")
        .bind(subjectKey, at, deleted ? 1 : 0)
    ]
  }
  async notification(notice: AppleNotice, now = Date.now()) {
    const subjectKey = await this.subjectKey(notice.subject), noticeId = await this.digest('notice:' + notice.id)
    const account = await this.db.prepare(`SELECT account_id FROM account_identities
      WHERE provider='APPLE' AND issuer='https://appleid.apple.com' AND subject=?`).bind(notice.subject).first<{ account_id: string }>()
    const accountId = account?.account_id ?? null
    const revoke = notice.type === 'consent-revoked' || notice.type === 'account-deleted'
    const deleted = notice.type === 'account-deleted'
    // One atomic transaction: recording receipt cannot acknowledge an event
    // without also applying its access changes. Replays are monotonic no-ops.
    const statements = [this.db.prepare('INSERT OR IGNORE INTO apple_signin_notices VALUES (?,?)').bind(noticeId, now),
      this.db.prepare(`INSERT INTO apple_signin_state
        (subject_key,account_id,revoked_before,deleted,email_event_at,email_enabled,updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(subject_key) DO UPDATE SET account_id=COALESCE(excluded.account_id,apple_signin_state.account_id),
        revoked_before=MAX(revoked_before,excluded.revoked_before),deleted=MAX(deleted,excluded.deleted),
        email_enabled=CASE WHEN excluded.email_event_at>email_event_at THEN excluded.email_enabled ELSE email_enabled END,
        email_event_at=MAX(email_event_at,excluded.email_event_at),updated_at=MAX(updated_at,excluded.updated_at)`)
        .bind(subjectKey, accountId, revoke ? notice.at : 0, deleted ? 1 : 0, revoke ? 0 : notice.at,
          revoke ? null : notice.type === 'email-enabled' ? 1 : 0, now)]
    if (revoke) {
      statements.push(...this.revokeStatements(subjectKey, notice.at, now, deleted))
    }
    await this.db.batch(statements)
  }
  async maintain(now = Date.now()) {
    // Staged credentials have no usable Solemi session; clean up abandoned
    // sign-ins too. Only one outbound request per bounded scheduler invocation.
    const row = await this.db.prepare(`SELECT * FROM apple_signin_credentials
      WHERE state IN ('STAGED','REVOKE') AND next_attempt_at<=? AND lease_until<=?
      ORDER BY next_attempt_at,created_at,id LIMIT 1`).bind(now, now).first<Credential>()
    let processed = 0, failed = 0
    if (row) {
      const lease = crypto.randomUUID()
      const claim = await this.db.prepare(`UPDATE apple_signin_credentials SET lease_until=?,lease_id=?
        WHERE id=? AND state IN ('STAGED','REVOKE') AND lease_until<=? AND next_attempt_at<=?`)
        .bind(now + 60_000, lease, row.id, now, now).run()
      if (claim.meta.changes === 1) {
        try {
          // Apple may return the same grant token on repeated sign-ins. An
          // abandoned exchange must not revoke that identical, attached grant.
          const attached = row.state === 'STAGED' && await this.db.prepare(`SELECT id FROM apple_signin_credentials
            WHERE subject_key=? AND token_key=? AND state='ACTIVE' LIMIT 1`).bind(row.subject_key, row.token_key).first()
          if (attached) {
            await this.db.prepare('DELETE FROM apple_signin_credentials WHERE id=? AND lease_id=?').bind(row.id, lease).run()
            processed++
          } else {
            await this.provider.revoke(await this.decrypt(row))
            const completedAt = Math.max(now, Date.now())
            await this.db.batch([
              this.db.prepare(`INSERT INTO apple_signin_state(subject_key,account_id,revoked_before,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(subject_key) DO UPDATE SET revoked_before=MAX(revoked_before,excluded.revoked_before),updated_at=excluded.updated_at`)
                .bind(row.subject_key, row.account_id, completedAt, completedAt),
              ...this.revokeStatements(row.subject_key, completedAt, completedAt, false, false),
              // Confirm every distinct stored token; do not assume revoking one
              // token has also invalidated all other refresh tokens for this user.
              this.db.prepare('DELETE FROM apple_signin_credentials WHERE subject_key=? AND token_key=? AND issued_at<=?')
                .bind(row.subject_key, row.token_key, completedAt)
            ])
            processed++
          }
        } catch (error) {
          failed++
          const code = error instanceof AppleSignInError ? error.code : 'APPLE_SIGN_IN_RETRY'
          const next = now + Math.min(DAY, 60_000 * 2 ** Math.min(row.attempts, 10))
          await this.db.prepare(`UPDATE apple_signin_credentials SET attempts=attempts+1,next_attempt_at=?,lease_until=0,lease_id=NULL,last_error=?
            WHERE id=? AND lease_id=?`).bind(next, code, row.id, lease).run()
        }
      }
    }
    await this.db.batch([
      this.db.prepare('DELETE FROM apple_signin_notices WHERE id IN (SELECT id FROM apple_signin_notices WHERE received_at<? LIMIT 50)').bind(now - 30 * DAY),
      this.db.prepare(`DELETE FROM apple_signin_state WHERE subject_key IN
        (SELECT subject_key FROM apple_signin_state s WHERE updated_at<?
         AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id=s.account_id AND a.status!='DELETED')
         AND NOT EXISTS (SELECT 1 FROM apple_signin_credentials c WHERE c.subject_key=s.subject_key) LIMIT 50)`).bind(now - 30 * DAY)
    ])
    const count = await this.db.prepare("SELECT COUNT(*) AS n FROM apple_signin_credentials WHERE state!='ACTIVE'").first<{ n: number }>()
    const report = { processed, failed, pending: count!.n }
    await this.db.prepare(`INSERT INTO apple_signin_maintenance VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      completed_at=excluded.completed_at,processed=excluded.processed,failed=excluded.failed,pending=excluded.pending`)
      .bind(now, processed, failed, report.pending).run()
    return report
  }
}
