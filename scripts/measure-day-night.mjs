// Local CPU sample: old minute loop vs exact calendar-boundary splitting.
// No timing threshold: correctness is gated by the separate regression tests.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

process.env.TZ = 'Europe/Budapest'
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true } })
try {
  const { splitDayNight } = await server.ssrLoadModule('/src/utils.ts')
  const { splitSleepTime } = await server.ssrLoadModule('/src/sleepTime.ts')
  function legacy(session) {
    const start = Date.parse(session.startTime), end = Date.parse(session.endTime)
    let day = 0, night = 0
    for (let cursor = start; cursor < end; cursor += 60000) {
      const date = new Date(cursor), minutes = date.getHours() * 60 + date.getMinutes()
      const amount = Math.min(60000, end - cursor)
      if (minutes >= 360 && minutes < 1140) day += amount
      else night += amount
    }
    return { day, night }
  }
  const results = []
  for (const count of [1800, 5000]) {
    const sessions = Array.from({ length: count }, (_, index) => {
      const end = Date.UTC(2026, 8, 30, 10, 0, 10) - (index + 1) * 6 * 3600000
      return { startTime: new Date(end - 2 * 3600000).toISOString(), endTime: new Date(end).toISOString(), dayNightOverride: null }
    })
    const measure = fn => {
      const start = performance.now()
      let duration = 0
      for (const session of sessions) { const parts = fn(session); duration += parts.day + parts.night }
      assert.equal(duration, count * 2 * 3600000)
      return performance.now() - start
    }
    measure(legacy); measure(splitDayNight) // Warm both implementations.
    const oldTimes = [], exactTimes = []
    for (let trial = 0; trial < 7; trial++) {
      oldTimes.push(measure(legacy))
      exactTimes.push(measure(splitDayNight))
    }
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const legacyMs = median(oldTimes), exactMs = median(exactTimes)
    const exactSegments = sessions.reduce((sum, item) => sum + splitSleepTime(Date.parse(item.startTime), Date.parse(item.endTime)).length, 0)
    const result = { count, legacyMinuteSteps: count * 120, exactSegments, legacyMedianMs: +legacyMs.toFixed(2), exactMedianMs: +exactMs.toFixed(2), speedup: +(legacyMs / exactMs).toFixed(2) }
    assert.ok(exactSegments < count * 3, 'Work scales with actual boundaries, not elapsed minutes')
    results.push(result)
    console.log(JSON.stringify(result))
  }
  await mkdir('.private-backups', { recursive: true })
  await writeFile('.private-backups/s01-day-night-performance.json', JSON.stringify({ node: process.version, timezone: process.env.TZ, trials: 7, fixture: '4 automatic sleeps/day, 2 hours each, seconds offset 10', results }, null, 2))
} finally { await server.close() }
