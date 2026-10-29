import { AppleBillingAdapter } from './appleBillingAdapter'
import { GooglePlayBillingAdapter } from './googlePlayBillingAdapter'
import { StoreBillingService } from './storeBillingService'
import { appleConfig, googleConfig, storeConfig, type StoreBillingEnv } from './storeProviderConfig'
import { requireStoreValue } from './storeProviderHttp'
import type { StoreBillingAdapter, StoreProvider, VerifiedStoreSubscription } from './billingContract'

export const BILLING_CRON = '2-59/5 * * * *'
type Adapter = StoreBillingAdapter & { acknowledge?: (id: string) => Promise<boolean> }
type Notice = { id: string; eventType: string; subscriptionId: string; occurredAt: number; payload: string; expectedAlias?: string }
type Work = { subscription_id: string; account_id: string; provider: StoreProvider; provider_subscription_id: string;
  external_account_token: string; reconcile_attempts: number }
const minute = 60000
const sha = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), x => x.toString(16).padStart(2, '0')).join('')

export class StoreLifecycleService {
  constructor(private readonly db: D1Database, private readonly env: StoreBillingEnv,
    private readonly adapter: (provider: StoreProvider) => Adapter = provider => provider === 'APPLE'
      ? new AppleBillingAdapter(appleConfig(env)) : new GooglePlayBillingAdapter(googleConfig(env))) {}

  async notification(provider: StoreProvider, notice: Notice) {
    const config = storeConfig(this.env)
    const eventId = `notify_${await sha(notice.id)}`, payloadHash = await sha(notice.payload)
    const previous = await this.db.prepare(`SELECT payload_hash FROM subscription_events
      WHERE provider = ? AND provider_event_id = ? AND processed_at IS NOT NULL`).bind(provider, eventId).first<{ payload_hash: string }>()
    if (previous) {
      requireStoreValue(previous.payload_hash === payloadHash, 'STORE_EVENT_ID_REUSED')
      // Any pending Google acknowledgement is durable and retried by the scheduler.
      return 'DUPLICATE'
    }
    const adapter = this.adapter(provider)
    const snapshot = await adapter.refreshSubscription(notice.subscriptionId)
    requireStoreValue(snapshot.provider === provider && snapshot.providerSubscriptionId === notice.subscriptionId
      && (!notice.expectedAlias || snapshot.externalAccountToken === notice.expectedAlias), 'STORE_ACCOUNT_MISMATCH')
    const owner = await this.db.prepare(`SELECT l.account_id FROM billing_account_links l
      JOIN accounts a ON a.id = l.account_id WHERE l.provider = ? AND l.external_account_token = ? AND a.status = 'ACTIVE'`)
      .bind(provider, snapshot.externalAccountToken).first<{ account_id: string }>()
    // No account creation or relinking from notifications. A future authenticated
    // restore retrieves current store state; erased accounts cannot be resurrected.
    if (!owner) return 'IGNORED'
    const billing = new StoreBillingService(this.db, config.environment)
    const result = await billing.applyVerifiedSubscription({ accountId: owner.account_id, subscription: snapshot, allowAppleReactivation: true,
      event: { provider, providerEventId: eventId, providerSubscriptionId: notice.subscriptionId, eventType: notice.eventType,
        source: 'SERVER_NOTIFICATION', occurredAt: notice.occurredAt, receivedAt: Date.now(), payloadHash } })
    if (result.outcome !== 'STALE') await this.acknowledge(billing, adapter, snapshot)
    return result.outcome
  }

  async maintain(now = Date.now()) {
    const counts = { checked: 0, failed: 0, remaining: 0 }
    if (this.env.STORE_RECONCILIATION_ENABLED !== 'true') return counts
    const config = storeConfig(this.env)
    // Two records per invocation bound D1 statements and external requests on Free.
    // Fair persisted due times prevent an unhealthy subscription starving others.
    const due = await this.db.prepare(`SELECT st.subscription_id, st.account_id, st.provider, st.external_account_token,
      st.reconcile_attempts, s.provider_subscription_id FROM store_subscription_state st
      JOIN subscriptions s ON s.id = st.subscription_id JOIN accounts a ON a.id = st.account_id
      WHERE a.status = 'ACTIVE' AND st.environment = ? AND st.next_reconcile_at <= ? AND st.reconcile_lease_until <= ?
      AND NOT EXISTS (SELECT 1 FROM google_token_replacements r WHERE st.provider = 'GOOGLE_PLAY' AND r.old_purchase_token = s.provider_subscription_id)
      ORDER BY st.next_reconcile_at, st.subscription_id LIMIT 2`).bind(config.environment, now, now).all<Work>()
    for (const row of due.results) {
      const lease = crypto.randomUUID()
      const claimed = await this.db.prepare(`UPDATE store_subscription_state SET reconcile_lease_id = ?, reconcile_lease_until = ?
        WHERE subscription_id = ? AND next_reconcile_at <= ? AND reconcile_lease_until <= ? RETURNING subscription_id`)
        .bind(lease, now + 2 * minute, row.subscription_id, now, now).first()
      if (!claimed) continue
      let delay = 15 * minute, attempts = 0
      try {
        const adapter = this.adapter(row.provider), snapshot = await adapter.refreshSubscription(row.provider_subscription_id)
        requireStoreValue(snapshot.provider === row.provider && snapshot.providerSubscriptionId === row.provider_subscription_id
          && snapshot.externalAccountToken === row.external_account_token, 'STORE_ACCOUNT_MISMATCH')
        const owner = await this.db.prepare(`SELECT id FROM accounts WHERE id = ? AND status = 'ACTIVE'`).bind(row.account_id).first()
        if (!owner) continue
        const hash = await sha(JSON.stringify(snapshot)), billing = new StoreBillingService(this.db, config.environment)
        const result = await billing.applyVerifiedSubscription({ accountId: row.account_id, subscription: snapshot, allowAppleReactivation: true,
          event: { provider: row.provider, providerEventId: `reconcile_${hash}`, providerSubscriptionId: row.provider_subscription_id,
            eventType: 'CURRENT_STATUS', source: 'RECONCILIATION', occurredAt: snapshot.verifiedAt, receivedAt: Date.now(), payloadHash: hash } })
        if (result.outcome !== 'STALE') await this.acknowledge(billing, adapter, snapshot)
        if (['EXPIRED', 'REVOKED'].includes(snapshot.status)) delay = 24 * 60 * minute
        counts.checked++
      } catch {
        // Never log a purchase token, account alias, signed body or provider error.
        attempts = Math.min(row.reconcile_attempts + 1, 16)
        delay = Math.min(5 * minute * 2 ** (attempts - 1), 6 * 60 * minute)
        counts.failed++
      } finally {
        await this.db.prepare(`UPDATE store_subscription_state SET next_reconcile_at = ?, reconcile_attempts = ?,
          reconcile_lease_id = NULL, reconcile_lease_until = 0 WHERE subscription_id = ? AND reconcile_lease_id = ?`)
          .bind(now + delay, attempts, row.subscription_id, lease).run()
      }
    }
    const remaining = await this.db.prepare(`SELECT COUNT(*) AS n FROM store_subscription_state st JOIN accounts a ON a.id = st.account_id
      JOIN subscriptions s ON s.id = st.subscription_id WHERE a.status = 'ACTIVE' AND st.environment = ? AND st.next_reconcile_at <= ?
      AND NOT EXISTS (SELECT 1 FROM google_token_replacements r WHERE st.provider = 'GOOGLE_PLAY' AND r.old_purchase_token = s.provider_subscription_id)`)
      .bind(config.environment, now).first<{ n: number }>()
    counts.remaining = remaining?.n ?? 0
    return counts
  }

  private async acknowledge(billing: StoreBillingService, adapter: Adapter, snapshot: VerifiedStoreSubscription) {
    if (snapshot.provider === 'GOOGLE_PLAY' && adapter.acknowledge) {
      if (await adapter.acknowledge(snapshot.providerSubscriptionId)) await billing.markGoogleAcknowledged(snapshot.providerSubscriptionId)
    }
  }
}
