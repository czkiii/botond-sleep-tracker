import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerPwa } from './pwaRegistration'

afterEach(() => vi.restoreAllMocks())

describe('PWA registration without interrupting the diary', () => {
  it.each(['/', '/botond-sleep-tracker/'])('registers within %s without activating a waiting update', async (base) => {
    const postMessage = vi.fn()
    const update = vi.fn()
    const register = vi.fn().mockResolvedValue({ waiting: { postMessage }, update })
    await registerPwa(base, { register })
    expect(register).toHaveBeenCalledWith(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
    expect(postMessage).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('allows startup without service worker support', async () => {
    await expect(registerPwa('/')).resolves.toBeUndefined()
  })

  it('does not reject diary startup when registration fails offline', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(registerPwa('/', { register: vi.fn().mockRejectedValue(new Error('offline')) })).resolves.toBeUndefined()
  })
})
