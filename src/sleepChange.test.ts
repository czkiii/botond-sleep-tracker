import { describe, expect, it } from 'vitest'
import { buildSleepChangeInsight } from './sleepChange'
import type { SleepSession } from './types'

const NOW = Date.parse('2026-08-27T12:00:00.000Z')

function sleep(id: string, date: Date, hours: number): SleepSession {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0)
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000)
  return { id, childId: 'child-1', startTime: start.toISOString(), endTime: end.toISOString(), note: '', dayNightOverride: 'night', createdAt: start.toISOString(), updatedAt: end.toISOString() }
}

function history(recentHours: (index: number) => number, baselineHours = 9) {
  const sessions: SleepSession[] = []
  const today = new Date(NOW); today.setHours(0, 0, 0, 0)
  for (let offset = 33; offset >= 1; offset -= 1) {
    const date = new Date(today); date.setDate(date.getDate() - offset)
    const recentIndex = 5 - offset
    sessions.push(sleep(`sleep-${offset}`, date, offset <= 5 ? recentHours(recentIndex) : baselineHours))
  }
  return sessions
}

describe('buildSleepChangeInsight', () => {
  it('collects until there are enough recent and baseline days', () => {
    const result = buildSleepChangeInsight(history(() => 9).slice(-10), NOW)
    expect(result.status).toBe('collecting')
  })

  it('stays stable when recent days follow the earlier pattern', () => {
    const result = buildSleepChangeInsight(history(() => 9), NOW)
    expect(result.status).toBe('stable')
    expect(result.signals).toEqual([])
  })

  it('detects a persistent reduction in recent night sleep', () => {
    const result = buildSleepChangeInsight(history(() => 6.5), NOW)
    expect(result.status).toBe('changed')
    const night = result.signals.find((signal) => signal.metric === 'night')
    expect(night).toMatchObject({ direction: 'lower', matchingRecentDays: 5, severity: 'strong' })
  })

  it('does not turn one unusual day into a change signal', () => {
    const result = buildSleepChangeInsight(history((index) => index === 0 ? 5 : 9), NOW)
    expect(result.status).toBe('stable')
  })

  it('uses overlap-safe daily totals', () => {
    const sessions = history(() => 9)
    const recent = sessions[sessions.length - 1]
    sessions.push({ ...recent, id: 'overlap-copy' })
    const result = buildSleepChangeInsight(sessions, NOW)
    expect(result.status).toBe('stable')
  })
})
