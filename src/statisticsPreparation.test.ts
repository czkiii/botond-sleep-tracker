import { describe, expect, it } from 'vitest'
import { buildSleepDaySource, buildSleepDevelopment } from './sleepDevelopment'
import { buildSleepChangeInsight } from './sleepChange'
import { buildMonthlyFamilyReport } from './monthlyReport'
import type { SleepSession } from './types'

const now = Date.parse('2026-09-30T10:00:10Z')
function session(id: number, start: number, end: number | null): SleepSession {
  const stamp = new Date(start).toISOString()
  return { id: String(id), childId: 'a', startTime: stamp, endTime: end === null ? null : new Date(end).toISOString(), note: '', dayNightOverride: id % 3 === 0 ? 'night' : null, createdAt: stamp, updatedAt: stamp }
}

describe('shared statistics preparation', () => {
  const clean = Array.from({ length: 400 }, (_, i) => {
    const end = now - (i + 1) * 12 * 3600000
    return session(i, end - 8 * 3600000, end)
  })
  const mixed = [...clean, { ...clean[0], id: 'overlap' }, session(401, now - 3600000, null),
    session(402, now + 86400000, now + 90000000), session(403, now - 1000, now - 2000)]
  for (const [name, sessions] of [['empty', []], ['clean', clean], ['overlap/active/future/invalid', mixed]] as const) {
    it(`preserves all consumer results and the prepared source: ${name}`, () => {
      const input = [...sessions]
      const source = buildSleepDaySource(input, now)
      const snapshot = JSON.stringify(source)
      for (const range of [3, 6, 12] as const) {
        expect(buildSleepDevelopment(input, now, range, undefined, source)).toEqual(buildSleepDevelopment(input, now, range))
      }
      const custom = { startMonth: '2026-06', endMonth: '2026-08' }
      expect(buildSleepDevelopment(input, now, 12, custom, source)).toEqual(buildSleepDevelopment(input, now, 12, custom))
      expect(buildSleepChangeInsight(input, now, source.days)).toEqual(buildSleepChangeInsight(input, now))
      expect(buildMonthlyFamilyReport(input, now, source.days)).toEqual(buildMonthlyFamilyReport(input, now))
      expect(JSON.stringify(source)).toBe(snapshot)
    })
  }
})
