import { afterEach, describe, expect, it } from 'vitest'
import { splitDayNight } from './utils'
import { buildSleepDaySummaries } from './sleepDevelopment'
import { buildSleepDevelopment } from './sleepDevelopment'
import { buildInsightsFoundation } from './insights'
import { buildSimilarDaysInsight } from './similarDays'
import { buildPredictionLite } from './prediction'
import { buildSleepChangeInsight } from './sleepChange'
import { buildMonthlyFamilyReport } from './monthlyReport'
import { splitSleepTime } from './sleepTime'
import type { SleepSession } from './types'

const HOUR = 3600000
const env = (globalThis as any).process.env
const originalTz = env.TZ
afterEach(() => { if (originalTz === undefined) delete env.TZ; else env.TZ = originalTz })
function sleep(startTime: string, endTime: string | null, dayNightOverride: SleepSession['dayNightOverride'] = null): SleepSession {
  return { id: 'boundary', childId: 'a', startTime, endTime, dayNightOverride, note: '', createdAt: startTime, updatedAt: endTime ?? startTime }
}

describe('exact shared day/night boundaries', () => {
  it.each([
    ['05:59:30.000', '06:02:30.000', 150000, 30000],
    ['18:59:30.000', '19:02:30.000', 30000, 150000],
    ['05:59:59.999', '06:00:00.001', 1, 1],
    ['18:59:59.999', '19:00:00.001', 1, 1],
    ['06:00:00.000', '19:00:00.000', 13 * HOUR, 0],
    ['19:00:00.000', '19:02:00.000', 0, 120000],
  ])('%s–%s preserves exact milliseconds', (start, end, day, night) => {
    env.TZ = 'UTC'
    expect(new Date('2026-09-30T00:00:00Z').getHours()).toBe(0)
    const item = sleep(`2026-09-30T${start}Z`, `2026-09-30T${end}Z`)
    expect(splitDayNight(item)).toEqual({ day, night })
    if (day + night >= 120000) {
      const summaries = buildSleepDaySummaries([item], Date.parse('2026-10-01T00:00:00Z'))
      expect(summaries.reduce((sum, value) => sum + value.dayMs, 0)).toBe(day)
      expect(summaries.reduce((sum, value) => sum + value.nightMs, 0)).toBe(night)
    }
  })

  it.each([
    ['Europe/Budapest', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', 10],
    ['Europe/Budapest', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', 12],
    ['America/New_York', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 10],
    ['America/New_York', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 12],
    ['Australia/Lord_Howe', '2026-04-04T13:00:00Z', '2026-04-05T13:30:00Z', 11.5],
    ['Australia/Lord_Howe', '2026-10-03T13:30:00Z', '2026-10-04T13:00:00Z', 10.5],
  ])('%s DST at %s counts actual elapsed time', (zone, start, end, nightHours) => {
    env.TZ = zone
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(end).getHours()).toBe(0)
    const result = splitDayNight(sleep(start, end))
    expect(result).toEqual({ day: 13 * HOUR, night: nightHours * HOUR })
    expect(result.day + result.night).toBe(Date.parse(end) - Date.parse(start))
  })

  it.each(['day', 'night'] as const)('preserves explicit %s overrides across midnight and DST', kind => {
    env.TZ = 'Europe/Budapest'
    const item = sleep('2026-10-24T21:59:30.250Z', '2026-10-25T05:00:30.750Z', kind)
    const duration = Date.parse(item.endTime!) - Date.parse(item.startTime)
    const result = splitDayNight(item)
    expect(result[kind]).toBe(duration)
    expect(result[kind === 'day' ? 'night' : 'day']).toBe(0)
    const days = buildSleepDaySummaries([item], Date.parse('2026-10-26T00:00:00Z'))
    expect(days).toHaveLength(2)
    expect(days.reduce((sum, day) => sum + (kind === 'day' ? day.dayMs : day.nightMs), 0)).toBe(duration)
  })

  it.each([
    ['2026-03-29T00:59:30Z', '2026-03-29T04:00:30Z', 3 * HOUR + 30000],
    ['2026-10-25T00:59:30Z', '2026-10-25T05:00:30Z', 4 * HOUR + 30000],
  ])('daily reports and automatic splitting agree across the Budapest clock change at %s', (start, end, night) => {
    env.TZ = 'Europe/Budapest'
    const item = sleep(start, end)
    const now = Date.parse(end) + HOUR
    expect(splitDayNight(item, now)).toEqual({ day: 30000, night })
    expect(buildSleepDaySummaries([item], now)).toMatchObject([{ dayMs: 30000, nightMs: night, totalMs: night + 30000 }])
  })

  it('clips an active sleep to the supplied time without changing it', () => {
    env.TZ = 'UTC'
    const item = sleep('2026-09-30T18:59:30Z', null)
    expect(splitDayNight(item, Date.parse('2026-09-30T19:00:15Z'))).toEqual({ day: 30000, night: 15000 })
    expect(item.endTime).toBeNull()
  })

  it('does not round partial seconds at midnight', () => {
    env.TZ = 'UTC'
    const item = sleep('2026-09-30T23:59:30.250Z', '2026-10-01T00:02:00.750Z')
    expect(splitDayNight(item)).toEqual({ day: 0, night: 150500 })
    const days = buildSleepDaySummaries([item], Date.parse('2026-10-02T00:00:00Z'))
    expect(days.map(day => [day.key, day.nightMs])).toEqual([['2026-09-30', 29750], ['2026-10-01', 120750]])
  })

  it.each([null, 'day', 'night'] as const)('returns finite zero for invalid/reversed/empty intervals (%s)', override => {
    for (const item of [sleep('invalid', '2026-10-01T00:00:00Z', override), sleep('2026-10-01T00:00:00Z', 'invalid', override),
      sleep('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z', override), sleep('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', override)]) {
      expect(splitDayNight(item)).toEqual({ day: 0, night: 0 })
    }
    expect(splitSleepTime(NaN, Infinity, override)).toEqual([])
  })

  it('advances by calendar boundaries and conserves every millisecond over several days', () => {
    env.TZ = 'Europe/Budapest'
    const start = Date.parse('2026-10-23T21:59:30.250Z')
    const end = Date.parse('2026-10-26T05:00:30.750Z')
    const pieces = splitSleepTime(start, end)
    expect(pieces.length).toBe(9)
    expect(pieces[0].start).toBe(start)
    expect(pieces[pieces.length - 1]?.end).toBe(end)
    expect(pieces.reduce((sum, part) => sum + part.end - part.start, 0)).toBe(end - start)
    pieces.forEach((piece, i) => {
      expect(piece.end).toBeGreaterThan(piece.start)
      if (i) expect(piece.start).toBe(pieces[i - 1].end)
    })
  })

  it('uses the same corrected boundary classification throughout the insight and report modules', () => {
    env.TZ = 'UTC'
    const sessions: SleepSession[] = []
    for (const month of ['08', '09']) for (let day = 1; day <= 30; day++) {
      const date = `2026-${month}-${String(day).padStart(2, '0')}`
      sessions.push({ ...sleep(`${date}T01:00:00Z`, `${date}T04:00:00Z`), id: `${date}-night` })
      // Old minute stepping incorrectly made this a night sleep (120s / 40s).
      // Exact boundaries make it a daytime sleep (70s night / 90s day).
      sessions.push({ ...sleep(`${date}T05:58:50Z`, `${date}T06:01:30Z`), id: `${date}-nap` })
    }
    const now = Date.parse('2026-09-30T07:00:00Z')
    const insights = buildInsightsFoundation(sessions, now)
    expect(insights.routine.daytimeSleepCount?.typicalCount).toBe(1)
    expect(insights.wakeWindow.breakdown.find(bucket => bucket.key === 'day-1')?.sampleCount).toBeGreaterThanOrEqual(3)
    expect(buildSimilarDaysInsight(sessions, now).current?.daytimeSleepCount).toBe(1)
    const explicit = sessions.map(item => item.id.endsWith('-nap') ? { ...item, dayNightOverride: 'day' as const } : item)
    expect(buildPredictionLite(sessions, now)).toEqual(buildPredictionLite(explicit, now))
    const days = buildSleepDaySummaries(sessions, now)
    expect(days).toHaveLength(60)
    for (const day of days) expect(day).toMatchObject({ dayMs: 90000, nightMs: 3 * HOUR + 70000, totalMs: 3 * HOUR + 160000 })
    expect(buildSleepDevelopment(sessions, now).latest).toMatchObject({ averageDayMs: 90000, averageNightMs: 3 * HOUR + 70000 })
    expect(buildMonthlyFamilyReport(sessions, now).month).toMatchObject({ key: '2026-08', averageDayMs: 90000, averageNightMs: 3 * HOUR + 70000 })
    expect(buildSleepChangeInsight(sessions, now)).toMatchObject({ status: 'stable', signals: [] })
  })
})
