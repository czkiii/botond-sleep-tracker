import { describe, expect, it } from 'vitest'
import { buildPredictionLite } from './prediction'
import type { SleepSession } from './types'

const HOUR = 3600000
const DAY = 24 * HOUR
const now = new Date(2026, 8, 30, 12).getTime()
function nap(day: number, hour = 8, endHour = hour + 1): SleepSession {
  const startTime = new Date(2026, 8, day, hour).toISOString()
  const endTime = new Date(2026, 8, day, endHour).toISOString()
  return { id: `${day}-${hour}`, childId: 'a', startTime, endTime, note: '', dayNightOverride: 'day', createdAt: startTime, updatedAt: endTime }
}
const recent = [27, 28, 29].flatMap(day => [nap(day), nap(day, 11)])
const today = nap(30)

describe('prediction type uses the selected lookback', () => {
  it.each([7, 14, 30] as const)('ignores an imported one-nap history outside %i days', lookbackDays => {
    const old = Array.from({ length: 20 }, (_, i) => nap(30 - lookbackDays - 1 - i))
    const baseline = buildPredictionLite([...recent, today], now, lookbackDays)
    const imported = [...old, ...recent, today]
    const original = JSON.stringify(imported)
    expect(baseline).toMatchObject({ status: 'ready', bucket: 'day-2', sampleCount: 3, windowStart: new Date(2026, 8, 30, 11).getTime() })
    expect(buildPredictionLite(imported, now, lookbackDays)).toEqual(baseline)
    expect(buildPredictionLite(imported.slice().reverse(), now, lookbackDays)).toEqual(baseline)
    expect(JSON.stringify(imported)).toBe(original)
  })

  it('learns older one-nap days only when the range includes them', () => {
    const data = [...Array.from({ length: 12 }, (_, i) => nap(10 + i)), ...recent, today]
    expect(buildPredictionLite(data, now, 7).bucket).toBe('day-2')
    expect(buildPredictionLite(data, now, 14).bucket).toBe('night')
    expect(buildPredictionLite(data, now, 30).bucket).toBe('night')
    expect(buildPredictionLite(data, now, 7).sampleCount).toBe(3)
  })

  it('does not borrow out-of-range days to reach the three-day learning minimum', () => {
    const data = [nap(27), nap(28), ...Array.from({ length: 10 }, (_, i) => nap(10 + i)), today]
    expect(buildPredictionLite(data, now, 7)).toMatchObject({ bucket: 'day-2', status: 'collecting', sampleCount: 0 })
  })

  it('does not turn a boundary fragment into a learned one-nap day', () => {
    // Cutoff is Sept 23 noon. That calendar day is only partially observed
    // by this range; it must not supply the third learned one-nap day.
    const data = [nap(23, 14), nap(27), nap(28), today]
    expect(buildPredictionLite(data, now, 7).bucket).toBe('day-2')
    expect(buildPredictionLite(data, now, 14).bucket).toBe('night')
  })

  it('counts the first whole calendar day inside the rolling window', () => {
    const data = [nap(24), nap(27), nap(28), today]
    expect(buildPredictionLite(data, now, 7).bucket).toBe('night')
  })

  it('preserves nighttime classification regardless of old nap counts', () => {
    const evening = new Date(2026, 8, 30, 20).getTime()
    expect(buildPredictionLite([...recent, today], evening, 7).bucket).toBe('night')
  })

  it('retains the original gap crossing the left cutoff for correct sleep order', () => {
    // A clean previous waking exactly at the rolling boundary remains a
    // valid gap. Keep full session adjacency/order for duration sampling.
    const cutoff = now - 7 * DAY
    const data = [nap(23, 11, 12), nap(23, 14, 15), ...recent, today]
    const result = buildPredictionLite(data, now, 7)
    expect(Date.parse(data[0].endTime!)).toBe(cutoff)
    expect(result).toMatchObject({ bucket: 'day-2', sampleCount: 4 })
    const before = { ...data[0], endTime: new Date(cutoff - 1).toISOString() }
    expect(buildPredictionLite([before, ...data.slice(1)], now, 7).sampleCount).toBe(3)
  })
})
