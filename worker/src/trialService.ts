import type { SubscriptionProduct } from './billingContract'

export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000
export const FAMILY_TRIAL_LIMIT = 4
type TrialRow = { account_id: string; operation_id: string; product: SubscriptionProduct; started_at: number; ends_at: number | null;
  activation_family_id: string | null; family_id: string | null; family_bound_at: number | null; origin: 'SOLEMI' | 'LEGACY_STORE' }
export class TrialError extends Error {
  constructor(readonly code: string) { super(code) }
}
export class TrialService {
  constructor(private readonly db: D1Database) {}
  private row(accountId: string) {
    return this.db.prepare('SELECT * FROM account_trials WHERE account_id = ?').bind(accountId).first<TrialRow>()
  }
  async state(accountId: string, now = Date.now()) {
    const trial = await this.row(accountId)
    const family = await this.db.prepare(`SELECT family_id FROM legacy_family_memberships WHERE account_id = ? AND status = 'ACTIVE'`)
      .bind(accountId).first<{ family_id: string }>()
    const usage = family ? await this.db.prepare(`SELECT COUNT(*) AS used, MAX(ends_at) AS busy_until FROM account_trials WHERE family_id = ?`)
      .bind(family.family_id).first<{ used: number; busy_until: number | null }>() : null
    return { used: Boolean(trial), usageOrigin: trial?.origin ?? null, trial: trial?.origin === 'SOLEMI' && trial.ends_at !== null ? { product: trial.product, startedAt: trial.started_at, endsAt: trial.ends_at,
      familyId: trial.family_id, activationFamilyId: trial.activation_family_id, origin: trial.origin,
      active: trial.origin === 'SOLEMI' && trial.started_at <= now && trial.ends_at > now } : null,
      family: family ? { familyId: family.family_id, used: usage?.used ?? 0, limit: FAMILY_TRIAL_LIMIT,
        activeUntil: usage?.busy_until && usage.busy_until > now ? usage.busy_until : null } : null }
  }
  async activate(accountId: string, product: SubscriptionProduct, operationId: string, now = Date.now()) {
    if (!['FAMILY', 'FAMILY_PLUS'].includes(product) || !/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)
      || !Number.isSafeInteger(now) || now < 0) throw new TrialError('TRIAL_INVALID_REQUEST')
    // One SQL write reads the current server-side membership and consumes both
    // limits under SQLite's write serialization. Never trust a client Family ID.
    try {
      await this.db.prepare(`INSERT INTO account_trials
        (account_id, operation_id, product, started_at, ends_at, activation_family_id, family_id, family_bound_at)
        SELECT a.id, ?, ?, ?, ?, m.family_id, m.family_id, CASE WHEN m.family_id IS NULL THEN NULL ELSE ? END
        FROM accounts a LEFT JOIN legacy_family_memberships m ON m.account_id = a.id AND m.status = 'ACTIVE'
        WHERE a.id = ? AND a.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM account_trials WHERE account_id = a.id)`)
        .bind(operationId, product, now, now + TRIAL_MS, now, accountId).run()
    } catch (error) {
      // A racing identical request may hit a trigger before a uniqueness check.
      const prior = await this.row(accountId)
      if (prior?.operation_id === operationId && prior.product === product && prior.origin === 'SOLEMI') return this.state(accountId, now)
      const message = error instanceof Error ? error.message : ''
      for (const code of ['TRIAL_FAMILY_LIMIT', 'TRIAL_FAMILY_ACTIVE', 'TRIAL_MEMBERSHIP_CHANGED', 'TRIAL_ACCOUNT_UNAVAILABLE']) {
        if (message.includes(code)) throw new TrialError(code)
      }
      throw error
    }
    const trial = await this.row(accountId)
    if (!trial) throw new TrialError('TRIAL_ACCOUNT_UNAVAILABLE')
    if (trial.operation_id !== operationId || trial.product !== product || trial.origin !== 'SOLEMI') throw new TrialError('TRIAL_ACCOUNT_USED')
    return this.state(accountId, now)
  }
  async bindToActiveFamily(accountId: string, now = Date.now()) {
    // Explicit retry for an initially busy Family. Extends neither the original
    // seven-day deadline nor the old Family's access; an existing binding is final.
    await this.db.prepare(`UPDATE account_trials SET family_id =
      (SELECT family_id FROM legacy_family_memberships WHERE account_id = ? AND status = 'ACTIVE'), family_bound_at = ?
      WHERE account_id = ? AND origin = 'SOLEMI' AND family_id IS NULL AND started_at <= ? AND ends_at > ?
      AND EXISTS (SELECT 1 FROM legacy_family_memberships m WHERE m.account_id = ? AND m.status = 'ACTIVE'
        AND (SELECT COUNT(*) FROM account_trials WHERE family_id = m.family_id) < 4
        AND NOT EXISTS (SELECT 1 FROM account_trials WHERE family_id = m.family_id AND ends_at > ?))`)
      .bind(accountId, now, accountId, now, now, accountId, now).run()
    return this.state(accountId, now)
  }
}
