import { afterEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ native: false, platform: 'web' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native, getPlatform: () => state.platform } }))
vi.mock('./accountAuth', () => ({ ACCOUNT_STATE_EVENT: 'account', accountBillingContext: vi.fn(), accountRequest: vi.fn(), getAccountAccess: vi.fn() }))
import { nativeBillingEnabled, nativeBilling } from './nativeBillingRuntime'
afterEach(() => { vi.unstubAllEnvs(); state.native = false; state.platform = 'web' })
describe('native billing activation boundary', () => {
  it('never invokes web mock purchases even with billing flag set', async () => {
    vi.stubEnv('VITE_NATIVE_APP', 'true'); vi.stubEnv('VITE_NATIVE_BILLING', 'true')
    expect(nativeBillingEnabled()).toBe(false)
    await expect(nativeBilling()).rejects.toMatchObject({ code: 'NATIVE_BILLING_UNAVAILABLE' })
  })
  it('requires native runtime and both explicit flags', () => {
    state.native = true; state.platform = 'android'
    expect(nativeBillingEnabled()).toBe(false)
    vi.stubEnv('VITE_NATIVE_APP', 'true'); expect(nativeBillingEnabled()).toBe(false)
    vi.stubEnv('VITE_NATIVE_BILLING', 'true'); expect(nativeBillingEnabled()).toBe(true)
    state.platform = 'ios'; expect(nativeBillingEnabled()).toBe(true)
    state.platform = 'web'; expect(nativeBillingEnabled()).toBe(false)
  })
})
