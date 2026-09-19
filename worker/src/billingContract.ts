export const storeProviders = ['APPLE', 'GOOGLE_PLAY'] as const
export type StoreProvider = typeof storeProviders[number]

export const storeEnvironments = ['SANDBOX', 'PRODUCTION'] as const
export type StoreEnvironment = typeof storeEnvironments[number]

export const subscriptionProducts = ['FAMILY', 'FAMILY_PLUS'] as const
export type SubscriptionProduct = typeof subscriptionProducts[number]

export const subscriptionStatuses = [
  'TRIALING',
  'ACTIVE',
  'GRACE_PERIOD',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
  'REVOKED'
] as const
export type SubscriptionStatus = typeof subscriptionStatuses[number]

export const storeEventSources = [
  'CLIENT_PURCHASE',
  'RESTORE',
  'SERVER_NOTIFICATION',
  'RECONCILIATION'
] as const
export type StoreEventSource = typeof storeEventSources[number]

export const billingEntitlementFeatures = [
  'FAMILY_SYNC',
  'PDF_EXPORT',
  'FAMILY_PLUS_INSIGHTS'
] as const
export type BillingEntitlementFeature = typeof billingEntitlementFeatures[number]

export type StorePurchaseClaim =
  | { provider: 'APPLE'; signedTransaction: string }
  | { provider: 'GOOGLE_PLAY'; purchaseToken: string }

export type VerifiedStoreSubscription = {
  provider: StoreProvider
  environment: StoreEnvironment
  providerSubscriptionId: string
  providerTransactionId: string
  externalAccountToken: string
  product: SubscriptionProduct
  status: SubscriptionStatus
  autoRenews: boolean
  startedAt: number
  trialEndsAt: number | null
  currentPeriodEndsAt: number
  accessUntil: number
  verifiedAt: number
  replacementProviderSubscriptionId: string | null
}

export type VerifiedStoreEvent = {
  provider: StoreProvider
  providerEventId: string
  providerSubscriptionId: string
  eventType: string
  source: StoreEventSource
  occurredAt: number
  receivedAt: number
  payloadHash: string
}

export interface StoreBillingAdapter {
  readonly provider: StoreProvider
  verifyPurchase(
    claim: StorePurchaseClaim,
    expectedExternalAccountToken: string,
    now?: number
  ): Promise<VerifiedStoreSubscription>
  refreshSubscription(
    providerSubscriptionId: string,
    now?: number
  ): Promise<VerifiedStoreSubscription>
}

export type BillingContractErrorCode =
  | 'INVALID_PURCHASE_CLAIM'
  | 'UNTRUSTED_PURCHASE_FIELD'
  | 'INVALID_VERIFIED_SUBSCRIPTION'

export class BillingContractError extends Error {
  constructor(readonly code: BillingContractErrorCode, message: string) {
    super(message)
    this.name = 'BillingContractError'
  }
}

const accessGrantingStatuses = new Set<SubscriptionStatus>([
  'TRIALING',
  'ACTIVE',
  'GRACE_PERIOD',
  'CANCELED'
])

const untrustedPurchaseFields = new Set([
  'accountId',
  'accessUntil',
  'paid',
  'plan',
  'product',
  'status'
])

const appleAccountTokenPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const googleAccountTokenPattern = /^[A-Za-z0-9_-]{20,64}$/

export function featuresForSubscriptionProduct(
  product: SubscriptionProduct
): BillingEntitlementFeature[] {
  return product === 'FAMILY_PLUS'
    ? ['FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS']
    : ['FAMILY_SYNC', 'PDF_EXPORT']
}

export function subscriptionGrantsAccess(
  subscription: Pick<VerifiedStoreSubscription, 'status' | 'accessUntil'>,
  now = Date.now()
) {
  return accessGrantingStatuses.has(subscription.status) && subscription.accessUntil > now
}

export function parseStorePurchaseClaim(
  provider: StoreProvider,
  value: unknown
): StorePurchaseClaim {
  const input = requireRecord(value, 'Purchase claim must be an object')
  for (const field of Object.keys(input)) {
    if (untrustedPurchaseFields.has(field)) {
      throw new BillingContractError(
        'UNTRUSTED_PURCHASE_FIELD',
        `The client cannot assert ${field}`
      )
    }
  }

  if (provider === 'APPLE') {
    assertOnlyKeys(input, ['signedTransaction'])
    const signedTransaction = requireBoundedString(
      input.signedTransaction,
      'signedTransaction',
      65_536
    )
    const parts = signedTransaction.split('.')
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      throw invalidClaim('signedTransaction must be a compact JWS')
    }
    return { provider, signedTransaction }
  }

  assertOnlyKeys(input, ['purchaseToken'])
  const purchaseToken = requireBoundedString(input.purchaseToken, 'purchaseToken', 4_096)
  return { provider, purchaseToken }
}

export function validateVerifiedStoreSubscription(
  value: VerifiedStoreSubscription
): VerifiedStoreSubscription {
  if (!storeProviders.includes(value.provider)) {
    throw invalidSubscription('Unknown store provider')
  }
  if (!storeEnvironments.includes(value.environment)) {
    throw invalidSubscription('Unknown store environment')
  }
  if (!subscriptionProducts.includes(value.product)) {
    throw invalidSubscription('Unknown subscription product')
  }
  if (!subscriptionStatuses.includes(value.status)) {
    throw invalidSubscription('Unknown subscription status')
  }

  requireSubscriptionString(value.providerSubscriptionId, 'providerSubscriptionId')
  requireSubscriptionString(value.providerTransactionId, 'providerTransactionId')
  requireSubscriptionString(value.externalAccountToken, 'externalAccountToken')
  if (value.replacementProviderSubscriptionId !== null) {
    requireSubscriptionString(
      value.replacementProviderSubscriptionId,
      'replacementProviderSubscriptionId'
    )
  }
  if (typeof value.autoRenews !== 'boolean') {
    throw invalidSubscription('autoRenews must be boolean')
  }

  requireTimestamp(value.currentPeriodEndsAt, 'currentPeriodEndsAt')
  requireTimestamp(value.accessUntil, 'accessUntil')
  requireTimestamp(value.verifiedAt, 'verifiedAt')
  requireTimestamp(value.startedAt, 'startedAt')
  if (value.trialEndsAt !== null) requireTimestamp(value.trialEndsAt, 'trialEndsAt')
  if (value.currentPeriodEndsAt < value.startedAt || value.accessUntil < value.startedAt ||
    (value.trialEndsAt !== null && value.trialEndsAt <= value.startedAt)) {
    throw invalidSubscription('Subscription period timestamps precede startedAt')
  }

  validateExternalAccountToken(value.provider, value.externalAccountToken)

  return { ...value }
}

export function validateVerifiedStoreEvent(value: VerifiedStoreEvent): VerifiedStoreEvent {
  if (!storeProviders.includes(value.provider)) {
    throw invalidSubscription('Unknown event provider')
  }
  if (!storeEventSources.includes(value.source)) {
    throw invalidSubscription('Unknown event source')
  }
  requireSubscriptionString(value.providerEventId, 'providerEventId')
  requireSubscriptionString(value.providerSubscriptionId, 'providerSubscriptionId')
  requireSubscriptionString(value.eventType, 'eventType')
  requireSubscriptionString(value.payloadHash, 'payloadHash')
  requireTimestamp(value.occurredAt, 'occurredAt')
  requireTimestamp(value.receivedAt, 'receivedAt')
  return { ...value }
}

export function validateExternalAccountToken(provider: StoreProvider, token: string) {
  const valid = provider === 'APPLE'
    ? appleAccountTokenPattern.test(token)
    : googleAccountTokenPattern.test(token)
  if (!valid) throw invalidSubscription(`Invalid ${provider} external account token`)
  return token
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidClaim(message)
  return value as Record<string, unknown>
}

function assertOnlyKeys(input: Record<string, unknown>, allowed: string[]) {
  const unexpected = Object.keys(input).find((key) => !allowed.includes(key))
  if (unexpected) throw invalidClaim(`Unexpected purchase field: ${unexpected}`)
}

function requireBoundedString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw invalidClaim(`${field} must be a non-empty string of at most ${maxLength} characters`)
  }
  return value
}

function requireSubscriptionString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw invalidSubscription(`${field} must be a non-empty string of at most 512 characters`)
  }
}

function requireTimestamp(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidSubscription(`${field} must be a non-negative integer timestamp`)
  }
}

function invalidClaim(message: string) {
  return new BillingContractError('INVALID_PURCHASE_CLAIM', message)
}

function invalidSubscription(message: string) {
  return new BillingContractError('INVALID_VERIFIED_SUBSCRIPTION', message)
}
