import { describe, expect, it } from 'vitest'
import { makeOperations, mergeRemote } from './familySync'
import type { AppData, ChildProfile, SleepSession } from './types'

const at = '2026-08-26T10:00:00.000Z'
const child = (id: string): ChildProfile => ({ id, name: id, birthDate: null, photoRef: null, createdAt: at, updatedAt: at })
const sleep = (id: string, childId: string): SleepSession => ({ id, childId, startTime: at, endTime: '2026-08-26T11:00:00.000Z', note: '', dayNightOverride: null, createdAt: at, updatedAt: at })
const previous: AppData = {
  version: 4,
  settings: { locale: 'hu', activeChildId: 'b', longSleepReminderEnabled: false },
  children: [child('a'), child('b')],
  sessions: [sleep('sleep-a', 'a'), sleep('sleep-b', 'b')]
}

describe('Family Sync child deletion', () => {
  it('queues one child delete and lets the server cascade its sleep data', () => {
    const next = { ...previous, children: [previous.children[0]], sessions: [previous.sessions[0]], settings: { ...previous.settings, activeChildId: 'a' } }
    const operations = makeOperations(previous, next)
    expect(operations.map((operation) => `${operation.method} ${operation.path}`)).toEqual(['DELETE /v1/children/b'])
  })

  it('applies a remote child tombstone and removes that child’s local sessions', () => {
    const merged = mergeRemote(previous, [], [{ ...child('b'), deletedAt: at, revision: 3 }])
    expect(merged.children.map((item) => item.id)).toEqual(['a'])
    expect(merged.sessions.map((item) => item.id)).toEqual(['sleep-a'])
    expect(merged.settings.activeChildId).toBe('a')
  })
})
