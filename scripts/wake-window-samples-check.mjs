import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// Synthetic diaries in fresh contexts. No real accounts or family records.
export async function checkWakeWindowSamples(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const labels = {
    hu: ['Statisztika', 'Még gyűjtjük a mintát', 'Jellemző érték', 'Második nappali alvás előtt', 'Korai jelzés', 'Futó alvás közben', 'tiszta ébrenléti ablak alapján'],
    en: ['Statistics', 'Still collecting a pattern', 'Typical value', 'Before the second daytime sleep', 'Early signal', 'while sleep is active', 'clean wake windows'],
    de: ['Statistik', 'Muster wird noch gesammelt', 'Typischer Wert', 'Vor dem zweiten Tagschlaf', 'Frühes Signal', 'Während eines laufenden Schlafs', 'sauberen Wachfenstern'],
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
          children: [{ id: 'a', name: 'Wake fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: labels[locale][0], exact: true }).click()
      const card = page.locator('.wake-card')
      await card.waitFor()
      const apply = async tuples => {
        const before = await page.evaluate(tuples => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          data.sessions = tuples.map(([day, hour, endHour], i) => {
            const startTime = new Date(2026, 8, day, hour).toISOString()
            const endTime = endHour === null ? null : new Date(2026, 8, day, endHour).toISOString()
            return { id: `wake-${i}`, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime ?? startTime }
          })
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildInsightsFoundation
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, tuples)
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildInsightsFoundation > before, before)
      }
      const pairs = days => days.flatMap(day => [[day, 8, 9], [day, 11, 12]])
      const collecting = async count => {
        await card.getByText(`${labels[locale][1]} (${count}/3)`, { exact: true }).waitFor()
        assert.equal(await card.locator('.wake-window-hero').count(), 0)
        assert.equal(await card.locator('.insights-card-head b').count(), 0)
        assert.equal((await card.innerText()).split(labels[locale][1]).length - 1, 1, 'Collecting explanation appears once')
      }
      for (const count of [0, 1, 2, 3]) {
        await apply(pairs([25, 26, 27].slice(0, count)))
        if (count < 3) await collecting(count)
        else {
          assert.equal(await card.locator('.wake-window-hero > span').innerText(), labels[locale][2])
          assert.match(await card.locator('.wake-window-hero strong').innerText(), /^2 /)
          assert.match(await card.locator('.wake-window-hero small').innerText(), /3 /)
          assert.ok(!(await card.innerText()).includes(labels[locale][1]))
        }
        assert.ok(!(await card.innerText()).includes(labels[locale][5]), 'Empty diary must not claim active sleep')
        if (count === 2 || count === 3) await card.screenshot({ path: `.private-backups/s04-${locale}-${width}-${count}-samples.png` })
      }
      await apply([...pairs([25, 26, 27]), [30, 13, null]])
      assert.equal(await card.locator('.wake-window-hero').count(), 1)
      assert.equal(await card.locator('.current-awake-status').count(), 0)
      assert.ok((await card.innerText()).includes(labels[locale][5]))
      assert.ok((await card.innerText()).includes(labels[locale][6]))
      assert.ok(!(await card.innerText()).includes(labels[locale][1]), 'Historical readiness is independent of active sleep')
      await apply(pairs([25, 26]))
      await collecting(2)

      // Nine total gaps, but only three before the second nap. Today has
      // one nap, so the highlighted subgroup is that three-sample pattern.
      await apply([...[27, 28, 29].flatMap(day => [8, 11, 14, 17].map(hour => [day, hour, hour + 1])), [30, 8, 9]])
      assert.equal(await card.locator('.wake-window-hero > span').innerText(), labels[locale][3])
      assert.match(await card.locator('.wake-window-hero small').innerText(), /3 /)
      const basis = await card.locator(':scope > small').first().innerText()
      assert.match(basis, /3 /)
      assert.ok(basis.includes(labels[locale][6]))
      assert.equal(await card.locator('.insights-card-head b').innerText(), labels[locale][4])
      await card.screenshot({ path: `.private-backups/s04-${locale}-${width}-subgroup.png` })
      assert.deepEqual(await card.evaluate(card => {
        const box = card.getBoundingClientRect()
        // The highlighted row deliberately extends 8 px into card padding.
        // Check it against the card; do not mistake that decoration for clipped text.
        return [...card.querySelectorAll('*')].filter(node => {
          const rect = node.getBoundingClientRect()
          return rect.right > box.right + 1 || rect.left < box.left - 1 ||
            (!node.classList.contains('wake-breakdown') && node.scrollWidth > node.clientWidth + 1)
        })
          .map(node => ({ tag: node.tagName, className: node.className, text: node.textContent, width: node.clientWidth, scrollWidth: node.scrollWidth }))
      }), [], 'Wake card must fit a narrow phone')

      await apply(pairs([20, 25, 26]))
      assert.equal(await card.locator('.wake-window-hero').count(), 1)
      await card.locator('.insights-range button').first().click()
      await collecting(2)
      await card.locator('.insights-range button').last().click()
      await card.locator('.wake-window-hero').waitFor()
      assert.match(await card.locator('.wake-window-hero small').innerText(), /3 /)
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: wake minimum ${locale}/${width}, 0/1/2/3, active sleep, removal, subgroup count, range change, layout`)
    } finally { await context.close() }
  }
}
