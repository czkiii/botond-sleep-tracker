import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// Reuse the isolated statistics server/browser; no accounts or remote data.
export async function checkRoutineClock(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const labels = {
    hu: ['Statisztika', 'Jellemző reggeli ébredés', 'éjfélen át', 'Még nincs egységes időpontminta'],
    en: ['Statistics', 'Typical morning wake-up', 'across midnight', 'No clear time pattern yet'],
    de: ['Statistik', 'Typisches morgendliches Aufwachen', 'über Mitternacht', 'Noch kein klares Zeitmuster'],
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
        const stamp = '2026-09-30T12:00:00Z'
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
          settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'Clock fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }],
          sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: labels[locale][0], exact: true }).click()
      const apply = async minutes => {
        await page.evaluate(minutes => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          data.sessions = minutes.map((minute, i) => {
            const end = new Date(2026, 8, 21 + i * 2, Math.floor(minute / 60), minute % 60)
            const endTime = end.toISOString(), startTime = new Date(end.getTime() - 2 * 3600000).toISOString()
            return { id: `clock-${i}`, childId: 'a', startTime, endTime, note: '', dayNightOverride: 'night', createdAt: startTime, updatedAt: endTime }
          })
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
        }, minutes)
      }
      const morning = page.locator('.routine-row').filter({ hasText: labels[locale][1] })
      await apply([1435, 5, 1435, 5])
      await morning.waitFor()
      assert.equal(await morning.locator('strong').innerText(), '00:00')
      assert.match(await morning.locator('small').innerText(), /23:55–00:05/)
      assert.ok((await morning.innerText()).includes(labels[locale][2]))
      await page.locator('.routine-card').screenshot({ path: `.private-backups/s03-${locale}-${width}-midnight.png` })
      await apply([60, 60, 300, 300])
      assert.equal(await morning.locator('strong').innerText(), labels[locale][3])
      assert.equal(await morning.locator('small').innerText().then(text => /03:00/.test(text)), false)
      assert.equal(await page.locator('.routine-card .routine-empty').count(), 0, 'Enough variable samples must not ask for three nights')
      assert.equal(await page.locator('.routine-card').evaluate(card => {
        const box = card.getBoundingClientRect()
        return [...card.querySelectorAll('*')].some(node => {
          const rect = node.getBoundingClientRect()
          return rect.right > box.right + 1 || node.scrollWidth > node.clientWidth + 1
        })
      }), false, 'Clock text must fit on a narrow phone')
      await page.locator('.routine-card').screenshot({ path: `.private-backups/s03-${locale}-${width}-variable.png` })
      await apply([0, 360, 720, 1080])
      assert.equal(await morning.locator('strong').innerText(), labels[locale][3])
      await apply([1435, 5])
      assert.equal(await morning.count(), 0)
      assert.equal(await page.locator('.routine-card .routine-empty').count(), 1)
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: circular routine ${locale}/${width}, midnight range, two modes, dispersion, insufficient samples, layout`)
    } finally { await context.close() }
  }
}
