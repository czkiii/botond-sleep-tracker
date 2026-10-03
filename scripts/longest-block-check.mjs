import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

export async function checkLongestBlock(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const copy = {
    hu: ['Statisztika', 'Napi leghosszabb szakaszok átlaga', '12 ó 0 p', '7 kezdési nap alapján', 'nem a hónap egyetlen', 'Nincs kezdődő szakasz'],
    en: ['Statistics', 'Average daily longest stretch', '12 hr 0 min', 'Based on 7 start dates', 'not the single longest', 'No stretches started'],
    de: ['Statistik', 'Durchschnitt der täglich längsten Schlafphasen', '12 Std. 0 Min.', 'Aus 7 Anfangstagen', 'nicht der einzelne längste', 'Keine beginnende Schlafphase'],
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
          children: [{ id: 'a', name: 'Longest fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-10-03T10:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: copy[locale][0], exact: true }).click()
      const apply = async mode => {
        const before = await page.evaluate(mode => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          const session = (start, end, id) => ({ id, childId: 'a', startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), note: '', dayNightOverride: null, createdAt: new Date(start).toISOString(), updatedAt: new Date(end).toISOString() })
          data.sessions = [7, 8].flatMap(month => Array.from({ length: 7 }, (_, i) => {
            const start = new Date(2026, month, 2 * i + 1, 20).getTime()
            return session(start, start + 12 * 3600000, `${month}-${i}`)
          }))
          if (mode === 'missing') {
            data.sessions = data.sessions.filter(s => s.id.startsWith('7-'))
            // Synthetic touching fragments exercise a continuation-only month;
            // this is a missing-value rendering fixture, not a real sleep claim.
            const end = new Date(2026, 8, 15, 8).getTime()
            for (let start = new Date(2026, 7, 31, 20).getTime(); start < end; start += 12 * 3600000) {
              data.sessions.push(session(start, Math.min(end, start + 12 * 3600000), `continuation-${start}`))
            }
          }
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildMonthlyFamilyReport
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, mode)
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildMonthlyFamilyReport > before, before)
      }
      const development = page.locator('.development-card')
      const report = page.locator('.monthly-report-card')
      const capture = async (node, name) => {
        await node.evaluate(node => node.scrollIntoView({ block: 'center' }))
        const overflow = await node.evaluate(node => {
          const box = node.getBoundingClientRect()
          return [...node.querySelectorAll('*')].filter(child => child.scrollWidth > child.clientWidth + 1 || child.getBoundingClientRect().right > box.right + 1).map(child => `${child.className}: ${child.textContent}`)
        })
        assert.deepEqual(overflow, [], `Longest block layout ${locale}/${width}`)
        await node.screenshot({ path: `.private-backups/s10-${locale}-${width}-${name}.png` })
      }
      await apply('audit')
      const kpi = report.locator('.monthly-kpis > div').last()
      assert.equal(await kpi.locator('span').innerText(), copy[locale][1])
      assert.equal(await kpi.locator('strong').innerText(), copy[locale][2])
      assert.equal(await kpi.locator('.longest-block-basis').innerText(), copy[locale][3])
      for (const point of await development.locator('.then-now-grid > div').all()) {
        assert.ok((await point.innerText()).includes(`${copy[locale][1]}: ${copy[locale][2]}`))
        assert.equal(await point.locator('.longest-block-basis').innerText(), copy[locale][3])
      }
      assert.equal(await development.locator('.then-now-grid > div').count(), 2)
      for (const card of [development, report]) assert.ok((await card.locator('.longest-block-explanation').innerText()).includes(copy[locale][4]))
      await capture(development.locator('.then-now'), 'development')
      await capture(report, 'report')
      await apply('missing')
      assert.equal(await kpi.locator('strong').innerText(), copy[locale][5])
      assert.match(await kpi.locator('.longest-block-basis').innerText(), /0/)
      assert.ok((await development.locator('.then-now-grid > div').last().innerText()).includes(copy[locale][5]))
      await capture(report, 'missing')
      await apply('audit')
      assert.equal(await kpi.locator('strong').innerText(), copy[locale][2])
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: longest blocks ${locale}/${width}, both views 12h/7 start dates, explanation, missing/recovery, layout`)
    } finally { await context.close() }
  }
}
