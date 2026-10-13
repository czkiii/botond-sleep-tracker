import { REMOTE_DATA_EVENT, STORAGE_KEY, createDefaultData, loadData } from './storage'

const ACTIVE_WORKSPACE_KEY = 'solemiSleep:activeWorkspace:v1'
const SWITCH_JOURNAL_KEY = 'solemiSleep:workspaceSwitch:v1'
const WORKSPACE_PREFIX = 'solemiSleep:workspaceData:v1:'
const LEGACY_STORAGE_KEY = 'solemiSleep:v3'
const LEGACY_SYNC_KEY = 'solemiSleep:sync:v1'
const DETACHED_FAMILY_KEY = 'solemiSleep:detachedFamily'
const LAST_SYNC_KEY = 'solemiSleep:lastSyncAt'
const LAST_INVITE_KEY = 'solemiSleep:lastInvite'
const PHOTO_ERASURE_KEY = 'solemiSleep:pendingPhotoErasure:v1'

function queuePhotoErasure(refs: string[]) {
  if (!refs.length) return
  const previous: unknown = JSON.parse(localStorage.getItem(PHOTO_ERASURE_KEY) || '[]')
  if (!Array.isArray(previous) || previous.some(ref => typeof ref !== 'string')) throw new Error('PHOTO_ERASURE_QUEUE_INVALID')
  localStorage.setItem(PHOTO_ERASURE_KEY, JSON.stringify([...new Set([...previous, ...refs])]))
}

export async function flushPhotoErasure(removePhoto: (ref: string) => Promise<void>) {
  const queued: unknown = JSON.parse(localStorage.getItem(PHOTO_ERASURE_KEY) || '[]')
  if (!Array.isArray(queued) || queued.some(ref => typeof ref !== 'string')) throw new Error('PHOTO_ERASURE_QUEUE_INVALID')
  if (!queued.length) return
  const retained = photoRefsInRetainedDiaries()
  if (!retained) throw new Error('PHOTO_REFERENCES_UNAVAILABLE')
  for (const ref of queued as string[]) {
    if (!retained.has(ref)) await removePhoto(ref)
    // Persist progress after each deletion; a failed IndexedDB write remains retryable.
    const current: string[] = JSON.parse(localStorage.getItem(PHOTO_ERASURE_KEY) || '[]')
    localStorage.setItem(PHOTO_ERASURE_KEY, JSON.stringify(current.filter(value => value !== ref)))
  }
  if (localStorage.getItem(PHOTO_ERASURE_KEY) === '[]') localStorage.removeItem(PHOTO_ERASURE_KEY)
}

type Workspace = { kind: 'guest' } | { kind: 'account'; accountId: string }
type WorkspaceSnapshot = {
  diary: string | null
  legacyDiary: string | null
  legacySync: string | null
  detachedFamily: string | null
  lastSyncAt: string | null
}
type SwitchJournal = { target: Workspace; removeAfter?: Workspace }

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

function photoRefsInRetainedDiaries(): Set<string> | null {
  try {
    const diaries = [localStorage.getItem(STORAGE_KEY)]
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(WORKSPACE_PREFIX)) continue
      const snapshot = parseSnapshot(localStorage.getItem(key))
      if (!snapshot) return null
      diaries.push(snapshot.diary)
    }
    const refs = new Set<string>()
    for (const diary of diaries) {
      if (!diary) continue
      const data = JSON.parse(diary) as { children?: Array<{ photoRef?: unknown }>;
        __solemiLocal?: { safetyBackupV1?: { data?: { children?: Array<{ photoRef?: unknown }> } } } }
      if (!Array.isArray(data.children)) return null
      for (const child of [...data.children, ...(data.__solemiLocal?.safetyBackupV1?.data?.children ?? [])]) {
        if (typeof child.photoRef === 'string') refs.add(child.photoRef)
      }
    }
    return refs
  } catch { return null }
}

function saveSnapshot(workspace: Workspace, snapshot: WorkspaceSnapshot) {
  localStorage.setItem(workspaceStorageKey(workspace), JSON.stringify(snapshot))
}

function sameWorkspace(left: Workspace | null, right: Workspace) {
  return left?.kind === right.kind && (right.kind === 'guest'
    || (left?.kind === 'account' && left.accountId === right.accountId))
}

function switchWorkspace(target: Workspace, snapshot: WorkspaceSnapshot, removeAfter?: Workspace) {
  const current = activeWorkspace()
  if (sameWorkspace(current, target)) return false
  if (current) saveSnapshot(current, currentSnapshot())
  saveSnapshot(target, snapshot)
  const journal: SwitchJournal = { target, removeAfter }
  localStorage.setItem(SWITCH_JOURNAL_KEY, JSON.stringify(journal))
  applySnapshot(snapshot)
  clearTransientFamilyState()
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(target))
  if (removeAfter) localStorage.removeItem(workspaceStorageKey(removeAfter))
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
    const removeAfter = journal.removeAfter === undefined ? null : parseWorkspace(JSON.stringify(journal.removeAfter))
    const snapshot = target ? savedSnapshot(target) : null
    const validRemoval = removeAfter && target
      && ((removeAfter.kind === 'account' && target.kind === 'guest')
        || (removeAfter.kind === 'guest' && target.kind === 'account'))
    if (!target || !snapshot || (journal.removeAfter !== undefined && !validRemoval)) {
      throw new Error('invalid workspace journal')
    }
    applySnapshot(snapshot)
    clearTransientFamilyState()
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(target))
    if (removeAfter) localStorage.removeItem(workspaceStorageKey(removeAfter))
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
  return switchWorkspace(target, targetSnapshot, movingGuestDiary ? guestWorkspace : undefined)
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
  const photoRefs = deleteAccountData ? snapshotPhotoRefs(currentSnapshot()) : []
  queuePhotoErasure(photoRefs)
  const guest = savedSnapshot(guestWorkspace) ?? emptySnapshot()
  const changed = switchWorkspace(guestWorkspace, guest, deleteAccountData ? current : undefined)
  const retainedRefs = deleteAccountData ? photoRefsInRetainedDiaries() : null
  return { changed, deletedPhotoRefs: retainedRefs
    ? photoRefs.filter((ref) => !retainedRefs.has(ref)) : [] }
}

function snapshotPhotoRefs(snapshot: WorkspaceSnapshot | null) {
  if (!snapshot?.diary) return [] as string[]
  const data = JSON.parse(snapshot.diary) as { children?: Array<{ photoRef?: string }>; __solemiLocal?: { safetyBackupV1?: { data?: { children?: Array<{ photoRef?: string }> } } } }
  return [...new Set([...(data.children ?? []), ...(data.__solemiLocal?.safetyBackupV1?.data?.children ?? [])]
    .flatMap(child => typeof child.photoRef === 'string' ? [child.photoRef] : []))]
}

export function removeAccountWorkspace(accountId: string) {
  recoverAccountWorkspaceSwitch()
  if (getActiveAccountWorkspaceId() === accountId) return activateSignedOutWorkspace(true).deletedPhotoRefs
  const target: Workspace = { kind: 'account', accountId }
  const refs = snapshotPhotoRefs(savedSnapshot(target))
  queuePhotoErasure(refs)
  localStorage.removeItem(workspaceStorageKey(target))
  const retained = photoRefsInRetainedDiaries()
  return retained ? refs.filter(ref => !retained.has(ref)) : []
}

export function getActiveAccountWorkspaceId() {
  const current = activeWorkspace()
  return current?.kind === 'account' ? current.accountId : null
}
