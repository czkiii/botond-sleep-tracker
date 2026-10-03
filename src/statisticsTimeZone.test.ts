import { afterEach, describe, expect, it } from 'vitest'
import type { SleepSession } from './types'
import { deviceTimeZone, localCalendarDayDistance, statisticsLookbackStart } from './statisticsCalendar'
import { buildSleepDaySource, summarizeSleepMonths } from './sleepDevelopment'
import { buildMonthlyFamilyReport } from './monthlyReport'
import { buildSleepChangeInsight } from './sleepChange'
import { buildInsightsFoundation } from './insights'
import { buildSimilarDaysInsight } from './similarDays'
import { splitSleepTime } from './sleepTime'

const env = (globalThis as any).process.env, previousZone = env.TZ
afterEach(() => { if (previousZone === undefined) delete env.TZ; else env.TZ = previousZone })
const HOUR = 3600000
function sleep(id: string, start: number, end: number): SleepSession {
  const startTime = new Date(start).toISOString(), endTime = new Date(end).toISOString()
  return { id, childId: 'a', startTime, endTime, dayNightOverride: null, note: '', createdAt: startTime, updatedAt: endTime }
}
const audit = sleep('audit', Date.parse('2026-01-01T21:30Z'), Date.parse('2026-01-01T23:30Z'))

describe('viewing-device calendar policy', () => {
  it.each([
    ['UTC', ['2026-01-01'], [2], 0],
    ['Europe/Budapest', ['2026-01-01', '2026-01-02'], [1.5, 0.5], 0],
    ['Asia/Tokyo', ['2026-01-02'], [2], 2],
  ] as const)('groups the same stored instants in %s without changing elapsed time', (zone, dates, hours, dayHours) => {
    env.TZ = zone
    const source = buildSleepDaySource([audit], Date.parse('2026-02-03T12:00Z'))
    expect(deviceTimeZone()).toBe(zone)
    expect(source.days.map(day => day.key)).toEqual(dates)
    expect(source.days.map(day => day.totalMs / HOUR)).toEqual(hours)
    expect(source.days.reduce((sum, day) => sum + day.dayMs, 0)).toBe(dayHours * HOUR)
    expect(source.days.reduce((sum, day) => sum + day.totalMs, 0)).toBe(2 * HOUR)
  })

  it('reinterprets year/month attribution on travel and restores it on return without rewriting data', () => {
    const data = [sleep('year', Date.parse('2025-12-31T21:30Z'), Date.parse('2025-12-31T23:30Z'))]
    const original = structuredClone(data), now = Date.parse('2026-02-03T12:00Z')
    const results = ['UTC', 'Europe/Budapest', 'Asia/Tokyo', 'UTC'].map(zone => {
      env.TZ = zone
      return summarizeSleepMonths(buildSleepDaySource(data, now).days)
    })
    expect(results.map(months => months.map(month => month.key))).toEqual([['2025-12'], ['2025-12', '2026-01'], ['2026-01'], ['2025-12']])
    expect(results[1].map(month => month.averageLongestBlockMs)).toEqual([2 * HOUR, null])
    expect(results[0]).toEqual(results[3])
    expect(data).toEqual(original)
  })

  it('makes the 14-date monthly minimum explicitly dependent on the viewing calendar', () => {
    const data = [11, 12].flatMap(month => Array.from({ length: 7 }, (_, index) => {
      const start = Date.UTC(month === 11 ? 2025 : 2026, month === 11 ? 11 : 0, 2 * index + 1, 21, 30)
      return sleep(`${month}-${index}`, start, start + 2 * HOUR)
    }))
    const reports = ['UTC', 'Europe/Budapest', 'Asia/Tokyo'].map(zone => {
      env.TZ = zone
      return buildMonthlyFamilyReport(data, Date.parse('2026-02-03T12:00Z'))
    })
    expect(reports.map(report => report.status)).toEqual(['collecting', 'ready', 'collecting'])
    expect(reports[1].month).toMatchObject({ key: '2026-01', recordedDays: 14 })
  })

  it.each([
    ['Europe/Budapest', '2026-03-29', 23], ['Europe/Budapest', '2026-10-25', 25],
    ['America/New_York', '2026-03-08', 23], ['America/New_York', '2026-11-01', 25],
  ] as const)('counts calendar dates and exact elapsed hours at %s %s', (zone, day, hours) => {
    env.TZ = zone
    const [y, m, d] = day.split('-').map(Number)
    const start = new Date(y, m - 1, d).getTime(), end = new Date(y, m - 1, d + 1).getTime()
    expect(localCalendarDayDistance(start, end)).toBe(1)
    expect(end - start).toBe(hours * HOUR)
    const segments = splitSleepTime(start, end)
    expect(segments.reduce((sum, segment) => sum + segment.end - segment.start, 0)).toBe(hours * HOUR)
    const now = new Date(y, m - 1, d + 1, 12).getTime()
    const cutoff = statisticsLookbackStart(now, 7)
    expect(now - cutoff).toBe(168 * HOUR)
    expect(new Date(cutoff).getHours()).toBe(hours === 23 ? 11 : 13)
    // Completed nights below the extreme-duration guard retain actual DST time.
    const night = sleep('night', new Date(y, m - 1, d - 1, 20).getTime(), new Date(y, m - 1, d, 8).getTime())
    const source = buildSleepDaySource([night], now)
    expect(source.days.reduce((sum, value) => sum + value.totalMs, 0)).toBe((hours - 12) * HOUR)
  })

  it('uses the exact rolling wake boundary across DST, including equality but not the preceding millisecond', () => {
    env.TZ = 'Europe/Budapest'
    const now = new Date(2026, 2, 30, 12).getTime(), cutoff = statisticsLookbackStart(now, 7)
    const data = [sleep('boundary', cutoff - HOUR, cutoff), sleep('next', cutoff + HOUR, cutoff + 2 * HOUR)]
    expect(buildInsightsFoundation(data, now, { lookbackDays: 7 }).wakeWindow.sampleCount).toBe(1)
    data[0] = { ...data[0], endTime: new Date(cutoff - 1).toISOString() }
    expect(buildInsightsFoundation(data, now, { lookbackDays: 7 }).wakeWindow.sampleCount).toBe(0)
  })

  it.each([2, 9])('keeps the change monitor at five closed calendar dates through DST month %s', month => {
    env.TZ = 'Europe/Budapest'
    const day = month === 2 ? 30 : 26, now = new Date(2026, month, day, 12).getTime()
    const data = Array.from({ length: 34 }, (_, i) => sleep(String(i), new Date(2026, month, day - i, 10).getTime(), new Date(2026, month, day - i, 11).getTime()))
    expect(buildSleepChangeInsight(data, now)).toMatchObject({ recentSampleCount: 5, baselineSampleCount: 28, status: 'stable' })
  })

  it('counts date labels across a date-line jump rather than dividing elapsed hours', () => {
    env.TZ = 'Pacific/Apia'
    const start = new Date(2011, 11, 29).getTime(), end = new Date(2011, 11, 31).getTime()
    expect(end - start).toBe(24 * HOUR)
    expect(localCalendarDayDistance(start, end)).toBe(2)
  })

  it('does not rank a normalized date twice after a date-line jump', () => {
    env.TZ = 'Pacific/Apia'
    const now = new Date(2012, 0, 1, 12).getTime()
    const data = [28, 29, 31].flatMap(day => [8, 16].map(hour =>
      sleep(`${day}-${hour}`, new Date(2011, 11, day, hour).getTime(), new Date(2011, 11, day, hour + 1).getTime())))
    data.push(sleep('today', new Date(2012, 0, 1, 8).getTime(), new Date(2012, 0, 1, 9).getTime()))
    const result = buildSimilarDaysInsight(data, now)
    expect(result.candidateCount).toBe(3)
    expect(new Set(result.matches.map(match => match.dateKey)).size).toBe(3)
  })
})
