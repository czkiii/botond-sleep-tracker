import { afterEach, describe, expect, it } from 'vitest'
import { activateInteractiveAccountWorkspace, activateRestoredAccountWorkspace, activateSignedOutWorkspace, accountWorkspaceNeedsGuestChoice, getActiveAccountWorkspaceId, recoverAccountWorkspaceSwitch } from './accountWorkspace'
import { STORAGE_KEY, createDefaultData, loadData } from './storage'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

class FailingStorage extends MemoryStorage {
  failOn = ''
  override setItem(key: string, value: string) {
    if (this.failOn && key.includes(this.failOn)) throw new Error('quota')
    super.setItem(key, value)
  }
}

const original = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  window: Object.getOwnPropertyDescriptor(globalThis, 'window')
}

function restore(name: keyof typeof original) {
  const descriptor = original[name]
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else Reflect.deleteProperty(globalThis, name)
}

function setup() {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'hu-HU' } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } })
  return storage
}

function diary(name: string, pending: unknown[] = []) {
  const data = createDefaultData('hu')
  data.children[0].name = name
  return { ...data, __solemiLocal: { familySyncV1: {
    connection: { familyId: `family-${name}`, familyName: name, deviceId: `device-${name}`, deviceToken: `token-${name}`, revision: 1 },
    pending, conflicts: [], missingSessions: []
  } } }
}

afterEach(() => {
  restore('localStorage')
  restore('navigator')
  restore('window')
})

describe('account-bound local workspaces', () => {
  it('binds an existing authenticated installation to its restored account without replacing data', () => {
    const storage = setup()
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Anna')))

    expect(activateRestoredAccountWorkspace('account-a')).toBe(false)
    expect(getActiveAccountWorkspaceId()).toBe('account-a')
    expect(loadData().children[0].name).toBe('Anna')
  })

  it('keeps a guest diary separate when the user declines to attach it', () => {
    const storage = setup()
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Guest child')))
    activateSignedOutWorkspace()

    expect(accountWorkspaceNeedsGuestChoice('account-a')).toBe(true)
    expect(activateInteractiveAccountWorkspace('account-a', false)).toBe(true)
    expect(loadData().children[0].name).toBe('')

    activateSignedOutWorkspace()
    expect(loadData().children[0].name).toBe('Guest child')
  })

  it('attaches a guest diary only after the explicit positive choice', () => {
    const storage = setup()
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Guest child')))
    activateSignedOutWorkspace()

    activateInteractiveAccountWorkspace('account-a', true)

    expect(getActiveAccountWorkspaceId()).toBe('account-a')
    expect(loadData().children[0].name).toBe('Guest child')
    activateSignedOutWorkspace()
    expect(loadData().children[0].name).toBe('')
    activateInteractiveAccountWorkspace('account-a', false)
    expect(loadData().children[0].name).toBe('Guest child')
  })

  it('keeps account diaries and pending family changes isolated across account switches', () => {
    const storage = setup()
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Account A', [{ id: 'pending-a' }])))
    activateRestoredAccountWorkspace('account-a')
    activateSignedOutWorkspace()
    activateInteractiveAccountWorkspace('account-b', false)
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Account B')))

    activateSignedOutWorkspace()
    activateInteractiveAccountWorkspace('account-a', false)

    expect(loadData().children[0].name).toBe('Account A')
    const envelope = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(envelope.__solemiLocal.familySyncV1.pending).toEqual([{ id: 'pending-a' }])
  })

  it('can remove one account workspace without deleting the separate guest diary', () => {
    const storage = setup()
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Guest child')))
    activateSignedOutWorkspace()
    activateInteractiveAccountWorkspace('account-a', false)
    const accountDiary = diary('Account child')
    accountDiary.children[0].photoRef = 'photo-account-child'
    storage.setItem(STORAGE_KEY, JSON.stringify(accountDiary))

    const result = activateSignedOutWorkspace(true)

    expect(result.deletedPhotoRefs).toEqual(['photo-account-child'])
    expect(loadData().children[0].name).toBe('Guest child')
    activateInteractiveAccountWorkspace('account-a', false)
    expect(loadData().children[0].name).toBe('')
  })

  it('does not replace the visible diary when the target workspace cannot be persisted', () => {
    const storage = new FailingStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } })
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Guest child')))
    activateSignedOutWorkspace()
    storage.failOn = 'account:account-a'

    expect(() => activateInteractiveAccountWorkspace('account-a', false)).toThrow('quota')
    expect(getActiveAccountWorkspaceId()).toBeNull()
    expect(loadData().children[0].name).toBe('Guest child')
  })

  it('finishes an interrupted switch from the durable target snapshot', () => {
    const storage = setup()
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Old visible diary')))
    storage.setItem('solemiSleep:workspaceData:v1:account:account-a', JSON.stringify({
      diary: JSON.stringify(diary('Recovered account diary')),
      legacyDiary: null, legacySync: null, detachedFamily: null, lastSyncAt: null
    }))
    storage.setItem('solemiSleep:workspaceSwitch:v1', JSON.stringify({
      target: { kind: 'account', accountId: 'account-a' }
    }))

    expect(recoverAccountWorkspaceSwitch()).toBe(true)
    expect(getActiveAccountWorkspaceId()).toBe('account-a')
    expect(loadData().children[0].name).toBe('Recovered account diary')
    expect(storage.getItem('solemiSleep:workspaceSwitch:v1')).toBeNull()
  })
})
