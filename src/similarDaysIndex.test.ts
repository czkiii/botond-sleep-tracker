import { afterEach, describe, expect, it } from 'vitest'
import { buildSimilarDaysInsight } from './similarDays'
import { buildSimilarDaysInsight as beforeIndex } from '../test-fixtures/statistics/similarDaysBeforeIndex'
import type { SleepSession } from './types'

const env = (globalThis as any).process.env, originalZone = env.TZ
afterEach(() => { if (originalZone === undefined) delete env.TZ; else env.TZ = originalZone })
const HOUR = 3600000
const sleep = (id: string, start: number, end: number): SleepSession => ({ id, childId: 'a', startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), dayNightOverride: null, note: '', createdAt: new Date(start).toISOString(), updatedAt: new Date(end).toISOString() })

function diary(now: number) {
  const reference = new Date(now), sessions: SleepSession[] = []
  let seed = 923
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  // Older exact matches, missing dates, irregular durations and midnight ends.
  for (let offset = 0; offset <= 735; offset += offset < 40 ? 1 : 13) {
    const midnight = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - offset).getTime()
    sessions.push(sleep(`night-${offset}`, midnight - 3 * HOUR, midnight))
    sessions.push(sleep(`nap-${offset}`, midnight + 8 * HOUR, midnight + (9 + Math.floor(random() * 3) / 4) * HOUR))
    if (offset > 0 && offset % 3 === 0) sessions.push(sleep(`next-${offset}`, midnight + 16 * HOUR, midnight + 17 * HOUR))
  }
  const base = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - 10).getTime()
  sessions.push(sleep('long', base - 30 * HOUR, base + 2 * HOUR))
  sessions.push(sleep('reverse', base + 12 * HOUR, base + 11 * HOUR))
  sessions.push(sleep('short', base + 13 * HOUR, base + 13 * HOUR + 1000))
  sessions.push({ ...sessions[5], id: 'duplicate' })
  sessions.push({ ...sessions[9], id: 'conflict-day', dayNightOverride: 'day' })
  sessions.push({ ...sessions[9], id: 'conflict-night', dayNightOverride: 'night' })
  sessions.push({ ...sessions[0], id: 'invalid', startTime: 'invalid' })
  // Seeded input permutation also checks stable source-id order.
  for (let i = sessions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [sessions[i], sessions[j]] = [sessions[j], sessions[i]]
  }
  return sessions
}

describe('indexed closest-day search preserves the pre-optimization result', () => {
  it.each([
    ['Europe/Budapest', '2026-03-30T12:00:00Z'],
    ['Europe/Budapest', '2026-10-26T12:00:00Z'],
    ['America/New_York', '2026-11-02T18:00:00Z'],
    ['UTC', '2026-10-01T14:00:00Z'],
    ['Asia/Tokyo', '2026-10-01T05:00:00Z'],
    ['Pacific/Apia', '2012-01-02T00:00:00Z'],
  ])('%s / %s: matches full-history scans including ranking, ties, cutoffs and rejected days', (zone, instant) => {
    env.TZ = zone
    const now = Date.parse(instant), sessions = diary(now), original = structuredClone(sessions)
    for (const lookback of [7, 14, 30] as const) {
      const expected = beforeIndex(sessions, now, lookback)
      expect(expected.status).toBe('ready')
      expect(buildSimilarDaysInsight(sessions, now, lookback)).toEqual(expected)
    }
    expect(sessions).toEqual(original)
  })

  it('preserves exact-cutoff and midnight wake handling, including missing/active current context', () => {
    env.TZ = 'Europe/Budapest'
    for (const hour of [0, 6, 12, 19]) {
      const now = new Date(2026, 9, 3, hour).getTime()
      const sessions = Array.from({ length: 12 }, (_, offset) => {
        const end = new Date(2026, 9, 3 - offset, hour).getTime()
        return sleep(`edge-${offset}`, end - 2 * HOUR, end)
      })
      sessions.push(sleep('starts-at-cutoff', new Date(2026, 9, 1, hour).getTime(), new Date(2026, 9, 1, hour + 1).getTime()))
      expect(buildSimilarDaysInsight(sessions, now)).toEqual(beforeIndex(sessions, now))
      const active = [...sessions, { ...sessions[0], id: 'active', endTime: null }]
      expect(buildSimilarDaysInsight(active, now)).toEqual(beforeIndex(active, now))
    }
    expect(buildSimilarDaysInsight([], Date.now())).toEqual(beforeIndex([], Date.now()))
  })

  it('does not reuse stale results after data replacement, clock or viewing-zone changes', () => {
    env.TZ = 'Europe/Budapest'
    const now = Date.parse('2026-10-01T12:00:00Z'), sessions = diary(now)
    for (const zone of ['Europe/Budapest', 'UTC', 'Asia/Tokyo', 'Europe/Budapest']) {
      env.TZ = zone
      for (const at of [now, now + HOUR, now + 24 * HOUR]) {
        expect(buildSimilarDaysInsight(sessions, at)).toEqual(beforeIndex(sessions, at))
        const replaced = sessions.slice(10).reverse()
        expect(buildSimilarDaysInsight(replaced, at)).toEqual(beforeIndex(replaced, at))
      }
    }
  })

  it('avoids parsing the entire 5000-record diary for each of 730 historical days', () => {
    env.TZ = 'Europe/Budapest'
    const now = Date.parse('2026-09-30T10:00:10Z')
    const sessions = Array.from({ length: 5000 }, (_, i) => sleep(`s-${i}`, now - (i + 1) * 6 * HOUR - 2 * HOUR, now - (i + 1) * 6 * HOUR))
    const nativeParse = Date.parse
    let parses = 0
    Date.parse = (value: string) => { parses++; return nativeParse(value) }
    try {
      const expected = beforeIndex(sessions, now), beforeParses = parses
      parses = 0
      const actual = buildSimilarDaysInsight(sessions, now), afterParses = parses
      expect(actual).toEqual(expected)
      expect(actual.status).toBe('ready')
      expect(afterParses).toBeLessThan(beforeParses / 10)
      expect(afterParses).toBeLessThan(sessions.length * 100)
    } finally { Date.parse = nativeParse }
  }, 20000)
})
