import type { StoreEnvironment, StoreProvider, SubscriptionProduct } from './billingContract'
import { StoreProviderError } from './storeProviderHttp'

export interface StoreBillingEnv {
  SOLEMI_ENVIRONMENT?: string
  STORE_BILLING_ENABLED?: string
  STORE_ENVIRONMENT?: string
  STORE_PRODUCT_CATALOG?: string
  APPLE_BUNDLE_ID?: string
  APPLE_APP_ID?: string
  APPLE_ISSUER_ID?: string
  APPLE_KEY_ID?: string
  APPLE_PRIVATE_KEY?: string
  GOOGLE_PLAY_PACKAGE_NAME?: string
  GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL?: string
  GOOGLE_PLAY_PRIVATE_KEY?: string
}
export type CatalogEntry = {
  provider: StoreProvider
  productId: string
  product: SubscriptionProduct
  basePlanId?: string
}
export type StoreConfig = { environment: StoreEnvironment; catalog: CatalogEntry[] }
export type AppleConfig = StoreConfig & {
  bundleId: string; appId: number; issuerId: string; keyId: string; privateKey: string
}
export type GoogleConfig = StoreConfig & { packageName: string; email: string; privateKey: string }

export function storeConfig(env: StoreBillingEnv): StoreConfig {
  if (env.STORE_BILLING_ENABLED !== 'true') throw new StoreProviderError('STORE_BILLING_DISABLED', 404)
  if (!['SANDBOX', 'PRODUCTION'].includes(env.STORE_ENVIRONMENT ?? '')
    || (env.SOLEMI_ENVIRONMENT === 'production' && env.STORE_ENVIRONMENT !== 'PRODUCTION')
    || (env.SOLEMI_ENVIRONMENT === 'staging' && env.STORE_ENVIRONMENT !== 'SANDBOX')) fail()
  let catalog: CatalogEntry[]
  try { catalog = JSON.parse(env.STORE_PRODUCT_CATALOG ?? '') } catch { return fail() }
  if (!Array.isArray(catalog) || !catalog.length || catalog.length > 20) fail()
  const keys = new Set<string>()
  for (const item of catalog) {
    if (!item || !['APPLE', 'GOOGLE_PLAY'].includes(item.provider)
      || !['FAMILY', 'FAMILY_PLUS'].includes(item.product)
      || !validId(item.productId)
      || (item.provider === 'GOOGLE_PLAY' ? !validId(item.basePlanId) : item.basePlanId !== undefined)) fail()
    const key = `${item.provider}:${item.productId}:${item.basePlanId ?? ''}`
    if (keys.has(key)) fail()
    keys.add(key)
  }
  return { environment: env.STORE_ENVIRONMENT as StoreEnvironment, catalog }
}
export function appleConfig(env: StoreBillingEnv): AppleConfig {
  const config = storeConfig(env)
  const appId = Number(env.APPLE_APP_ID)
  if (!Number.isSafeInteger(appId) || appId <= 0) fail()
  return { ...config, appId, bundleId: required(env.APPLE_BUNDLE_ID),
    issuerId: required(env.APPLE_ISSUER_ID), keyId: required(env.APPLE_KEY_ID),
    privateKey: required(env.APPLE_PRIVATE_KEY) }
}
export function googleConfig(env: StoreBillingEnv): GoogleConfig {
  return { ...storeConfig(env), packageName: required(env.GOOGLE_PLAY_PACKAGE_NAME),
    email: required(env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL), privateKey: required(env.GOOGLE_PLAY_PRIVATE_KEY) }
}
function validId(value: unknown) { return typeof value === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(value) }
function required(value: string | undefined): string { if (!value?.trim()) fail(); return value! }
function fail(): never { throw new StoreProviderError('STORE_NOT_CONFIGURED', 503) }
