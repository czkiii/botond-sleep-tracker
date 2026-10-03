import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

export async function checkMonthlyPeriods(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const copy = {
    hu: { tab: 'Statisztika', empty: 'Nincs felhasználható adat', sparse: '13 adatos dátum', candidate: 'Riporthoz alkalmas hónap' },
    en: { tab: 'Statistics', empty: 'No usable data', sparse: '13 dates with data', candidate: 'Eligible report month' },
    de: { tab: 'Statistik', empty: 'Keine nutzbaren Daten', sparse: '13 Tage mit Daten', candidate: 'Geeigneter Berichtsmonat' },
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
        const stamp = '2026-09-30T21:59:50Z'
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
          settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'Monthly period fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-30T21:59:50Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: copy[locale].tab, exact: true }).click()
      const card = page.locator('.monthly-report-card')
      const monthName = month => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(2026, month, 1))
      const apply = async months => {
        const before = await page.evaluate(months => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          data.sessions = months.flatMap(([month, count, hours = 8]) => Array.from({ length: count }, (_, index) => {
            const startTime = new Date(2026, month, index + 1).toISOString()
            const endTime = new Date(Date.parse(startTime) + hours * 3600000).toISOString()
            return { id: `${month}-${index}`, childId: 'a', startTime, endTime, note: '', dayNightOverride: 'night', createdAt: startTime, updatedAt: endTime }
          }))
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildMonthlyFamilyReport
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, months)
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildMonthlyFamilyReport > before, before)
      }
      const capture = async name => {
        await card.evaluate(node => node.scrollIntoView({ block: 'center' }))
        assert.doesNotMatch(await card.innerText(), /\{\w+\}/)
        assert.deepEqual(await card.evaluate(node => {
          const box = node.getBoundingClientRect()
          return [...node.querySelectorAll('*')].filter(child => child.getClientRects().length &&
            (child.scrollWidth > child.clientWidth + 1 || child.getBoundingClientRect().right > box.right + 1)).map(child => child.textContent)
        }), [], `${locale}/${width} overflow`)
        await card.screenshot({ path: `.private-backups/s12-${locale}-${width}-${name}.png`,
          style: '.internal-preview-banner, .bottom-nav { visibility: hidden !important; }' })
      }
      assert.equal(await card.locator('.monthly-report-hero').count(), 0)
      assert.equal(await card.locator('.monthly-skipped').count(), 0)
      await apply([[4, 20], [5, 20], [7, 13], [8, 20]])
      assert.equal((await card.locator('.monthly-report-hero > span').innerText()).toLocaleLowerCase(locale), monthName(5).toLocaleLowerCase(locale))
      assert.ok((await card.locator('.monthly-baseline').innerText()).includes(monthName(4)))
      assert.ok((await card.locator('.monthly-current-period').innerText()).includes(monthName(8)))
      await card.locator('.monthly-skipped summary').click()
      const skipped = await card.locator('.monthly-skipped li').allTextContents()
      assert.equal(skipped.length, 2)
      assert.ok(skipped[0].includes(monthName(6)) && skipped[0].includes(copy[locale].empty))
      assert.ok(skipped[1].includes(monthName(7)) && skipped[1].includes(copy[locale].sparse))
      await capture('older-report')
      // The open September month becomes eligible without a reload at local midnight.
      await page.clock.runFor(70000)
      assert.equal((await card.locator('.monthly-report-hero > span').innerText()).toLocaleLowerCase(locale), monthName(8).toLocaleLowerCase(locale))
      assert.ok((await card.locator('.monthly-current-period').innerText()).includes(monthName(9)))
      const baseline = await card.locator('.monthly-baseline').innerText()
      assert.ok(baseline.includes(monthName(4)) && baseline.includes(monthName(5)))
      await capture('month-boundary')
      await apply([[0, 20], [2, 20], [4, 20], [6, 20], [8, 20, 10]])
      const recent = await card.locator('.monthly-baseline').innerText()
      for (const month of [2, 4, 6]) assert.ok(recent.includes(monthName(month)))
      assert.ok(!recent.includes(monthName(0)))
      assert.ok((await card.locator('.monthly-milestone-periods').innerText()).includes(monthName(0)))
      await capture('nonconsecutive-baseline')
      await apply([[5, 20]])
      assert.equal(await card.locator('.monthly-report-hero').count(), 0)
      assert.ok((await card.locator('.monthly-candidate').innerText()).includes(copy[locale].candidate))
      assert.ok((await card.locator('.monthly-candidate').innerText()).includes(monthName(5)))
      await capture('collecting')
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: monthly periods ${locale}/${width}, older report, missing/sparse months, current exclusion, local midnight, explicit baseline/milestones, collecting, layout`)
    } finally { await context.close() }
  }
}
