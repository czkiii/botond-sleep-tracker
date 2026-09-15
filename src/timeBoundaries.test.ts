import { afterEach, describe, expect, it } from 'vitest'
import type { SleepSession } from './types'
import { splitDayNight, todaySessions, totalToday } from './utils'

const HOUR = 60 * 60 * 1000
const originalTz = (globalThis as any).process?.env?.TZ

function session(id: string, startTime: string, endTime: string): SleepSession {
  return { id, childId: 'child-1', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime }
}

afterEach(() => {
  if (!(globalThis as any).process?.env) return
  if (originalTz === undefined) delete (globalThis as any).process.env.TZ
  else (globalThis as any).process.env.TZ = originalTz
})

describe('time boundaries', () => {
  it('splits an automatic sleep correctly across midnight', () => {
    ;(globalThis as any).process.env.TZ = 'UTC'
    const result = splitDayNight(session('cross-midnight', '2026-08-26T18:30:00.000Z', '2026-08-27T06:30:00.000Z'))
    expect(result.day).toBe(HOUR)
    expect(result.night).toBe(11 * HOUR)
  })

  it('shows a cross-midnight sleep on both involved calendar days', () => {
    ;(globalThis as any).process.env.TZ = 'UTC'
    const item = session('cross-midnight', '2026-08-26T23:30:00.000Z', '2026-08-27T00:30:00.000Z')
    expect(todaySessions([item], new Date('2026-08-26T12:00:00.000Z'))).toEqual([item])
    expect(todaySessions([item], new Date('2026-08-27T12:00:00.000Z'))).toEqual([item])
  })

  it('uses the 23-hour spring DST day in Europe/Budapest', () => {
    ;(globalThis as any).process.env.TZ = 'Europe/Budapest'
    const item = session('spring-dst', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z')
    expect(totalToday([item], new Date('2026-03-29T21:59:00.000Z'))).toBe(23 * HOUR)
  })

  it('uses the 25-hour autumn DST day in Europe/Budapest', () => {
    ;(globalThis as any).process.env.TZ = 'Europe/Budapest'
    const item = session('autumn-dst', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z')
    expect(totalToday([item], new Date('2026-10-25T22:59:00.000Z'))).toBe(25 * HOUR)
  })
})
