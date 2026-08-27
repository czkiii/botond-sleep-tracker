import { describe, expect, it } from 'vitest'
import { buildSleepDevelopment } from './sleepDevelopment'
import type { SleepSession } from './types'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-08-27T12:00:00.000Z')

function session(id: string, start: string, end: string, override: SleepSession['dayNightOverride'] = null): SleepSession {
  return { id, childId: 'child-1', startTime: start, endTime: end, note: '', dayNightOverride: override, createdAt: start, updatedAt: end }
}

describe('buildSleepDevelopment', () => {
  it('counts overlapping sleep only once', () => {
    const result = buildSleepDevelopment([
      session('a', '2026-08-01T08:00:00.000Z', '2026-08-01T10:00:00.000Z', 'day'),
      session('b', '2026-08-01T09:00:00.000Z', '2026-08-01T11:00:00.000Z', 'day'),
      session('c', '2026-08-02T08:00:00.000Z', '2026-08-02T11:00:00.000Z', 'day'),
      session('d', '2026-08-03T08:00:00.000Z', '2026-08-03T11:00:00.000Z', 'day')
    ], NOW, 3)

    expect(result.months).toHaveLength(1)
    expect(result.months[0].averageTotalMs).toBe(3 * HOUR)
    expect(result.months[0].averageEpisodeCount).toBe(1)
  })

  it('builds a then-now comparison and deterministic milestones', () => {
    const sessions: SleepSession[] = []
    for (let day = 1; day <= 3; day += 1) {
      const padded = String(day).padStart(2, '0')
      sessions.push(session(`may-day-${day}`, `2026-05-${padded}T10:00:00.000Z`, `2026-05-${padded}T14:00:00.000Z`, 'day'))
      sessions.push(session(`may-night-${day}`, `2026-05-${padded}T20:00:00.000Z`, `2026-05-${padded}T23:00:00.000Z`, 'night'))
      sessions.push(session(`aug-night-${day}`, `2026-08-${padded}T20:00:00.000Z`, `2026-08-${String(day + 1).padStart(2, '0')}T04:00:00.000Z`, 'night'))
    }

    const result = buildSleepDevelopment(sessions, NOW, 6)
    expect(result.status).toBe('ready')
    expect(result.first?.key).toBe('2026-05')
    expect(result.latest?.key).toBe('2026-08')
    expect(result.latest?.averageNightMs).toBeGreaterThan(result.first!.averageNightMs)
    expect(result.milestones.map((item) => item.kind)).toContain('night-longer')
    expect(result.milestones.map((item) => item.kind)).toContain('longest-longer')
  })

  it('keeps collecting until two months have at least three recorded days', () => {
    const result = buildSleepDevelopment([
      session('a', '2026-08-01T20:00:00.000Z', '2026-08-02T05:00:00.000Z'),
      session('b', '2026-08-02T20:00:00.000Z', '2026-08-03T05:00:00.000Z'),
      session('c', '2026-08-03T20:00:00.000Z', '2026-08-04T05:00:00.000Z')
    ], NOW, 12)
    expect(result.status).toBe('collecting')
    expect(result.months).toHaveLength(1)
  })
})
