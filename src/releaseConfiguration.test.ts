import { describe, expect, it } from 'vitest'
import { assertProductionReleaseConfiguration } from './releaseConfiguration'
import { generateKeyPairSync } from 'node:crypto'
import { loadEnv } from 'vite'

const publicKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' })
const nativeRelease = {
  VITE_NATIVE_APP: 'true', VITE_NATIVE_PLATFORM: 'android', VITE_BASE_PATH: '/',
  VITE_RELEASE_CHANNEL: 'production', VITE_INTERNAL_PREVIEW: 'false', VITE_ENTITLEMENT_TEST_MODE: 'false',
  VITE_ACCOUNT_AUTH: 'true', VITE_ACCOUNT_DELETION: 'true', VITE_NATIVE_AUTH: 'true',
  VITE_NATIVE_APPLE_AUTH: 'false', VITE_NATIVE_BILLING: 'true',
  // Syntax-only fixture, never contacted by these tests.
  VITE_ACCOUNT_API_BASE: 'https://api.solemi-sleep.app', VITE_SYNC_API_BASE: 'https://api.solemi-sleep.app',
  VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK: JSON.stringify(publicKey)
}

const release = {
  VITE_RELEASE_CHANNEL: 'production', VITE_ACCOUNT_AUTH: 'true', VITE_INTERNAL_PREVIEW: 'false',
  VITE_SYNC_API_BASE: 'https://solemi-sleep-sync.czki-adam.workers.dev',
  VITE_ACCOUNT_API_BASE: '/api', VITE_HOSTING_PLATFORM: 'cloudflare-pages', VITE_BASE_PATH: '/'
}

describe('production release build gate', () => {
  it('accepts direct native endpoints without requiring the web Pages proxy', () => {
    expect(() => assertProductionReleaseConfiguration(nativeRelease)).not.toThrow()
    expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, VITE_NATIVE_PLATFORM: 'ios', VITE_NATIVE_APPLE_AUTH: 'true' })).not.toThrow()
  })
  it.each(['VITE_ACCOUNT_AUTH', 'VITE_ACCOUNT_DELETION', 'VITE_NATIVE_AUTH', 'VITE_NATIVE_BILLING'])('rejects a release with %s disabled', key => {
    expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, [key]: 'false' })).toThrow(key)
  })
  it('requires explicit test-mode exclusion and the right Apple sign-in setting', () => {
    for (const key of ['VITE_INTERNAL_PREVIEW', 'VITE_ENTITLEMENT_TEST_MODE']) {
      for (const value of ['true', undefined]) expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, [key]: value })).toThrow(key)
    }
    expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, VITE_NATIVE_PLATFORM: 'ios' })).toThrow(/Apple sign-in/)
    expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, VITE_NATIVE_APPLE_AUTH: 'true' })).toThrow(/Apple sign-in/)
  })
  it.each(['', '/api', 'http://api.solemi-sleep.app', 'https://solemi-sleep-sync-staging.czki-adam.workers.dev',
    'https://solemi-sleep-internal.pages.dev', 'https://localhost', 'https://127.0.0.1', 'https://[::1]',
    'https://api.example.com', 'https://api.solemi-sleep.app/path', 'https://api.solemi-sleep.app?token=x',
    'https://user:password@api.solemi-sleep.app'])('rejects non-release native endpoint %s', url => {
    expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, VITE_ACCOUNT_API_BASE: url })).toThrow(/HTTPS/)
  })
  it('rejects mixed account/sync environments', () => {
    expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, VITE_SYNC_API_BASE: 'https://other.solemi-sleep.app' })).toThrow(/same API/)
  })
  it('requires a public-only offline verification key', () => {
    for (const key of ['', '{}', 'invalid json', JSON.stringify({ ...publicKey, d: 'PRIVATE' }),
      JSON.stringify({ ...publicKey, key_ops: ['sign'] }), JSON.stringify({ ...publicKey, x: 'bad' })]) {
      expect(() => assertProductionReleaseConfiguration({ ...nativeRelease, VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK: key })).toThrow(/public P-256/)
    }
  })
  it.each(['android', 'ios'])('ships an incomplete %s release profile that fails until the real connection is supplied', platform => {
    // Empty envDir override values are intentional; no deployed endpoint is guessed.
    const vars = loadEnv(`native-${platform}-release`, process.cwd(), 'VITE_')
    expect(vars.VITE_NATIVE_PLATFORM).toBe(platform)
    expect(vars.VITE_INTERNAL_PREVIEW).toBe('false')
    expect(() => assertProductionReleaseConfiguration({ ...vars, VITE_ACCOUNT_API_BASE: '', VITE_SYNC_API_BASE: '' })).toThrow(/HTTPS/)
    expect(() => assertProductionReleaseConfiguration({ ...vars,
      VITE_ACCOUNT_API_BASE: nativeRelease.VITE_ACCOUNT_API_BASE, VITE_SYNC_API_BASE: nativeRelease.VITE_SYNC_API_BASE,
      VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK: nativeRelease.VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK })).not.toThrow()
  })
  it('requires explicit native auth and HTTPS root endpoints before enabling billing', () => {
    const native = { VITE_NATIVE_APP: 'true', VITE_BASE_PATH: '/', VITE_ACCOUNT_AUTH: 'true', VITE_NATIVE_AUTH: 'true',
      VITE_ACCOUNT_API_BASE: 'https://api.example', VITE_SYNC_API_BASE: 'https://api.example', VITE_NATIVE_BILLING: 'true' }
    expect(() => assertProductionReleaseConfiguration(native)).not.toThrow()
    expect(() => assertProductionReleaseConfiguration({ ...native, VITE_NATIVE_AUTH: 'false' })).toThrow(/native auth/)
    expect(() => assertProductionReleaseConfiguration({ VITE_NATIVE_AUTH: 'true' })).toThrow(/native build/)
    for (const url of ['http://localhost', 'https://api.example/path', 'https://api.example?secret=x']) {
      expect(() => assertProductionReleaseConfiguration({ ...native, VITE_ACCOUNT_API_BASE: url })).toThrow(/HTTPS endpoints/)
    }
  })
  it('allows an offline native preparation but blocks accidental production and unconfigured purchases', () => {
    const native = { VITE_NATIVE_APP: 'true', VITE_BASE_PATH: '/', VITE_NATIVE_BILLING: 'false', VITE_RELEASE_CHANNEL: 'native-preparation' }
    expect(() => assertProductionReleaseConfiguration(native)).not.toThrow()
    expect(() => assertProductionReleaseConfiguration({ ...native, VITE_RELEASE_CHANNEL: 'production' })).toThrow(/Native production/)
    expect(() => assertProductionReleaseConfiguration({ ...native, VITE_BASE_PATH: '/old/' })).toThrow(/root/)
    expect(() => assertProductionReleaseConfiguration({ ...native, VITE_NATIVE_BILLING: 'true' })).toThrow(/account auth/)
    expect(() => assertProductionReleaseConfiguration({ VITE_NATIVE_BILLING: 'true' })).toThrow(/native build/)
  })
  it('requires the real account and first-party proxy configuration', () => {
    expect(() => assertProductionReleaseConfiguration(release)).not.toThrow()
    expect(() => assertProductionReleaseConfiguration({ ...release, VITE_ACCOUNT_AUTH: undefined }))
      .toThrow(/VITE_ACCOUNT_AUTH/)
    expect(() => assertProductionReleaseConfiguration({ ...release, VITE_HOSTING_PLATFORM: 'github-pages' }))
      .toThrow(/first-party/)
    expect(() => assertProductionReleaseConfiguration({ ...release, VITE_BASE_PATH: '/botond-sleep-tracker/' }))
      .toThrow(/root base path/)
    expect(() => assertProductionReleaseConfiguration({ ...release, VITE_SYNC_API_BASE: 'https://solemi-sleep-sync-staging.example.workers.dev' }))
      .toThrow(/production HTTPS/)
    expect(() => assertProductionReleaseConfiguration({ ...release, VITE_ENTITLEMENT_TEST_MODE: 'true' }))
      .toThrow(/manual plan/)
  })

  it('leaves development and internal builds available', () => {
    expect(() => assertProductionReleaseConfiguration({ VITE_RELEASE_CHANNEL: 'internal' })).not.toThrow()
  })
})
