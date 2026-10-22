import { describe, expect, it } from 'vitest'
import { buildClockPattern, buildInsightsFoundation } from './insights'
import type { SleepSession } from './types'

// Separate dates keep each synthetic clock observation in its own S02 night.
function routineAt(wakeMinutes: number[]) {
  const sessions: SleepSession[] = wakeMinutes.map((minutes, index) => {
    const end = new Date(2026, 8, 1 + index * 2, Math.floor(minutes / 60), minutes % 60)
    const endTime = end.toISOString()
    const startTime = new Date(end.getTime() - 2 * 3600000).toISOString()
    return { id: `${index}`, childId: 'a', startTime, endTime, dayNightOverride: 'night', note: '', createdAt: startTime, updatedAt: endTime }
  })
  const now = new Date(2026, 8, 2 + wakeMinutes.length * 2, 14).getTime()
  return buildInsightsFoundation(sessions, now, { lookbackDays: 30 }).routine
}

describe('circular routine clock integration', () => {
  it('puts 23:55 and 00:05 around midnight, not noon', () => {
    const routine = routineAt([1435, 5, 1435, 5])
    expect(routine.wakeTime).toMatchObject({ typicalMinutes: 0, lowMinutes: 1435, highMinutes: 5, sampleCount: 4, consistentCount: 4 })
    expect(routine.bedtime?.typicalMinutes).toBe(22 * 60)
  })

  it('does not invent a middle time between two equally supported distant modes', () => {
    const routine = routineAt([60, 60, 60, 300, 300, 300])
    expect(routine.wakeTime).toBeNull()
    expect(routine.wakeTimeVariable).toBe(true)
  })

  it('does not invent a typical time from observations spread across the clock', () => {
    expect(routineAt([0, 360, 720, 1080]).wakeTime).toBeNull()
  })

  it('retains a normal clustered morning routine and its quartiles', () => {
    expect(routineAt([345, 360, 375]).wakeTime).toMatchObject({ typicalMinutes: 360, lowMinutes: 353, highMinutes: 368, sampleCount: 3, consistentCount: 3 })
  })

  it('does not lower the minimum sample count', () => {
    expect(routineAt([1435, 5]).wakeTime).toBeNull()
    expect(routineAt([1435, 5]).wakeTimeVariable).toBe(false)
  })
})

describe('circular clock median and central interval', () => {
  it('marks an ordered Q1–Q3 interval that crosses midnight', () => {
    expect(buildClockPattern([1435, 5, 1435, 5])).toEqual({
      typicalMinutes: 0, lowMinutes: 1435, highMinutes: 5,
      rangeCrossesMidnight: true, sampleCount: 4, consistentCount: 4,
    })
  })

  it('preserves the ordinary non-wrapping median and interpolated quartiles', () => {
    expect(buildClockPattern([345, 355, 365, 375])).toEqual({
      typicalMinutes: 360, lowMinutes: 353, highMinutes: 368,
      rangeCrossesMidnight: false, sampleCount: 4, consistentCount: 4,
    })
  })

  it.each([0, 720, 1439])('supports identical times at %s minutes', minutes => {
    expect(buildClockPattern([minutes, minutes, minutes])).toMatchObject({
      typicalMinutes: minutes, lowMinutes: minutes, highMinutes: minutes,
      rangeCrossesMidnight: false, consistentCount: 3,
    })
  })

  it('normalizes equivalent clock times without mutating the input', () => {
    const values = [-5, 1445, 2875, 5]
    const original = [...values]
    expect(buildClockPattern(values)).toEqual(buildClockPattern([1435, 5, 1435, 5]))
    expect(values).toEqual(original)
  })

  it.each([[], [0], [0, 0], [0, 0, NaN], [0, 0, Infinity]].map(values => ({ values })))('rejects insufficient or invalid samples: $values', ({ values }) => {
    expect(buildClockPattern(values)).toBeNull()
  })

  it.each([
    [0, 720, 0, 720], // No unique direction for antipodal modes.
    [0, 360, 720, 1080], // Uniformly spread clock.
    [0, 240, 480], // A short arc alone is not evidence of a typical time.
    [1380, 1380, 60, 60], // Two separated modes around midnight.
    [0, 0, 0, 720], // Conservative rejection even with a dominant group.
  ].map(values => ({ values })))('does not report an ambiguous or unsupported center: $values', ({ values }) => {
    expect(buildClockPattern(values)).toBeNull()
  })

  it('retains a dominant cluster while reporting the outlier in sample count and quartiles', () => {
    expect(buildClockPattern([0, 10, 20, 400])).toMatchObject({
      typicalMinutes: 15, lowMinutes: 8, highMinutes: 115, consistentCount: 3, sampleCount: 4,
    })
  })

  it('uses the documented inclusive ±30-minute consistency band', () => {
    expect(buildClockPattern([0, 0, 60, 60])?.consistentCount).toBe(4)
    expect(buildClockPattern([0, 0, 61, 61])).toBeNull()
  })

  it('is invariant to input order and rotating all samples around the clock', () => {
    const values = [1430, 1435, 5, 10]
    const base = buildClockPattern(values)!
    expect(base).not.toBeNull()
    for (let shift = 0; shift < 1440; shift++) {
      const rotated = values.map(value => (value + shift) % 1440).reverse()
      const result = buildClockPattern(rotated)!
      const low = (base.lowMinutes + shift) % 1440
      const high = (base.highMinutes + shift) % 1440
      expect(result).toEqual({ ...base, typicalMinutes: (base.typicalMinutes + shift) % 1440,
        lowMinutes: low, highMinutes: high, rangeCrossesMidnight: low > high })
    }
  })
})
