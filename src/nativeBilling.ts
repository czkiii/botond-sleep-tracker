import type { NativePurchasesPlugin, Product, Transaction } from '@capgo/native-purchases'
import { PURCHASE_TYPE } from '@capgo/native-purchases'

export type StorePlatform = 'ios' | 'android'
export type CatalogItem = { productId: string; basePlanId?: string; product: 'FAMILY' | 'FAMILY_PLUS' }
export type PreparedStore = {
  provider: 'APPLE' | 'GOOGLE_PLAY'; environment: 'SANDBOX' | 'PRODUCTION'
  externalAccountToken: string; products: CatalogItem[]
}
export type StoreOffer = CatalogItem & { price: string; period: string; offerToken?: string }
type Verification = { outcome: 'APPLIED' | 'DUPLICATE' | 'STALE'; subscriptionId: string | null;
  acknowledgement: 'NOT_REQUIRED' | 'ACKNOWLEDGED' | 'RETRY_REQUIRED' }
export type RecoveryResult = { verified: number; skipped: number; pending: number; failed: number }
export class NativeBillingError extends Error {
  constructor(readonly code: string) { super(code) }
}
export type BillingDependencies = {
  platform: StorePlatform
  store: Pick<NativePurchasesPlugin, 'configure' | 'getProducts' | 'purchaseProduct' | 'getPurchases'
    | 'getUnfinishedTransactions' | 'restorePurchases' | 'finishTransaction' | 'manageSubscriptions'>
  context(): string | null
  post<T>(path: string, body: object): Promise<T>
  refreshAccess(): Promise<unknown>
}

// The stores retain unfinished purchases; no receipt/token is written to browser
// storage, exported with a diary, logged or trusted as a local access grant.
export class NativeBilling {
  private busy = false
  constructor(private readonly deps: BillingDependencies) {}

  private async run<T>(operation: (check: () => void) => Promise<T>): Promise<T> {
    if (this.busy) throw new NativeBillingError('BILLING_BUSY')
    const context = this.deps.context()
    if (!context) throw new NativeBillingError('SIGN_IN_REQUIRED')
    const check = () => {
      if (this.deps.context() !== context) throw new NativeBillingError('ACCOUNT_CONTEXT_CHANGED')
    }
    this.busy = true
    try {
      await this.deps.store.configure({ autoFinishTransactions: false }); check()
      return await operation(check)
    } finally { this.busy = false }
  }

  private async prepare(check: () => void) {
    const result = await this.deps.post<PreparedStore>(`${this.path}/prepare`, {}); check()
    if (result.provider !== (this.deps.platform === 'ios' ? 'APPLE' : 'GOOGLE_PLAY')
      || !['SANDBOX', 'PRODUCTION'].includes(result.environment)
      || !(this.deps.platform === 'ios' ? /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i : /^[A-Za-z0-9_-]{20,64}$/).test(result.externalAccountToken)
      || !Array.isArray(result.products) || result.products.length > 20) throw new NativeBillingError('STORE_NOT_CONFIGURED')
    return result
  }
  private get path() { return `/v1/auth/billing/${this.deps.platform === 'ios' ? 'apple' : 'google'}` }

  offers() {
    return this.run(async check => {
      const prepared = await this.prepare(check)
      return this.loadOffers(prepared, check)
    })
  }

  private async loadOffers(prepared: PreparedStore, check: () => void) {
    if (!prepared.products.length) return []
    const { products } = await this.deps.store.getProducts({
      productIdentifiers: [...new Set(prepared.products.map(x => x.productId))], productType: PURCHASE_TYPE.SUBS
    }); check()
    return selectStoreOffers(this.deps.platform, prepared.products, products)
  }

  purchase(selected: StoreOffer) {
    return this.run(async check => {
      const prepared = await this.prepare(check)
      const offers = await this.loadOffers(prepared, check)
      const offer = offers.find(x => x.productId === selected.productId && x.basePlanId === selected.basePlanId)
      if (!offer) throw new NativeBillingError('PRODUCT_UNAVAILABLE')
      // Do not silently buy after the displayed price/period changed.
      if (offer.price !== selected.price || offer.period !== selected.period) throw new NativeBillingError('PRICE_CHANGED')
      const { purchases: owned } = await this.deps.store.getPurchases({ productType: PURCHASE_TYPE.SUBS, onlyCurrentEntitlements: true }); check()
      // Plan replacement needs the store's upgrade/downgrade flow. Do not start
      // a second independent subscription (including one owned by another alias).
      if (owned.some(txn => prepared.products.some(x => x.productId === txn.productIdentifier)
        && (this.deps.platform === 'android' || txn.isActive === true || txn.needsFinish === true))) {
        throw new NativeBillingError('SUBSCRIPTION_EXISTS')
      }
      let transaction: Transaction
      try {
        transaction = await this.deps.store.purchaseProduct({ productIdentifier: offer.productId,
          planIdentifier: offer.basePlanId, offerToken: offer.offerToken, productType: PURCHASE_TYPE.SUBS,
          appAccountToken: prepared.externalAccountToken, autoAcknowledgePurchases: false, isConsumable: false })
      } catch (error) {
        check()
        // This pinned bridge reports these StoreKit/Play outcomes as errors.
        const message = error instanceof Error ? error.message : ''
        if (/cancel/i.test(message)) throw new NativeBillingError('PURCHASE_CANCELLED')
        if (/pending/i.test(message)) throw new NativeBillingError('PURCHASE_PENDING')
        throw new NativeBillingError('STORE_PURCHASE_FAILED')
      }
      check()
      const outcome = await this.verify(transaction, prepared, false, check)
      if (outcome !== 'verified') throw new NativeBillingError(outcome === 'pending' ? 'PURCHASE_PENDING' : 'PURCHASE_ACCOUNT_MISMATCH')
      await this.deps.refreshAccess(); check()
    })
  }

  recover(explicitRestore = false): Promise<RecoveryResult> {
    return this.run(async check => {
      const prepared = await this.prepare(check)
      // AppStore.sync can prompt for credentials: ONLY on an explicit restore.
      if (explicitRestore) { await this.deps.store.restorePurchases(); check() }
      const { purchases } = await this.deps.store.getPurchases({ productType: PURCHASE_TYPE.SUBS,
        onlyCurrentEntitlements: true }); check()
      const unfinished = this.deps.platform === 'ios'
        ? (await this.deps.store.getUnfinishedTransactions()).transactions : []
      check()
      const unique = new Map<string, Transaction>()
      for (const txn of [...purchases, ...unfinished]) unique.set(txn.purchaseToken || txn.transactionId, txn)
      const result: RecoveryResult = { verified: 0, pending: 0, skipped: 0, failed: 0 }
      // Bounded calls. Put unfinished work first so old history cannot starve it.
      const ordered = [...unique.values()].sort((a, b) => Number(Boolean(b.needsFinish)) - Number(Boolean(a.needsFinish)))
      for (const txn of ordered.slice(0, 20)) {
        check()
        try { result[await this.verify(txn, prepared, true, check)]++ }
        catch (error) { check(); if (error instanceof NativeBillingError && error.code === 'ACCOUNT_CONTEXT_CHANGED') throw error; result.failed++ }
      }
      result.failed += Math.max(0, ordered.length - 20)
      await this.deps.refreshAccess(); check()
      return result
    })
  }

  private async verify(txn: Transaction, prepared: PreparedStore, restore: boolean, check: () => void): Promise<'verified' | 'skipped' | 'pending'> {
    // The prefilter avoids submitting/finishing another store account's history.
    // The server independently validates the alias in the signed/store response.
    const aliasMatches = this.deps.platform === 'ios'
      ? txn.appAccountToken?.toLowerCase() === prepared.externalAccountToken.toLowerCase()
      : txn.appAccountToken === prepared.externalAccountToken
    if (!aliasMatches
      || !prepared.products.some(x => x.productId === txn.productIdentifier)) return 'skipped'
    if (this.deps.platform === 'android' && !['1', 'PURCHASED'].includes(txn.purchaseState || '')) return 'pending'
    const proof = this.deps.platform === 'ios' ? txn.jwsRepresentation : txn.purchaseToken
    if (!proof) throw new NativeBillingError('PURCHASE_PROOF_MISSING')
    check()
    const verified = await this.deps.post<Verification>(`${this.path}/${restore ? 'restore' : 'verify'}`,
      this.deps.platform === 'ios' ? { signedTransaction: proof } : { purchaseToken: proof })
    check()
    if (!verified.subscriptionId || !['APPLIED', 'DUPLICATE'].includes(verified.outcome)
      || verified.acknowledgement === 'RETRY_REQUIRED') throw new NativeBillingError('VERIFICATION_RETRY_REQUIRED')
    if (this.deps.platform === 'ios') {
      await this.deps.store.finishTransaction({ transactionId: txn.transactionId }); check()
    }
    // Play acknowledge is performed ONLY by the Worker after durable persistence.
    return 'verified'
  }

  manage() { return this.deps.store.manageSubscriptions() }
}

export function selectStoreOffers(platform: StorePlatform, catalog: CatalogItem[], products: Product[]): StoreOffer[] {
  return catalog.flatMap(entry => {
    const candidates = products.filter(p => platform === 'ios' ? p.identifier === entry.productId
      // Pinned bridge uses identifier=basePlanId, planIdentifier=productId on Play.
      : p.planIdentifier === entry.productId && p.identifier === entry.basePlanId && p.offerId == null && Boolean(p.offerToken))
    if (candidates.length !== 1) return []
    const p = candidates[0]
    if (!p.priceString || p.price <= 0 || p.introductoryPrice || p.pricingTerms?.some(x => x.billingPlanType === 'monthly')) return []
    const period = p.subscriptionPeriod
    const unit = period?.unitString || ['day', 'week', 'month', 'year'][period?.unit]
    if (!period || period.numberOfUnits !== 1 || unit !== 'month') return [] // V1 monthly only.
    if (platform === 'android' && (p as Product & { solemiAutoRenew?: boolean }).solemiAutoRenew !== true) return []
    return [{ ...entry, price: p.priceString, period: 'month', offerToken: p.offerToken }]
  })
}
