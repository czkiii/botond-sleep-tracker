import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

export async function checkSleepOverlap(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const copy = {
    hu: ['Statisztika', 'Nap', '0 p', '2 ó 0 p', '3 ó 0 p', 'egész csoport', 'sorrend'],
    en: ['Statistics', 'Day', '0 min', '2 hr 0 min', '3 hr 0 min', 'entire group', 'order'],
    de: ['Statistik', 'Tag', '0 Min.', '2 Std. 0 Min.', '3 Std. 0 Min.', 'gesamte Gruppe', 'Reihenfolge'],
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
        const stamp = '2026-10-03T16:00:00Z'
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
          settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'Overlap fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-10-03T16:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: copy[locale][0], exact: true }).click()
      await page.locator('.segmented.four-options').getByRole('button', { name: copy[locale][1], exact: true }).click()
      const policy = page.locator('.statistics-overlap-policy')
      const totals = () => page.locator('.overview-compact .stats-row strong').allTextContents()
      const apply = async mode => {
        const before = await page.evaluate(mode => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          const session = (id, start, end, kind) => {
            const startTime = new Date(2026, 9, 3, start).toISOString(), endTime = new Date(2026, 9, 3, end).toISOString()
            return { id, childId: 'a', startTime, endTime, note: '', dayNightOverride: kind, createdAt: startTime, updatedAt: endTime }
          }
          data.sessions = [session('first', 12, 14, 'day')]
          if (mode !== 'single') data.sessions.push(session('second', mode === 'partial' ? 13 : 12, mode === 'partial' ? 15 : 14, mode === 'conflict' ? 'night' : 'day'))
          if (mode === 'conflict') data.sessions.push(session('automatic-copy', 12, 14, null))
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildSleepDaySource
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, mode)
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildSleepDaySource > before, before)
      }
      await apply('conflict')
      assert.deepEqual(await totals(), Array(3).fill(copy[locale][2]))
      assert.ok((await policy.locator('[role=status]').innerText()).includes(copy[locale][5]))
      assert.match(await policy.locator('[role=status]').innerText(), /3/)
      await policy.locator('summary').click()
      assert.ok((await policy.locator('details').innerText()).includes(copy[locale][6]))
      assert.doesNotMatch(await policy.innerText(), /\{\w+\}/)
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions.length), 3)
      assert.deepEqual(await policy.evaluate(node => [...node.querySelectorAll('*')].filter(child => child.scrollWidth > child.clientWidth + 1).map(child => child.textContent)), [])
      await policy.screenshot({ path: `.private-backups/s13-${locale}-${width}-conflict.png`, style: '.internal-preview-banner, .bottom-nav { visibility: hidden !important; }' })
      await apply('duplicate')
      assert.equal(await policy.locator('[role=status]').count(), 0)
      assert.deepEqual(await totals(), [copy[locale][3], copy[locale][3], copy[locale][2]])
      assert.match(await page.locator('.wake-card .insights-quality-note').innerText(), /2/)
      await apply('partial')
      assert.deepEqual(await totals(), [copy[locale][4], copy[locale][4], copy[locale][2]])
      await apply('single')
      assert.deepEqual(await totals(), [copy[locale][3], copy[locale][3], copy[locale][2]])
      assert.equal(await page.locator('.wake-card .insights-quality-note').count(), 0)
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: overlap ${locale}/${width}, conflicting group excluded, raw data preserved, duplicate/partial union, live correction, translated policy, layout`)
    } finally { await context.close() }
  }
}
