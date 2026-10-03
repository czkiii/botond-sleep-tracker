import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'

// The unit integration test uses this exact diary too. No real account or API.
const diary = JSON.parse(await readFile(new URL('../test-fixtures/a27-common-diary.json', import.meta.url), 'utf8')).data
const at = '2026-09-30T22:05:00Z'
export async function checkStatisticsAcceptance(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const evidence = [], prior = new Map()
  for (const locale of ['hu', 'en', 'de']) for (const width of [320, 393]) {
    const context = await browser.newContext({ viewport: { width, height: 852 }, timezoneId: 'Europe/Budapest', serviceWorkers: 'block' })
    const errors = [], unexpected = []
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.startsWith('/api/')) { unexpected.push(url.href); return route.abort() }
      return route.continue()
    })
    try {
      await context.addInitScript(({ diary, locale }) => {
        if (!localStorage.getItem('solemiSleep:v4')) {
          diary.settings.locale = locale
          localStorage.setItem('solemiSleep:v4', JSON.stringify(diary))
          localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        }
      }, { diary, locale })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date(at) })
      await page.goto(origin)
      const open = () => page.getByRole('button', { name: { hu: 'Statisztika', en: 'Statistics', de: 'Statistik' }[locale], exact: true }).click()
      await open()
      const cards = page.locator('.insights-card')
      assert.equal(await cards.count(), 7)
      const texts = async () => (await cards.allTextContents()).map(text => text.replace(/\s+/g, ' ').trim())
      const original = await texts()
      if (prior.has(locale)) assert.deepEqual(original, prior.get(locale), 'Independent browser contexts must agree')
      prior.set(locale, original)
      assert.equal(await page.locator('.prediction-window').innerText(), '00:15–00:15')
      assert.match(await page.locator('.wake-window-hero strong').innerText(), /15/)
      const routine = await page.locator('.routine-card').innerText()
      assert.ok(routine.includes('20:00') && routine.includes('06:00'))
      const month = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'Europe/Budapest' }).format(new Date('2026-09-15'))
      assert.ok((await page.locator('.monthly-report-hero').innerText()).toLocaleLowerCase(locale).includes(month.toLocaleLowerCase(locale)))
      for (let index = 0; index < 7; index++) {
        const card = cards.nth(index)
        assert.doesNotMatch(await card.innerText(), /\{\w+\}/)
        const overflow = await card.evaluate(node => [...node.querySelectorAll('p, small, strong, b, span, h2')].filter(child => child.getClientRects().length && child.scrollWidth > child.clientWidth + 1).map(child => child.textContent))
        assert.deepEqual(overflow, [], `${locale}/${width} card ${index} text overflow`)
        await card.screenshot({ path: `.private-backups/a27-common-${locale}-${width}-${index}.png`, style: '.internal-preview-banner, .bottom-nav { visibility: hidden !important; }' })
      }
      const apply = async sessions => {
        const before = await page.evaluate(sessions => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          data.sessions = sessions
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildPredictionLite
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, sessions)
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildPredictionLite > before, before)
      }
      await apply([...diary.sessions].reverse())
      assert.deepEqual(await texts(), original, 'Replacement order must not alter any card')
      await page.reload(); await open()
      assert.deepEqual(await texts(), original, 'Persisted replacement must survive reload')
      const active = { ...diary.sessions.at(-1), id: 'active', startTime: '2026-09-30T22:02:00Z', endTime: null }
      await apply([...diary.sessions, active])
      assert.equal(await page.locator('.prediction-window').count(), 0)
      assert.equal(await page.locator('.similar-day-row').count(), 0)
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions.at(-1).endTime), null)
      await apply([])
      for (const selector of ['.prediction-window', '.wake-window-hero', '.monthly-report-hero', '.similar-day-row']) assert.equal(await page.locator(selector).count(), 0)
      await apply(diary.sessions)
      assert.deepEqual(await texts(), original, 'Recovery from an empty diary must restore all cards')
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, [])
      evidence.push({ locale, width, cards: original, states: ['common', 'reverse-replacement', 'reload', 'active', 'empty', 'restore'], passed: true })
      console.log(`PASS: A27 common diary ${locale}/${width}: seven cards, cross-context agreement, replacement/reload, active/empty/recovery`)
    } finally { await context.close() }
  }
  await writeFile('.private-backups/a27-common-browser.json', JSON.stringify({ at, timeZone: 'Europe/Budapest', browser: browser.version(), evidence }, null, 2))
}
