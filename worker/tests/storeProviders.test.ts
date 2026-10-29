import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose'
import { AppleBillingAdapter } from '../src/appleBillingAdapter'
import { GooglePlayBillingAdapter } from '../src/googlePlayBillingAdapter'
import { StoreHttp } from '../src/storeProviderHttp'
import { storeConfig, type AppleConfig, type GoogleConfig } from '../src/storeProviderConfig'
import { subscriptionGrantsAccess } from '../src/billingContract'
import { appleSigningFixture } from './storeProviderFixture'

const now = Date.UTC(2026, 9, 28), end = now + 86400000
const alias = '01990d45-a1b2-47e8-91f3-123456789abc', googleAlias = 'SyntheticGoogleAccountToken012345'
let apple: AppleConfig, google: GoogleConfig, googlePublicKey: CryptoKey, applePublicKey: CryptoKey
let signing: ReturnType<typeof appleSigningFixture>
beforeAll(async () => {
  const ec = await generateKeyPair('ES256', { extractable: true }), rsa = await generateKeyPair('RS256', { extractable: true })
  applePublicKey = ec.publicKey; googlePublicKey = rsa.publicKey
  apple = { environment: 'SANDBOX', bundleId: 'app.solemi.test', appId: 123, issuerId: 'synthetic-issuer', keyId: 'TESTKEY',
    privateKey: await exportPKCS8(ec.privateKey), catalog: [{ provider: 'APPLE', productId: 'family.monthly', product: 'FAMILY' }] }
  google = { environment: 'SANDBOX', packageName: 'app.solemi.test', email: 'test@example.invalid',
    privateKey: await exportPKCS8(rsa.privateKey), catalog: [{ provider: 'GOOGLE_PLAY', productId: 'family', basePlanId: 'monthly', product: 'FAMILY' }] }
  signing = appleSigningFixture(apple.bundleId, apple.appId)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function transaction(extra = {}) { return { bundleId: apple.bundleId, environment: 'Sandbox', type: 'Auto-Renewable Subscription',
  inAppOwnershipType: 'PURCHASED', originalTransactionId: '10001', transactionId: '10002', productId: 'family.monthly',
  appAccountToken: alias, originalPurchaseDate: now - 86400000, purchaseDate: now - 1000, expiresDate: end, signedDate: now, ...extra } }
function renewal(extra = {}) { return { environment: 'Sandbox', originalTransactionId: '10001', productId: 'family.monthly', autoRenewStatus: 1, signedDate: now, ...extra } }
function appleServer(status = 1, tx = transaction(), rn = renewal()) {
  return { environment: 'Sandbox', bundleId: apple.bundleId, appAppleId: apple.appId,
    data: [{ lastTransactions: [{ status, originalTransactionId: '10001', signedTransactionInfo: signing.sign(tx), signedRenewalInfo: signing.sign(rn) }] }] }
}
function googleServer() { return { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', startTime: new Date(now - 86400000).toISOString(),
  testPurchase: {}, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', externalAccountIdentifiers: { obfuscatedExternalAccountId: googleAlias },
  lineItems: [{ productId: 'family', latestSuccessfulOrderId: 'GPA.synthetic', expiryTime: new Date(end).toISOString(),
    autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: 'monthly' } }] } }
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

describe('Apple signed purchase and authoritative current status', () => {
  it('validates a real certificate chain/signature, then uses fresh server status instead of the old client expiry', async () => {
    const transport = vi.fn(async (_url, init) => {
      const jwt = String(new Headers(init?.headers).get('Authorization')).slice(7)
      const { payload } = await jwtVerify(jwt, applePublicKey, { audience: 'appstoreconnect-v1', issuer: apple.issuerId, currentDate: new Date(now) })
      expect(payload.bid).toBe(apple.bundleId)
      return json(appleServer())
    })
    const adapter = new AppleBillingAdapter(apple, new StoreHttp(transport), signing.verifier)
    const result = await adapter.verifyPurchase({ provider: 'APPLE', signedTransaction: signing.sign(transaction({ expiresDate: now - 1 })) }, alias, now)
    expect(result).toMatchObject({ status: 'ACTIVE', currentPeriodEndsAt: end, verifiedAt: now, product: 'FAMILY' })
    expect(transport.mock.calls[0][0]).toBe('https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/10001')
  })
  it('rejects tampering and an untrusted root before making provider requests', async () => {
    const transport = vi.fn(), jws = signing.sign(transaction())
    await expect(new AppleBillingAdapter(apple, new StoreHttp(transport), signing.verifier)
      .verifyPurchase({ provider: 'APPLE', signedTransaction: signing.changePayload(jws) }, alias, now)).rejects.toMatchObject({ code: 'STORE_SIGNATURE_INVALID' })
    await expect(new AppleBillingAdapter(apple, new StoreHttp(transport))
      .verifyPurchase({ provider: 'APPLE', signedTransaction: jws }, alias, now)).rejects.toMatchObject({ code: 'STORE_SIGNATURE_INVALID' })
    expect(transport).not.toHaveBeenCalled()
  })
  it.each([{ bundleId: 'wrong.app' }, { environment: 'Production' }, { appAccountToken: '01990d45-a1b2-47e8-91f3-123456789abd' },
    { inAppOwnershipType: 'FAMILY_SHARED' }])('rejects wrong app/environment/owner: %j', async change => {
    const transport = vi.fn()
    await expect(new AppleBillingAdapter(apple, new StoreHttp(transport), signing.verifier)
      .verifyPurchase({ provider: 'APPLE', signedTransaction: signing.sign(transaction(change)) }, alias, now)).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it.each([[1, 0, 'CANCELED', true], [2, 0, 'EXPIRED', false], [3, 1, 'PAST_DUE', false], [4, 1, 'GRACE_PERIOD', true], [5, 0, 'REVOKED', false]] as const)
    ('maps current status %s without granting expired/revoked/retry access', async (status, autoRenewStatus, expected, grants) => {
      const transport = vi.fn(async () => json(appleServer(status, transaction(), renewal({ autoRenewStatus, gracePeriodExpiresDate: end + 1000 }))))
      const result = await new AppleBillingAdapter(apple, new StoreHttp(transport), signing.verifier).refreshSubscription('10001', now)
      expect(result.status).toBe(expected); expect(subscriptionGrantsAccess(result, now)).toBe(grants)
    })
  it.each([{ productId: 'unknown' }, { offerType: 1, offerDiscountType: 'FREE_TRIAL' }, { originalTransactionId: 'different' }])
    ('rejects server mismatch or an unconfigured product/offer: %j', async change => {
      const adapter = new AppleBillingAdapter(apple, new StoreHttp(vi.fn(async () => json(appleServer(1, transaction(change))))), signing.verifier)
      await expect(adapter.refreshSubscription('10001', now)).rejects.toThrow()
    })
})

describe('Google Play authenticated V2 verification', () => {
  it('signs scoped OAuth assertion, verifies a long purchase token, then acknowledges the checked product', async () => {
    const token = 'token+/' + 't'.repeat(1000)
    const transport = vi.fn(async (url, init) => {
      if (String(url).includes('oauth2')) {
        const assertion = new URLSearchParams(String(init?.body)).get('assertion')!
        const { payload } = await jwtVerify(assertion, googlePublicKey, { issuer: google.email, audience: 'https://oauth2.googleapis.com/token', currentDate: new Date(now) })
        expect(payload.scope).toBe('https://www.googleapis.com/auth/androidpublisher')
        return json({ token_type: 'Bearer', access_token: 'synthetic-access-token' })
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-access-token')
      return String(url).endsWith(':acknowledge') ? new Response(null, { status: 204 }) : json(googleServer())
    })
    const adapter = new GooglePlayBillingAdapter(google, new StoreHttp(transport))
    const result = await adapter.verifyPurchase({ provider: 'GOOGLE_PLAY', purchaseToken: token }, googleAlias, now)
    expect(result.providerSubscriptionId).toBe(token)
    expect(await adapter.acknowledge(token)).toBe(true)
    expect(String(transport.mock.calls[1][0])).toContain(encodeURIComponent(token))
    expect(String(transport.mock.calls[2][0])).toContain('/subscriptions/family/tokens/')
  })
  it.each(['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'UNKNOWN'])('does not grant pending/unknown state %s', async state => {
    const response = { ...googleServer(), subscriptionState: state }
    const adapter = new GooglePlayBillingAdapter(google, new StoreHttp(vi.fn(async url => json(String(url).includes('oauth2')
      ? { token_type: 'Bearer', access_token: 'token' } : response))))
    await expect(adapter.verifyPurchase({ provider: 'GOOGLE_PLAY', purchaseToken: 'purchase' }, googleAlias, now)).rejects.toMatchObject({ code: 'STORE_PURCHASE_NOT_COMPLETED' })
  })
  it.each(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED'])
    ('maps %s with no entitlement for hold/pause/expiry', async state => {
      const adapter = new GooglePlayBillingAdapter(google, new StoreHttp(vi.fn(async url => json(String(url).includes('oauth2')
        ? { token_type: 'Bearer', access_token: 'token' } : { ...googleServer(), subscriptionState: state }))))
      const result = await adapter.verifyPurchase({ provider: 'GOOGLE_PLAY', purchaseToken: 'purchase' }, googleAlias, now)
      expect(subscriptionGrantsAccess(result, now)).toBe(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(state))
    })
  it.each(['owner', 'environment', 'product', 'basePlan', 'trial', 'multi', 'date'])('fails closed for %s mismatch', async variant => {
    const response: any = googleServer()
    if (variant === 'owner') response.externalAccountIdentifiers.obfuscatedExternalAccountId = 'AnotherAccountToken0123456789'
    if (variant === 'environment') delete response.testPurchase
    if (variant === 'product') response.lineItems[0].productId = 'unconfigured'
    if (variant === 'basePlan') response.lineItems[0].offerDetails.basePlanId = 'unconfigured'
    if (variant === 'trial') response.lineItems[0].offerPhase = { freeTrial: {} }
    if (variant === 'multi') response.lineItems.push(response.lineItems[0])
    if (variant === 'date') response.lineItems[0].expiryTime = 'invalid'
    const transport = vi.fn(async url => json(String(url).includes('oauth2') ? { token_type: 'Bearer', access_token: 'token' } : response))
    await expect(new GooglePlayBillingAdapter(google, new StoreHttp(transport))
      .verifyPurchase({ provider: 'GOOGLE_PLAY', purchaseToken: 'purchase' }, googleAlias, now)).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(2)
  })
})

describe('bounded provider transport and activation', () => {
  it('redacts provider errors and refuses oversized responses', async () => {
    for (const response of [new Response('secret token', { status: 403 }), new Response('x'.repeat(300000))]) {
      const call = new StoreHttp(vi.fn(async () => response)).json('https://provider.invalid')
      await expect(call).rejects.not.toThrow('secret token')
    }
  })
  it('aborts a stalled response and forbids redirects', async () => {
    vi.useFakeTimers()
    const transport = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      expect(init?.redirect).toBe('error')
      init?.signal?.addEventListener('abort', () => reject(new Error('private detail')))
    }))
    const check = expect(new StoreHttp(transport).json('https://provider.invalid')).rejects.toMatchObject({ code: 'STORE_UNAVAILABLE', status: 503 })
    await vi.advanceTimersByTimeAsync(9001); await check
  })
  it('requires explicit activation, catalog and a matching deployment environment', () => {
    expect(() => storeConfig({})).toThrow('STORE_BILLING_DISABLED')
    expect(() => storeConfig({ STORE_BILLING_ENABLED: 'true' })).toThrow('STORE_NOT_CONFIGURED')
    expect(() => storeConfig({ STORE_BILLING_ENABLED: 'true', SOLEMI_ENVIRONMENT: 'production', STORE_ENVIRONMENT: 'SANDBOX', STORE_PRODUCT_CATALOG: JSON.stringify(apple.catalog) })).toThrow('STORE_NOT_CONFIGURED')
    expect(() => storeConfig({ STORE_BILLING_ENABLED: 'true', STORE_ENVIRONMENT: 'SANDBOX', STORE_PRODUCT_CATALOG: JSON.stringify([apple.catalog[0], apple.catalog[0]]) })).toThrow('STORE_NOT_CONFIGURED')
  })
})
