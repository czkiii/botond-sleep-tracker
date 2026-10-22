export const DAY_MS = 86400000
// Calendar months, UTC, clamped to the final day of the destination month.
export function addMonths(timestamp: number, months: number) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('INVALID_RETENTION_TIME')
  const date = new Date(timestamp), day = date.getUTCDate()
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months)
  const end = new Date(date.getTime()); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0)
  date.setUTCDate(Math.min(day, end.getUTCDate()))
  return date.getTime()
}

export class RetentionService {
  constructor(private db: D1Database, private journal: D1Database,
    private environment: string, private sourceId: string) {}

  private async verify() {
    const identity = await this.journal.prepare('SELECT * FROM journal_identity WHERE id = 1')
      .first<{ environment: string; source_database_id: string }>()
    if (this.db === this.journal || identity?.environment !== this.environment || identity?.source_database_id !== this.sourceId)
      throw new Error('RETENTION_IDENTITY_MISMATCH')
  }

  // At most one journal item per invocation. Completion means the source
  // transaction actually finished, not merely that ERASE intent was recorded.
  async journalStep(now = Date.now()) {
    await this.verify()
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_RETENTION_TIME')
    const item = await this.journal.prepare(`SELECT j.request_id, j.account_id, j.state, c.completed_at
      FROM deletion_journal j LEFT JOIN deletion_completion c ON c.request_id = j.request_id
      LEFT JOIN completion_attempts a ON a.request_id = j.request_id
      WHERE j.state <> 'PENDING' AND c.request_id IS NULL AND COALESCE(a.next_attempt_at,0) <= ? ORDER BY j.sequence LIMIT 1`).bind(now)
      .first<{ request_id: string; account_id: string; state: string; completed_at: number | null }>()
    if (item) {
      const local = await this.db.prepare('SELECT state, finalized_at, resolution_at FROM account_deletions WHERE id = ? AND account_id = ?')
        .bind(item.request_id, item.account_id).first<{ state: string; finalized_at: number | null; resolution_at: number | null }>()
      if ((item.state === 'ERASE' && local?.state === 'FINALIZED') || (item.state === 'RESTORE' && local?.state === 'RESTORED')) {
        // Use observation time: request/decision timestamps can precede the
        // physical commit by an outage. Never backdate actual completion.
        const completed = now
        await this.journal.prepare('INSERT OR IGNORE INTO deletion_completion (request_id, completed_at) VALUES (?, ?)')
          .bind(item.request_id, completed).run()
      } else {
        await this.journal.prepare(`INSERT INTO completion_attempts VALUES (?, ?) ON CONFLICT(request_id)
          DO UPDATE SET next_attempt_at = excluded.next_attempt_at`).bind(item.request_id, now + 15 * 60000).run()
      }
    }
    const inventory = await this.journal.prepare('SELECT verified_until FROM retention_inventory WHERE id = 1').first<{ verified_until: number }>()
    if (!inventory || inventory.verified_until < now) return { cleaned: 0, inventoryRequired: true }
    // All affected backups must actually be destroyed. The verified provider
    // horizon (at most 30 days) also applies when no manual copies are listed.
    const eligible = await this.journal.prepare(`SELECT j.request_id, j.account_id FROM deletion_journal j
      JOIN deletion_completion c ON c.request_id = j.request_id
      JOIN retention_inventory i ON i.id = 1
      WHERE j.state <> 'PENDING' AND c.completed_at + i.provider_window_ms + ? <= ?
        AND NOT EXISTS (SELECT 1 FROM deletion_journal p WHERE p.account_id = j.account_id AND p.state = 'PENDING')
        AND NOT EXISTS (SELECT 1 FROM managed_backups b WHERE b.created_at <= c.completed_at
          AND (b.destroyed_at IS NULL OR b.destroyed_at + ? > ?))
        AND NOT EXISTS (SELECT 1 FROM restore_jobs r WHERE r.completed_at IS NULL OR r.completed_at + ? > ?)
      ORDER BY j.sequence LIMIT 1`).bind(30 * DAY_MS, now, 30 * DAY_MS, now, 30 * DAY_MS, now)
      .first<{ request_id: string; account_id: string }>()
    if (!eligible) return { cleaned: 0, inventoryRequired: false }
    // Local receipt first, external evidence last: retry after partial failure is safe.
    await this.db.batch([
      this.db.prepare(`DELETE FROM erasure_receipts WHERE account_id = ? AND NOT EXISTS
        (SELECT 1 FROM account_deletions WHERE account_id = ? AND id <> ?)`)
        .bind(eligible.account_id, eligible.account_id, eligible.request_id),
      this.db.prepare("DELETE FROM account_deletions WHERE id = ? AND state <> 'PENDING'").bind(eligible.request_id)
    ])
    await this.journal.batch([
      this.journal.prepare('UPDATE retention_inventory SET cleanup_clock = ? WHERE id = 1').bind(now),
      this.journal.prepare('UPDATE deletion_completion SET cleanup_after = ? WHERE request_id = ?').bind(now, eligible.request_id),
      this.journal.prepare('DELETE FROM deletion_journal WHERE request_id = ?').bind(eligible.request_id)
    ])
    return { cleaned: 1, inventoryRequired: false }
  }

  // Trusted store/operations caller only. A pending or unknown dispute never
  // silently expires; repeated closure notifications do not extend the deadline.
  async dispute(subscriptionId: string, open: boolean, at: number) {
    if (!Number.isSafeInteger(at) || at < 0) throw new Error('INVALID_RETENTION_TIME')
    await this.db.prepare(`UPDATE billing_retention SET dispute_open = ?,
      dispute_closed_at = CASE WHEN ? = 0 AND dispute_open = 1 THEN MAX(COALESCE(dispute_closed_at, 0), ?) ELSE dispute_closed_at END,
      dispute_event_at = ?
      WHERE subscription_id = ? AND (dispute_event_at IS NULL OR dispute_event_at < ?)`)
      .bind(open ? 1 : 0, open ? 1 : 0, at, at, subscriptionId, at).run()
  }

  async billingStep(now = Date.now()) {
    await this.verify()
    // An alias with no remaining subscription is no longer needed after erasure,
    // even when a live Family still needs that account's spent trial slot.
    await this.db.prepare(`DELETE FROM billing_account_links WHERE rowid IN (
      SELECT l.rowid FROM billing_account_links l JOIN accounts a ON a.id = l.account_id AND a.status = 'DELETED'
      WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.account_id = l.account_id)
        AND NOT EXISTS (SELECT 1 FROM store_subscription_state s WHERE s.account_id = l.account_id) LIMIT 50)`).run()
    const row = await this.db.prepare(`SELECT r.subscription_id, r.ended_at, r.dispute_closed_at FROM billing_retention r
      JOIN subscriptions s ON s.id = r.subscription_id WHERE r.dispute_open = 0 AND r.ended_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM billing_legal_holds h WHERE h.subscription_id = s.id AND h.released_at IS NULL)
        AND s.status IN ('EXPIRED','REVOKED') AND (s.status = 'REVOKED' OR s.access_until <= ?)
      ORDER BY MAX(r.ended_at, COALESCE(r.dispute_closed_at,0)), r.subscription_id LIMIT 1`).bind(now)
      .first<{ subscription_id: string; ended_at: number; dispute_closed_at: number | null }>()
    if (!row || addMonths(Math.max(row.ended_at, row.dispute_closed_at ?? 0), 24) > now) {
      await this.pruneDeletedAccounts()
      return { cleaned: 0 }
    }
    // Recheck in the transaction so a concurrent renewal/dispute cancels cleanup.
    const guard = `EXISTS (SELECT 1 FROM billing_retention r JOIN subscriptions s ON s.id = r.subscription_id
      WHERE r.subscription_id = ? AND r.dispute_open = 0 AND r.ended_at = ? AND r.dispute_closed_at IS ?
        AND NOT EXISTS (SELECT 1 FROM billing_legal_holds h WHERE h.subscription_id = s.id AND h.released_at IS NULL)
        AND s.status IN ('EXPIRED','REVOKED') AND (s.status = 'REVOKED' OR s.access_until <= ?))`
    const values = [row.subscription_id, row.ended_at, row.dispute_closed_at, now]
    await this.db.batch([
      this.db.prepare(`DELETE FROM subscription_events WHERE subscription_id = ? AND ${guard}`).bind(row.subscription_id, ...values),
      this.db.prepare(`DELETE FROM google_token_replacements WHERE replacement_subscription_id = ? AND ${guard}`).bind(row.subscription_id, ...values),
      this.db.prepare(`DELETE FROM account_entitlements WHERE source_type = 'SUBSCRIPTION' AND source_id = ? AND ${guard}`).bind(row.subscription_id, ...values),
      this.db.prepare(`DELETE FROM subscriptions WHERE id = ? AND ${guard}`).bind(row.subscription_id, ...values),
      this.db.prepare(`DELETE FROM billing_account_links WHERE account_id IN (SELECT id FROM accounts WHERE status = 'DELETED')
        AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.account_id = billing_account_links.account_id)
        AND NOT EXISTS (SELECT 1 FROM store_subscription_state st WHERE st.account_id = billing_account_links.account_id)
        AND rowid IN (SELECT rowid FROM billing_account_links LIMIT 50)`)
    ])
    return { cleaned: 1 }
  }

  private async pruneDeletedAccounts() {
    // A live Family keeps its spent slots. The minimal independent marker does
    // not require the erased account or its obsolete family/trial detail forever.
    const row = await this.db.prepare(`SELECT id FROM accounts a WHERE a.status = 'DELETED'
      AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE account_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM erasure_receipts WHERE account_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE account_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM account_trials t JOIN families f ON f.id = t.family_id WHERE t.account_id = a.id)
      ORDER BY id LIMIT 1`).first<{ id: string }>()
    if (!row) return
    await this.db.batch([
      this.db.prepare('DELETE FROM account_trials WHERE account_id = ?').bind(row.id),
      this.db.prepare('DELETE FROM billing_account_links WHERE account_id = ?').bind(row.id),
      this.db.prepare("DELETE FROM accounts WHERE id = ? AND status = 'DELETED'").bind(row.id)
    ])
  }

  async maintain(now = Date.now()) {
    await this.verify()
    const program = await this.journal.prepare('SELECT active, reviewed_at FROM trial_program WHERE id = 1')
      .first<{ active: number; reviewed_at: number }>()
    const trialReviewRequired = !program || Boolean(program.active && addMonths(program.reviewed_at, 12) <= now)
    const holds = await this.db.prepare(`SELECT COUNT(*) AS count FROM billing_legal_holds WHERE released_at IS NULL AND review_at <= ?`)
      .bind(now).first<{ count: number }>()
    // Alternate work across scheduler invocations to preserve the Free query budget.
    const result = await (Math.floor(now / 300000) % 2 === 0 ? this.journalStep(now) : this.billingStep(now))
    return { ...result, trialReviewRequired, legalHoldReviewsDue: holds?.count ?? 0 }
  }
}
