import { describe, expect, it } from 'vitest'
import { buildPredictionLite } from './prediction'
import { formatPredictionWindow, predictionUnavailableText } from './predictionDisplay'
import type { SleepSession } from './types'

const stamp = (day: number, hour: number, minute = 0) => new Date(2026, 0, day, hour, minute).getTime()
function sleep(id: string, start: number, end: number | null, type: 'day' | 'night' = 'night'): SleepSession {
  const startTime = new Date(start).toISOString(), endTime = end === null ? null : new Date(end).toISOString()
  return { id, childId: 'a', startTime, endTime, dayNightOverride: type, note: '', createdAt: startTime, updatedAt: endTime ?? startTime }
}
const history = [23, 24, 25].flatMap(day => [
  sleep(`night${day}`, stamp(day - 1, 22), stamp(day, 6)),
  sleep(`nap${day}`, stamp(day, 8), stamp(day, 9), 'day'),
])
const lateHistory = [23, 24, 25].flatMap(day => [
  sleep(`evening${day}`, stamp(day, 21), stamp(day, 22)),
  sleep(`night${day}`, stamp(day + 1, 0), stamp(day + 1, 1)),
])

describe('prediction current context', () => {
  it('withholds the 51-hour-old audit case and retains the dated last wake', () => {
    const data = [...history, sleep('old', stamp(27, 22), stamp(28, 6))]
    const original = JSON.stringify(data)
    const result = buildPredictionLite(data, stamp(30, 9))
    expect(result).toMatchObject({ status: 'unavailable', unavailableReason: 'stale-wake', lastWakeTime: stamp(28, 6), currentWakeMs: null, bucket: null, typicalTime: null, windowStart: null, windowEnd: null, windowState: null, sourceSessionIds: [] })
    expect(JSON.stringify(data)).toBe(original)
  })

  it('separates missing, sleeping and invalid current data', () => {
    const now = stamp(30, 9)
    expect(buildPredictionLite([], now)).toMatchObject({ unavailableReason: 'missing-wake', lastWakeTime: null })
    expect(buildPredictionLite([...history, sleep('active', stamp(30, 8), null)], now)).toMatchObject({ unavailableReason: 'sleeping', currentWakeMs: null })
    const invalid = sleep('bad', stamp(30, 8), stamp(30, 7))
    expect(buildPredictionLite([...history, invalid], now)).toMatchObject({ unavailableReason: 'invalid-data', currentWakeMs: null })
  })

  it('does not use an older clean wake when the newest end timestamp is malformed', () => {
    const bad = { ...sleep('bad', stamp(30, 8), stamp(30, 9)), endTime: 'invalid' }
    expect(buildPredictionLite([...history, bad], stamp(30, 10))).toMatchObject({ status: 'unavailable', unavailableReason: 'invalid-data' })
  })

  it('returns to ready after a new clean waking, and back to stale after removal', () => {
    const data = [...history, sleep('old', stamp(27, 22), stamp(28, 6))]
    const fresh = sleep('today', stamp(29, 22), stamp(30, 6))
    expect(buildPredictionLite([...data, fresh], stamp(30, 9))).toMatchObject({ status: 'ready', unavailableReason: null, lastWakeTime: stamp(30, 6), currentWakeMs: 3 * 3600000 })
    expect(buildPredictionLite(data, stamp(30, 9))).toMatchObject({ status: 'unavailable', unavailableReason: 'stale-wake' })
  })

  it('keeps the current overnight context across midnight and expires it at morning', () => {
    const data = [...lateHistory, sleep('last', stamp(29, 21), stamp(29, 22))]
    for (const now of [stamp(29, 23, 59), stamp(30, 0), stamp(30, 5, 59)]) {
      expect(buildPredictionLite(data, now)).toMatchObject({ status: 'ready', unavailableReason: null, windowStart: stamp(30, 0), windowEnd: stamp(30, 0) })
    }
    expect(buildPredictionLite(data, stamp(30, 6))).toMatchObject({ status: 'unavailable', unavailableReason: 'stale-wake' })
  })

  it('uses the existing evening boundary inclusively, not a duration ceiling', () => {
    for (const [minute, reason] of [[0, null], [-1, 'stale-wake']] as const) {
      const last = stamp(29, 19, minute)
      expect(buildPredictionLite([...lateHistory, sleep('last', last - 3600000, last)], stamp(30, 1)).unavailableReason).toBe(reason)
    }
    // A long same-calendar-day interval is not declared physiologically invalid.
    expect(buildPredictionLite([...history, sleep('today', stamp(29, 23), stamp(30, 0))], stamp(30, 23)).unavailableReason).toBeNull()
  })

  it('collects historical samples when the current wake is valid but history is sparse', () => {
    expect(buildPredictionLite([sleep('today', stamp(30, 5), stamp(30, 6))], stamp(30, 9))).toMatchObject({ status: 'collecting', unavailableReason: null, lastWakeTime: stamp(30, 6), sampleCount: 0 })
  })

  it('rejects a future waking even inside the general timestamp tolerance', () => {
    expect(buildPredictionLite([sleep('future', stamp(30, 8), stamp(30, 9) + 1000)], stamp(30, 9))).toMatchObject({ unavailableReason: 'invalid-data', currentWakeMs: null })
  })

  it.each([2, 9])('keeps the previous evening across DST month %i until local 06:00', month => {
    const day = month === 2 ? 29 : 25
    const time = (d: number, h: number, m = 0) => new Date(2026, month, d, h, m).getTime()
    const data = [sleep('evening', time(day - 1, 21), time(day - 1, 22))]
    expect(buildPredictionLite(data, time(day, 5, 59)).unavailableReason).toBeNull()
    expect(buildPredictionLite(data, time(day, 6)).unavailableReason).toBe('stale-wake')
  })

  it.each(['hu', 'en', 'de'] as const)('dates stale wakes and cross-midnight windows in %s', locale => {
    const stale = buildPredictionLite([...history, sleep('old', stamp(27, 22), stamp(28, 6))], stamp(30, 9))
    const text = predictionUnavailableText(stale, locale)
    expect(text).toContain('2026')
    expect(text).toContain('28')
    expect(text).toContain('06:00')
    expect(formatPredictionWindow(stamp(30, 10), stamp(30, 11), stamp(30, 9), locale)).toBe('10:00–11:00')
    const cross = formatPredictionWindow(stamp(29, 23), stamp(30, 1), stamp(30, 0), locale)
    expect(cross).toContain('29')
    expect(cross).toContain('30')
    expect(cross).toContain('23:00')
    expect(cross).toContain('01:00')
  })
})
