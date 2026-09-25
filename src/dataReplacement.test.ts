import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareFamilyReplacement, summarizeReplacement } from './dataReplacement'
import type { AppData, ChildProfile, SleepSession } from './types'

const at = '2026-09-20T10:00:00.000Z'
const child = (id: string, name = id): ChildProfile => ({ id, name, birthDate: null, photoRef: null, createdAt: at, updatedAt: at })
const sleep = (id: string, childId: string, note = ''): SleepSession => ({ id, childId, startTime: at,
  endTime: '2026-09-20T11:00:00.000Z', note, dayNightOverride: null, createdAt: at, updatedAt: at })
const data = (children: ChildProfile[], sessions: SleepSession[]): AppData => ({ version: 4,
  settings: { locale: 'hu', activeChildId: children[0].id, longSleepReminderEnabled: false }, children, sessions })

describe('data replacement planning', () => {
  afterEach(() => vi.restoreAllMocks())
  it('reports ID-based additions, changes and removals before an import', () => {
    const current = data([child('kept'), child('removed')], [sleep('changed', 'kept'), sleep('removed-sleep', 'removed')])
    const next = data([child('kept', 'Új név'), child('added')], [sleep('changed', 'kept', 'Új jegyzet'), sleep('added-sleep', 'added')])

    expect(summarizeReplacement(current, next)).toEqual({
      children: { added: 1, changed: 1, removed: 1 },
      sessions: { added: 1, changed: 1, removed: 1 },
      childIds: { added: ['added'], changed: ['kept'], removed: ['removed'] },
      sessionIds: { added: ['added-sleep'], changed: ['changed'], removed: ['removed-sleep'] }
    })
  })

  it('keeps existing family IDs and rekeys incoming records that may collide with tombstones', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    const current = data([child('kept')], [sleep('kept-sleep', 'kept')])
    const incoming = data([child('kept', 'Friss'), child('foreign')], [
      sleep('kept-sleep', 'kept', 'Friss'), sleep('foreign-sleep', 'foreign')
    ])

    const prepared = prepareFamilyReplacement(current, incoming)

    expect(prepared.children.map((item) => item.id)).toEqual(['kept', 'child_restore_11111111111141118111111111111111'])
    expect(prepared.sessions.map((item) => item.id)).toEqual(['kept-sleep', 'sleep_restore_22222222222242228222222222222222'])
    expect(prepared.sessions[1].childId).toBe(prepared.children[1].id)
  })
})
