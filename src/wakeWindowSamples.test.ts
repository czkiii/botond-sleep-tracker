import { describe, expect, it } from 'vitest'
import { buildInsightsFoundation } from './insights'
import type { SleepSession } from './types'

const HOUR = 3600000
const now = new Date(2026, 8, 30, 14).getTime()

function sleep(id: string, day: number, hour: number, endHour: number | null): SleepSession {
  const startTime = new Date(2026, 8, day, hour).toISOString()
  const endTime = endHour === null ? null : new Date(2026, 8, day, endHour).toISOString()
  return { id, childId: 'a', startTime, endTime, createdAt: startTime, updatedAt: endTime ?? startTime, note: '', dayNightOverride: null }
}

// Each isolated day contributes one two-hour waking; the overnight gaps
// exceed twelve hours and must not inflate the sample count.
function samples(count: number) {
  return Array.from({ length: count }, (_, i) => [sleep(`a${i}`, 25 + i, 8, 9), sleep(`b${i}`, 25 + i, 11, 12)]).flat()
}

describe('wake-window minimum evidence', () => {
  it.each([0, 1, 2, 3])('exposes a typical value only after three samples (count %i)', count => {
    const wake = buildInsightsFoundation(samples(count), now).wakeWindow
    expect(wake.sampleCount).toBe(count)
    expect(wake.typicalMs).toBe(count >= 3 ? 2 * HOUR : null)
    expect(wake.typicalRange).toEqual(count >= 3 ? { lowMs: 2 * HOUR, highMs: 2 * HOUR } : null)
    expect(wake.confidence).toBe(count >= 3 ? 'low' : null)
    expect(wake.breakdown.map(item => item.key)).toEqual(count >= 3 ? ['day-2'] : [])
  })

  it('keeps enough historical evidence visible during active sleep', () => {
    const wake = buildInsightsFoundation([...samples(3), sleep('active', 30, 13, null)], now).wakeWindow
    expect(wake.currentMs).toBeNull()
    expect(wake.status).toBe('unavailable')
    expect(wake.sampleCount).toBe(3)
    expect(wake.typicalMs).toBe(2 * HOUR)
    expect(wake.breakdown[0].sampleCount).toBe(3)
  })

  it('withdraws the typical value when a sample is removed or becomes invalid', () => {
    const full = samples(3)
    expect(buildInsightsFoundation(full, now).wakeWindow.typicalMs).toBe(2 * HOUR)
    const last = full[full.length - 1]
    for (const reduced of [full.slice(0, -1), [...full.slice(0, -1), { ...last, endTime: last.startTime }]]) {
      expect(buildInsightsFoundation(reduced, now).wakeWindow).toMatchObject({ sampleCount: 2, typicalMs: null, typicalRange: null, confidence: null, breakdown: [] })
    }
  })

  it('applies the minimum to the selected lookback, not the full diary', () => {
    const data = [...samples(2), sleep('old-a', 10, 8, 9), sleep('old-b', 10, 11, 12)]
    expect(buildInsightsFoundation(data, now, { lookbackDays: 30 }).wakeWindow.typicalMs).toBe(2 * HOUR)
    for (const lookbackDays of [7, 14] as const) {
      expect(buildInsightsFoundation(data, now, { lookbackDays }).wakeWindow).toMatchObject({ sampleCount: 2, typicalMs: null, typicalRange: null })
    }
  })

  it('does not promote an undersized subgroup using the total sample count', () => {
    const data = [...samples(2), sleep('third-a', 28, 6, 7), sleep('third-b', 28, 9, 10), sleep('third-c', 28, 12, 13)]
    const wake = buildInsightsFoundation(data, now).wakeWindow
    expect(wake.sampleCount).toBe(4)
    expect(wake.breakdown.map(item => [item.key, item.sampleCount])).toEqual([['day-2', 3]])
    expect(wake.typicalMs).toBe(2 * HOUR)
  })
})
