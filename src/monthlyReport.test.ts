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
