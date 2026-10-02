import { describe, expect, it } from 'vitest'
import { buildInsightsFoundation } from './insights'
import { buildPredictionLite } from './prediction'
import type { SleepSession } from './types'

const HOUR = 3600000
const now = new Date(2026, 8, 30, 14).getTime()
function sleep(id: string, start: number, end: number): SleepSession {
  const startTime = new Date(start).toISOString(), endTime = new Date(end).toISOString()
  return { id, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime }
}

describe('historical wake evidence, not forecast confidence', () => {
  it('reports seven same-day observations without assigning confidence', () => {
    let cursor = new Date(2026, 8, 29, 6).getTime()
    const sessions = [sleep('first', cursor, cursor + HOUR / 4)]
    for (const [i, gap] of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].entries()) {
      cursor += HOUR / 4 + gap * HOUR
      sessions.push(sleep(`s${i}`, cursor, cursor + HOUR / 4))
    }
    const wake = buildInsightsFoundation(sessions, now).wakeWindow
    expect(wake.sampleCount).toBe(7)
    expect(wake).not.toHaveProperty('confidence')
    expect(wake.typicalMs).toBe(HOUR)
    expect(wake.typicalRange).toEqual({ lowMs: 0.625 * HOUR, highMs: 1.375 * HOUR })
  })

  it.each([
    { name: 'identical', gaps: [2, 2, 2, 2, 2, 2, 2], low: 2, high: 2, median: 2 },
    { name: 'spread', gaps: [1, 2, 3, 4, 5, 6, 7], low: 2.5, high: 5.5, median: 4 },
  ])('keeps $name historical quartiles and shifts them from the latest wake', ({ gaps, low, high, median }) => {
    const sessions = gaps.flatMap((gap, i) => {
      const start = new Date(2026, 8, 20 + i, 8).getTime()
      return [sleep(`a${i}`, start, start + HOUR), sleep(`b${i}`, start + (1 + gap) * HOUR, start + (2 + gap) * HOUR)]
    })
    const lastWake = new Date(2026, 8, 30, 9).getTime()
    sessions.push(sleep('today', lastWake - HOUR, lastWake))
    const original = JSON.stringify(sessions)
    const wake = buildInsightsFoundation(sessions, now).wakeWindow
    const prediction = buildPredictionLite(sessions, now)
    expect(wake.sampleCount).toBe(7)
    expect(wake.typicalRange).toEqual({ lowMs: low * HOUR, highMs: high * HOUR })
    expect(prediction).toMatchObject({ status: 'ready', sampleCount: 7, bucket: 'day-2',
      typicalTime: lastWake + median * HOUR, windowStart: lastWake + low * HOUR, windowEnd: lastWake + high * HOUR })
    expect(wake).not.toHaveProperty('confidence')
    expect(prediction).not.toHaveProperty('confidence')
    expect(JSON.stringify(sessions)).toBe(original)
  })
})
