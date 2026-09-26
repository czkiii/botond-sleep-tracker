import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, createDefaultData } from './storage'
import { API_TIMEOUT_MS } from './apiTransport'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const workspaceKey = 'solemiSleep:activeWorkspace:v1'
const accountSnapshotKey = 'solemiSleep:workspaceData:v1:account:account-a'
const accessKey = 'solemiSleep:accountAccess'
let storage: MemoryStorage
let session: MemoryStorage
let raw: string
let fetchMock: ReturnType<typeof vi.fn>

function validAccess() {
  return { account: { id: 'account-a', email: 'test@example.com', name: 'Test' },
    deviceId: 'test-device', accessToken: 'fixture-token', accessExpiresAt: Date.now() + 60_000,
    expiresAt: Date.now() + 120_000 }
}

beforeEach(() => {
  vi.resetModules()
  storage = new MemoryStorage()
  session = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('navigator', { onLine: true, language: 'hu-HU' })
  vi.stubGlobal('window', new EventTarget())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const diary = createDefaultData('hu')
  diary.children[0].name = 'Account diary'
  const at = '2026-09-26T08:00:00.000Z'
  diary.sessions.push({ id: 'active', childId: diary.children[0].id, startTime: at, endTime: null,
    note: 'Offline note', dayNightOverride: 'night', createdAt: at, updatedAt: at })
  raw = JSON.stringify({ ...diary, __solemiLocal: { familySyncV1: {
    connection: { familyId: 'family-a', familyName: 'Fixture', deviceId: 'device-a', deviceToken: 'fixture', revision: 2 },
    pending: [{ id: 'pending-a', method: 'POST', path: '/v1/sessions/start', sessionId: 'active',
      body: { operationId: 'mutation-a', baseRevision: 2, sessionId: 'active' } }],
    conflicts: [], missingSessions: []
  } } })
  storage.setItem(STORAGE_KEY, raw)
  storage.setItem(workspaceKey, JSON.stringify({ kind: 'account', accountId: 'account-a' }))
})

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules() })

function expectAccountDiaryUnchanged() {
  expect(storage.getItem(STORAGE_KEY)).toBe(raw)
  expect(JSON.parse(storage.getItem(workspaceKey)!)).toEqual({ kind: 'account', accountId: 'account-a' })
  expect(storage.getItem(accountSnapshotKey)).toBeNull()
}

describe('account restoration after closing/reopening the PWA', () => {
  it('opens the existing account diary offline with no tab session and retries when online', async () => {
    const { restoreAccount } = await import('./accountAuth')
    vi.stubGlobal('navigator', { onLine: false })
    expect(await restoreAccount()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expectAccountDiaryUnchanged()

    vi.stubGlobal('navigator', { onLine: true })
    fetchMock.mockResolvedValue(Response.json({ ok: true, data: validAccess() }))
    expect(await restoreAccount()).toMatchObject({ id: 'account-a' })
    expectAccountDiaryUnchanged()
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/auth/refresh')
  })

  it.each(['network', 'bad-json', 'server-error'])('keeps the visible diary/outbox on %s, without caching logout', async (failure) => {
    const { restoreAccount } = await import('./accountAuth')
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    else if (failure === 'bad-json') fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 502 }))
    else fetchMock.mockResolvedValueOnce(Response.json({ ok: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 }))
    expect(await restoreAccount()).toBeNull()
    expectAccountDiaryUnchanged()

    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, data: validAccess() }))
    expect(await restoreAccount()).toMatchObject({ id: 'account-a' })
    expectAccountDiaryUnchanged()
  })

  it('keeps the diary after a refresh timeout', async () => {
    vi.useFakeTimers()
    const { restoreAccount } = await import('./accountAuth')
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const restoring = restoreAccount()
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS)
    expect(await restoring).toBeNull()
    expectAccountDiaryUnchanged()
  })

  it('parks offline edits with their original account when a different account is restored online', async () => {
    const { restoreAccount } = await import('./accountAuth')
    vi.stubGlobal('navigator', { onLine: false })
    await restoreAccount()
    expectAccountDiaryUnchanged()
    vi.stubGlobal('navigator', { onLine: true })
    const access = validAccess()
    access.account.id = 'account-b'
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, data: access }))
    expect(await restoreAccount()).toMatchObject({ id: 'account-b' })
    expect(JSON.parse(storage.getItem(accountSnapshotKey)!).diary).toBe(raw)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions).toEqual([])
    expect(JSON.parse(storage.getItem(workspaceKey)!)).toEqual({ kind: 'account', accountId: 'account-b' })
  })

  it('preserves a tab token on a transient /me failure without claiming authenticated access', async () => {
    const { restoreAccount, ACCOUNT_STATE_EVENT, ACCOUNT_ACCESS_EVENT } = await import('./accountAuth')
    session.setItem(accessKey, JSON.stringify(validAccess()))
    const savedAccess = session.getItem(accessKey)
    const accountEvents: unknown[] = []
    const accessEvents: unknown[] = []
    window.addEventListener(ACCOUNT_STATE_EVENT, (event) => accountEvents.push((event as CustomEvent).detail.account))
    window.addEventListener(ACCOUNT_ACCESS_EVENT, (event) => accessEvents.push((event as CustomEvent).detail.access))
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await restoreAccount()).toBeNull()
    expectAccountDiaryUnchanged()
    expect(session.getItem(accessKey)).toBe(savedAccess)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/auth/me')
    expect(accountEvents).toEqual([null])
    expect(accessEvents).toEqual([null])
  })

  it.each(['SESSION_INVALID', 'REFRESH_REUSED'])('still signs out on a definitive 401 %s while retaining the account backup', async (code) => {
    const { restoreAccount } = await import('./accountAuth')
    fetchMock.mockResolvedValue(Response.json({ ok: false, error: { code } }, { status: 401 }))
    expect(await restoreAccount()).toBeNull()
    expect(JSON.parse(storage.getItem(workspaceKey)!)).toEqual({ kind: 'guest' })
    expect(JSON.parse(storage.getItem(accountSnapshotKey)!).diary).toBe(raw)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions).toEqual([])
  })

  it('tries refresh after a rejected /me token and keeps the diary if refresh cannot reach the server', async () => {
    const { restoreAccount } = await import('./accountAuth')
    session.setItem(accessKey, JSON.stringify(validAccess()))
    fetchMock.mockResolvedValueOnce(Response.json({ ok: false, error: { code: 'SESSION_INVALID' } }, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await restoreAccount()).toBeNull()
    expectAccountDiaryUnchanged()
    expect(session.getItem(accessKey)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
