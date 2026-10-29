import { Buffer } from 'node:buffer'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { AppleBillingAdapter } from './appleBillingAdapter'
import { appleConfig, storeConfig, type StoreBillingEnv } from './storeProviderConfig'
import { StoreProviderError, record, requireStoreValue, storeString, storeTime } from './storeProviderHttp'
import { StoreLifecycleService } from './storeLifecycleService'

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 3500 })
export async function verifyGooglePush(authorization: string | null, env: StoreBillingEnv, keys = googleKeys) {
  if (!env.GOOGLE_PLAY_PUSH_AUDIENCE || !env.GOOGLE_PLAY_PUSH_EMAIL || !env.GOOGLE_PLAY_PUSH_SUBSCRIPTION)
    throw new StoreProviderError('STORE_PUSH_NOT_CONFIGURED', 503)
  if (!authorization || !authorization.startsWith('Bearer ') || authorization.length >= 8192)
    throw new StoreProviderError('STORE_PUSH_UNAUTHORIZED', 401)
  try {
    const { payload } = await jwtVerify(authorization.slice(7), keys, { algorithms: ['RS256'],
      audience: env.GOOGLE_PLAY_PUSH_AUDIENCE, issuer: ['https://accounts.google.com', 'accounts.google.com'],
      requiredClaims: ['iat', 'exp', 'sub', 'email', 'email_verified'], maxTokenAge: '65m' })
    requireStoreValue(payload.email === env.GOOGLE_PLAY_PUSH_EMAIL && payload.email_verified === true)
  } catch { throw new StoreProviderError('STORE_PUSH_UNAUTHORIZED', 401) }
}

export function googleNotice(body: unknown, env: StoreBillingEnv, now = Date.now()) {
  const envelope = record(body)
  requireStoreValue(envelope.subscription === env.GOOGLE_PLAY_PUSH_SUBSCRIPTION, 'STORE_PUSH_SUBSCRIPTION_MISMATCH')
  const message = record(envelope.message), id = storeString(message.messageId)
  const encoded = storeString(message.data, 65536)
  requireStoreValue(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
  let data
  try { data = record(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))) }
  catch { throw new StoreProviderError('STORE_NOTIFICATION_INVALID', 400) }
  requireStoreValue(data.packageName === env.GOOGLE_PLAY_PACKAGE_NAME, 'STORE_APP_MISMATCH')
  const occurredAt = storeTime(Number(data.eventTimeMillis))
  requireStoreValue(occurredAt <= now + 60_000)
  const variants = ['subscriptionNotification', 'voidedPurchaseNotification', 'testNotification', 'oneTimeProductNotification', 'pendingRefundReviewNotification']
    .filter(key => data[key] !== undefined)
  requireStoreValue(variants.length === 1)
  if (variants[0] === 'testNotification' || variants[0] === 'oneTimeProductNotification') return null
  // A pending refund review isn't a completed refund. Refresh only; never revoke on the notification type alone.
  const notice = record(data[variants[0]])
  if (variants[0] === 'voidedPurchaseNotification' && notice.productType !== 1) return null
  return { id, eventType: variants[0], subscriptionId: storeString(notice.purchaseToken, 4096), occurredAt, payload: encoded }
}

export async function storeNotification(request: Request, env: StoreBillingEnv, db: D1Database,
  provider: 'APPLE' | 'GOOGLE_PLAY', readBody: () => Promise<unknown>) {
  if (env.STORE_NOTIFICATIONS_ENABLED !== 'true' || env.STORE_RECONCILIATION_ENABLED !== 'true')
    throw new StoreProviderError('STORE_NOTIFICATIONS_DISABLED', 404)
  storeConfig(env)
  // Google authentication precedes body parsing and all database/provider access.
  if (provider === 'GOOGLE_PLAY') await verifyGooglePush(request.headers.get('Authorization'), env)
  const body = record(await readBody())
  const lifecycle = new StoreLifecycleService(db, env)
  if (provider === 'APPLE') {
    requireStoreValue(Object.keys(body).length === 1)
    const payload = storeString(body.signedPayload, 65536)
    const adapter = new AppleBillingAdapter(appleConfig(env))
    const notice = await adapter.notification(payload)
    if (notice) await lifecycle.notification(provider, { ...notice, payload })
  } else {
    const notice = googleNotice(body, env)
    if (notice) await lifecycle.notification(provider, notice)
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
