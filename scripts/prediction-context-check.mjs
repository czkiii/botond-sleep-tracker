import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

export async function checkPredictionContext(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const labels = {
    hu: ['Statisztika', 'Még nincs rögzített ébredés', 'Az utolsó rögzített ébredés', 'Futó alvás közben', 'hibás vagy átfedő'],
    en: ['Statistics', 'No waking has been recorded', 'Last recorded waking', 'while sleep is active', 'invalid or overlapping'],
    de: ['Statistik', 'Noch kein Aufwachen erfasst', 'Zuletzt erfasstes Aufwachen', 'Während eines laufenden Schlafs', 'ungültige oder überlappende'],
  }
  for (const locale of ['hu', 'en', 'de']) for (const width of [320, 393]) {
    const context = await browser.newContext({ viewport: { width, height: 852 }, timezoneId: 'Europe/Budapest', serviceWorkers: 'block' })
    const errors = [], unexpected = []
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.startsWith('/api/')) { unexpected.push(url.href); return route.abort() }
      return route.continue()
    })
    try {
      await context.addInitScript(locale => {
        const stamp = '2026-09-30T07:00:00Z'
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
          settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'Context fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-30T07:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: labels[locale][0], exact: true }).click()
      const card = page.locator('.prediction-card')
      const wake = page.locator('.wake-card')
      await card.waitFor()
      const apply = async tuples => {
        const before = await page.evaluate(tuples => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          data.sessions = tuples.map(([day, hour, endDay, endHour, type = 'night'], i) => {
            const startTime = new Date(2026, 8, day, hour).toISOString()
            const endTime = endDay === null ? null : new Date(2026, 8, endDay, endHour).toISOString()
            return { id: `context-${i}`, childId: 'a', startTime, endTime, note: '', dayNightOverride: type, createdAt: startTime, updatedAt: endTime ?? startTime }
          })
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildPredictionLite
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, tuples)
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildPredictionLite > before, before)
      }
      const unavailable = async label => {
        await card.locator('.routine-empty').filter({ hasText: label }).waitFor()
        assert.equal(await card.locator('.prediction-window, .prediction-state, .insights-card-head b').count(), 0)
        assert.equal(await wake.locator('.current-awake-status').count(), 0, 'No stale or uncertain live wake counter')
      }
      const capture = async name => {
        await card.evaluate(node => node.scrollIntoView({ block: 'center' }))
        assert.equal(await card.evaluate(card => {
          const box = card.getBoundingClientRect()
          return [...card.querySelectorAll('*')].some(node => node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().right > box.right + 1)
        }), false, 'Dated context must fit a narrow phone')
        await card.screenshot({ path: `.private-backups/s07-${locale}-${width}-${name}.png` })
      }
      await unavailable(labels[locale][1])
      const history = [23, 24, 25].flatMap(day => [[day - 1, 22, day, 6], [day, 8, day, 9, 'day']])
      const stale = [...history, [27, 22, 28, 6]]
      await apply(stale)
      await unavailable(labels[locale][2])
      assert.match(await card.innerText(), /2026/)
      assert.match(await card.innerText(), /28/)
      assert.match(await card.innerText(), /06:00/)
      assert.equal(await wake.locator('.wake-window-hero').count(), 1, 'Keep historical evidence')
      await capture('stale')
      for (const index of [0, 2, 1]) {
        await wake.locator('.insights-range button').nth(index).click()
        await unavailable(labels[locale][2])
      }
      await apply([...history, [30, 8, null, null]])
      await unavailable(labels[locale][3])
      await apply([...history, [30, 7, 30, 9], [30, 8, 30, 9]])
      await unavailable(labels[locale][4])
      await apply([...stale, [29, 22, 30, 6]])
      assert.equal(await card.locator('.prediction-window').innerText(), '08:00–08:00')
      assert.equal(await wake.locator('.current-awake-status').count(), 1)
      await apply(stale)
      await unavailable(labels[locale][2])

      // The existing minute clock must preserve the same night at midnight
      // and withdraw the old reference at 06:00 without a page reload.
      await page.clock.setSystemTime(new Date('2026-09-29T21:59:00Z'))
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      const night = [...[23, 24, 25].flatMap(day => [[day, 21, day, 22], [day + 1, 0, day + 1, 1]]), [29, 21, 29, 22]]
      await apply(night)
      assert.match(await card.locator('.prediction-window').innerText(), /30/)
      assert.match(await card.locator('.prediction-window').innerText(), /00:00/)
      await capture('dated-night')
      await page.clock.runFor(60000)
      assert.equal(await card.locator('.prediction-window').innerText(), '00:00–00:00')
      await page.clock.setSystemTime(new Date('2026-09-30T03:59:59Z'))
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      assert.equal(await card.locator('.prediction-window').count(), 1)
      await page.clock.runFor(1000)
      await unavailable(labels[locale][2])
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: prediction context ${locale}/${width}, missing/stale/active/invalid, recovery/removal, range changes, dated night, midnight/06:00`)
    } finally { await context.close() }
  }
}
