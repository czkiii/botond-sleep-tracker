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
  failOnRemoval = ''
  override setItem(key: string, value: string) {
    if (this.failOn && key.includes(this.failOn)) throw new Error('quota')
    super.setItem(key, value)
  }
  override removeItem(key: string) {
    if (this.failOnRemoval && key.includes(this.failOnRemoval)) throw new Error('interrupted removal')
    super.removeItem(key)
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

  it('keeps a recoverable copy if deleting the current account is interrupted before changing the visible diary', () => {
    const storage = new FailingStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } })
    const original = diary('Account A', [{ id: 'pending-a' }])
    storage.setItem(STORAGE_KEY, JSON.stringify(original))
    activateRestoredAccountWorkspace('account-a')
    storage.failOn = 'activeWorkspace:v1'

    expect(() => activateSignedOutWorkspace(true)).toThrow('quota')
    expect(getActiveAccountWorkspaceId()).toBe('account-a')
    expect(JSON.parse(storage.getItem('solemiSleep:workspaceData:v1:account:account-a')!).diary).toBe(JSON.stringify(original))
    storage.failOn = ''
    expect(recoverAccountWorkspaceSwitch()).toBe(true)
    expect(getActiveAccountWorkspaceId()).toBeNull()
    expect(storage.getItem('solemiSleep:workspaceData:v1:account:account-a')).toBeNull()
    expect(loadData().children[0].name).toBe('')
  })

  it('keeps the account visible if the guest snapshot cannot be saved before a local deletion', () => {
    const storage = new FailingStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } })
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Account A')))
    activateRestoredAccountWorkspace('account-a')
    storage.failOn = 'workspaceData:v1:guest'

    expect(() => activateSignedOutWorkspace(true)).toThrow('quota')
    expect(getActiveAccountWorkspaceId()).toBe('account-a')
    expect(loadData().children[0].name).toBe('Account A')
    expect(storage.getItem('solemiSleep:workspaceData:v1:account:account-a')).not.toBeNull()
    expect(storage.getItem('solemiSleep:workspaceSwitch:v1')).toBeNull()
  })

  it('rejects a damaged recovery journal that would delete an unrelated account', () => {
    const storage = setup()
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Account A')))
    activateRestoredAccountWorkspace('account-a')
    const accountSnapshot = JSON.stringify({ diary: JSON.stringify(diary('Account B')),
      legacyDiary: null, legacySync: null, detachedFamily: null, lastSyncAt: null })
    storage.setItem('solemiSleep:workspaceData:v1:account:account-b', accountSnapshot)
    storage.setItem('solemiSleep:workspaceSwitch:v1', JSON.stringify({
      target: { kind: 'account', accountId: 'account-b' },
      removeAfter: { kind: 'account', accountId: 'account-a' }
    }))

    expect(recoverAccountWorkspaceSwitch()).toBe(false)
    expect(getActiveAccountWorkspaceId()).toBe('account-a')
    expect(loadData().children[0].name).toBe('Account A')
    expect(storage.getItem('solemiSleep:workspaceData:v1:account:account-b')).toBe(accountSnapshot)
  })

  it('keeps a photo that another account diary still references when deleting the first account locally', () => {
    const storage = setup()
    const first = diary('Account A')
    first.children[0].photoRef = 'shared-local-photo'
    storage.setItem(STORAGE_KEY, JSON.stringify(first))
    activateRestoredAccountWorkspace('account-a')
    activateSignedOutWorkspace()
    activateInteractiveAccountWorkspace('account-b', false)
    const second = diary('Account B')
    second.children[0].photoRef = 'shared-local-photo'
    storage.setItem(STORAGE_KEY, JSON.stringify(second))
    activateSignedOutWorkspace()
    activateInteractiveAccountWorkspace('account-a', false)

    expect(activateSignedOutWorkspace(true).deletedPhotoRefs).toEqual([])
    activateInteractiveAccountWorkspace('account-b', false)
    expect(loadData().children[0].photoRef).toBe('shared-local-photo')
  })

  it('finishes local account deletion after a crash between switching and removing the account snapshot', () => {
    const storage = new FailingStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } })
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Account A')))
    activateRestoredAccountWorkspace('account-a')
    storage.failOnRemoval = 'workspaceData:v1:account:account-a'

    expect(() => activateSignedOutWorkspace(true)).toThrow('interrupted removal')
    expect(getActiveAccountWorkspaceId()).toBeNull()
    expect(storage.getItem('solemiSleep:workspaceData:v1:account:account-a')).not.toBeNull()
    storage.failOnRemoval = ''
    expect(recoverAccountWorkspaceSwitch()).toBe(true)
    expect(storage.getItem('solemiSleep:workspaceData:v1:account:account-a')).toBeNull()
    expect(storage.getItem('solemiSleep:workspaceSwitch:v1')).toBeNull()
    expect(loadData().children[0].name).toBe('')
  })

  it('does not show a guest diary again after adopting it across an interrupted switch', () => {
    const storage = new FailingStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } })
    storage.setItem(STORAGE_KEY, JSON.stringify(diary('Guest child')))
    activateSignedOutWorkspace()
    storage.failOnRemoval = 'workspaceData:v1:guest'

    expect(() => activateInteractiveAccountWorkspace('account-a', true)).toThrow('interrupted removal')
    expect(loadData().children[0].name).toBe('Guest child')
    storage.failOnRemoval = ''
    expect(recoverAccountWorkspaceSwitch()).toBe(true)
    expect(storage.getItem('solemiSleep:workspaceData:v1:guest')).toBeNull()
    activateSignedOutWorkspace()
    expect(loadData().children[0].name).toBe('')
  })
})
