import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

export async function checkLogCoverage(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const copy = {
    hu: ['Statisztika', 'nem ellenőrizhető', 'Naplóeltérés', 'Nincs kiemelt eltérés', 'Rögzített nappali alvásszám', 'nem bizonyít nulla', 'nem jelent teljes'],
    en: ['Statistics', 'cannot establish', 'Diary difference', 'No flagged difference', 'Recorded daytime sleep count', 'do not establish zero', 'is not a full'],
    de: ['Statistik', 'belegen nicht', 'Datenabweichung', 'Keine Auffälligkeit', 'Erfasste Tagschlafanzahl', 'belegen nicht null', 'keine vollständige'],
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
        const stamp = '2026-10-03T10:00:00Z'
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
          settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'Coverage fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-10-03T10:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: copy[locale][0], exact: true }).click()
      const card = page.locator('.change-card'), routine = page.locator('.routine-card')
      const apply = async (recent, hours, naps = false) => {
        const before = await page.evaluate(({ recent, hours, naps }) => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          const session = (offset, duration, startHour = 0) => {
            const startTime = new Date(2026, 9, 3 - offset, startHour).toISOString()
            const endTime = new Date(Date.parse(startTime) + duration * 3600000).toISOString()
            return { id: `${offset}-${startHour}`, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime }
          }
          data.sessions = [...Array.from({ length: 14 }, (_, i) => session(i + 6, 10)), ...Array.from({ length: recent }, (_, i) => session(i + 1, hours))]
          if (naps) data.sessions.push(...[1, 2, 3].map(offset => session(offset, 1, 12)))
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildSleepChangeInsight
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, { recent, hours, naps })
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildSleepChangeInsight > before, before)
      }
      const capture = async name => {
        await card.evaluate(node => node.scrollIntoView({ block: 'center' }))
        const overflow = await card.evaluate(node => {
          const box = node.getBoundingClientRect()
          return [...node.querySelectorAll('*')].filter(child => child.scrollWidth > child.clientWidth + 1 || child.getBoundingClientRect().right > box.right + 1).map(child => child.textContent)
        })
        assert.deepEqual(overflow, [], `${locale}/${width}`)
        assert.doesNotMatch(await card.innerText(), /\{\w+\}/, 'All count placeholders must be resolved')
        await card.screenshot({ path: `.private-backups/s11-${locale}-${width}-${name}.png` })
      }
      await apply(3, 1)
      await card.locator('.routine-empty').waitFor()
      assert.match(await card.locator('.routine-empty').innerText(), /4/)
      assert.match(await card.locator('.routine-empty').innerText(), /14/)
      assert.match(await card.locator('.change-coverage').innerText(), /3\/5/)
      await capture('collecting')
      await apply(4, 1)
      assert.equal(await card.locator('.insights-card-head b').innerText(), copy[locale][2])
      assert.match(await card.locator('.change-coverage').innerText(), /4\/5/)
      assert.match(await card.locator('.change-coverage').innerText(), /14\/28/)
      assert.ok((await card.locator('.change-coverage').innerText()).includes(copy[locale][1]))
      assert.ok(await card.locator('.change-signal').count() > 0)
      assert.equal(await card.locator('.change-signal.strong').count(), 0)
      for (const badge of await card.locator('.change-signal > div b').all()) assert.match(await badge.innerText(), /4\/4/)
      assert.equal(await routine.locator('.routine-row').filter({ hasText: copy[locale][4] }).count(), 0)
      assert.ok((await routine.locator('.nap-coverage').innerText()).includes(copy[locale][5]))
      for (const parent of ['.development-card', '.monthly-report-card']) assert.ok((await page.locator(`${parent} .recorded-coverage`).innerText()).includes(copy[locale][6]))
      await capture('audit')
      await apply(5, 10)
      assert.equal(await card.locator('.insights-card-head b').innerText(), copy[locale][3])
      assert.equal(await card.locator('.change-signal').count(), 0)
      await capture('unchanged-records')
      await apply(5, 10, true)
      const napRow = routine.locator('.routine-row').filter({ hasText: copy[locale][4] })
      assert.equal(await napRow.locator('strong').innerText(), '1')
      await apply(3, 1)
      await card.locator('.routine-empty').waitFor()
      assert.equal(await card.locator('.change-signal').count(), 0)
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: coverage ${locale}/${width}, 3/4/5 date boundary, 4/4 evidence, unverified completeness, no false zero naps, live recovery, layout`)
    } finally { await context.close() }
  }
}
