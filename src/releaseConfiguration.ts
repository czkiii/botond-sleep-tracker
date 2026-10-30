type ReleaseVariables = Record<string, string | undefined>

// Only a deliberately selected release build is subject to this gate. Local
// and internal builds remain available while the production host is prepared.
export function assertProductionReleaseConfiguration(vars: ReleaseVariables) {
  if (vars.VITE_NATIVE_APP === 'true') {
    if (vars.VITE_BASE_PATH !== '/') throw new Error('Native assets require the root base path')
    // Native sign-in/session transport and store credentials are a separate release
    // prerequisite. Do not accidentally distribute this preparation profile.
    if (vars.VITE_RELEASE_CHANNEL === 'production') throw new Error('Native production release is not configured yet')
    if (vars.VITE_NATIVE_BILLING === 'true') {
      if (vars.VITE_ACCOUNT_AUTH !== 'true') throw new Error('Native billing requires account auth')
      for (const key of ['VITE_ACCOUNT_API_BASE', 'VITE_SYNC_API_BASE']) {
        const url = new URL(vars[key] || '')
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
          throw new Error('Native billing requires explicit HTTPS endpoints')
        }
      }
    }
  } else if (vars.VITE_NATIVE_BILLING === 'true') throw new Error('Store billing requires a native build')
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
