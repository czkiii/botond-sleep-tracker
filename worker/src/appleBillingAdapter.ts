import { Buffer } from 'node:buffer'
import type { SignedDataVerifier, JWSTransactionDecodedPayload, JWSRenewalInfoDecodedPayload } from '@apple/app-store-server-library'
import { importPKCS8, SignJWT } from 'jose'
import { appleRootG3 } from './appleRoot'
import { validateVerifiedStoreSubscription, type StoreBillingAdapter, type StorePurchaseClaim,
  type SubscriptionStatus, type VerifiedStoreSubscription } from './billingContract'
import type { AppleConfig } from './storeProviderConfig'
import { StoreHttp, StoreProviderError, record, requireStoreValue, storeString, storeTime } from './storeProviderHttp'

type AppleVerifier = Pick<SignedDataVerifier, 'verifyAndDecodeTransaction' | 'verifyAndDecodeRenewalInfo'>

export class AppleBillingAdapter implements StoreBillingAdapter {
  readonly provider = 'APPLE' as const
  private verifier?: AppleVerifier
  private readonly environment: 'Production' | 'Sandbox'

  constructor(private readonly config: AppleConfig, private readonly http = new StoreHttp(), verifier?: AppleVerifier) {
    this.environment = config.environment === 'PRODUCTION' ? 'Production' : 'Sandbox'
    // Offline certificate-chain validation is always followed by a fresh, authenticated
    // Apple HTTPS status lookup. A client JWS alone can NEVER grant access. No OCSP URL
    // supplied in an untrusted certificate is fetched; no LocalTesting/Xcode bypass.
    this.verifier = verifier
  }

  async verifyPurchase(claim: StorePurchaseClaim, expectedToken: string, now = Date.now()) {
    requireStoreValue(claim.provider === this.provider, 'STORE_PROVIDER_MISMATCH')
    const transaction = await this.decodeTransaction(claim.signedTransaction)
    this.checkIdentity(transaction)
    requireStoreValue(transaction.appAccountToken?.toLowerCase() === expectedToken, 'STORE_ACCOUNT_MISMATCH')
    const result = await this.refreshSubscription(storeString(transaction.originalTransactionId), now)
    requireStoreValue(result.externalAccountToken === expectedToken, 'STORE_ACCOUNT_MISMATCH')
    return result
  }

  async refreshSubscription(originalId: string, now = Date.now()): Promise<VerifiedStoreSubscription> {
    requireStoreValue(/^\d{1,128}$/.test(originalId), 'STORE_TRANSACTION_INVALID')
    let bearer: string
    try {
      bearer = await new SignJWT({ bid: this.config.bundleId })
        .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId, typ: 'JWT' })
        .setIssuer(this.config.issuerId).setAudience('appstoreconnect-v1')
        .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + 300)
        .sign(await importPKCS8(this.config.privateKey, 'ES256'))
    } catch { throw new StoreProviderError('STORE_NOT_CONFIGURED', 503) }
    const host = this.environment === 'Production' ? 'api.storekit.itunes.apple.com' : 'api.storekit-sandbox.itunes.apple.com'
    const response = await this.http.json(`https://${host}/inApps/v1/subscriptions/${originalId}`,
      { headers: { Authorization: `Bearer ${bearer}` } })
    requireStoreValue(response.bundleId === this.config.bundleId && response.environment === this.environment
      && response.appAppleId === this.config.appId, 'STORE_APP_MISMATCH')
    requireStoreValue(Array.isArray(response.data))
    const matches: Record<string, unknown>[] = []
    for (const rawGroup of response.data) {
      const group = record(rawGroup)
      requireStoreValue(Array.isArray(group.lastTransactions))
      for (const rawItem of group.lastTransactions) {
        const item = record(rawItem)
        if (item.originalTransactionId === originalId) matches.push(item)
      }
    }
    requireStoreValue(matches.length === 1, 'STORE_SUBSCRIPTION_AMBIGUOUS')
    const item = matches[0]
    const transaction = await this.decodeTransaction(storeString(item.signedTransactionInfo, 65_536))
    const renewal = await this.decodeRenewal(storeString(item.signedRenewalInfo, 65_536))
    this.checkIdentity(transaction)
    requireStoreValue(transaction.originalTransactionId === originalId && renewal.originalTransactionId === originalId
      && renewal.environment === this.environment && renewal.productId === transaction.productId,
      'STORE_TRANSACTION_MISMATCH')
    requireStoreValue(!transaction.isUpgraded && transaction.advancedCommerceInfo === undefined,
      'STORE_PLAN_UNSUPPORTED')
    requireStoreValue(transaction.offerType === undefined && transaction.offerDiscountType === undefined,
      'STORE_OFFER_REQUIRES_RECONCILIATION')
    const entry = this.config.catalog.find(x => x.provider === this.provider && x.productId === transaction.productId)
    requireStoreValue(entry, 'STORE_PRODUCT_UNKNOWN')
    requireStoreValue(renewal.autoRenewStatus === 0 || renewal.autoRenewStatus === 1)
    const statuses: Record<number, SubscriptionStatus> = { 1: 'ACTIVE', 2: 'EXPIRED', 3: 'PAST_DUE', 4: 'GRACE_PERIOD', 5: 'REVOKED' }
    requireStoreValue(typeof item.status === 'number' && statuses[item.status], 'STORE_STATUS_UNKNOWN')
    let status = statuses[item.status]
    if (transaction.revocationDate !== undefined) status = 'REVOKED'
    if (status === 'ACTIVE' && renewal.autoRenewStatus === 0) status = 'CANCELED'
    const startedAt = storeTime(transaction.originalPurchaseDate), end = storeTime(transaction.expiresDate)
    requireStoreValue(startedAt <= now + 60_000)
    const signedAt = storeTime(transaction.signedDate), renewalSignedAt = storeTime(renewal.signedDate)
    requireStoreValue(signedAt <= now + 60_000 && renewalSignedAt <= now + 60_000)
    return validateVerifiedStoreSubscription({ provider: this.provider, environment: this.config.environment,
      providerSubscriptionId: originalId, providerTransactionId: storeString(transaction.transactionId),
      externalAccountToken: storeString(transaction.appAccountToken).toLowerCase(), product: entry.product,
      status, autoRenews: renewal.autoRenewStatus === 1, startedAt, trialEndsAt: null,
      currentPeriodEndsAt: end, accessUntil: status === 'GRACE_PERIOD' ? storeTime(renewal.gracePeriodExpiresDate) : end,
      // Timestamp the request, not its completion: a slow old response must not win.
      verifiedAt: now, replacementProviderSubscriptionId: null })
  }

  private checkIdentity(transaction: JWSTransactionDecodedPayload) {
    requireStoreValue(transaction.bundleId === this.config.bundleId && transaction.environment === this.environment,
      'STORE_APP_MISMATCH')
    requireStoreValue(transaction.type === 'Auto-Renewable Subscription' && transaction.inAppOwnershipType === 'PURCHASED',
      'STORE_PLAN_UNSUPPORTED')
  }
  private async decodeTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
    try { return await (await this.signedDataVerifier()).verifyAndDecodeTransaction(jws) }
    catch { throw new StoreProviderError('STORE_SIGNATURE_INVALID') }
  }
  private async decodeRenewal(jws: string): Promise<JWSRenewalInfoDecodedPayload> {
    try { return await (await this.signedDataVerifier()).verifyAndDecodeRenewalInfo(jws) }
    catch { throw new StoreProviderError('STORE_SIGNATURE_INVALID') }
  }
  private async signedDataVerifier() {
    if (!this.verifier) {
      // jsrsasign initializes random state: Cloudflare forbids that at module load.
      const { SignedDataVerifier, Environment } = await import('@apple/app-store-server-library')
      this.verifier = new SignedDataVerifier([Buffer.from(appleRootG3, 'base64')], false,
        this.environment === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX,
        this.config.bundleId, this.config.appId)
    }
    return this.verifier
  }
}
