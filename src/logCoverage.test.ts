import { describe, expect, it } from 'vitest'
import { buildSleepChangeInsight } from './sleepChange'
import { buildInsightsFoundation } from './insights'
import { buildSleepDaySource } from './sleepDevelopment'
import type { SleepSession } from './types'

const HOUR = 3600000
const at = (offset: number, hour: number) => new Date(2026, 9, 3 - offset, hour).getTime()
const now = at(0, 12)
function sleep(id: string, offset: number, hours: number, startHour = 0): SleepSession {
  const startTime = new Date(at(offset, startHour)).toISOString(), endTime = new Date(at(offset, startHour) + hours * HOUR).toISOString()
  return { id, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime }
}
function history(recent: number, baseline: number, recentHours = 1) {
  return [...Array.from({ length: baseline }, (_, i) => sleep(`base-${i}`, i + 6, 10)), ...Array.from({ length: recent }, (_, i) => sleep(`recent-${i}`, i + 1, recentHours))]
}

describe('recorded dates do not prove complete observation', () => {
  it('keeps the audit difference factual without assigning strong confidence', () => {
    const data = history(4, 14)
    const original = JSON.stringify(data)
    const result = buildSleepChangeInsight(data, now)
    expect(result).toMatchObject({ status: 'changed', recentSampleCount: 4, baselineSampleCount: 14, coverage: 'unverified' })
    expect(result.signals.length).toBeGreaterThan(0)
    for (const signal of result.signals) {
      expect(signal).not.toHaveProperty('severity')
      expect(signal).toMatchObject({ recentSampleCount: 4, baselineSampleCount: 14, matchingRecentDays: 4 })
    }
    expect(JSON.stringify(data)).toBe(original)
  })

  it('does not turn night-only dates into observed zero-nap days', () => {
    const result = buildInsightsFoundation([1, 2, 3, 4].map(day => sleep(`night-${day}`, day, 5)), now)
    expect(result.routine.daytimeSleepCount).toBeNull()
  })

  it.each([[3, 14, 'collecting'], [4, 13, 'collecting'], [4, 14, 'changed'], [5, 14, 'changed']] as const)('uses the actual %i recent / %i baseline minimum', (recent, baseline, status) => {
    const result = buildSleepChangeInsight(history(recent, baseline), now)
    expect(result).toMatchObject({ status, recentSampleCount: recent, baselineSampleCount: baseline, coverage: 'unverified' })
  })

  it('does not infer verified completeness even from unchanged, densely logged values', () => {
    const result = buildSleepChangeInsight(history(5, 28, 10), now)
    expect(result).toMatchObject({ status: 'stable', coverage: 'unverified', signals: [] })
  })

  it('keeps missing dates out of the median and excludes today and older data', () => {
    const data = history(4, 14, 10)
    const result = buildSleepChangeInsight([...data, sleep('today', 0, 1), sleep('old', 34, 1)], now)
    expect(result).toMatchObject({ status: 'stable', recentSampleCount: 4, baselineSampleCount: 14 })
    expect(buildSleepDaySource(data, now).days).toHaveLength(18)
  })

  it('counts nap samples only on past dates with recorded naps', () => {
    const nights = [1, 2, 3, 4, 5].map(day => sleep(`night-${day}`, day, 5))
    const naps = [1, 2, 3].map(day => sleep(`nap-${day}`, day, 1, 12))
    const today = sleep('today-nap', 0, 1, 8)
    expect(buildInsightsFoundation([...nights, ...naps, today], now).routine.daytimeSleepCount).toMatchObject({ typicalCount: 1, sampleCount: 3 })
    expect(buildInsightsFoundation([...nights, ...naps.slice(0, 2), today], now).routine.daytimeSleepCount).toBeNull()
  })

  it('does not create empty daily samples or mistake two touched dates for two complete days', () => {
    const data = [sleep('overnight', 2, 12, 20)]
    const days = buildSleepDaySource(data, now).days
    expect(days).toHaveLength(2)
    expect(days.map(day => day.totalMs)).toEqual([4 * HOUR, 8 * HOUR])
    expect(buildSleepChangeInsight(data, now)).toMatchObject({ recentSampleCount: 2, coverage: 'unverified', status: 'collecting' })
    expect(buildSleepDaySource([], now).days).toEqual([])
  })
})
