import { describe, expect, it, vi } from 'vitest'
import { NativeSession } from './nativeSession'
import type { NativeSessionData, NativeVaultRecord } from './nativeSession'

const data = (token = 'b') => ({ account: { id: 'account', email: null, name: null }, deviceId: 'device',
  accessToken: 'access', accessExpiresAt: 100, expiresAt: 200, refreshToken: token.repeat(64) }) satisfies NativeSessionData
function fixture() {
  let record: NativeVaultRecord | null = { marker: 'container', installationSecret: 'a'.repeat(64), refreshToken: 'c'.repeat(64) }
  let disabled = false
  const deps = { read: vi.fn(async () => record), write: vi.fn(async (value: NativeVaultRecord) => { record = { ...value } }),
    marker: () => 'container', disabled: () => disabled, disable: (value: boolean) => { disabled = value },
    randomSecret: () => 'd'.repeat(64), post: vi.fn(async (_path: string, _body: object) => data()) }
  const session = new NativeSession({ ...deps, post: async <T>(path: string, body: object) => deps.post(path, body) as T })
  return { session, deps, record: () => record, disabled: () => disabled }
}
describe('native protected session', () => {
  it('rotates in protected storage and never returns refresh credentials to account UI', async () => {
    const f = fixture()
    f.deps.post.mockImplementation(async () => { expect(f.record()?.refreshToken).toBeNull(); return data() })
    const access = await f.session.refresh(() => {})
    expect(access).not.toHaveProperty('refreshToken')
    expect(f.record()?.refreshToken).toBe('b'.repeat(64))
    expect(f.deps.post).toHaveBeenCalledWith('/v1/auth/native/refresh', { refreshToken: 'c'.repeat(64) })
  })
  it('requires fresh sign-in after a lost rotation response instead of replaying the old token', async () => {
    const f = fixture(); f.deps.post.mockRejectedValue(new Error('connection lost'))
    await expect(f.session.refresh(() => {})).rejects.toThrow('connection lost')
    await expect(f.session.refresh(() => {})).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    expect(f.deps.post).toHaveBeenCalledTimes(1)
  })
  it('does not call the server if secure removal fails', async () => {
    const f = fixture(); f.deps.write.mockRejectedValue(new Error('locked'))
    await expect(f.session.refresh(() => {})).rejects.toThrow('locked')
    expect(f.deps.post).not.toHaveBeenCalled()
  })
  it('rejects a delayed refresh after account change', async () => {
    const f = fixture(); let current = true
    f.deps.post.mockImplementation(async () => { current = false; return data() })
    await expect(f.session.refresh(() => { if (!current) throw new Error('context changed') })).rejects.toThrow('context changed')
    expect(f.record()?.refreshToken).toBeNull()
  })
  it('blocks persisted credentials when account change occurs during a secure write', async () => {
    const f = fixture(); let current = true
    f.deps.write.mockImplementation(async () => { current = false })
    await expect(f.session.accept(data(), () => { if (!current) throw new Error('context changed') })).rejects.toThrow('context changed')
    expect(f.disabled()).toBe(true)
  })
  it('does not resurrect an old Keychain session after reinstall', async () => {
    const f = fixture(); f.deps.read.mockResolvedValue({ marker: 'previous container', installationSecret: 'a'.repeat(64), refreshToken: 'c'.repeat(64) })
    await expect(f.session.refresh(() => {})).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    expect(f.record()).toEqual({ marker: 'container', installationSecret: 'd'.repeat(64), refreshToken: null })
    expect(f.deps.post).not.toHaveBeenCalled()
  })
  it('invalidates immediately even if secure storage is temporarily unavailable', async () => {
    const f = fixture(); f.deps.write.mockRejectedValue(new Error('locked'))
    const pending = f.session.invalidate(); expect(f.disabled()).toBe(true)
    await expect(pending).rejects.toThrow('locked')
    await expect(f.session.refresh(() => {})).rejects.toMatchObject({ code: 'SESSION_INVALID' })
  })
  it('clears credentials only after successful server logout; failed logout can be retried', async () => {
    const f = fixture(); f.deps.post.mockRejectedValueOnce(new Error('offline'))
    await expect(f.session.logout(() => {})).rejects.toThrow('offline')
    expect(f.record()?.refreshToken).toBe('c'.repeat(64))
    await f.session.logout(() => {})
    expect(f.record()?.refreshToken).toBeNull(); expect(f.disabled()).toBe(true)
  })
})
