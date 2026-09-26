import { describe, expect, it } from 'vitest'
import { mergeChildDraft, removeChildProfile } from './childProfiles'
import type { AppData, ChildProfile, SleepSession } from './types'

const at = '2026-08-26T10:00:00.000Z'
const child = (id: string): ChildProfile => ({ id, name: id, birthDate: null, photoRef: null, createdAt: at, updatedAt: at })
const sleep = (id: string, childId: string): SleepSession => ({ id, childId, startTime: at, endTime: '2026-08-26T11:00:00.000Z', note: '', dayNightOverride: null, createdAt: at, updatedAt: at })
const data: AppData = {
  version: 4,
  settings: { locale: 'hu', activeChildId: 'b', longSleepReminderEnabled: false },
  children: [child('a'), child('b')],
  sessions: [sleep('sleep-a', 'a'), sleep('sleep-b', 'b')]
}

describe('removeChildProfile', () => {
  it('removes the profile and all of its sleep data, then selects a remaining child', () => {
    const result = removeChildProfile(data, 'b')
    expect(result?.children.map((item) => item.id)).toEqual(['a'])
    expect(result?.sessions.map((item) => item.id)).toEqual(['sleep-a'])
    expect(result?.settings.activeChildId).toBe('a')
  })

  it('does not allow deleting the final profile', () => {
    expect(removeChildProfile({ ...data, children: [data.children[0]], sessions: [data.sessions[0]], settings: { ...data.settings, activeChildId: 'a' } }, 'a')).toBeNull()
  })
})

describe('child editor during a family update', () => {
  it('keeps the downloaded birthday when the open draft only changed the name', () => {
    const original = child('a')
    const current = { ...original, birthDate: '2025-08-23' }
    expect(mergeChildDraft(current, original, { ...original, name: 'Helyi név' }))
      .toMatchObject({ name: 'Helyi név', birthDate: '2025-08-23' })
  })
  it('does not overwrite a conflicting name downloaded while the editor was open', () => {
    const original = child('a')
    expect(mergeChildDraft({ ...original, name: 'Családi név' }, original, { ...original, name: 'Helyi név' })).toBeNull()
  })
  it('does not restore a child that was deleted while its editor was open', () => {
    expect(mergeChildDraft(undefined, child('a'), { ...child('a'), name: 'Helyi név' })).toBeNull()
  })
})
