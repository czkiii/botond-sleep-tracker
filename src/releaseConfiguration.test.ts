import { describe, expect, it } from 'vitest'
import { assertProductionReleaseConfiguration } from './releaseConfiguration'

const release = {
  VITE_RELEASE_CHANNEL: 'production', VITE_ACCOUNT_AUTH: 'true', VITE_INTERNAL_PREVIEW: 'false',
  VITE_SYNC_API_BASE: 'https://solemi-sleep-sync.czki-adam.workers.dev',
  VITE_ACCOUNT_API_BASE: '/api', VITE_HOSTING_PLATFORM: 'cloudflare-pages', VITE_BASE_PATH: '/'
}

describe('production release build gate', () => {
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
