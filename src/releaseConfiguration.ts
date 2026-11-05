type ReleaseVariables = Record<string, string | undefined>

function nativeEndpoint(value: string | undefined, production: boolean) {
  let url: URL
  try { url = new URL(value || '') } catch { throw new Error('Native auth and billing require explicit HTTPS endpoints') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Native auth and billing require explicit HTTPS endpoints')
  }
  if (production && (/staging|internal|localhost|example|\.invalid$|\.test$|\.local$|\.localhost$|\.pages\.dev$/i.test(url.hostname)
    || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || url.port)) {
    throw new Error('Native production requires a production HTTPS API endpoint')
  }
  return url.origin
}

function assertNativeProduction(vars: ReleaseVariables) {
  const platform = vars.VITE_NATIVE_PLATFORM
  if (platform !== 'android' && platform !== 'ios') throw new Error('Native production requires an explicit android or ios platform')
  for (const key of ['VITE_ACCOUNT_AUTH', 'VITE_NATIVE_AUTH', 'VITE_NATIVE_BILLING', 'VITE_ACCOUNT_DELETION']) {
    if (vars[key] !== 'true') throw new Error(`Native production requires ${key}=true`)
  }
  for (const key of ['VITE_INTERNAL_PREVIEW', 'VITE_ENTITLEMENT_TEST_MODE']) {
    if (vars[key] !== 'false') throw new Error(`Native production requires ${key}=false`)
  }
  if (vars.VITE_NATIVE_APPLE_AUTH !== (platform === 'ios' ? 'true' : 'false')) {
    throw new Error('Native production requires Apple sign-in on iOS only')
  }
  const account = nativeEndpoint(vars.VITE_ACCOUNT_API_BASE, true)
  if (nativeEndpoint(vars.VITE_SYNC_API_BASE, true) !== account) {
    throw new Error('Native production account and sync must use the same API origin')
  }
  // Only the verification key belongs in a client bundle. The signing key stays on the Worker.
  let key: Record<string, unknown> | null = null
  try { key = JSON.parse(vars.VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK || 'null') } catch { /* report without printing key material */ }
  if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || 'd' in key
    || typeof key.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key.x)
    || typeof key.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key.y)
    || (key.alg !== undefined && key.alg !== 'ES256')
    || (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || key.key_ops.length !== 1 || key.key_ops[0] !== 'verify'))) {
    throw new Error('Native production requires a public P-256 offline entitlement verification key')
  }
}

// Only a deliberately selected release build is subject to this gate. Local
// and internal builds remain available while the production host is prepared.
export function assertProductionReleaseConfiguration(vars: ReleaseVariables) {
  if (vars.VITE_NATIVE_APP === 'true') {
    if (vars.VITE_BASE_PATH !== '/') throw new Error('Native assets require the root base path')
    if (vars.VITE_RELEASE_CHANNEL === 'production') {
      assertNativeProduction(vars)
      return // Native bearer sessions connect directly; the web cookie proxy is not used.
    }
    if (vars.VITE_NATIVE_BILLING === 'true' || vars.VITE_NATIVE_AUTH === 'true') {
      if (vars.VITE_ACCOUNT_AUTH !== 'true') throw new Error('Native billing requires account auth')
      if (vars.VITE_NATIVE_BILLING === 'true' && vars.VITE_NATIVE_AUTH !== 'true') throw new Error('Native billing requires native auth')
      for (const key of ['VITE_ACCOUNT_API_BASE', 'VITE_SYNC_API_BASE']) {
        nativeEndpoint(vars[key], false)
      }
    }
  } else if (vars.VITE_NATIVE_BILLING === 'true' || vars.VITE_NATIVE_AUTH === 'true') throw new Error('Native auth and store billing require a native build')
  if (vars.VITE_RELEASE_CHANNEL !== 'production') return
  const required = ['VITE_ACCOUNT_AUTH', 'VITE_INTERNAL_PREVIEW', 'VITE_SYNC_API_BASE',
    'VITE_ACCOUNT_API_BASE', 'VITE_HOSTING_PLATFORM', 'VITE_BASE_PATH'] as const
  for (const name of required) {
    if (!vars[name]) throw new Error(`Production release configuration is missing ${name}`)
  }
  if (vars.VITE_ACCOUNT_AUTH !== 'true' || vars.VITE_INTERNAL_PREVIEW !== 'false') {
    throw new Error('Production release requires account auth and no internal preview')
  }
  if (vars.VITE_HOSTING_PLATFORM !== 'cloudflare-pages' || vars.VITE_ACCOUNT_API_BASE !== '/api') {
    throw new Error('Production release requires a first-party Cloudflare Pages account proxy')
  }
  if (vars.VITE_BASE_PATH !== '/') {
    throw new Error('Production release requires the root base path')
  }
  const syncUrl = new URL(vars.VITE_SYNC_API_BASE!)
  if (syncUrl.protocol !== 'https:' || syncUrl.username || syncUrl.password
    || syncUrl.pathname !== '/' || syncUrl.search || syncUrl.hash
    || /staging|internal|localhost|127\.0\.0\.1/i.test(syncUrl.hostname)) {
    throw new Error('Production release requires a production HTTPS sync endpoint')
  }
  if (vars.VITE_ENTITLEMENT_TEST_MODE === 'true') {
    throw new Error('Production release cannot include manual plan testing')
  }
}
