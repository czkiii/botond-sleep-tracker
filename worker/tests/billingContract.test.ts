import { describe, expect, it } from 'vitest'
import {
  BillingContractError,
  featuresForSubscriptionProduct,
  parseStorePurchaseClaim,
  subscriptionGrantsAccess,
  validateVerifiedStoreSubscription,
  type SubscriptionStatus,
  type VerifiedStoreSubscription
} from '../src/billingContract'

const now = Date.UTC(2026, 8, 19, 12)

function verifiedSubscription(
  overrides: Partial<VerifiedStoreSubscription> = {}
): VerifiedStoreSubscription {
  return {
    provider: 'APPLE',
    environment: 'SANDBOX',
    providerSubscriptionId: '2000000123456789',
    providerTransactionId: '2000000123456790',
    externalAccountToken: '01990d45-a1b2-47e8-91f3-123456789abc',
    product: 'FAMILY_PLUS',
    status: 'ACTIVE',
    autoRenews: true,
    startedAt: now - 1_000,
    trialEndsAt: null,
    currentPeriodEndsAt: now + 30_000,
    accessUntil: now + 30_000,
    verifiedAt: now,
    replacementProviderSubscriptionId: null,
    ...overrides
  }
}

describe('store billing contract', () => {
  it('maps the two paid products to their server-granted features', () => {
    expect(featuresForSubscriptionProduct('FAMILY')).toEqual([
      'FAMILY_SYNC',
      'PDF_EXPORT'
    ])
    expect(featuresForSubscriptionProduct('FAMILY_PLUS')).toEqual([
      'FAMILY_SYNC',
      'PDF_EXPORT',
      'FAMILY_PLUS_INSIGHTS'
    ])
  })

  it.each<SubscriptionStatus>(['TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'CANCELED'])(
    'keeps access for %s only until the verified access boundary',
    (status) => {
      expect(subscriptionGrantsAccess({ status, accessUntil: now + 1 }, now)).toBe(true)
      expect(subscriptionGrantsAccess({ status, accessUntil: now }, now)).toBe(false)
    }
  )

  it.each<SubscriptionStatus>(['PAST_DUE', 'EXPIRED', 'REVOKED'])(
    'does not grant access for %s even with a future timestamp',
    (status) => {
      expect(subscriptionGrantsAccess({ status, accessUntil: now + 30_000 }, now)).toBe(false)
    }
  )

  it('accepts proof-only Apple and Google claims', () => {
    expect(parseStorePurchaseClaim('APPLE', { signedTransaction: 'header.payload.signature' }))
      .toEqual({ provider: 'APPLE', signedTransaction: 'header.payload.signature' })
    expect(parseStorePurchaseClaim('GOOGLE_PLAY', { purchaseToken: 'opaque-play-token' }))
      .toEqual({ provider: 'GOOGLE_PLAY', purchaseToken: 'opaque-play-token' })
  })

  it.each(['plan', 'product', 'paid', 'status', 'accessUntil', 'accountId'])(
    'rejects client authority over %s',
    (field) => {
      expect(() => parseStorePurchaseClaim('GOOGLE_PLAY', {
        purchaseToken: 'opaque-play-token',
        [field]: field === 'paid' ? true : 'FAMILY_PLUS'
      })).toThrowError(expect.objectContaining<Partial<BillingContractError>>({
        code: 'UNTRUSTED_PURCHASE_FIELD'
      }))
    }
  )

  it('rejects malformed proofs and extra request data', () => {
    expect(() => parseStorePurchaseClaim('APPLE', { signedTransaction: 'not-a-jws' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PURCHASE_CLAIM' }))
    expect(() => parseStorePurchaseClaim('GOOGLE_PLAY', {
      purchaseToken: 'opaque-play-token',
      productId: 'client-selected-product'
    })).toThrowError(expect.objectContaining({ code: 'INVALID_PURCHASE_CLAIM' }))
  })

  it('validates a normalized provider snapshot and returns a copy', () => {
    const snapshot = verifiedSubscription()
    const validated = validateVerifiedStoreSubscription(snapshot)
    expect(validated).toEqual(snapshot)
    expect(validated).not.toBe(snapshot)
  })

  it('requires provider-specific opaque account links', () => {
    expect(() => validateVerifiedStoreSubscription(verifiedSubscription({
      externalAccountToken: 'acc_internal_account_id'
    }))).toThrowError(expect.objectContaining({ code: 'INVALID_VERIFIED_SUBSCRIPTION' }))

    expect(validateVerifiedStoreSubscription(verifiedSubscription({
      provider: 'GOOGLE_PLAY',
      externalAccountToken: 'M7F8abCDefghijklmnop_QrsTuvwxyZ01234'
    })).provider).toBe('GOOGLE_PLAY')
  })
})
