import { AppleBillingAdapter } from './appleBillingAdapter'
import { GooglePlayBillingAdapter } from './googlePlayBillingAdapter'
import { parseStorePurchaseClaim, type StoreProvider } from './billingContract'
import { StoreBillingService } from './storeBillingService'
import { appleConfig, googleConfig, storeConfig, type StoreBillingEnv } from './storeProviderConfig'
import { StoreProviderError } from './storeProviderHttp'

export function purchaseService(db: D1Database, env: StoreBillingEnv, provider: StoreProvider) {
  const config = storeConfig(env)
  const billing = new StoreBillingService(db, config.environment)
  // Construct only from server configuration, never request-supplied hosts/keys/catalog.
  const adapter = provider === 'APPLE'
    ? new AppleBillingAdapter(appleConfig(env)) : new GooglePlayBillingAdapter(googleConfig(env))
  return {
    async prepare(accountId: string) {
      return { externalAccountToken: await billing.getOrCreateAccountLink(accountId, provider),
        provider, environment: config.environment,
        products: config.catalog.filter(x => x.provider === provider) }
    },
    async verify(accountId: string, body: unknown, restore: boolean) {
      const claim = parseStorePurchaseClaim(provider, body)
      const expectedToken = await billing.getOrCreateAccountLink(accountId, provider)
      const snapshot = await adapter.verifyPurchase(claim, expectedToken)
      const source = restore ? 'RESTORE' : 'CLIENT_PURCHASE'
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ source, snapshot })))
      const payloadHash = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('')
      const result = await billing.applyVerifiedSubscription({ accountId, subscription: snapshot,
        event: { provider, providerEventId: `verify_${payloadHash}`, providerSubscriptionId: snapshot.providerSubscriptionId,
          eventType: 'VERIFIED_STATUS', source, occurredAt: snapshot.verifiedAt, receivedAt: Date.now(), payloadHash } })
      let acknowledgement: 'NOT_REQUIRED' | 'ACKNOWLEDGED' | 'RETRY_REQUIRED' = 'NOT_REQUIRED'
      if (adapter instanceof GooglePlayBillingAdapter && result.outcome !== 'STALE') {
        try {
          if (await adapter.acknowledge(snapshot.providerSubscriptionId)) {
            await billing.markGoogleAcknowledged(snapshot.providerSubscriptionId)
            acknowledgement = 'ACKNOWLEDGED'
          }
        } catch (error) {
          if (!(error instanceof StoreProviderError)) throw error
          // Purchase is durable. The native client must retry verify/restore; don't
          // claim success to Google or erase the grant on a transient ack failure.
          acknowledgement = 'RETRY_REQUIRED'
        }
      }
      // Raw purchase tokens/JWS/aliases never leave this operation in its response.
      return { ...result, acknowledgement }
    }
  }
}
