import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import backup from '../test-fixtures/a27-common-diary.json'
import { inspectBackup } from './storage'
import type { SleepSession } from './types'
import { buildSleepDaySource, buildSleepDevelopment } from './sleepDevelopment'
import { buildInsightsFoundation } from './insights'
import { buildPredictionLite } from './prediction'
import { buildSimilarDaysInsight } from './similarDays'
import { buildSleepChangeInsight } from './sleepChange'
import { buildMonthlyFamilyReport } from './monthlyReport'

const diary = backup.data
const now = Date.parse('2026-09-30T22:05:00Z'), HOUR = 3600000
const env = (globalThis as any).process.env, originalZone = env.TZ
beforeEach(() => { env.TZ = 'Europe/Budapest' })
afterEach(() => { if (originalZone === undefined) delete env.TZ; else env.TZ = originalZone })
const data = () => structuredClone(diary.sessions) as SleepSession[]
function all(sessions: SleepSession[], range: 7 | 14 | 30 = 14) {
  const source = buildSleepDaySource(sessions, now)
  return { source, insights: buildInsightsFoundation(sessions, now, { lookbackDays: range }),
    prediction: buildPredictionLite(sessions, now, range), similar: buildSimilarDaysInsight(sessions, now, range),
    development: buildSleepDevelopment(sessions, now, 3, undefined, source),
    change: buildSleepChangeInsight(sessions, now, source.days), monthly: buildMonthlyFamilyReport(sessions, now, source.days) }
}

describe('A27 common diary across all statistics consumers', () => {
  it('reconciles elapsed totals, interrupted nights, month attribution and report/development denominators', () => {
    const sessions = data(), original = structuredClone(sessions), result = all(sessions)
    expect(result.source.days.reduce((sum, day) => sum + day.totalMs, 0)).toBe(425 * HOUR)
    expect(result.source.days.every(day => day.totalMs === day.dayMs + day.nightMs)).toBe(true)
    expect(result.source.days.some(day => day.key === '2026-10-01')).toBe(false) // Exact midnight end.
    expect(result.insights.routine.bedtime?.typicalMinutes).toBe(20 * 60)
    expect(result.insights.routine.wakeTime?.typicalMinutes).toBe(6 * 60)
    expect(result.monthly.status).toBe('ready')
    expect(result.monthly.month).toEqual(result.development.months.find(month => month.key === '2026-09'))
    expect(result.monthly.baselineMonths.map(month => month.key)).toEqual(['2026-08'])
    expect(result.change).toMatchObject({ recentSampleCount: 5, coverage: 'unverified' })
    expect(sessions).toEqual(original)
  })

  it.each([7, 14, 30] as const)('keeps prediction and wake evidence aligned at %s days without filtering monthly history', range => {
    const result = all(data(), range)
    const group = result.insights.wakeWindow.breakdown.find(item => item.key === result.prediction.bucket)!
    expect(result.prediction).toMatchObject({ status: 'ready', bucket: 'night-resettling', windowStart: Date.parse('2026-09-30T22:15:00Z') })
    expect(group.typicalMs).toBe(15 * 60000)
    expect(group.sampleCount).toBe(result.prediction.sampleCount)
    expect(result.insights.wakeWindow.breakdown.find(item => item.key === 'night')?.typicalMs).toBe(7 * HOUR)
    expect(result.monthly).toEqual(all(data(), 14).monthly)
    expect(result.similar.matches).toEqual(all(data(), 14).similar.matches)
  })

  it('accepts the shared fixture through the real backup parser without changing results', () => {
    const imported = inspectBackup(backup)
    expect(imported.diagnostics).toEqual([])
    expect(all(imported.data.sessions)).toEqual(all(data()))
  })

  it('gives the same final result after serialization, reverse delivery and delete/reinsert ordering', () => {
    const sessions = data(), baseline = all(sessions)
    expect(all(JSON.parse(JSON.stringify(sessions)))).toEqual(baseline)
    expect(all([...sessions].reverse())).toEqual(baseline)
    expect(all([...sessions.slice(1), sessions[0]])).toEqual(baseline)
  })

  it('removes stale live predictions and matches during active sleep, then restores them after rollback', () => {
    const sessions = data(), baseline = all(sessions)
    const active = { ...sessions[sessions.length - 1], id: 'active', startTime: '2026-09-30T22:02:00Z', endTime: null }
    const result = all([...sessions, active])
    expect(result.prediction).toMatchObject({ status: 'unavailable', unavailableReason: 'sleeping', windowStart: null })
    expect(result.similar).toMatchObject({ status: 'unavailable', matches: [] })
    expect(active.endTime).toBe(null)
    expect(all(sessions)).toEqual(baseline)
  })

  it('represents a missing diary as collecting or unavailable across every card, without synthetic zero months', () => {
    const result = all([])
    expect(result.source.days).toEqual([])
    expect(result.insights.wakeWindow.typicalMs).toBeNull()
    expect(result.insights.routine.status).toBe('collecting')
    expect(result.prediction.unavailableReason).toBe('missing-wake')
    expect(result.similar.matches).toEqual([])
    expect(result.development).toMatchObject({ status: 'collecting', months: [] })
    expect(result.monthly).toMatchObject({ status: 'collecting', month: null })
    expect(result.change).toMatchObject({ status: 'collecting', recentSampleCount: 0, baselineSampleCount: 0 })
  })
})
