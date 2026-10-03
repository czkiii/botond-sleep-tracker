// Instrument only the local test server: production bundles contain no counters.
// Timings use real performance.now(); operation counts are the regression gate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { checkStatisticsFreshness } from './statistics-freshness.mjs'
import { checkRoutineClock } from './routine-clock-check.mjs'
import { checkWakeWindowSamples } from './wake-window-samples-check.mjs'
import { checkPredictionContext } from './prediction-context-check.mjs'
import { checkLongestBlock } from './longest-block-check.mjs'
import { checkLogCoverage } from './log-coverage-check.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const wakeSamplesOnly = process.argv.includes('--wake-samples-only')
const longestBlockOnly = process.argv.includes('--longest-block-only')
const coverageOnly = process.argv.includes('--coverage-only')
const functions = ['buildSleepDaySummaries', 'buildInsightsFoundation', 'buildSimilarDaysInsight',
  'buildPredictionLite', 'buildSleepDevelopment', 'buildSleepChangeInsight', 'buildMonthlyFamilyReport', 'buildSleepDaySource']
const server = await createServer({ base: '/', server: { host: '127.0.0.1', port: 0 }, define: {
  'import.meta.env.VITE_INTERNAL_PREVIEW': JSON.stringify('true'),
  'import.meta.env.VITE_ACCOUNT_AUTH': JSON.stringify('false'),
  'import.meta.env.VITE_SYNC_API_BASE': JSON.stringify('/api')
}, plugins: [{ name: 'statistics-measurement', enforce: 'pre', transform(code, id) {
  if (!/\/src\/[^/]+\.ts$/.test(id.replaceAll('\\', '/'))) return
  let changed = false
  for (const name of functions) {
    if (!code.includes(`export function ${name}(`)) continue
    changed = true
    code = code.replace(`export function ${name}(`, `function measured_${name}(`)
    code += `\nexport function ${name}(...args: Parameters<typeof measured_${name}>) {
      const state = ((globalThis as any).__statisticsMeasure ??= { calls: {}, ms: 0, depth: 0 });
      state.calls['${name}'] = (state.calls['${name}'] ?? 0) + 1;
      const start = performance.now(); const outer = state.depth++ === 0;
      try { return measured_${name}(...args); }
      finally { state.depth--; if (outer) state.ms += performance.now() - start; }
    }\n`
  }
  if (changed) return { code, map: null }
} }] })
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true,
    ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  const results = []
  for (const count of process.argv.includes('--freshness-only') || wakeSamplesOnly || longestBlockOnly || coverageOnly ? [] : [1800, 5000]) for (const plan of ['free', 'familyPlus']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, timezoneId: 'Europe/Budapest', serviceWorkers: 'block' })
    const at = Date.UTC(2026, 8, 30, 10, 0, 10)
    const sessions = Array.from({ length: count }, (_, i) => {
      const end = at - (i + 1) * 6 * 3600000
      return { id: `s-${i}`, childId: 'a', startTime: new Date(end - 2 * 3600000).toISOString(), endTime: new Date(end).toISOString(), note: '', dayNightOverride: null, createdAt: new Date(end).toISOString(), updatedAt: new Date(end).toISOString() }
    })
    const data = { version: 4, settings: { locale: 'en', activeChildId: 'a', longSleepReminderEnabled: false },
      children: [{ id: 'a', name: 'Performance fixture', birthDate: null, photoRef: null, createdAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString() }], sessions }
    await context.addInitScript(({ data, plan, at }) => {
      localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
      localStorage.setItem('solemi-internal-plan-preview', plan)
      // Stable fixture date, but time still passes normally (including performance.now).
      const NativeDate = Date, offset = at - NativeDate.now()
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [NativeDate.now() + offset])) }
        static now() { return NativeDate.now() + offset }
      }
    }, { data, plan, at })
    const unexpected = [], errors = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.startsWith('/api/')) { unexpected.push(url.href); return route.abort() }
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin)
    await page.getByRole('button', { name: 'Statistics', exact: true }).click()
    await page.locator('.stats-screen').waitFor()
    await page.waitForTimeout(200)
    const initial = await page.evaluate(() => structuredClone(window.__statisticsMeasure))
    await page.waitForTimeout(3200)
    const final = await page.evaluate(() => structuredClone(window.__statisticsMeasure))
    const idleCalls = Object.fromEntries(functions.map(name => [name, (final.calls[name] || 0) - (initial.calls[name] || 0)]))
    if (!baseline) {
      assert.equal(Object.values(idleCalls).reduce((a, b) => a + b, 0), 0, 'Second ticks must not rebuild statistics')
      if (plan === 'free') for (const name of functions.slice(1, -1)) assert.equal(final.calls[name] || 0, 0, `Locked ${name} must not run`)
      assert.equal(final.calls.buildSleepDaySummaries || 0, 0, 'All consumers must share the prepared daily source')
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    results.push({ count, plan, initialCalls: initial.calls, initialMs: +initial.ms.toFixed(2), idleCalls, idleMs: +(final.ms - initial.ms).toFixed(2), observationMs: 3200 })
    console.log(JSON.stringify(results.at(-1)))
    await context.close()
  }
  const freshness = baseline || wakeSamplesOnly || longestBlockOnly || coverageOnly ? 'not run in this mode' : await checkStatisticsFreshness(browser, origin)
  if (!baseline && !wakeSamplesOnly && !longestBlockOnly && !coverageOnly) await checkRoutineClock(browser, origin)
  if (!baseline && !longestBlockOnly && !coverageOnly) await checkWakeWindowSamples(browser, origin)
  if (!baseline && !longestBlockOnly && !coverageOnly) await checkPredictionContext(browser, origin)
  if (!baseline && !wakeSamplesOnly && !coverageOnly) await checkLongestBlock(browser, origin)
  if (!baseline && !wakeSamplesOnly && !longestBlockOnly) await checkLogCoverage(browser, origin)
  await mkdir('.private-backups', { recursive: true })
  if (results.length) await writeFile(`.private-backups/a22-${baseline ? 'baseline' : 'after'}.json`, JSON.stringify({ browser: browser.version(), mode: 'Vite development, real clock, synthetic 4 sleeps/day of 2 hours', results, freshness }, null, 2))
} finally { await browser?.close(); await server.close() }
