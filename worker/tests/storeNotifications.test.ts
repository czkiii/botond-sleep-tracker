import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Buffer } from 'node:buffer'
import { createLocalJWKSet, generateKeyPair, exportJWK, SignJWT } from 'jose'
import { AppleBillingAdapter } from '../src/appleBillingAdapter'
import { appleSigningFixture } from './storeProviderFixture'
import { googleNotice, verifyGooglePush } from '../src/storeNotifications'
import { StoreHttp } from '../src/storeProviderHttp'
import worker from '../src/index'
import { onRequest } from '../../functions/api/[[path]]'
import type { StoreBillingEnv } from '../src/storeProviderConfig'

const env: StoreBillingEnv = { GOOGLE_PLAY_PACKAGE_NAME: 'app.solemi.test', GOOGLE_PLAY_PUSH_AUDIENCE: 'https://sync.example/v1/billing/notifications/google',
  GOOGLE_PLAY_PUSH_EMAIL: 'push@synthetic.iam.gserviceaccount.com', GOOGLE_PLAY_PUSH_SUBSCRIPTION: 'projects/synthetic/subscriptions/billing' }
let keys: Awaited<ReturnType<typeof generateKeyPair>>, jwks: ReturnType<typeof createLocalJWKSet>
beforeAll(async () => {
  keys = await generateKeyPair('RS256', { extractable: true })
  jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: 'synthetic-key' }] })
})
afterEach(() => vi.restoreAllMocks())
async function token(changes: Record<string, unknown> = {}, signing = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ sub: 'service-account', iss: 'https://accounts.google.com', aud: env.GOOGLE_PLAY_PUSH_AUDIENCE,
    email: env.GOOGLE_PLAY_PUSH_EMAIL, email_verified: true, iat: now, exp: now + 3600, ...changes })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-key' }).sign(signing)
}
function envelope(data: unknown) { return { subscription: env.GOOGLE_PLAY_PUSH_SUBSCRIPTION,
  message: { messageId: '123', data: Buffer.from(JSON.stringify({ packageName: env.GOOGLE_PLAY_PACKAGE_NAME, eventTimeMillis: String(Date.now()), ...data as object })).toString('base64') } } }

describe('Google authenticated Pub/Sub notifications', () => {
  it('accepts a correctly signed service account identity with exact audience', async () => {
    await expect(verifyGooglePush(`Bearer ${await token()}`, env, jwks as any)).resolves.toBeUndefined()
  })
  it.each([{ aud: 'wrong' }, { email: 'attacker@example.invalid' }, { email_verified: false }, { iss: 'https://attacker.invalid' },
    { exp: 1 }, { iat: 1 }])('rejects identity/time mismatch %j', async changes => {
    await expect(verifyGooglePush(`Bearer ${await token(changes)}`, env, jwks as any)).rejects.toMatchObject({ status: 401 })
  })
  it('rejects missing, forged and unsigned credentials', async () => {
    for (const authorization of [null, 'Bearer a.b.c', `Bearer ${await token({}, (await generateKeyPair('RS256')).privateKey)}`])
      await expect(verifyGooglePush(authorization, env, jwks as any)).rejects.toMatchObject({ status: 401 })
  })
  it('decodes subscription changes and refunds only as locators for fresh verification', () => {
    expect(googleNotice(envelope({ subscriptionNotification: { purchaseToken: 'purchase', notificationType: 2 } }), env))
      .toMatchObject({ id: '123', subscriptionId: 'purchase', eventType: 'subscriptionNotification' })
    expect(googleNotice(envelope({ voidedPurchaseNotification: { purchaseToken: 'purchase', productType: 1 } }), env))
      .toMatchObject({ subscriptionId: 'purchase' })
    expect(googleNotice(envelope({ testNotification: {} }), env)).toBeNull()
    expect(googleNotice(envelope({ voidedPurchaseNotification: { purchaseToken: 'purchase', productType: 2 } }), env)).toBeNull()
  })
  it('rejects another subscription/package, malformed base64 and ambiguous payloads', () => {
    for (const body of [{ ...envelope({ testNotification: {} }), subscription: 'projects/other/subscriptions/other' },
      envelope({ packageName: 'wrong', testNotification: {} }), envelope({ testNotification: {}, subscriptionNotification: {} }),
      { ...envelope({}), message: { messageId: '123', data: 'not base64!' } }])
      expect(() => googleNotice(body, env)).toThrow()
  })
})

describe('Apple V2 notification signatures and nested transaction binding', () => {
  const config = { environment: 'SANDBOX' as const, bundleId: 'app.solemi.test', appId: 123, issuerId: 'test', keyId: 'test', privateKey: '', catalog: [] }
  it('verifies the outer and inner signed payload without trusting its claimed paid status', async () => {
    const signing = appleSigningFixture(config.bundleId, config.appId), now = Date.now()
    const tx = { bundleId: config.bundleId, environment: 'Sandbox', type: 'Auto-Renewable Subscription', inAppOwnershipType: 'PURCHASED',
      originalTransactionId: '10001', appAccountToken: '01990d45-a1b2-47e8-91f3-123456789abc', signedDate: now }
    const notice = { version: '2.0', notificationType: 'DID_RENEW', notificationUUID: 'synthetic-event', signedDate: now,
      data: { environment: 'Sandbox', bundleId: config.bundleId, appAppleId: config.appId, signedTransactionInfo: signing.sign(tx) } }
    const outbound = vi.fn(), adapter = new AppleBillingAdapter(config, new StoreHttp(outbound), signing.verifier)
    expect(await adapter.notification(signing.sign(notice))).toMatchObject({ subscriptionId: '10001', id: 'synthetic-event' })
    await expect(adapter.notification(signing.changePayload(signing.sign(notice)))).rejects.toMatchObject({ code: 'STORE_SIGNATURE_INVALID' })
    await expect(adapter.notification(signing.sign({ ...notice, data: { ...notice.data, signedTransactionInfo: signing.changePayload(signing.sign(tx)) } }))).rejects.toThrow()
    await expect(adapter.notification(signing.sign({ ...notice, data: { ...notice.data, environment: 'Production' } }))).rejects.toThrow()
    expect(await adapter.notification(signing.sign({ ...notice, notificationType: 'TEST' }))).toBeNull()
    expect(outbound).not.toHaveBeenCalled()
  })
})

describe('notification HTTP boundary', () => {
  const forbiddenDB = () => ({ prepare: vi.fn(() => { throw new Error('must not touch database') }) } as unknown as D1Database)
  it('fails closed when disabled and does not require a browser Origin for a provider request', async () => {
    const db = forbiddenDB()
    const response = await worker.fetch(new Request('https://sync.example/v1/billing/notifications/apple', { method: 'POST', body: '{}' }),
      { DB: db, TOKEN_PEPPER: '', ALLOWED_ORIGINS: '' })
    expect(response.status).toBe(404); expect(db.prepare).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated Google delivery before body parsing/provider/database work', async () => {
    const db = forbiddenDB()
    const response = await worker.fetch(new Request('https://sync.example/v1/billing/notifications/google', { method: 'POST', body: 'malformed' }),
      { ...env, DB: db, TOKEN_PEPPER: '', ALLOWED_ORIGINS: '', STORE_NOTIFICATIONS_ENABLED: 'true', STORE_RECONCILIATION_ENABLED: 'true',
        STORE_BILLING_ENABLED: 'true', STORE_ENVIRONMENT: 'SANDBOX', STORE_PRODUCT_CATALOG: JSON.stringify([{ provider: 'GOOGLE_PLAY', productId: 'family', basePlanId: 'monthly', product: 'FAMILY' }]) })
    expect(response.status).toBe(401); expect(db.prepare).not.toHaveBeenCalled()
  })
  it('applies the request ceiling before parsing proofs and keeps webhooks outside the browser proxy', async () => {
    const db = forbiddenDB(), allow = { limit: vi.fn(async () => ({ success: true })) }
    const response = await worker.fetch(new Request('https://sync.example/v1/billing/notifications/apple', { method: 'POST', body: '{}' }),
      { DB: db, TOKEN_PEPPER: '', ALLOWED_ORIGINS: '', SOLEMI_ENVIRONMENT: 'staging', API_LIMITER: allow, INVITE_LIMITER: allow,
        AUTH_LIMITER: { limit: vi.fn(async () => ({ success: false })) } })
    expect(response.status).toBe(429); expect(db.prepare).not.toHaveBeenCalled()
    expect((await onRequest({ request: new Request('https://solemi-sleep-internal.pages.dev/api/v1/billing/notifications/apple', { method: 'POST' }) })).status).toBe(404)
  })
})
