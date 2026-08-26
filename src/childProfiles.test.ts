import { describe, expect, it } from 'vitest'
import { removeChildProfile } from './childProfiles'
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
