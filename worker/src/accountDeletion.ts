import { SignJWT, jwtVerify } from 'jose'

export const RECOVERY_MS = 30 * 24 * 60 * 60 * 1000
const encoder = new TextEncoder()
export class DeletionError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code) }
}
type Family = { id: string; name: string; revision: number; members: number }
type Deletion = { id: string; account_id: string; purge_after: number; held_family_id: string | null; state: string }
export type DeletionPreview = { accountId: string; family: Family | null }

export class AccountDeletionService {
  constructor(private db: D1Database) {}

  async preview(accountId: string): Promise<DeletionPreview> {
    const account = await this.db.prepare("SELECT id FROM accounts WHERE id = ? AND status = 'ACTIVE'").bind(accountId).first()
    if (!account) throw new DeletionError('ACCOUNT_UNAVAILABLE', 403)
    const family = await this.db.prepare(`SELECT f.id, f.name, f.revision,
      (SELECT COUNT(*) FROM legacy_family_memberships m WHERE m.family_id = f.id AND m.status = 'ACTIVE') AS members
      FROM families f JOIN legacy_family_memberships m ON m.family_id = f.id
      WHERE m.account_id = ? AND m.status = 'ACTIVE'`).bind(accountId).first<Family>()
    return { accountId, family }
  }

  async request(accountId: string, mode: 'IMMEDIATE' | 'RECOVERY', expected: DeletionPreview,
    confirmedFamilyName: string, now = Date.now()) {
    if (!['IMMEDIATE', 'RECOVERY'].includes(mode) || expected?.accountId !== accountId) throw new DeletionError('DELETION_INVALID_REQUEST', 400)
    const family = expected.family
    if (family && (!Number.isSafeInteger(family.revision) || !Number.isSafeInteger(family.members)
      || family.members < 1 || typeof family.id !== 'string' || typeof family.name !== 'string')) throw new DeletionError('DELETION_INVALID_REQUEST', 400)
    if (family?.members === 1 && confirmedFamilyName !== family.name) throw new DeletionError('FAMILY_NAME_REQUIRED', 400)
    const id = crypto.randomUUID(), due = now + (mode === 'RECOVERY' ? RECOVERY_MS : 0), iso = new Date(now).toISOString()
    const guard = `EXISTS (SELECT 1 FROM account_deletions WHERE id = ? AND state = 'PENDING')`
    // The snapshot is checked inside the same transaction as every state change.
    // A concurrent join, leave or diary edit makes the entire batch a no-op.
    const statements = [this.db.prepare(`INSERT INTO account_deletions
      (id, account_id, mode, requested_at, purge_after, held_family_id)
      SELECT ?, a.id, ?, ?, ?, ? FROM accounts a WHERE a.id = ? AND a.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE account_id = a.id AND state = 'PENDING')
      AND (? IS (SELECT family_id FROM legacy_family_memberships WHERE account_id = a.id AND status = 'ACTIVE'))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM families f WHERE f.id = ? AND f.name = ? AND f.revision = ?
        AND (SELECT COUNT(*) FROM legacy_family_memberships m WHERE m.family_id = f.id AND m.status = 'ACTIVE') = ?))`)
      .bind(id, mode, now, due, family?.members === 1 ? family.id : null, accountId,
        family?.id ?? null, family?.id ?? null, family?.id ?? null, family?.name ?? null, family?.revision ?? null, family?.members ?? null),
    this.db.prepare(`UPDATE accounts SET status = 'DELETION_PENDING', updated_at = ? WHERE id = ? AND ${guard}`).bind(now, accountId, id),
    this.db.prepare(`UPDATE legacy_family_memberships SET status = 'LEFT', ended_at = ? WHERE account_id = ? AND status = 'ACTIVE' AND ${guard}`).bind(now, accountId, id)]
    if (family) {
      statements.push(this.db.prepare(`UPDATE legacy_family_memberships SET role = 'ADMIN' WHERE id = (
        SELECT m.id FROM legacy_family_memberships m JOIN accounts a ON a.id = m.account_id
        WHERE m.family_id = ? AND m.status = 'ACTIVE' AND a.status = 'ACTIVE' ORDER BY m.joined_at, m.id LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM legacy_family_memberships WHERE family_id = ? AND status = 'ACTIVE' AND role = 'ADMIN') AND ${guard}`)
        .bind(family.id, family.id, id))
    }
    statements.push(
      this.db.prepare(`UPDATE account_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL AND ${guard}`).bind(now, accountId, id),
      this.db.prepare(`UPDATE account_devices SET revoked_at = ?, revoke_reason = 'ACCOUNT_DELETED' WHERE account_id = ? AND ${guard}`).bind(now, accountId, id),
      this.db.prepare(`UPDATE devices SET revoked_at = ?, name = NULL, token_hash = 'erased:' || id WHERE ${guard} AND
        (id IN (SELECT legacy_device_id FROM account_family_devices WHERE account_id = ?)
          OR family_id = (SELECT held_family_id FROM account_deletions WHERE id = ?))`).bind(iso, id, accountId, id),
      this.db.prepare(`DELETE FROM invite_codes WHERE ${guard} AND
        (created_by_device_id IN (SELECT legacy_device_id FROM account_family_devices WHERE account_id = ?)
          OR family_id = (SELECT held_family_id FROM account_deletions WHERE id = ?))`).bind(id, accountId, id),
      this.db.prepare(`DELETE FROM account_family_devices WHERE account_id = ? AND ${guard}`).bind(accountId, id),
      // Recovery never revives cached billing grants. Store verification must issue current grants again.
      this.db.prepare(`UPDATE account_entitlements SET revoked_at = ?, updated_at = ? WHERE account_id = ? AND revoked_at IS NULL AND ${guard}`).bind(now, now, accountId, id)
    )
    await this.db.batch(statements)
    const recorded = await this.db.prepare('SELECT id FROM account_deletions WHERE id = ?').bind(id).first()
    if (!recorded) throw new DeletionError('DELETION_PREVIEW_CHANGED')
    if (mode === 'IMMEDIATE') await this.finalize(id, now)
    return { requestId: id, recoverUntil: mode === 'RECOVERY' ? due : null }
  }

  async pending(accountId: string) {
    return this.db.prepare("SELECT * FROM account_deletions WHERE account_id = ? AND state = 'PENDING'").bind(accountId).first<Deletion>()
  }

  async restore(accountId: string, requestId: string, now = Date.now()) {
    const pending = await this.pending(accountId)
    if (!pending || pending.id !== requestId) throw new DeletionError('RECOVERY_UNAVAILABLE')
    if (pending.purge_after <= now) { await this.finalize(pending.id, now); throw new DeletionError('RECOVERY_EXPIRED') }
    const guard = `EXISTS (SELECT 1 FROM account_deletions WHERE id = ? AND account_id = ? AND state = 'PENDING' AND purge_after > ?)`
    const statements = [this.db.prepare(`UPDATE accounts SET status = 'ACTIVE', updated_at = ? WHERE id = ? AND status = 'DELETION_PENDING' AND ${guard}`)
      .bind(now, accountId, requestId, accountId, now)]
    if (pending.held_family_id) {
      // Only a solely owned, suspended family is recoverable. Shared-family membership is never resurrected.
      statements.push(this.db.prepare(`INSERT INTO legacy_family_memberships (id, family_id, account_id, role, status, joined_at)
        SELECT ?, f.id, ?, 'ADMIN', 'ACTIVE', ? FROM families f WHERE f.id = ? AND ${guard}
        AND NOT EXISTS (SELECT 1 FROM legacy_family_memberships WHERE family_id = f.id AND status = 'ACTIVE')`)
        .bind(crypto.randomUUID(), accountId, now, pending.held_family_id, requestId, accountId, now))
    }
    statements.push(this.db.prepare(`UPDATE account_deletions SET state = 'RESTORED' WHERE id = ? AND account_id = ? AND state = 'PENDING' AND purge_after > ?`).bind(requestId, accountId, now))
    const results = await this.db.batch(statements)
    if (results[0].meta.changes !== 1) throw new DeletionError('RECOVERY_UNAVAILABLE')
    return { restored: true, signInRequired: true }
  }

  async finalize(requestId: string, now = Date.now()) {
    // A retry also resumes an immediate deletion interrupted after access revocation.
    const row = await this.db.prepare('SELECT * FROM account_deletions WHERE id = ?').bind(requestId).first<Deletion>()
    if (!row || row.state !== 'PENDING') return
    const guard = `EXISTS (SELECT 1 FROM account_deletions WHERE id = ? AND state = 'FINALIZED' AND finalized_at = ?)`
    const statements = [this.db.prepare(`UPDATE account_deletions SET state = 'FINALIZED', finalized_at = ?
      WHERE id = ? AND state = 'PENDING' AND EXISTS (SELECT 1 FROM accounts WHERE id = account_id AND status = 'DELETION_PENDING')`).bind(now, requestId)]
    if (row.held_family_id) {
      // Never erase data if a later administrative repair attached another active member.
      statements.push(this.db.prepare(`INSERT OR REPLACE INTO erasure_receipts (account_id, family_id, erased_at)
        SELECT ?, ?, ? WHERE ${guard} AND NOT EXISTS
        (SELECT 1 FROM legacy_family_memberships WHERE family_id = ? AND status = 'ACTIVE')`)
        .bind(row.account_id, row.held_family_id, now, requestId, now, row.held_family_id))
      for (const table of ['operations', 'invite_codes', 'sleep_sessions', 'children', 'devices', 'families']) {
        statements.push(this.db.prepare(`DELETE FROM ${table} WHERE ${table === 'families' ? 'id' : 'family_id'} = ? AND ${guard}
          AND NOT EXISTS (SELECT 1 FROM legacy_family_memberships WHERE family_id = ? AND status = 'ACTIVE')`)
          .bind(row.held_family_id, requestId, now, row.held_family_id))
      }
    }
    statements.push(
      this.db.prepare(`INSERT OR IGNORE INTO erasure_receipts (account_id, family_id, erased_at) SELECT ?, NULL, ? WHERE ${guard}`).bind(row.account_id, now, requestId, now),
      this.db.prepare(`UPDATE devices SET name = NULL, token_hash = 'erased:' || id WHERE id IN
        (SELECT legacy_device_id FROM account_family_devices WHERE account_id = ?) AND ${guard}`).bind(row.account_id, requestId, now)
    )
    for (const table of ['account_identities', 'account_family_devices', 'account_devices', 'legacy_family_memberships', 'account_entitlements']) {
      statements.push(this.db.prepare(`DELETE FROM ${table} WHERE account_id = ? AND ${guard}`).bind(row.account_id, requestId, now))
    }
    statements.push(this.db.prepare(`UPDATE accounts SET status = 'DELETED', email = NULL, display_name = NULL,
      avatar_url = NULL, locale = NULL, created_at = 0, last_login_at = 0, updated_at = ?, deleted_at = ? WHERE id = ? AND ${guard}`)
      .bind(now, now, row.account_id, requestId, now))
    await this.db.batch(statements)
  }

  async purgeDue(now = Date.now()) {
    const due = await this.db.prepare("SELECT id FROM account_deletions WHERE state = 'PENDING' AND purge_after <= ? ORDER BY purge_after LIMIT 50").bind(now).all<{ id: string }>()
    for (const row of due.results) await this.finalize(row.id, now)
    await this.db.batch([
      this.db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').bind(now),
      this.db.prepare('DELETE FROM auth_challenges WHERE expires_at <= ?').bind(now)
    ])
    return due.results.length
  }

  // Maintenance-only: replay independently retained receipts into an isolated
  // restored database BEFORE serving traffic. Never exposed as a public route.
  async replayErasure(receipt: { account_id: string; family_id: string | null; erased_at: number }) {
    if (!receipt.account_id || !Number.isSafeInteger(receipt.erased_at) || receipt.erased_at < 0) throw new DeletionError('INVALID_ERASURE_RECEIPT', 400)
    const account = await this.db.prepare('SELECT status FROM accounts WHERE id = ?').bind(receipt.account_id).first<{ status: string }>()
    if (!account || account.status === 'DELETED') return
    const pending = await this.pending(receipt.account_id)
    if (pending) {
      if (pending.held_family_id !== receipt.family_id) throw new DeletionError('ERASURE_REPLAY_SCOPE_CHANGED')
      await this.finalize(pending.id, receipt.erased_at)
      return
    }
    const preview = await this.preview(receipt.account_id)
    const soleFamily = preview.family?.members === 1 ? preview.family.id : null
    if (soleFamily !== receipt.family_id) throw new DeletionError('ERASURE_REPLAY_SCOPE_CHANGED')
    await this.request(receipt.account_id, 'IMMEDIATE', preview, preview.family?.name ?? '', receipt.erased_at)
  }

  async exportAccount(accountId: string, now = Date.now()) {
    const preview = await this.preview(accountId)
    const account = await this.db.prepare('SELECT id, email, display_name, locale, created_at FROM accounts WHERE id = ?').bind(accountId).first()
    const subscriptions = await this.db.prepare(`SELECT provider, product, status, auto_renews, trial_ends_at, current_period_ends_at, access_until FROM subscriptions WHERE account_id = ?`).bind(accountId).all()
    const trial = await this.db.prepare('SELECT product, started_at, ends_at, family_id, origin FROM account_trials WHERE account_id = ?').bind(accountId).first()
    const devices = await this.db.prepare('SELECT name, platform, created_at, last_seen_at, revoked_at FROM account_devices WHERE account_id = ?').bind(accountId).all()
    const familyId = preview.family?.id ?? ''
    const children = await this.db.prepare('SELECT id, name, birth_date, created_at, updated_at FROM children WHERE family_id = ? AND deleted_at IS NULL LIMIT 1001').bind(familyId).all()
    const sleeps = await this.db.prepare(`SELECT id, child_id, start_time, end_time, note, day_night_override FROM sleep_sessions WHERE family_id = ? AND deleted_at IS NULL LIMIT 5001`).bind(familyId).all()
    if (children.results.length > 1000 || sleeps.results.length > 5000) throw new DeletionError('EXPORT_TOO_LARGE', 413)
    const fresh = await this.preview(accountId)
    if (JSON.stringify(fresh) !== JSON.stringify(preview)) throw new DeletionError('DELETION_PREVIEW_CHANGED')
    return { format: 'solemi-account-export', version: 1, exportedAt: now, account,
      family: preview.family, children: children.results, sleeps: sleeps.results, subscriptions: subscriptions.results, trial, devices: devices.results,
      includesLocalDiaryOrPhotos: false }
  }
}

export async function recoveryProof(secret: string, accountId: string, requestId: string, now = Date.now()) {
  return new SignJWT({ requestId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('solemi-auth')
    .setAudience('solemi-account-recovery').setSubject(accountId).setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + 600).sign(encoder.encode(secret))
}
export async function verifyRecoveryProof(secret: string, token: string, now = Date.now()) {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'], issuer: 'solemi-auth',
      audience: 'solemi-account-recovery', requiredClaims: ['sub', 'requestId', 'exp'], currentDate: new Date(now) })
    if (typeof payload.sub !== 'string' || typeof payload.requestId !== 'string') throw new Error()
    return { accountId: payload.sub, requestId: payload.requestId }
  } catch { throw new DeletionError('RECOVERY_PROOF_INVALID', 401) }
}
