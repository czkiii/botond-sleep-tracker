import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

export async function checkStatisticsTimeZone(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const copy = {
    hu: ['Statisztika', '24 óra', '23 vagy 25', 'mentett bejegyzések'],
    en: ['Statistics', '24 hours', '23 or 25', 'saved entries'],
    de: ['Statistik', '24 Stunden', '23 oder 25', 'gespeicherte Einträge'],
  }
  for (const locale of ['hu', 'en', 'de']) for (const width of [320, 393]) {
    const context = await browser.newContext({ viewport: { width, height: 852 }, serviceWorkers: 'block' })
    const errors = [], unexpected = []
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.startsWith('/api/')) { unexpected.push(url.href); return route.abort() }
      return route.continue()
    })
    try {
      await context.addInitScript(locale => {
        const stamp = '2026-02-03T12:00:00Z'
        const sessions = [11, 12].flatMap(month => Array.from({ length: 7 }, (_, index) => {
          const start = Date.UTC(month === 11 ? 2025 : 2026, month === 11 ? 11 : 0, index * 2 + 1, 21, 30)
          const startTime = new Date(start).toISOString(), endTime = new Date(start + 2 * 3600000).toISOString()
          return { id: `${month}-${index}`, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime }
        }))
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
          settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'Time zone fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions,
        }))
      }, locale)
      const page = await context.newPage()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' })
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-02-03T12:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: copy[locale][0], exact: true }).click()
      const policy = page.locator('.statistics-timezone'), hero = page.locator('.monthly-report-hero')
      const diary = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions))
      const original = await diary()
      assert.ok((await policy.locator('summary').innerText()).includes('UTC'))
      assert.equal(await hero.count(), 0, 'Seven dates per UTC month do not meet the fourteen-date minimum')
      await policy.locator('summary').click()
      for (const word of copy[locale].slice(1)) assert.ok((await policy.innerText()).includes(word))
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000))
      const instant = await page.evaluate(() => Date.now())
      const changeZone = async (timezoneId, event) => {
        const calls = await page.evaluate(() => window.__statisticsMeasure.calls.buildSleepDaySource)
        await cdp.send('Emulation.setTimezoneOverride', { timezoneId })
        if (event === 'minute') await page.clock.runFor(60000)
        else await page.evaluate(event => event === 'focus' ? window.dispatchEvent(new Event('focus')) : document.dispatchEvent(new Event('visibilitychange')), event)
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildSleepDaySource > before, calls, { polling: 100, timeout: 10000 })
        assert.ok((await policy.locator('summary').innerText()).includes(timezoneId))
        assert.equal(await diary(), original, 'Travel must never rewrite saved instants')
      }
      await changeZone('Europe/Budapest', 'focus')
      assert.equal(await page.evaluate(() => Date.now()), instant, 'Focus can change the calendar at an unchanged instant')
      await hero.waitFor()
      assert.match(await hero.locator('small').innerText(), /14/)
      assert.match(await hero.locator('span').innerText(), /2026/)
      assert.doesNotMatch(await policy.innerText(), /\{\w+\}/)
      assert.deepEqual(await policy.evaluate(node => [...node.querySelectorAll('*')].filter(child => child.scrollWidth > child.clientWidth + 1).map(child => child.textContent)), [])
      await policy.screenshot({ path: `.private-backups/s14-${locale}-${width}-timezone.png`, style: '.internal-preview-banner, .bottom-nav { visibility: hidden !important; }' })
      await changeZone('Asia/Tokyo', 'visibility')
      assert.equal(await hero.count(), 0, 'Travel can change the recorded-date minimum again')
      await changeZone('UTC', 'minute')
      assert.equal(await hero.count(), 0)
      const before = await page.evaluate(() => structuredClone(window.__statisticsMeasure.calls))
      await page.clock.runFor(1000)
      assert.deepEqual(await page.evaluate(() => window.__statisticsMeasure.calls), before, 'The second clock must not invalidate time-zone statistics')
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: time zone ${locale}/${width}, UTC/Budapest/Tokyo/UTC, same-instant focus, visibility and minute refresh, monthly minimum, diary preserved, no second recomputation, layout`)
    } finally { await context.close() }
  }
}
