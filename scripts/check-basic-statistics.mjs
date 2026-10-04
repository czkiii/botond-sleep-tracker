import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const server = await createServer({ base: '/', server: { host: '127.0.0.1', port: 0 }, define: {
  'import.meta.env.VITE_INTERNAL_PREVIEW': JSON.stringify('true'),
  'import.meta.env.VITE_ACCOUNT_AUTH': JSON.stringify('false'),
  'import.meta.env.VITE_SYNC_API_BASE': JSON.stringify('/api'),
} })
let browser
try {
  await mkdir('.private-backups', { recursive: true })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  const copy = {
    hu: ['Statisztika', '1 ó 30 p', '5 p', '<1 p', 'Ma', 'Tegnap', 'Előzmények'],
    en: ['Statistics', '1 hr 30 min', '5 min', '<1 min', 'Today', 'Yesterday', 'History'],
    de: ['Statistik', '1 Std. 30 Min.', '5 Min.', '<1 Min.', 'Heute', 'Gestern', 'Verlauf'],
  }
  const sleep = (id, startTime, endTime) => ({ id, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime ?? startTime })
  const overlap = [sleep('a', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z'), sleep('b', '2026-09-30T10:30:00Z', '2026-09-30T11:30:00Z')]
  for (const locale of ['hu', 'en', 'de']) for (const width of [320, 393]) {
    const context = await browser.newContext({ viewport: { width, height: 852 }, serviceWorkers: 'block' })
    const errors = [], unexpected = []
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.startsWith('/api/')) { unexpected.push(url.href); return route.abort() }
      return route.continue()
    })
    try {
      await context.addInitScript(({ locale, sessions }) => {
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4, settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'A21 fixture', birthDate: null, photoRef: null, createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z' }], sessions }))
      }, { locale, sessions: overlap })
      const page = await context.newPage()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Budapest' })
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') })
      await page.goto(origin)
      const home = () => page.locator('.bottom-nav button').first().click()
      const statistics = () => page.getByRole('button', { name: copy[locale][0], exact: true }).click()
      const apply = async sessions => {
        await page.evaluate(sessions => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4')); data.sessions = sessions
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
        }, sessions)
      }
      const homeTotal = value => page.waitForFunction(value => document.querySelector('.daily-summary strong')?.textContent === value, value)
      await homeTotal(copy[locale][1])
      assert.equal(await page.locator('.today-card').first().locator('.sleep-row').count(), 2)
      await page.locator('.diary-totals-policy summary').click()
      await page.locator('.today-screen').screenshot({ path: `.private-backups/a21-${locale}-${width}-home.png` })
      await statistics(); await page.locator('.segmented.four-options button').first().click()
      assert.ok((await page.locator('.stats-row').innerText()).includes(copy[locale][1]))
      await page.locator('.statistics-totals-policy summary').click()
      const policy = page.locator('.statistics-totals-policy')
      assert.doesNotMatch(await policy.innerText(), /\{\w+\}/)
      assert.equal(await policy.evaluate(node => node.scrollWidth > node.clientWidth + 1), false)
      await policy.screenshot({ path: `.private-backups/a21-${locale}-${width}-policy.png` })

      await home(); await apply([sleep('five', '2026-09-30T10:00:00Z', '2026-09-30T10:05:00Z')]); await homeTotal(copy[locale][2])
      await statistics(); await page.locator('.segmented.four-options button').nth(1).click()
      assert.ok((await page.locator('.stats-row').innerText()).includes(copy[locale][3]), 'Five minutes over seven days must not look like zero')
      await page.locator('.segmented.four-options button').first().click()
      assert.ok((await page.locator('.stats-row').innerText()).includes(copy[locale][2]))

      await home(); await apply([]); await homeTotal(locale === 'hu' ? '0 p' : locale === 'de' ? '0 Min.' : '0 min')
      await page.clock.runFor(999)
      await page.locator('.primary-action').click()
      assert.equal(await page.locator('.quality-warning-card').count(), 0, 'No transient error immediately after start')
      await page.clock.runFor(1000)
      assert.equal(await page.locator('.quality-warning-card').count(), 0)
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions)
      assert.equal(stored[0].endTime, null)
      await statistics()
      assert.equal(await page.locator('.prediction-window').count(), 0)

      await home()
      await apply([sleep('old', '2026-09-20T10:00:00Z', '2026-09-20T11:00:00Z'), sleep('older', '2025-09-20T10:00:00Z', '2025-09-20T11:00:00Z')])
      await page.locator('.bottom-nav').getByRole('button', { name: copy[locale][6], exact: true }).click()
      const headings = await page.locator('.history-group h3').allTextContents()
      assert.equal(headings.length, 2)
      assert.ok(headings[0].includes('2026') && headings[1].includes('2025'))
      assert.ok(headings.every(text => !text.startsWith(copy[locale][4] + ' –') && !text.startsWith(copy[locale][5] + ' –')))
      await page.clock.setSystemTime(new Date('2026-09-20T12:00:00Z')); await page.clock.runFor(1000)
      assert.ok((await page.locator('.history-group h3').first().innerText()).startsWith(copy[locale][4] + ' –'))
      await page.clock.setSystemTime(new Date('2026-09-21T12:00:00Z')); await page.clock.runFor(1000)
      assert.ok((await page.locator('.history-group h3').first().innerText()).startsWith(copy[locale][5] + ' –'))
      // Same month-crossing record on home and day statistics after travel.
      await page.clock.setSystemTime(new Date('2026-10-01T12:00:00Z')); await page.clock.runFor(1000)
      await home()
      await apply([sleep('travel', '2026-09-30T21:30:00Z', '2026-09-30T23:30:00Z')])
      for (const [zone, expected] of [
        ['Europe/Budapest', copy[locale][1]],
        ['UTC', locale === 'hu' ? '0 p' : locale === 'de' ? '0 Min.' : '0 min'],
        ['Asia/Tokyo', locale === 'hu' ? '2 ó 0 p' : locale === 'de' ? '2 Std. 0 Min.' : '2 hr 0 min'],
      ]) {
        await cdp.send('Emulation.setTimezoneOverride', { timezoneId: zone })
        await home(); await page.clock.runFor(1000); await homeTotal(expected)
        await statistics(); await page.locator('.segmented.four-options button').first().click()
        assert.ok((await page.locator('.stats-row').innerText()).includes(expected), `${zone}: same home/day total`)
      }
      await cdp.detach()
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, [])
      console.log(`PASS: A21 ${locale}/${width}, shared overlap total, positive sub-minute average, day/week, exact start, raw/history labels, month boundary in Budapest/UTC/Tokyo and layout`)
    } finally { await context.close() }
  }
} finally { await browser?.close(); await server.close() }
