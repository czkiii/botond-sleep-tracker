import { afterEach, describe, expect, it } from 'vitest'
import { buildSleepDaySource, buildSleepDevelopment, summarizeSleepMonths } from './sleepDevelopment'
import { buildMonthlyFamilyReport } from './monthlyReport'
import { buildSleepChangeInsight } from './sleepChange'
import type { SleepSession } from './types'

const HOUR = 3600000
const env = (globalThis as any).process.env
const originalTz = env.TZ
afterEach(() => { if (originalTz === undefined) delete env.TZ; else env.TZ = originalTz })
const at = (month: number, day: number, hour: number) => new Date(2026, month - 1, day, hour).getTime()
const now = at(10, 3, 12)
function sleep(id: string, start: number, end: number | null): SleepSession {
  const startTime = new Date(start).toISOString(), endTime = end === null ? null : new Date(end).toISOString()
  return { id, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime ?? startTime }
}
const nights = (month: number, hours = 12) => Array.from({ length: 7 }, (_, i) => {
  const start = at(month, 2 * i + 1, 20)
  return sleep(`${month}-${i}`, start, start + hours * HOUR)
})

describe('longest daily blocks shared by development and monthly report', () => {
  it('uses seven start days, not fourteen touched dates, for seven overnight sleeps', () => {
    const data = [...nights(8), ...nights(9)]
    const development = buildSleepDevelopment(data, now)
    const report = buildMonthlyFamilyReport(data, now)
    expect(report.status).toBe('ready')
    expect(development.latest?.recordedDays).toBe(14)
    expect(development.latest?.averageLongestBlockMs).toBe(12 * HOUR)
    expect(report.month?.averageLongestBlockMs).toBe(12 * HOUR)
    expect(report.month?.longestBlockSampleDays).toBe(7)
    expect(report.month).toEqual(development.latest)
    expect(report.trends.some(trend => trend.metric === 'longest')).toBe(false)
  })

  it('represents a continuation-only date as missing, not a zero-length maximum', () => {
    const source = buildSleepDaySource(nights(9), now)
    expect(source.days.find(day => day.key === '2026-09-02')).toMatchObject({ totalMs: 8 * HOUR, episodeCount: 0, longestBlockMs: null })
  })

  it('averages daily maxima, not every episode or the single monthly maximum', () => {
    const data = [sleep('short', at(9, 1, 1), at(9, 1, 3)), sleep('long', at(9, 1, 8), at(9, 1, 13)), sleep('next', at(9, 2, 1), at(9, 2, 11))]
    const [month] = summarizeSleepMonths(buildSleepDaySource(data, now).days)
    expect(month).toMatchObject({ averageLongestBlockMs: 7.5 * HOUR, longestBlockSampleDays: 2, averageTotalMs: 8.5 * HOUR })
  })

  it('attributes the full cross-year episode to its start month while splitting total time', () => {
    const data = [sleep('new-year', at(1, 0, 20), at(1, 1, 8))]
    const original = JSON.stringify(data)
    const source = buildSleepDaySource(data, now)
    const months = summarizeSleepMonths(source.days)
    expect(months[0]).toMatchObject({ key: '2025-12', averageTotalMs: 4 * HOUR, averageLongestBlockMs: 12 * HOUR, longestBlockSampleDays: 1 })
    expect(months[1]).toMatchObject({ key: '2026-01', averageTotalMs: 8 * HOUR, averageLongestBlockMs: null, longestBlockSampleDays: 0 })
    const withNap = summarizeSleepMonths(buildSleepDaySource([...data, sleep('nap', at(1, 1, 12), at(1, 1, 14))], now).days)
    expect(withNap[1]).toMatchObject({ averageTotalMs: 10 * HOUR, averageLongestBlockMs: 2 * HOUR, longestBlockSampleDays: 1 })
    expect(JSON.stringify(data)).toBe(original)
  })

  it('does not create an extra date for a sleep ending exactly at midnight', () => {
    const days = buildSleepDaySource([sleep('end', at(9, 30, 20), at(10, 1, 0))], now).days
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ key: '2026-09-30', longestBlockMs: 4 * HOUR })
    const midnight = buildSleepDaySource([sleep('start', at(10, 1, 0), at(10, 1, 8))], now).days
    expect(midnight[0]).toMatchObject({ key: '2026-10-01', longestBlockMs: 8 * HOUR })
  })

  it('keeps the same merged episode across duplicate or touching records', () => {
    const first = sleep('a', at(9, 30, 20), at(10, 1, 0))
    const source = buildSleepDaySource([first, { ...first, id: 'duplicate' }, sleep('b', at(10, 1, 0), at(10, 1, 8))], now)
    expect(source.days[0]).toMatchObject({ episodeCount: 1, longestBlockMs: 12 * HOUR, totalMs: 4 * HOUR })
    expect(source.days[1]).toMatchObject({ episodeCount: 0, longestBlockMs: null, totalMs: 8 * HOUR })
  })

  it('does not count active or malformed sleeps in either the sum or denominator', () => {
    const valid = sleep('valid', at(9, 1, 8), at(9, 1, 10))
    const source = buildSleepDaySource([valid, sleep('active', at(9, 2, 8), null), { ...valid, id: 'bad', startTime: 'invalid' }], now)
    expect(summarizeSleepMonths(source.days)[0]).toMatchObject({ averageLongestBlockMs: 2 * HOUR, longestBlockSampleDays: 1 })
  })

  it('does not turn missing monthly maxima into trends or record milestones', () => {
    const days = buildSleepDaySource([...nights(7), ...nights(8), ...nights(9)], now).days
      .map(day => day.month === 8 ? { ...day, longestBlockMs: null, episodeCount: 0 } : day)
    const report = buildMonthlyFamilyReport([], now, days)
    expect(report.status).toBe('ready')
    expect(report.month?.averageLongestBlockMs).toBeNull()
    expect(report.trends.some(trend => trend.metric === 'longest')).toBe(false)
    expect(report.milestones.some(milestone => milestone.kind === 'longest-high')).toBe(false)
    const development = buildSleepDevelopment([], now, 12, undefined, { days, usableSessionCount: 21 })
    expect(development.milestones.some(milestone => milestone.kind === 'longest-longer')).toBe(false)
    // Missing baseline evidence must not become an artificial record either.
    const missingBaseline = days.map(day => ({ ...day, longestBlockMs: day.month === 8 ? 12 * HOUR : null }))
    const recovered = buildMonthlyFamilyReport([], now, missingBaseline)
    expect(recovered.trends.some(trend => trend.metric === 'longest')).toBe(false)
    expect(recovered.milestones.some(milestone => milestone.kind === 'longest-high')).toBe(false)
  })

  it('does not use continuation-only days as zero values in the change monitor', () => {
    const data = Array.from({ length: 33 }, (_, i) => sleep(`daily-${i}`, at(10, 2 - i, 1), at(10, 2 - i, 9)))
    const days = buildSleepDaySource(data, now).days.map(day => day.key >= '2026-09-28' ? { ...day, longestBlockMs: null, episodeCount: 0 } : day)
    expect(buildSleepChangeInsight([], now, days).signals.some(signal => signal.metric === 'longest')).toBe(false)
  })

  it.each([[3, 28, 11], [10, 24, 13]])('uses actual elapsed hours across DST in month %i', (month, day, hours) => {
    env.TZ = 'Europe/Budapest'
    const start = at(month, day, 20), end = at(month, day + 1, 8)
    const source = buildSleepDaySource([sleep('dst', start, end)], end + HOUR)
    expect(source.days[0].longestBlockMs).toBe(hours * HOUR)
    expect(source.days[1].longestBlockMs).toBeNull()
    expect(source.days.reduce((sum, date) => sum + date.totalMs, 0)).toBe(hours * HOUR)
    expect(summarizeSleepMonths(source.days)[0].averageLongestBlockMs).toBe(hours * HOUR)
  })
})
