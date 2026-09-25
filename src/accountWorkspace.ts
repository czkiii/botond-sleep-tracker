import { REMOTE_DATA_EVENT, STORAGE_KEY, createDefaultData, loadData } from './storage'

const ACTIVE_WORKSPACE_KEY = 'solemiSleep:activeWorkspace:v1'
const SWITCH_JOURNAL_KEY = 'solemiSleep:workspaceSwitch:v1'
const WORKSPACE_PREFIX = 'solemiSleep:workspaceData:v1:'
const LEGACY_STORAGE_KEY = 'solemiSleep:v3'
const LEGACY_SYNC_KEY = 'solemiSleep:sync:v1'
const DETACHED_FAMILY_KEY = 'solemiSleep:detachedFamily'
const LAST_SYNC_KEY = 'solemiSleep:lastSyncAt'
const LAST_INVITE_KEY = 'solemiSleep:lastInvite'

type Workspace = { kind: 'guest' } | { kind: 'account'; accountId: string }
type WorkspaceSnapshot = {
  diary: string | null
  legacyDiary: string | null
  legacySync: string | null
  detachedFamily: string | null
  lastSyncAt: string | null
}
type SwitchJournal = { target: Workspace }

const guestWorkspace: Workspace = { kind: 'guest' }

function workspaceStorageKey(workspace: Workspace) {
  return `${WORKSPACE_PREFIX}${workspace.kind === 'guest' ? 'guest' : `account:${encodeURIComponent(workspace.accountId)}`}`
}

function parseWorkspace(value: string | null): Workspace | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<Workspace>
    if (parsed.kind === 'guest') return guestWorkspace
    if (parsed.kind === 'account' && typeof parsed.accountId === 'string' && parsed.accountId) {
      return { kind: 'account', accountId: parsed.accountId }
    }
  } catch { /* invalid marker is treated as an unbound legacy workspace */ }
  return null
}

function parseSnapshot(value: string | null): WorkspaceSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceSnapshot>
    const valid = (item: unknown) => item === null || typeof item === 'string'
    if (valid(parsed.diary) && valid(parsed.legacyDiary) && valid(parsed.legacySync)
      && valid(parsed.detachedFamily) && valid(parsed.lastSyncAt)) return parsed as WorkspaceSnapshot
  } catch { /* invalid snapshots are never activated */ }
  return null
}

function currentSnapshot(): WorkspaceSnapshot {
  return {
    diary: localStorage.getItem(STORAGE_KEY),
    legacyDiary: localStorage.getItem(LEGACY_STORAGE_KEY),
    legacySync: localStorage.getItem(LEGACY_SYNC_KEY),
    detachedFamily: localStorage.getItem(DETACHED_FAMILY_KEY),
    lastSyncAt: localStorage.getItem(LAST_SYNC_KEY)
  }
}

function emptySnapshot(): WorkspaceSnapshot {
  return {
    diary: JSON.stringify(createDefaultData(loadData().settings.locale)),
    legacyDiary: null,
    legacySync: null,
    detachedFamily: null,
    lastSyncAt: null
  }
}

function setOrRemove(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key)
  else localStorage.setItem(key, value)
}

function applySnapshot(snapshot: WorkspaceSnapshot) {
  setOrRemove(STORAGE_KEY, snapshot.diary)
  setOrRemove(LEGACY_STORAGE_KEY, snapshot.legacyDiary)
  setOrRemove(LEGACY_SYNC_KEY, snapshot.legacySync)
  setOrRemove(DETACHED_FAMILY_KEY, snapshot.detachedFamily)
  setOrRemove(LAST_SYNC_KEY, snapshot.lastSyncAt)
}

function announceWorkspaceChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REMOTE_DATA_EVENT))
  window.dispatchEvent(new CustomEvent('solemi-sync-state'))
}

function clearTransientFamilyState() {
  try { sessionStorage.removeItem(LAST_INVITE_KEY) } catch { /* session storage is non-critical */ }
}

function activeWorkspace() {
  return parseWorkspace(localStorage.getItem(ACTIVE_WORKSPACE_KEY))
}

function savedSnapshot(workspace: Workspace) {
  return parseSnapshot(localStorage.getItem(workspaceStorageKey(workspace)))
}

function saveSnapshot(workspace: Workspace, snapshot: WorkspaceSnapshot) {
  localStorage.setItem(workspaceStorageKey(workspace), JSON.stringify(snapshot))
}

function sameWorkspace(left: Workspace | null, right: Workspace) {
  return left?.kind === right.kind && (right.kind === 'guest'
    || (left?.kind === 'account' && left.accountId === right.accountId))
}

function switchWorkspace(target: Workspace, snapshot: WorkspaceSnapshot, saveCurrent = true) {
  const current = activeWorkspace()
  if (sameWorkspace(current, target)) return false
  if (current && saveCurrent) saveSnapshot(current, currentSnapshot())
  saveSnapshot(target, snapshot)
  const journal: SwitchJournal = { target }
  localStorage.setItem(SWITCH_JOURNAL_KEY, JSON.stringify(journal))
  applySnapshot(snapshot)
  clearTransientFamilyState()
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(target))
  localStorage.removeItem(SWITCH_JOURNAL_KEY)
  announceWorkspaceChange()
  return true
}

export function recoverAccountWorkspaceSwitch() {
  let raw: string | null
  try { raw = localStorage.getItem(SWITCH_JOURNAL_KEY) } catch { return false }
  if (!raw) return false
  try {
    const journal = JSON.parse(raw) as Partial<SwitchJournal>
    const target = parseWorkspace(JSON.stringify(journal.target))
    const snapshot = target ? savedSnapshot(target) : null
    if (!target || !snapshot) throw new Error('invalid workspace journal')
    applySnapshot(snapshot)
    clearTransientFamilyState()
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(target))
    localStorage.removeItem(SWITCH_JOURNAL_KEY)
    return true
  } catch {
    return false
  }
}

export function accountWorkspaceNeedsGuestChoice(accountId: string) {
  recoverAccountWorkspaceSwitch()
  if (savedSnapshot({ kind: 'account', accountId })) return false
  const current = activeWorkspace()
  if (current?.kind === 'account') return false
  const data = loadData()
  if (data.sessions.length || data.children.length !== 1) return true
  const child = data.children[0]
  return Boolean(child.name.trim() || child.birthDate || child.photoRef)
}

export function activateInteractiveAccountWorkspace(accountId: string, adoptGuestDiary: boolean) {
  recoverAccountWorkspaceSwitch()
  const target: Workspace = { kind: 'account', accountId }
  const existing = savedSnapshot(target)
  const current = activeWorkspace()
  if (sameWorkspace(current, target)) return false
  const outgoing = currentSnapshot()
  if (!current) saveSnapshot(guestWorkspace, outgoing)
  const movingGuestDiary = !existing && adoptGuestDiary && current?.kind !== 'account'
  const targetSnapshot = existing ?? (movingGuestDiary ? outgoing : emptySnapshot())
  const changed = switchWorkspace(target, targetSnapshot)
  if (changed && movingGuestDiary) localStorage.removeItem(workspaceStorageKey(guestWorkspace))
  return changed
}

export function activateRestoredAccountWorkspace(accountId: string) {
  recoverAccountWorkspaceSwitch()
  const target: Workspace = { kind: 'account', accountId }
  const current = activeWorkspace()
  if (sameWorkspace(current, target)) return false
  if (!current) {
    const snapshot = currentSnapshot()
    saveSnapshot(target, snapshot)
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(target))
    return false
  }
  return switchWorkspace(target, savedSnapshot(target) ?? emptySnapshot())
}

export function activateSignedOutWorkspace(deleteAccountData = false) {
  recoverAccountWorkspaceSwitch()
  const current = activeWorkspace()
  if (!current) {
    const snapshot = currentSnapshot()
    saveSnapshot(guestWorkspace, snapshot)
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(guestWorkspace))
    return { changed: false, deletedPhotoRefs: [] as string[] }
  }
  if (current.kind === 'guest') return { changed: false, deletedPhotoRefs: [] as string[] }
  const photoRefs = deleteAccountData
    ? loadData().children.flatMap((child) => child.photoRef ? [child.photoRef] : []) : []
  const guest = savedSnapshot(guestWorkspace) ?? emptySnapshot()
  if (deleteAccountData) localStorage.removeItem(workspaceStorageKey(current))
  const changed = switchWorkspace(guestWorkspace, guest, !deleteAccountData)
  return { changed, deletedPhotoRefs: photoRefs }
}

export function getActiveAccountWorkspaceId() {
  const current = activeWorkspace()
  return current?.kind === 'account' ? current.accountId : null
}
