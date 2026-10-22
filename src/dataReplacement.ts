import type { AppData } from './types'

export type ReplacementCounts = { added: number; changed: number; removed: number }
export type ReplacementSummary = {
  children: ReplacementCounts
  sessions: ReplacementCounts
  childIds: { added: string[]; changed: string[]; removed: string[] }
  sessionIds: { added: string[]; changed: string[]; removed: string[] }
}

function compareById<T extends { id: string }>(current: T[], next: T[]) {
  const before = new Map(current.map((item) => [item.id, item]))
  const after = new Map(next.map((item) => [item.id, item]))
  const added = next.filter((item) => !before.has(item.id)).map((item) => item.id)
  const removed = current.filter((item) => !after.has(item.id)).map((item) => item.id)
  const changed = next.filter((item) => {
    const previous = before.get(item.id)
    return previous && JSON.stringify(previous) !== JSON.stringify(item)
  }).map((item) => item.id)
  return { added, changed, removed }
}

export function summarizeReplacement(current: AppData, next: AppData): ReplacementSummary {
  const childIds = compareById(current.children, next.children)
  const sessionIds = compareById(current.sessions, next.sessions)
  return {
    children: { added: childIds.added.length, changed: childIds.changed.length, removed: childIds.removed.length },
    sessions: { added: sessionIds.added.length, changed: sessionIds.changed.length, removed: sessionIds.removed.length },
    childIds,
    sessionIds
  }
}

function replacementId(prefix: 'child' | 'sleep') {
  return `${prefix}_restore_${crypto.randomUUID().replaceAll('-', '')}`
}

// IDs are global in the sync database. Records absent from the current family
// may still exist there as tombstones or belong to another family, so a family
// import/restore gives only those incoming records fresh IDs.
export function prepareFamilyReplacement(current: AppData, incoming: AppData): AppData {
  const currentChildIds = new Set(current.children.map((child) => child.id))
  const currentSessions = new Map(current.sessions.map((session) => [session.id, session]))
  const childIds = new Map(incoming.children.map((child) => [child.id,
    currentChildIds.has(child.id) ? child.id : replacementId('child')]))
  const children = incoming.children.map((child) => ({ ...child, id: childIds.get(child.id)! }))
  const sessions = incoming.sessions.map((session) => ({
    ...session,
    // A closed sleep cannot be reopened by PATCH. Import it as a new active
    // record, with the old closed ID removed by the normal replacement plan.
    id: currentSessions.has(session.id) && currentSessions.get(session.id)!.childId === childIds.get(session.childId)
      && !(currentSessions.get(session.id)!.endTime && !session.endTime)
      ? session.id : replacementId('sleep'),
    childId: childIds.get(session.childId)!
  }))
  return {
    ...incoming,
    settings: { ...incoming.settings, activeChildId: childIds.get(incoming.settings.activeChildId) ?? children[0].id },
    children,
    sessions
  }
}
