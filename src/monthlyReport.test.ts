import { describe, expect, it } from 'vitest'
import { buildMonthlyFamilyReport } from './monthlyReport'
import type { SleepSession } from './types'

const NOW = new Date(2026, 7, 27, 12).getTime()

function monthSessions(year: number, month: number, nightHours: number, dayHours = 2, episodes = 2) {
  const sessions: SleepSession[] = []
  for (let day = 1; day <= 20; day += 1) {
    const nightStart = new Date(year, month, day, 0, 0)
    sessions.push({ id: `${year}-${month}-${day}-night`, childId: 'child-1', startTime: nightStart.toISOString(), endTime: new Date(nightStart.getTime() + nightHours * 3600000).toISOString(), note: '', dayNightOverride: 'night', createdAt: nightStart.toISOString(), updatedAt: nightStart.toISOString() })
    for (let index = 0; index < episodes - 1; index += 1) {
      const start = new Date(year, month, day, 12 + index * 3, 0)
      sessions.push({ id: `${year}-${month}-${day}-day-${index}`, childId: 'child-1', startTime: start.toISOString(), endTime: new Date(start.getTime() + dayHours * 3600000 / Math.max(1, episodes - 1)).toISOString(), note: '', dayNightOverride: 'day', createdAt: start.toISOString(), updatedAt: start.toISOString() })
    }
  }
  return sessions
}

describe('buildMonthlyFamilyReport', () => {
  const keys = (months: { key: string }[]) => months.map(month => month.key)
  const recorded = (month: number, count = 20, year = 2026) => monthSessions(year, month, 8, 0, 1).slice(0, count)

  it('labels the older eligible report and distinguishes missing and sparse later months', () => {
    const report = buildMonthlyFamilyReport([...recorded(4), ...recorded(5), ...recorded(7, 13), ...recorded(8)], new Date(2026, 8, 25).getTime())
    expect(report.status).toBe('ready')
    expect(report.month?.key).toBe('2026-06')
    expect(keys(report.baselineMonths)).toEqual(['2026-05'])
    expect(report.currentMonth.key).toBe('2026-09')
    expect(report.skippedMonths.map(item => [item.start.key, item.end.key, item.count, item.recordedDays])).toEqual([
      ['2026-07', '2026-07', 1, 0], ['2026-08', '2026-08', 1, 13],
    ])
  })

  it('uses fourteen dates as the eligibility boundary without treating the current month as closed', () => {
    const sessions = [...recorded(5, 14), ...recorded(6, 13), ...recorded(7, 14)]
    const before = buildMonthlyFamilyReport(sessions, new Date(2026, 7, 31, 23, 59).getTime())
    expect(before.status).toBe('collecting')
    expect(before.month?.key).toBe('2026-06')
    const after = buildMonthlyFamilyReport(sessions, new Date(2026, 8, 1).getTime())
    expect(after.status).toBe('ready')
    expect(after.month?.key).toBe('2026-08')
    expect(keys(after.baselineMonths)).toEqual(['2026-06'])
    expect(after.skippedMonths[0].recordedDays).toBe(13)
  })

  it('names up to three nonconsecutive baseline months and retains the distinct milestone history', () => {
    const report = buildMonthlyFamilyReport([0, 2, 4, 6, 7].flatMap(month => recorded(month)), new Date(2026, 8, 20).getTime())
    expect(keys(report.baselineMonths)).toEqual(['2026-03', '2026-05', '2026-07'])
    expect(keys(report.milestoneMonths)).toEqual(['2026-01', '2026-03', '2026-05', '2026-07'])
    expect(report.skippedMonths.map(item => item.start.key)).toEqual(['2026-04', '2026-06'])
  })

  it('groups an empty multi-year gap without inventing observations or zero averages', () => {
    const report = buildMonthlyFamilyReport([...recorded(10, 20, 2023), ...recorded(11, 20, 2023)], new Date(2026, 0, 1).getTime())
    expect(report.month?.key).toBe('2023-12')
    expect(report.skippedMonths).toEqual([{ start: { key: '2024-01', year: 2024, month: 0 }, end: { key: '2025-12', year: 2025, month: 11 }, count: 24, recordedDays: 0 }])
    expect(report.trends).toEqual([])
  })

  it('does not invent skipped history for an empty or current-month-only diary', () => {
    for (const sessions of [[], recorded(7)]) {
      const report = buildMonthlyFamilyReport(sessions, NOW)
      expect(report.status).toBe('collecting')
      expect(report.month).toBeNull()
      expect(report.baselineMonths).toEqual([])
      expect(report.skippedMonths).toEqual([])
    }
  })

  it('explains sparse history while collecting, starting with its first recorded month', () => {
    const report = buildMonthlyFamilyReport([...recorded(4, 1), ...recorded(6, 13)], NOW)
    expect(report.month).toBeNull()
    expect(report.skippedMonths.map(item => [item.start.key, item.recordedDays])).toEqual([
      ['2026-05', 1], ['2026-06', 0], ['2026-07', 13],
    ])
  })

  it('has no skipped months when eligible closed months are consecutive across a year boundary', () => {
    const sessions = [...recorded(10, 20, 2025), ...recorded(11, 20, 2025)]
    const original = structuredClone(sessions)
    const report = buildMonthlyFamilyReport(sessions, new Date(2026, 0, 1).getTime())
    expect(report.month?.key).toBe('2025-12')
    expect(keys(report.baselineMonths)).toEqual(['2025-11'])
    expect(report.skippedMonths).toEqual([])
    expect(sessions).toEqual(original)
  })

  it('waits for a closed report month and a usable earlier month', () => {
    expect(buildMonthlyFamilyReport(monthSessions(2026, 6, 9), NOW).status).toBe('collecting')
  })

  it('compares the latest closed month with the previous personal baseline', () => {
    const sessions = [
      ...monthSessions(2026, 3, 8),
      ...monthSessions(2026, 4, 8),
      ...monthSessions(2026, 5, 8),
      ...monthSessions(2026, 6, 9)
    ]
    const report = buildMonthlyFamilyReport(sessions, NOW)
    expect(report.status).toBe('ready')
    expect(report.month?.key).toBe('2026-07')
    expect(report.baselineMonthCount).toBe(3)
    expect(report.trends).toContainEqual(expect.objectContaining({ metric: 'night', direction: 'higher', delta: 3600000 }))
  })

  it('does not report small monthly noise as a trend', () => {
    const sessions = [...monthSessions(2026, 5, 8), ...monthSessions(2026, 6, 8.25)]
    expect(buildMonthlyFamilyReport(sessions, NOW).trends).toEqual([])
  })

  it('marks only a new personal high that clears the milestone margin', () => {
    const sessions = [
      ...monthSessions(2026, 3, 8),
      ...monthSessions(2026, 4, 8.2),
      ...monthSessions(2026, 5, 8.1),
      ...monthSessions(2026, 6, 9)
    ]
    const report = buildMonthlyFamilyReport(sessions, NOW)
    expect(report.milestones).toContainEqual(expect.objectContaining({ kind: 'night-high' }))
  })

  it('ignores the still incomplete current month', () => {
    const sessions = [...monthSessions(2026, 5, 8), ...monthSessions(2026, 6, 9), ...monthSessions(2026, 7, 4)]
    expect(buildMonthlyFamilyReport(sessions, NOW).month?.key).toBe('2026-07')
  })
})
