import { importPKCS8, SignJWT } from 'jose'
import { validateVerifiedStoreSubscription, type StoreBillingAdapter, type StorePurchaseClaim,
  type SubscriptionStatus, type VerifiedStoreSubscription } from './billingContract'
import type { GoogleConfig } from './storeProviderConfig'
import { StoreHttp, StoreProviderError, record, requireStoreValue, storeString, storeTime } from './storeProviderHttp'

const oauthUrl = 'https://oauth2.googleapis.com/token'
const publisher = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'

export class GooglePlayBillingAdapter implements StoreBillingAdapter {
  readonly provider = 'GOOGLE_PLAY' as const
  private bearer?: string
  private verified = new Map<string, { productId: string; acknowledged: boolean; canAcknowledge: boolean }>()
  constructor(private readonly config: GoogleConfig, private readonly http = new StoreHttp()) {}

  async verifyPurchase(claim: StorePurchaseClaim, expectedToken: string, now = Date.now()) {
    requireStoreValue(claim.provider === this.provider, 'STORE_PROVIDER_MISMATCH')
    const result = await this.refreshSubscription(claim.purchaseToken, now)
    requireStoreValue(result.externalAccountToken === expectedToken, 'STORE_ACCOUNT_MISMATCH')
    return result
  }

  async refreshSubscription(purchaseToken: string, now = Date.now()): Promise<VerifiedStoreSubscription> {
    storeString(purchaseToken, 4096)
    const response = await this.http.json(`${publisher}${encodeURIComponent(this.config.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      { headers: { Authorization: `Bearer ${await this.accessToken(now)}` } })
    const environment = response.testPurchase !== undefined ? 'SANDBOX' : 'PRODUCTION'
    requireStoreValue(environment === this.config.environment, 'STORE_ENVIRONMENT_MISMATCH')
    // V1 supports one auto-renewing base plan, not bundles, prepaid or store trial offers.
    requireStoreValue(Array.isArray(response.lineItems) && response.lineItems.length === 1, 'STORE_PLAN_UNSUPPORTED')
    const item = record(response.lineItems[0]), offer = record(item.offerDetails), plan = record(item.autoRenewingPlan)
    const phase = item.offerPhase === undefined ? {} : record(item.offerPhase)
    requireStoreValue(offer.offerId === undefined && phase.freeTrial === undefined && phase.introductoryPrice === undefined
      && phase.prorationPeriod === undefined && item.signupPromotion === undefined,
      'STORE_OFFER_REQUIRES_RECONCILIATION')
    requireStoreValue(item.prepaidPlan === undefined && item.deferredItemReplacement === undefined
      && item.deferredItemRemoval === undefined && plan.installmentDetails === undefined, 'STORE_PLAN_UNSUPPORTED')
    const entry = this.config.catalog.find(x => x.provider === this.provider
      && x.productId === item.productId && x.basePlanId === offer.basePlanId)
    requireStoreValue(entry, 'STORE_PRODUCT_UNKNOWN')
    requireStoreValue(typeof plan.autoRenewEnabled === 'boolean')
    const statuses: Record<string, SubscriptionStatus> = {
      SUBSCRIPTION_STATE_ACTIVE: 'ACTIVE', SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'GRACE_PERIOD',
      SUBSCRIPTION_STATE_CANCELED: 'CANCELED', SUBSCRIPTION_STATE_EXPIRED: 'EXPIRED',
      SUBSCRIPTION_STATE_ON_HOLD: 'PAST_DUE', SUBSCRIPTION_STATE_PAUSED: 'PAST_DUE'
    }
    const status = statuses[storeString(response.subscriptionState)]
    requireStoreValue(status, 'STORE_PURCHASE_NOT_COMPLETED')
    const startedAt = storeTime(response.startTime), end = storeTime(item.expiryTime)
    requireStoreValue(startedAt <= now + 60_000)
    const acknowledged = response.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
    requireStoreValue(acknowledged || response.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING')
    const result = validateVerifiedStoreSubscription({ provider: this.provider, environment,
      providerSubscriptionId: purchaseToken, providerTransactionId: storeString(item.latestSuccessfulOrderId),
      externalAccountToken: storeString(record(response.externalAccountIdentifiers).obfuscatedExternalAccountId),
      product: entry.product, status, autoRenews: plan.autoRenewEnabled, startedAt, trialEndsAt: null,
      currentPeriodEndsAt: end, accessUntil: end, verifiedAt: now,
      replacementProviderSubscriptionId: response.linkedPurchaseToken === undefined ? null : storeString(response.linkedPurchaseToken, 4096) })
    this.verified.set(purchaseToken, { productId: entry.productId, acknowledged,
      canAcknowledge: ['ACTIVE', 'GRACE_PERIOD', 'CANCELED'].includes(status) && end > now })
    return result
  }

  // Called only after the ownership-checked entitlement transaction succeeds.
  async acknowledge(purchaseToken: string): Promise<boolean> {
    const verified = this.verified.get(purchaseToken)
    requireStoreValue(verified, 'STORE_PURCHASE_NOT_VERIFIED')
    if (verified.acknowledged) return true
    if (!verified.canAcknowledge) return false
    await this.http.json(`${publisher}${encodeURIComponent(this.config.packageName)}/purchases/subscriptions/${encodeURIComponent(verified.productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      { method: 'POST', headers: { Authorization: `Bearer ${this.bearer}`, 'Content-Type': 'application/json' }, body: '{}' }, true)
    return true
  }

  private async accessToken(now: number) {
    if (this.bearer) return this.bearer
    let assertion: string
    try {
      assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(this.config.email).setAudience(oauthUrl)
        .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + 300)
        .sign(await importPKCS8(this.config.privateKey, 'RS256'))
    } catch { throw new StoreProviderError('STORE_NOT_CONFIGURED', 503) }
    const result = await this.http.json(oauthUrl, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString() })
    requireStoreValue(result.token_type === 'Bearer')
    this.bearer = storeString(result.access_token, 8192)
    return this.bearer
  }
}
