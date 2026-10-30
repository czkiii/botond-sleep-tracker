import { describe, expect, it, vi } from 'vitest'
import type { Product, Transaction } from '@capgo/native-purchases'
import { NativeBilling, selectStoreOffers } from './nativeBilling'
import type { BillingDependencies, PreparedStore, StorePlatform } from './nativeBilling'

const appleAlias = '12345678-1234-4123-8123-123456789012'
const googleAlias = 'AbCdEFghIJklMNopQRstUVwxYZ012345'
function fixture(platform: StorePlatform = 'ios') {
  let context: string | null = 'account:epoch1'
  const alias = platform === 'ios' ? appleAlias : googleAlias
  const catalog = { productId: 'family.monthly', product: 'FAMILY' as const, ...(platform === 'android' ? { basePlanId: 'monthly' } : {}) }
  const product = { identifier: platform === 'ios' ? catalog.productId : 'monthly', planIdentifier: catalog.productId,
    price: 990, priceString: '990 Ft', subscriptionPeriod: { unit: 2, numberOfUnits: 1 },
    offerId: null, offerToken: 'regular-offer', solemiAutoRenew: true, introductoryPrice: null } as unknown as Product
  const prepared: PreparedStore = { provider: platform === 'ios' ? 'APPLE' : 'GOOGLE_PLAY', environment: 'SANDBOX', externalAccountToken: alias, products: [catalog] }
  const transaction = { transactionId: '12345', productIdentifier: catalog.productId, appAccountToken: alias,
    purchaseState: '1', jwsRepresentation: 'signed.transaction.proof', purchaseToken: 'opaque-google-proof', needsFinish: true } as Transaction
  const store = { configure: vi.fn().mockResolvedValue(undefined), getProducts: vi.fn().mockResolvedValue({ products: [product] }),
    purchaseProduct: vi.fn().mockResolvedValue(transaction), getPurchases: vi.fn().mockResolvedValue({ purchases: [] }),
    getUnfinishedTransactions: vi.fn().mockResolvedValue({ transactions: [] }), restorePurchases: vi.fn().mockResolvedValue(undefined),
    finishTransaction: vi.fn().mockResolvedValue(undefined), manageSubscriptions: vi.fn().mockResolvedValue(undefined) }
  const post = vi.fn(async (path: string) => path.endsWith('/prepare') ? prepared
    : { outcome: 'APPLIED', subscriptionId: 'sub', acknowledgement: platform === 'ios' ? 'NOT_REQUIRED' : 'ACKNOWLEDGED' })
  const refreshAccess = vi.fn().mockResolvedValue({ features: [] })
  const deps = { platform, store, context: () => context, post, refreshAccess } as unknown as BillingDependencies
  const billing = new NativeBilling(deps)
  return { billing, deps, store, post, refreshAccess, product, transaction, prepared, catalog,
    offer: selectStoreOffers(platform, [catalog], [product])[0], setContext: (value: string | null) => { context = value } }
}

describe('native purchase → authenticated server → store completion', () => {
  it('passes server Apple alias, JWS only; finishes after server persistence then refreshes access', async () => {
    const f = fixture()
    await f.billing.purchase(f.offer)
    expect(f.store.configure).toHaveBeenCalledWith({ autoFinishTransactions: false })
    expect(f.store.purchaseProduct).toHaveBeenCalledWith(expect.objectContaining({ appAccountToken: appleAlias, autoAcknowledgePurchases: false }))
    expect(f.post).toHaveBeenLastCalledWith('/v1/auth/billing/apple/verify', { signedTransaction: 'signed.transaction.proof' })
    expect(f.store.finishTransaction).toHaveBeenCalledWith({ transactionId: '12345' })
    expect(f.post.mock.invocationCallOrder[1]).toBeLessThan(f.store.finishTransaction.mock.invocationCallOrder[0])
    expect(f.store.finishTransaction.mock.invocationCallOrder[0]).toBeLessThan(f.refreshAccess.mock.invocationCallOrder[0])
  })
  it('passes Play account alias/exact base plan and never acknowledges on the client', async () => {
    const f = fixture('android')
    await f.billing.purchase(f.offer)
    expect(f.store.purchaseProduct).toHaveBeenCalledWith(expect.objectContaining({ appAccountToken: googleAlias,
      productIdentifier: 'family.monthly', planIdentifier: 'monthly', offerToken: 'regular-offer', autoAcknowledgePurchases: false }))
    expect(f.post).toHaveBeenLastCalledWith('/v1/auth/billing/google/verify', { purchaseToken: 'opaque-google-proof' })
    expect(f.store.finishTransaction).not.toHaveBeenCalled()
  })
  it.each(['ios', 'android'] as const)('refuses signed-out %s purchase before accessing store', async platform => {
    const f = fixture(platform); f.setContext(null)
    await expect(f.billing.purchase(f.offer)).rejects.toMatchObject({ code: 'SIGN_IN_REQUIRED' })
    expect(f.store.configure).not.toHaveBeenCalled()
  })
  it('does not submit a returned transaction after logout/login even to the same account', async () => {
    const f = fixture()
    f.store.purchaseProduct.mockImplementation(async () => { f.setContext('account:epoch2'); return f.transaction })
    await expect(f.billing.purchase(f.offer)).rejects.toMatchObject({ code: 'ACCOUNT_CONTEXT_CHANGED' })
    expect(f.post).toHaveBeenCalledTimes(1); expect(f.store.finishTransaction).not.toHaveBeenCalled()
  })
  it('does not finish when context changes while verification is in flight', async () => {
    const f = fixture()
    f.post.mockImplementation(async path => {
      if (path.endsWith('/prepare')) return f.prepared
      f.setContext(null); return { outcome: 'APPLIED', subscriptionId: 'sub', acknowledgement: 'NOT_REQUIRED' }
    })
    await expect(f.billing.purchase(f.offer)).rejects.toMatchObject({ code: 'ACCOUNT_CONTEXT_CHANGED' })
    expect(f.store.finishTransaction).not.toHaveBeenCalled()
  })
  it.each(['STALE', 'retry', 'network'])('leaves unfinished work for recovery on %s', async failure => {
    const f = fixture()
    f.post.mockImplementation(async path => {
      if (path.endsWith('/prepare')) return f.prepared
      if (failure === 'network') throw new Error('network')
      return { outcome: failure === 'STALE' ? 'STALE' : 'APPLIED', subscriptionId: 'sub', acknowledgement: failure === 'retry' ? 'RETRY_REQUIRED' : 'NOT_REQUIRED' }
    })
    await expect(f.billing.purchase(f.offer)).rejects.toBeDefined()
    expect(f.store.finishTransaction).not.toHaveBeenCalled(); expect(f.refreshAccess).not.toHaveBeenCalled()
  })
  it.each([['User cancelled', 'PURCHASE_CANCELLED'], ['Transaction pending', 'PURCHASE_PENDING']])('handles %s without granting or finishing', async (message, code) => {
    const f = fixture(); f.store.purchaseProduct.mockRejectedValue(new Error(message))
    await expect(f.billing.purchase(f.offer)).rejects.toMatchObject({ code })
    expect(f.store.finishTransaction).not.toHaveBeenCalled(); expect(f.post).toHaveBeenCalledTimes(1)
  })
  it('does not verify a pending Play purchase or grant from the store payload', async () => {
    const f = fixture('android')
    f.store.purchaseProduct.mockResolvedValue({ ...f.transaction, purchaseState: '2' })
    await expect(f.billing.purchase(f.offer)).rejects.toMatchObject({ code: 'PURCHASE_PENDING' })
    expect(f.post).toHaveBeenCalledTimes(1); expect(f.refreshAccess).not.toHaveBeenCalled()
  })
  it('refuses a changed price or missing exact product before charging', async () => {
    const f = fixture()
    await expect(f.billing.purchase({ ...f.offer, price: '1 Ft' })).rejects.toMatchObject({ code: 'PRICE_CHANGED' })
    f.store.getProducts.mockResolvedValue({ products: [] })
    await expect(f.billing.purchase(f.offer)).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' })
    expect(f.store.purchaseProduct).not.toHaveBeenCalled()
  })
  it('blocks an overlapping purchase and a second subscription', async () => {
    const f = fixture()
    f.store.getPurchases.mockResolvedValue({ purchases: [{ ...f.transaction, isActive: true }] })
    const first = f.billing.purchase(f.offer)
    await expect(f.billing.purchase(f.offer)).rejects.toMatchObject({ code: 'BILLING_BUSY' })
    await expect(first).rejects.toMatchObject({ code: 'SUBSCRIPTION_EXISTS' })
    expect(f.store.purchaseProduct).not.toHaveBeenCalled()
  })
})

describe('store recovery, not diary restore', () => {
  it('recovers unfinished transactions on launch without prompting AppStore.sync', async () => {
    const f = fixture(); f.store.getUnfinishedTransactions.mockResolvedValue({ transactions: [f.transaction] })
    expect(await f.billing.recover()).toEqual({ verified: 1, skipped: 0, failed: 0, pending: 0 })
    expect(f.post).toHaveBeenLastCalledWith('/v1/auth/billing/apple/restore', { signedTransaction: f.transaction.jwsRepresentation })
    expect(f.store.restorePurchases).not.toHaveBeenCalled()
  })
  it('explicit restore syncs once, deduplicates current/unfinished and refreshes server access', async () => {
    const f = fixture(); f.store.getPurchases.mockResolvedValue({ purchases: [f.transaction] })
    f.store.getUnfinishedTransactions.mockResolvedValue({ transactions: [f.transaction] })
    expect((await f.billing.recover(true)).verified).toBe(1)
    expect(f.store.restorePurchases).toHaveBeenCalledTimes(1); expect(f.store.finishTransaction).toHaveBeenCalledTimes(1)
  })
  it('does not submit or finish another alias; Google alias matching is case-sensitive', async () => {
    const f = fixture('android')
    f.store.getPurchases.mockResolvedValue({ purchases: [{ ...f.transaction, appAccountToken: googleAlias.toLowerCase() }] })
    expect((await f.billing.recover(true)).skipped).toBe(1); expect(f.post).toHaveBeenCalledTimes(1)
  })
  it('one failed receipt does not prevent the remaining recoveries', async () => {
    const f = fixture()
    f.store.getPurchases.mockResolvedValue({ purchases: [{ ...f.transaction, transactionId: 'bad', purchaseToken: undefined, jwsRepresentation: undefined }, { ...f.transaction, purchaseToken: undefined }] })
    expect(await f.billing.recover()).toEqual({ verified: 1, failed: 1, pending: 0, skipped: 0 })
  })
  it('stops recovery after account switch and never continues under the new account', async () => {
    const f = fixture(); f.store.getPurchases.mockImplementation(async () => { f.setContext('other:epoch2'); return { purchases: [f.transaction] } })
    await expect(f.billing.recover()).rejects.toMatchObject({ code: 'ACCOUNT_CONTEXT_CHANGED' })
    expect(f.post).toHaveBeenCalledTimes(1)
  })
  it('retries Play acknowledgement via the server on next recovery', async () => {
    const f = fixture('android'); f.store.getPurchases.mockResolvedValue({ purchases: [f.transaction] })
    f.post.mockResolvedValueOnce(f.prepared).mockResolvedValueOnce({ outcome: 'APPLIED', subscriptionId: 'sub', acknowledgement: 'RETRY_REQUIRED' })
    expect((await f.billing.recover()).failed).toBe(1)
    expect((await f.billing.recover()).verified).toBe(1)
  })
})

describe('store price/catalog matching', () => {
  it('excludes intro offers, unknown products, duplicate products, annual/prepaid plans', () => {
    const f = fixture('android')
    for (const altered of [{ offerId: 'trial' }, { introductoryPrice: {} }, { solemiAutoRenew: false },
      { planIdentifier: 'other' }, { subscriptionPeriod: { unit: 3, numberOfUnits: 1 } }]) {
      expect(selectStoreOffers('android', [f.catalog], [{ ...f.product, ...altered } as Product])).toEqual([])
    }
    expect(selectStoreOffers('android', [f.catalog], [f.product, f.product])).toEqual([])
  })
  it('refuses a wrong provider before presenting any products', async () => {
    const f = fixture(); f.prepared.provider = 'GOOGLE_PLAY'
    await expect(f.billing.offers()).rejects.toMatchObject({ code: 'STORE_NOT_CONFIGURED' })
    expect(f.store.getProducts).not.toHaveBeenCalled()
  })
})
