import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SleepSession } from './types'
import { formatDuration, getDataQualityReport, todaySessions, totalToday } from './utils'
import { buildSleepDaySource } from './sleepDevelopment'

const HOUR = 3600000, MINUTE = 60000
const env = (globalThis as any).process.env, originalZone = env.TZ
beforeEach(() => { env.TZ = 'Europe/Budapest' })
afterEach(() => { if (originalZone === undefined) delete env.TZ; else env.TZ = originalZone })
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime()
function sleep(id: string, start: number, end: number | null): SleepSession {
  return { id, childId: 'a', startTime: new Date(start).toISOString(), endTime: end === null ? null : new Date(end).toISOString(), note: '', dayNightOverride: null, createdAt: new Date(start).toISOString(), updatedAt: new Date(start).toISOString() }
}

describe('A21 diary totals and analytical filtering', () => {
  it('counts overlapping and duplicate minutes once on home and in statistics, preserving records', () => {
    const sessions = [sleep('a', at(30, 12), at(30, 13)), sleep('b', at(30, 12, 30), at(30, 13, 30))]
    sessions.push({ ...sessions[0], id: 'duplicate' })
    const original = structuredClone(sessions), now = at(30, 14)
    expect(totalToday(sessions, new Date(now))).toBe(90 * MINUTE)
    expect(buildSleepDaySource(sessions, now).days[0].totalMs).toBe(90 * MINUTE)
    expect(totalToday([...sessions].reverse(), new Date(now))).toBe(90 * MINUTE)
    expect(sessions).toEqual(original)
  })

  it('keeps the documented raw/analytical distinction for short and running sleeps', () => {
    const now = at(30, 14), short = sleep('short', at(30, 12), at(30, 12, 1)), active = sleep('active', at(30, 13), null)
    expect(totalToday([short, active], new Date(now))).toBe(61 * MINUTE)
    expect(buildSleepDaySource([short, active], now).days).toEqual([])
    expect(active.endTime).toBeNull()
  })

  it('retains the five-minute audit record while explaining a weekly average below one minute', () => {
    const sessions = [sleep('five', at(30, 12), at(30, 12, 5))], now = at(30, 14)
    const total = buildSleepDaySource(sessions, now).days[0].totalMs
    expect(total).toBe(5 * MINUTE)
    expect(totalToday(sessions, new Date(now))).toBe(total)
    expect(formatDuration(total / 7, 'hu')).toBe('<1 p')
    expect(formatDuration(total / 7, 'en')).toBe('<1 min')
    expect(formatDuration(total / 7, 'de')).toBe('<1 Min.')
    expect(formatDuration(0, 'hu')).toBe('0 p')
  })

  it('retains conflicting manual records in the raw total but excludes them from classified statistics', () => {
    const sessions: SleepSession[] = [
      { ...sleep('day', at(30, 12), at(30, 13)), dayNightOverride: 'day' },
      { ...sleep('night', at(30, 12), at(30, 13)), dayNightOverride: 'night' },
    ]
    expect(totalToday(sessions, new Date(at(30, 14)))).toBe(HOUR)
    expect(buildSleepDaySource(sessions, at(30, 14)).days).toEqual([])
  })

  it('uses half-open midnight boundaries and includes an active sleep carried from yesterday', () => {
    const closed = sleep('closed', at(29, 23), at(30, 0)), active = sleep('active', at(29, 23), null)
    expect(todaySessions([closed], new Date(at(30, 1)))).toEqual([])
    expect(todaySessions([active], new Date(at(30, 1)))).toEqual([active])
    expect(totalToday([active], new Date(at(30, 1)))).toBe(HOUR)
    expect(todaySessions([sleep('spanning', at(28, 23), at(30, 1))], new Date(at(29, 12)))).toHaveLength(1)
  })

  it('never lets invalid or far-future times poison today’s sum', () => {
    const sessions = [sleep('valid', at(30, 12), at(30, 13)), sleep('reverse', at(30, 12), at(30, 11)), sleep('future', at(30, 15), at(30, 16))]
    sessions.push({ ...sessions[0], id: 'invalid', startTime: 'not-a-date' })
    expect(totalToday(sessions, new Date(at(30, 14)))).toBe(HOUR)
  })

  it('does not flash an invalid-time warning at exact start or before the next timer tick', () => {
    const now = at(30, 14)
    for (const offset of [0, 1, 999]) expect(getDataQualityReport([sleep('active', now + offset, null)], now).issues).toEqual([])
    expect(getDataQualityReport([sleep('future', now + 61000, null)], now).issues).toHaveLength(1)
    expect(getDataQualityReport([sleep('zero-closed', now, now)], now).issues[0].kind).toBe('invalid-time')
  })

  it.each(['2026-03-29', '2026-10-25'])('agrees across home/statistics on real elapsed time on DST date %s', date => {
    const start = Date.parse(`${date}T00:00:00Z`), end = start + 3 * HOUR, now = end + HOUR
    const sessions = [sleep('dst', start, end)]
    expect(totalToday(sessions, new Date(now))).toBe(3 * HOUR)
    expect(buildSleepDaySource(sessions, now).days[0].totalMs).toBe(3 * HOUR)
  })

  it('regroups the same month-boundary record after a timezone change without changing elapsed time', () => {
    const sessions = [sleep('travel', Date.parse('2026-09-30T21:30:00Z'), Date.parse('2026-09-30T23:30:00Z'))]
    const now = Date.parse('2026-10-01T12:00:00Z')
    for (const [zone, expected] of [['UTC', 0], ['Europe/Budapest', 1.5 * HOUR], ['Asia/Tokyo', 2 * HOUR]] as const) {
      env.TZ = zone
      const days = buildSleepDaySource(sessions, now).days
      expect(totalToday(sessions, new Date(now))).toBe(expected)
      expect(days.find(day => day.key === '2026-10-01')?.totalMs ?? 0).toBe(expected)
      expect(days.reduce((sum, day) => sum + day.totalMs, 0)).toBe(2 * HOUR)
    }
  })
})
