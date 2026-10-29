import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { sqliteBinding } from './sqliteD1'
import { StoreLifecycleService, BILLING_CRON } from '../src/storeLifecycleService'
import { StoreBillingService } from '../src/storeBillingService'
import type { VerifiedStoreSubscription, StoreProvider } from '../src/billingContract'
import type { StoreBillingEnv } from '../src/storeProviderConfig'
import worker from '../src/index'

const now = Date.UTC(2026, 9, 29), day = 86400000
let db: DatabaseSync, binding: D1Database, env: StoreBillingEnv, billing: StoreBillingService
let snapshot: VerifiedStoreSubscription, refresh: ReturnType<typeof vi.fn>, acknowledge: ReturnType<typeof vi.fn>, lifecycle: StoreLifecycleService
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const name of readdirSync(new URL('../migrations', import.meta.url)).filter(x => x.endsWith('.sql') && x >= '003').sort())
    db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  binding = sqliteBinding(db); billing = new StoreBillingService(binding, 'SANDBOX')
  db.prepare(`INSERT INTO accounts(id,status,created_at,updated_at,last_login_at) VALUES('payer','ACTIVE',?,?,?)`).run(now, now, now)
  const alias = await billing.getOrCreateAccountLink('payer', 'GOOGLE_PLAY', now)
  snapshot = { provider: 'GOOGLE_PLAY', environment: 'SANDBOX', providerSubscriptionId: 'purchase', providerTransactionId: 'order',
    externalAccountToken: alias, product: 'FAMILY_PLUS', status: 'ACTIVE', autoRenews: true, startedAt: now - day,
    trialEndsAt: null, currentPeriodEndsAt: now + day, accessUntil: now + day, verifiedAt: now, replacementProviderSubscriptionId: null }
  env = { STORE_BILLING_ENABLED: 'true', STORE_RECONCILIATION_ENABLED: 'true', STORE_ENVIRONMENT: 'SANDBOX',
    STORE_PRODUCT_CATALOG: JSON.stringify([{ provider: 'GOOGLE_PLAY', productId: 'family', basePlanId: 'monthly', product: 'FAMILY_PLUS' }]) }
  refresh = vi.fn(async () => ({ ...snapshot, verifiedAt: Date.now() })); acknowledge = vi.fn(async () => true)
  lifecycle = new StoreLifecycleService(binding, env, provider => ({ provider, refreshSubscription: refresh, verifyPurchase: vi.fn(), acknowledge }))
})
afterEach(() => { db.close(); vi.useRealTimers(); vi.restoreAllMocks() })
const notice = (id = 'message-1') => ({ id, eventType: 'subscriptionNotification', subscriptionId: 'purchase', occurredAt: now - 5000, payload: `signed-${id}` })
const grants = () => db.prepare('SELECT feature_key, valid_until FROM account_entitlements WHERE revoked_at IS NULL ORDER BY feature_key').all()
async function seed(provider: StoreProvider = 'GOOGLE_PLAY') {
  if (provider === 'APPLE') snapshot = { ...snapshot, provider, externalAccountToken: await billing.getOrCreateAccountLink('payer', 'APPLE'), providerSubscriptionId: '10001' }
  await billing.applyVerifiedSubscription({ accountId: 'payer', subscription: snapshot, event: { provider, providerEventId: 'initial',
    providerSubscriptionId: snapshot.providerSubscriptionId, source: 'CLIENT_PURCHASE', occurredAt: now, receivedAt: now, eventType: 'PURCHASE', payloadHash: 'initial' } })
  vi.setSystemTime(now + 1000)
}

describe('verified notification delivery into the durable ledger', () => {
  it('creates only linked account grants, extends a renewal, and deduplicates authenticated messages before another provider call', async () => {
    expect(await lifecycle.notification('GOOGLE_PLAY', notice())).toBe('APPLIED')
    expect(grants()).toHaveLength(3)
    expect(acknowledge).toHaveBeenCalledOnce()
    expect(await lifecycle.notification('GOOGLE_PLAY', notice())).toBe('DUPLICATE')
    expect(refresh).toHaveBeenCalledOnce()
    await expect(lifecycle.notification('GOOGLE_PLAY', { ...notice(), payload: 'changed' })).rejects.toThrow('STORE_EVENT_ID_REUSED')
    vi.setSystemTime(now + 1000); snapshot.accessUntil += day; snapshot.currentPeriodEndsAt += day
    await lifecycle.notification('GOOGLE_PLAY', notice('renewal'))
    expect(grants().every(x => x.valid_until === now + 2 * day)).toBe(true)
    expect(db.prepare('SELECT count(*) n FROM subscriptions').get()).toEqual({ n: 1 })
  })
  it('uses current refund/expiry state even when the notification claims an old renewal', async () => {
    await seed(); snapshot.status = 'EXPIRED'
    await lifecycle.notification('GOOGLE_PLAY', { ...notice(), eventType: 'RENEWED', occurredAt: now - day })
    expect(grants()).toEqual([])
  })
  it('applies Apple revocation and cannot revive it from a delayed old event', async () => {
    await seed('APPLE'); snapshot.status = 'REVOKED'
    await lifecycle.notification('APPLE', { ...notice(), subscriptionId: '10001', expectedAlias: snapshot.externalAccountToken })
    expect(grants()).toEqual([])
    vi.setSystemTime(now + 2000)
    await lifecycle.notification('APPLE', { ...notice('delayed'), subscriptionId: '10001', occurredAt: now - day })
    expect(grants()).toEqual([])
  })
  it('does not create or relink an unknown/deleted account', async () => {
    snapshot.externalAccountToken = 'unknownaccountalias0000000000'
    expect(await lifecycle.notification('GOOGLE_PLAY', notice())).toBe('IGNORED')
    expect(db.prepare('SELECT count(*) n FROM subscriptions').get()).toEqual({ n: 0 })
    snapshot.externalAccountToken = await billing.getOrCreateAccountLink('payer', 'GOOGLE_PLAY')
    db.exec(`UPDATE accounts SET status='DELETED',deleted_at=${now}`)
    expect(await lifecycle.notification('GOOGLE_PLAY', notice())).toBe('IGNORED')
    expect(acknowledge).not.toHaveBeenCalled()
  })
  it('restores an Apple refund reversal only from a newer current provider snapshot', async () => {
    await seed('APPLE'); snapshot.status = 'REVOKED'
    await lifecycle.notification('APPLE', { ...notice(), subscriptionId: '10001' })
    expect(grants()).toEqual([])
    vi.setSystemTime(now + 2000); snapshot.status = 'ACTIVE'
    await lifecycle.notification('APPLE', { ...notice('refund-reversed'), subscriptionId: '10001', eventType: 'REFUND_REVERSED' })
    expect(grants()).toHaveLength(3)
  })
  it('does not issue grants if account deletion wins during the provider request', async () => {
    refresh.mockImplementationOnce(async () => {
      db.exec(`UPDATE accounts SET status='DELETED',deleted_at=${now}`)
      return snapshot
    })
    expect(await lifecycle.notification('GOOGLE_PLAY', notice())).toBe('IGNORED')
    expect(grants()).toEqual([])
  })
  it('does not issue grants if deletion wins immediately before the atomic billing write', async () => {
    const racing = { ...binding, batch: async (statements: D1PreparedStatement[]) => {
      db.exec(`UPDATE accounts SET status='DELETED',deleted_at=${now}`)
      return binding.batch(statements)
    } } as D1Database
    const service = new StoreLifecycleService(racing, env, provider => ({ provider, refreshSubscription: refresh, verifyPurchase: vi.fn(), acknowledge }))
    await service.notification('GOOGLE_PLAY', notice())
    expect(grants()).toEqual([])
  })
  it('retries provider failure and never records an unprocessed message as successful', async () => {
    refresh.mockRejectedValueOnce(new Error('secret provider detail'))
    await expect(lifecycle.notification('GOOGLE_PLAY', notice())).rejects.toThrow()
    expect(db.prepare('SELECT count(*) n FROM subscription_events').get()).toEqual({ n: 0 })
    expect(await lifecycle.notification('GOOGLE_PLAY', notice())).toBe('APPLIED')
  })
  it('leaves failed acknowledgement durable, then cron completes it after duplicate delivery', async () => {
    acknowledge.mockRejectedValueOnce(new Error('network'))
    await expect(lifecycle.notification('GOOGLE_PLAY', notice())).rejects.toThrow()
    expect(db.prepare('SELECT acknowledgement_state FROM store_subscription_state').get()).toEqual({ acknowledgement_state: 'PENDING' })
    expect(await lifecycle.notification('GOOGLE_PLAY', notice())).toBe('DUPLICATE')
    vi.setSystemTime(now + 1000)
    expect(await lifecycle.maintain()).toMatchObject({ checked: 1, failed: 0 })
    expect(db.prepare('SELECT acknowledgement_state FROM store_subscription_state').get()).toEqual({ acknowledgement_state: 'ACKNOWLEDGED' })
  })
  it('rejects provider or alias mismatch without grants', async () => {
    await expect(lifecycle.notification('GOOGLE_PLAY', { ...notice(), expectedAlias: 'someone-else' })).rejects.toThrow('STORE_ACCOUNT_MISMATCH')
    expect(grants()).toEqual([])
  })
})

describe('bounded, leased recovery of missed events', () => {
  it('discovers a missed renewal without a client and persists its next due time', async () => {
    await seed(); snapshot.accessUntil += day; snapshot.currentPeriodEndsAt += day
    expect(await lifecycle.maintain()).toEqual({ checked: 1, failed: 0, remaining: 0 })
    expect(grants().every(x => x.valid_until === now + 2 * day)).toBe(true)
    expect(await lifecycle.maintain()).toEqual({ checked: 0, failed: 0, remaining: 0 })
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('backs off failures without extending the old grant and retries at the persisted due time', async () => {
    await seed(); refresh.mockRejectedValueOnce(new Error('network'))
    expect(await lifecycle.maintain()).toMatchObject({ checked: 0, failed: 1 })
    expect(grants().every(x => x.valid_until === now + day)).toBe(true)
    expect(db.prepare('SELECT reconcile_attempts, reconcile_lease_until FROM store_subscription_state').get()).toEqual({ reconcile_attempts: 1, reconcile_lease_until: 0 })
    vi.setSystemTime(now + 301000)
    expect(await lifecycle.maintain()).toMatchObject({ checked: 1, failed: 0 })
  })
  it('uses a lease to avoid concurrent refresh, then recovers an expired lease after interruption', async () => {
    await seed()
    let release!: (value: VerifiedStoreSubscription) => void
    refresh.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const first = lifecycle.maintain()
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve()
    expect(release).toBeTypeOf('function')
    expect(await lifecycle.maintain()).toMatchObject({ checked: 0 })
    release({ ...snapshot, verifiedAt: now + 1000 }); await first
    db.exec(`UPDATE store_subscription_state SET next_reconcile_at=0,reconcile_lease_until=${now + 200000},reconcile_lease_id='interrupted'`)
    expect(await lifecycle.maintain()).toMatchObject({ checked: 0 })
    vi.setSystemTime(now + 201000)
    expect(await lifecycle.maintain()).toMatchObject({ checked: 1 })
  })
  it('processes at most two records and does not starve a third record behind failing work', async () => {
    await seed()
    for (const id of ['purchase2', 'purchase3']) {
      snapshot.providerSubscriptionId = id; snapshot.verifiedAt++
      await billing.applyVerifiedSubscription({ accountId: 'payer', subscription: snapshot, event: { provider: 'GOOGLE_PLAY', providerEventId: id,
        providerSubscriptionId: id, source: 'CLIENT_PURCHASE', occurredAt: now, receivedAt: now + 1000, eventType: 'PURCHASE', payloadHash: id } })
    }
    refresh.mockRejectedValue(new Error('unavailable'))
    expect(await lifecycle.maintain()).toEqual({ checked: 0, failed: 2, remaining: 1 })
    expect(await lifecycle.maintain()).toEqual({ checked: 0, failed: 1, remaining: 0 })
  })
  it('skips erased accounts and disabled maintenance', async () => {
    await seed(); db.exec(`UPDATE accounts SET status='DELETED',deleted_at=${now}`)
    expect(await lifecycle.maintain()).toMatchObject({ checked: 0 })
    env.STORE_RECONCILIATION_ENABLED = 'false'
    expect(await lifecycle.maintain()).toMatchObject({ checked: 0 })
    expect(refresh).not.toHaveBeenCalled()
  })
  it('keeps the billing scheduler separate from retention and respects the restore freeze', async () => {
    const dbNever = { prepare: vi.fn(() => { throw Error('must not query') }) } as unknown as D1Database
    const environment = { DB: dbNever, TOKEN_PEPPER: '', ALLOWED_ORIGINS: '', STORE_RECONCILIATION_ENABLED: 'false', RETENTION_MAINTENANCE: 'true' }
    await worker.scheduled({ cron: BILLING_CRON }, environment)
    await worker.scheduled({ cron: BILLING_CRON }, { ...environment, RESTORE_MAINTENANCE: 'true', STORE_RECONCILIATION_ENABLED: 'true' })
    expect(dbNever.prepare).not.toHaveBeenCalled()
  })
})
