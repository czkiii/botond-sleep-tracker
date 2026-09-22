import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import {
  StoreBillingService,
  type StoreBillingServiceError
} from '../src/storeBillingService'
import type {
  StoreProvider,
  VerifiedStoreEvent,
  VerifiedStoreSubscription
} from '../src/billingContract'
import { sqliteBinding } from './sqliteD1'

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const accountMigration = readFileSync(
  new URL('../migrations/003_accounts_and_sessions.sql', import.meta.url),
  'utf8'
)
const entitlementMigration = readFileSync(
  new URL('../migrations/006_subscriptions_and_entitlements.sql', import.meta.url),
  'utf8'
)
const billingMigration = readFileSync(
  new URL('../migrations/007_store_billing_state.sql', import.meta.url),
  'utf8'
)
const orderingMigration = readFileSync(
  new URL('../migrations/008_billing_event_order.sql', import.meta.url),
  'utf8'
)
const replacementMigration = readFileSync(
  new URL('../migrations/009_google_token_replacements.sql', import.meta.url),
  'utf8'
)

const now = 1_800_000_000_000
const appleToken = '01990d45-a1b2-47e8-91f3-123456789abc'
const googleToken = 'M7F8abCDefghijklmnop_QrsTuvwxyZ01234'
let sqlite: DatabaseSync
let service: StoreBillingService
let sequence: number

function insertAccount(id = 'acc_a', status = 'ACTIVE') {
  sqlite.prepare(`INSERT INTO accounts
    (id, email, display_name, avatar_url, locale, status, created_at, updated_at,
     last_login_at, deleted_at)
    VALUES (?, NULL, NULL, NULL, 'hu', ?, ?, ?, ?, ?)`)
    .run(id, status, now, now, now, status === 'DELETED' ? now : null)
}

function snapshot(overrides: Partial<VerifiedStoreSubscription> = {}): VerifiedStoreSubscription {
  const provider = overrides.provider ?? 'APPLE'
  return {
    provider,
    environment: 'SANDBOX',
    providerSubscriptionId: provider === 'APPLE' ? 'apple-original-1' : 'google-purchase-1',
    providerTransactionId: provider === 'APPLE' ? 'apple-transaction-1' : 'google-order-1',
    externalAccountToken: provider === 'APPLE' ? appleToken : googleToken,
    product: 'FAMILY_PLUS',
    status: 'ACTIVE',
    autoRenews: true,
    startedAt: now - 1_000,
    trialEndsAt: null,
    currentPeriodEndsAt: now + 100_000,
    accessUntil: now + 100_000,
    verifiedAt: now,
    replacementProviderSubscriptionId: null,
    ...overrides
  }
}

function event(
  subscription: VerifiedStoreSubscription,
  overrides: Partial<VerifiedStoreEvent> = {}
): VerifiedStoreEvent {
  return {
    provider: subscription.provider,
    providerEventId: `event-${sequence++}`,
    providerSubscriptionId: subscription.providerSubscriptionId,
    eventType: 'PURCHASED',
    source: 'CLIENT_PURCHASE',
    occurredAt: subscription.verifiedAt,
    receivedAt: subscription.verifiedAt,
    payloadHash: `hash-${sequence}`,
    ...overrides
  }
}

function activeFeatures(accountId = 'acc_a') {
  return sqlite.prepare(`SELECT feature_key FROM account_entitlements
    WHERE account_id = ? AND revoked_at IS NULL ORDER BY feature_key`).all(accountId)
    .map((row) => row.feature_key)
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  sqlite.exec(accountMigration)
  sqlite.exec(entitlementMigration)
  sqlite.exec(billingMigration)
  sqlite.exec(orderingMigration)
  sqlite.exec(replacementMigration)
  insertAccount()
  sequence = 1
  service = new StoreBillingService(sqliteBinding(sqlite), {
    appleAccountToken: () => appleToken,
    googleAccountToken: () => googleToken,
    id: (prefix) => `${prefix}_${sequence++}`
  })
})

afterEach(() => sqlite.close())

describe('store billing migration', () => {
  it('preserves existing subscription and entitlement rows', () => {
    using legacy = new DatabaseSync(':memory:')
    legacy.exec(schema)
    legacy.exec(accountMigration)
    legacy.exec(entitlementMigration)
    legacy.exec(`
      INSERT INTO accounts VALUES
        ('acc_old', NULL, NULL, NULL, 'hu', 'ACTIVE', 1, 1, 1, NULL);
      INSERT INTO subscriptions VALUES
        ('sub_old', 'acc_old', 'MANUAL', 'acc_old', 'FAMILY', 'ACTIVE', 1,
         NULL, 100, 100, 1, 1, NULL);
      INSERT INTO account_entitlements VALUES
        ('ent_old', 'acc_old', 'FAMILY_SYNC', 'SUBSCRIPTION', 'sub_old',
         1, 100, NULL, 1, 1);
    `)
    const beforeSubscriptions = legacy.prepare('SELECT * FROM subscriptions').all()
    const beforeEntitlements = legacy.prepare('SELECT * FROM account_entitlements').all()

    legacy.exec(billingMigration)
    legacy.exec(orderingMigration)
    legacy.exec(replacementMigration)

    expect(legacy.prepare('SELECT * FROM subscriptions').all()).toEqual(beforeSubscriptions)
    expect(legacy.prepare('SELECT * FROM account_entitlements').all()).toEqual(beforeEntitlements)
    expect(legacy.prepare('SELECT COUNT(*) AS count FROM billing_account_links').get())
      .toEqual({ count: 0 })
    expect(legacy.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})

describe('store billing persistence', () => {
  it('creates stable provider-specific account aliases for active accounts', async () => {
    expect(await service.getOrCreateAccountLink('acc_a', 'APPLE', now)).toBe(appleToken)
    expect(await service.getOrCreateAccountLink('acc_a', 'APPLE', now + 1)).toBe(appleToken)
    expect(await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)).toBe(googleToken)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM billing_account_links').get())
      .toEqual({ count: 2 })

    insertAccount('acc_disabled', 'DELETION_PENDING')
    await expect(service.getOrCreateAccountLink('acc_disabled', 'APPLE', now))
      .rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  })

  it('atomically persists a verified Family+ purchase and its three grants', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const purchase = snapshot()
    const result = await service.applyVerifiedSubscription({
      accountId: 'acc_a',
      subscription: purchase,
      event: event(purchase)
    })

    expect(result).toMatchObject({ outcome: 'APPLIED' })
    expect(activeFeatures()).toEqual(['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'])
    expect(sqlite.prepare(`SELECT product, status FROM subscriptions`).get())
      .toEqual({ product: 'FAMILY_PLUS', status: 'ACTIVE' })
    expect(sqlite.prepare(`SELECT environment, acknowledgement_state
      FROM store_subscription_state`).get())
      .toEqual({ environment: 'SANDBOX', acknowledgement_state: 'NOT_REQUIRED' })
    expect(sqlite.prepare(`SELECT processed_at FROM subscription_events`).get())
      .toEqual({ processed_at: now })
  })

  it('treats a repeated provider event as idempotent and detects ID reuse', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const purchase = snapshot()
    const purchaseEvent = event(purchase, { providerEventId: 'same-event', payloadHash: 'same-hash' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
      event: purchaseEvent })

    await expect(service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
      event: purchaseEvent })).resolves.toMatchObject({ outcome: 'DUPLICATE' })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscription_events').get())
      .toEqual({ count: 1 })
    await expect(service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
      event: { ...purchaseEvent, payloadHash: 'different-hash' } }))
      .rejects.toMatchObject({ code: 'EVENT_ID_REUSED' })
  })

  it('downgrades Family+ to Family without leaving the Insights grant active', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const plus = snapshot()
    const first = await service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: plus, event: event(plus) })
    const family = snapshot({
      product: 'FAMILY',
      providerTransactionId: 'apple-transaction-2',
      verifiedAt: now + 1,
      currentPeriodEndsAt: now + 200_000,
      accessUntil: now + 200_000
    })
    const second = await service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: family, event: event(family) })

    expect(second).toEqual({ outcome: 'APPLIED', subscriptionId: first.subscriptionId })
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
    expect(sqlite.prepare(`SELECT revoked_at FROM account_entitlements
      WHERE feature_key = 'FAMILY_PLUS_INSIGHTS'`).get()).toEqual({ revoked_at: now + 1 })
  })

  it('records but does not apply a stale snapshot received after a newer one', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const older = snapshot({ verifiedAt: now + 1 })
    const newer = snapshot({
      product: 'FAMILY',
      providerTransactionId: 'apple-transaction-new',
      verifiedAt: now + 2
    })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: newer,
      event: event(newer) })
    const stale = await service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: older, event: event(older) })

    expect(stale.outcome).toBe('STALE')
    expect(sqlite.prepare('SELECT product FROM subscriptions').get())
      .toEqual({ product: 'FAMILY' })
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscription_events').get())
      .toEqual({ count: 2 })
  })

  it('revokes every grant immediately for a verified refund or revocation', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const active = snapshot()
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: active,
      event: event(active) })
    const revoked = snapshot({
      status: 'REVOKED',
      autoRenews: false,
      providerTransactionId: 'apple-transaction-revoked',
      verifiedAt: now + 1
    })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: revoked,
      event: event(revoked, { eventType: 'REFUNDED', source: 'SERVER_NOTIFICATION' }) })

    expect(activeFeatures()).toEqual([])
    expect(sqlite.prepare('SELECT status FROM subscriptions').get())
      .toEqual({ status: 'REVOKED' })
  })

  it('lets revocation win an equal-time conflict and never restores the refunded token', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const active = snapshot()
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: active,
      event: event(active) })
    const revoked = snapshot({ status: 'REVOKED', autoRenews: false })
    expect(await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: revoked,
      event: event(revoked, { eventType: 'REFUNDED' }) }))
      .toMatchObject({ outcome: 'APPLIED' })
    expect(activeFeatures()).toEqual([])

    const replayedActive = snapshot({ verifiedAt: now + 10,
      providerTransactionId: 'apple-transaction-late' })
    expect(await service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: replayedActive, event: event(replayedActive) }))
      .toMatchObject({ outcome: 'STALE' })
    expect(activeFeatures()).toEqual([])
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()).toEqual({ status: 'REVOKED' })
  })

  it('does not regrant on a second event with the same verification time and transaction', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const active = snapshot()
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: active,
      event: event(active) })
    const tied = snapshot({ product: 'FAMILY', autoRenews: false })
    expect(await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: tied,
      event: event(tied, { eventType: 'CORRECTION' }) }))
      .toMatchObject({ outcome: 'STALE' })
    expect(activeFeatures()).toEqual(['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'])
    expect(sqlite.prepare('SELECT product FROM subscriptions').get())
      .toEqual({ product: 'FAMILY_PLUS' })
  })

  it('serializes competing first purchases and rejects conflicting event ID reuse', async () => {
    const base = sqliteBinding(sqlite)
    let previous = Promise.resolve()
    const serialized = {
      prepare: (sql: string) => base.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => {
        const run = previous.then(() => base.batch(statements))
        previous = run.then(() => {}, () => {})
        return run
      }
    } as D1Database
    const makeService = () => new StoreBillingService(serialized, {
      appleAccountToken: () => appleToken,
      googleAccountToken: () => googleToken,
      id: (prefix) => `${prefix}_${sequence++}`
    })
    const left = makeService()
    const right = makeService()
    await left.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const purchase = snapshot()
    const first = event(purchase, { providerEventId: 'competing-event' })
    const conflicting = { ...first, payloadHash: 'different-payload' }
    const results = await Promise.allSettled([
      left.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase, event: first }),
      right.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
        event: conflicting })
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected'))
      .toMatchObject({ reason: { code: 'EVENT_ID_REUSED' } })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscription_events').get())
      .toEqual({ count: 1 })
    expect(activeFeatures()).toEqual(['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'])
  })

  it('retries a different first-purchase event against the winning subscription row', async () => {
    const base = sqliteBinding(sqlite)
    let previous = Promise.resolve()
    const serialized = {
      prepare: (sql: string) => base.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => {
        const run = previous.then(() => base.batch(statements))
        previous = run.then(() => {}, () => {})
        return run
      }
    } as D1Database
    const makeService = () => new StoreBillingService(serialized, {
      appleAccountToken: () => appleToken,
      googleAccountToken: () => googleToken,
      id: (prefix) => `${prefix}_${sequence++}`
    })
    const left = makeService()
    const right = makeService()
    await left.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const purchase = snapshot()
    const results = await Promise.all([
      left.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
        event: event(purchase) }),
      right.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
        event: event(purchase) })
    ])
    expect(results.map((result) => result.outcome).sort()).toEqual(['APPLIED', 'STALE'])
    expect(results[0].subscriptionId).toBe(results[1].subscriptionId)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscriptions').get())
      .toEqual({ count: 1 })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscription_events').get())
      .toEqual({ count: 2 })
    expect(activeFeatures()).toEqual(['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'])
  })

  it('does not let another account claim an existing store subscription', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const purchase = snapshot()
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
      event: event(purchase) })

    insertAccount('acc_b')
    const secondService = new StoreBillingService(sqliteBinding(sqlite), {
      appleAccountToken: () => '01990d45-a1b2-47e8-91f3-123456789abd',
      googleAccountToken: () => 'N8G9bcDEfghijklmnop_QrsTuvwxyZ012345',
      id: (prefix) => `${prefix}_other_${sequence++}`
    })
    const secondToken = await secondService.getOrCreateAccountLink('acc_b', 'APPLE', now)
    const stolen = snapshot({ externalAccountToken: secondToken, verifiedAt: now + 1 })
    await expect(secondService.applyVerifiedSubscription({ accountId: 'acc_b',
      subscription: stolen, event: event(stolen) }))
      .rejects.toMatchObject({ code: 'SUBSCRIPTION_OWNERSHIP_MISMATCH' })
  })

  it('tracks Google acknowledgement separately and preserves it on refresh', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const purchase = snapshot({ provider: 'GOOGLE_PLAY' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: purchase,
      event: event(purchase) })
    expect(sqlite.prepare('SELECT acknowledgement_state FROM store_subscription_state').get())
      .toEqual({ acknowledgement_state: 'PENDING' })

    await service.markGoogleAcknowledged(purchase.providerSubscriptionId, now + 1)
    const renewal = snapshot({
      provider: 'GOOGLE_PLAY',
      providerTransactionId: 'google-order-2',
      verifiedAt: now + 2
    })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: renewal,
      event: event(renewal, { source: 'SERVER_NOTIFICATION', eventType: 'RENEWED' }) })
    expect(sqlite.prepare(`SELECT acknowledgement_state, acknowledged_at
      FROM store_subscription_state`).get())
      .toEqual({ acknowledgement_state: 'ACKNOWLEDGED', acknowledged_at: now + 1 })
  })

  it('replaces a Google Family+ token with Family and blocks late old-token restore', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const old = snapshot({ provider: 'GOOGLE_PLAY' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: old,
      event: event(old) })
    const next = snapshot({ provider: 'GOOGLE_PLAY', providerSubscriptionId: 'google-purchase-2',
      providerTransactionId: 'google-order-2', replacementProviderSubscriptionId: old.providerSubscriptionId,
      product: 'FAMILY', verifiedAt: now + 1 })
    expect(await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: next,
      event: event(next) })).toMatchObject({ outcome: 'APPLIED' })
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
    expect(sqlite.prepare(`SELECT provider_subscription_id, status FROM subscriptions
      ORDER BY provider_subscription_id`).all()).toEqual([
      { provider_subscription_id: 'google-purchase-1', status: 'REVOKED' },
      { provider_subscription_id: 'google-purchase-2', status: 'ACTIVE' }
    ])
    expect(sqlite.prepare('SELECT old_purchase_token FROM google_token_replacements').get())
      .toEqual({ old_purchase_token: old.providerSubscriptionId })

    const oldRestore = snapshot({ provider: 'GOOGLE_PLAY', verifiedAt: now + 10 })
    expect(await service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: oldRestore, event: event(oldRestore, { source: 'RESTORE' }) }))
      .toMatchObject({ outcome: 'STALE' })
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])

    const renewed = { ...next, verifiedAt: now + 2, providerTransactionId: 'google-order-3' }
    expect(await service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: renewed, event: event(renewed, { source: 'SERVER_NOTIFICATION' }) }))
      .toMatchObject({ outcome: 'APPLIED' })
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
  })

  it('tombstones an unseen linked Google token before any late purchase arrives', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const next = snapshot({ provider: 'GOOGLE_PLAY', providerSubscriptionId: 'google-purchase-2',
      replacementProviderSubscriptionId: 'google-purchase-unseen' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: next,
      event: event(next) })
    const lateOld = snapshot({ provider: 'GOOGLE_PLAY',
      providerSubscriptionId: 'google-purchase-unseen', verifiedAt: now + 10 })
    expect(await service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: lateOld, event: event(lateOld, { source: 'RESTORE' }) }))
      .toMatchObject({ outcome: 'STALE', subscriptionId: null })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscriptions').get())
      .toEqual({ count: 1 })
  })

  it('keeps only the newest grants through a Google upgrade and downgrade chain', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const family = snapshot({ provider: 'GOOGLE_PLAY', product: 'FAMILY' })
    const plus = snapshot({ provider: 'GOOGLE_PLAY', providerSubscriptionId: 'google-purchase-2',
      replacementProviderSubscriptionId: family.providerSubscriptionId,
      providerTransactionId: 'google-order-2', verifiedAt: now + 1 })
    const familyAgain = snapshot({ provider: 'GOOGLE_PLAY', product: 'FAMILY',
      providerSubscriptionId: 'google-purchase-3',
      replacementProviderSubscriptionId: plus.providerSubscriptionId,
      providerTransactionId: 'google-order-3', verifiedAt: now + 2 })
    for (const purchase of [family, plus, familyAgain]) {
      await service.applyVerifiedSubscription({ accountId: 'acc_a',
        subscription: purchase, event: event(purchase) })
    }
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
    expect(sqlite.prepare(`SELECT provider_subscription_id, status FROM subscriptions
      ORDER BY provider_subscription_id`).all()).toEqual([
      { provider_subscription_id: 'google-purchase-1', status: 'REVOKED' },
      { provider_subscription_id: 'google-purchase-2', status: 'REVOKED' },
      { provider_subscription_id: 'google-purchase-3', status: 'ACTIVE' }
    ])
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM google_token_replacements').get())
      .toEqual({ count: 2 })
  })

  it('rejects linking a Google token owned by another account', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const old = snapshot({ provider: 'GOOGLE_PLAY' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: old,
      event: event(old) })
    insertAccount('acc_b')
    const other = new StoreBillingService(sqliteBinding(sqlite), {
      appleAccountToken: () => appleToken,
      googleAccountToken: () => 'N8G9bcDEfghijklmnop_QrsTuvwxyZ012345',
      id: (prefix) => `${prefix}_other_${sequence++}`
    })
    const otherAlias = await other.getOrCreateAccountLink('acc_b', 'GOOGLE_PLAY', now)
    const stolen = snapshot({ provider: 'GOOGLE_PLAY', externalAccountToken: otherAlias,
      providerSubscriptionId: 'google-purchase-2',
      replacementProviderSubscriptionId: old.providerSubscriptionId })
    await expect(other.applyVerifiedSubscription({ accountId: 'acc_b',
      subscription: stolen, event: event(stolen) }))
      .rejects.toMatchObject({ code: 'LINKED_SUBSCRIPTION_OWNERSHIP_MISMATCH' })
    expect(activeFeatures('acc_b')).toEqual([])
    expect(activeFeatures('acc_a')).toEqual(['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'])
  })

  it('rejects a second replacement for the same Google token', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const old = snapshot({ provider: 'GOOGLE_PLAY' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: old,
      event: event(old) })
    const first = snapshot({ provider: 'GOOGLE_PLAY', providerSubscriptionId: 'google-purchase-2',
      replacementProviderSubscriptionId: old.providerSubscriptionId, product: 'FAMILY' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: first,
      event: event(first) })
    const second = snapshot({ provider: 'GOOGLE_PLAY', providerSubscriptionId: 'google-purchase-3',
      replacementProviderSubscriptionId: old.providerSubscriptionId, verifiedAt: now + 1 })
    await expect(service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: second, event: event(second) }))
      .rejects.toMatchObject({ code: 'LINKED_SUBSCRIPTION_CONFLICT' })
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
  })

  it('rolls back both subscriptions and grants if the Google link cannot be saved', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const old = snapshot({ provider: 'GOOGLE_PLAY' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: old,
      event: event(old) })
    sqlite.exec(`CREATE TRIGGER fail_google_link BEFORE INSERT ON google_token_replacements
      BEGIN SELECT RAISE(ABORT, 'SIMULATED_LINK_FAILURE'); END`)
    const next = snapshot({ provider: 'GOOGLE_PLAY', providerSubscriptionId: 'google-purchase-2',
      replacementProviderSubscriptionId: old.providerSubscriptionId, product: 'FAMILY',
      verifiedAt: now + 1 })
    await expect(service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: next, event: event(next) })).rejects.toThrow(/SIMULATED_LINK_FAILURE/)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscriptions').get())
      .toEqual({ count: 1 })
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()).toEqual({ status: 'ACTIVE' })
    expect(activeFeatures()).toEqual(['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'])
  })

  it('blocks an old-token restore that started before the replacement committed', async () => {
    await service.getOrCreateAccountLink('acc_a', 'GOOGLE_PLAY', now)
    const old = snapshot({ provider: 'GOOGLE_PLAY' })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: old,
      event: event(old) })

    const base = sqliteBinding(sqlite)
    let resumeRestore!: () => void
    let signalPaused!: () => void
    const paused = new Promise<void>((resolve) => { signalPaused = resolve })
    const gate = new Promise<void>((resolve) => { resumeRestore = resolve })
    const delayedDb = {
      prepare: (sql: string) => base.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        signalPaused()
        await gate
        return base.batch(statements)
      }
    } as D1Database
    const delayed = new StoreBillingService(delayedDb, {
      appleAccountToken: () => appleToken,
      googleAccountToken: () => googleToken,
      id: (prefix) => `${prefix}_delayed_${sequence++}`
    })
    const restoring = snapshot({ provider: 'GOOGLE_PLAY', verifiedAt: now + 2 })
    const restore = delayed.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: restoring, event: event(restoring, { source: 'RESTORE' }) })
    await paused

    const next = snapshot({ provider: 'GOOGLE_PLAY', providerSubscriptionId: 'google-purchase-2',
      replacementProviderSubscriptionId: old.providerSubscriptionId,
      product: 'FAMILY', verifiedAt: now + 1 })
    await service.applyVerifiedSubscription({ accountId: 'acc_a', subscription: next,
      event: event(next) })
    resumeRestore()
    await expect(restore).resolves.toMatchObject({ outcome: 'STALE' })
    expect(activeFeatures()).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
  })

  it('rolls back subscription, state and event together when a grant write fails', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    sqlite.exec(`CREATE TRIGGER fail_billing_grant BEFORE INSERT ON account_entitlements
      BEGIN SELECT RAISE(ABORT, 'SIMULATED_BILLING_FAILURE'); END`)
    const purchase = snapshot()

    await expect(service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: purchase, event: event(purchase) })).rejects.toThrow(/SIMULATED_BILLING_FAILURE/)
    for (const table of ['subscriptions', 'store_subscription_state',
      'subscription_events', 'account_entitlements']) {
      expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(), table)
        .toEqual({ count: 0 })
    }
  })

  it('rejects a verified token that is not linked to the signed-in account', async () => {
    await service.getOrCreateAccountLink('acc_a', 'APPLE', now)
    const wrong = snapshot({ externalAccountToken: '01990d45-a1b2-47e8-91f3-123456789abd' })
    await expect(service.applyVerifiedSubscription({ accountId: 'acc_a',
      subscription: wrong, event: event(wrong) }))
      .rejects.toMatchObject<Partial<StoreBillingServiceError>>({ code: 'ACCOUNT_LINK_MISMATCH' })
  })
})
