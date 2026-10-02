import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// Synthetic diaries in fresh contexts. No real accounts or family records.
export async function checkWakeWindowSamples(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const labels = {
    hu: ['Statisztika', 'Még gyűjtjük a mintát', 'Jellemző érték', 'Második nappali alvás előtt', '3 minta', 'Futó alvás közben', 'tiszta ébrenléti ablak alapján'],
    en: ['Statistics', 'Still collecting a pattern', 'Typical value', 'Before the second daytime sleep', '3 samples', 'while sleep is active', 'clean wake windows'],
    de: ['Statistik', 'Muster wird noch gesammelt', 'Typischer Wert', 'Vor dem zweiten Tagschlaf', '3 Werte', 'Während eines laufenden Schlafs', 'sauberen Wachfenstern'],
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
      const rangeLabels = {
        hu: ['Korábbi ébrenlétek középső 50%-a', 'Nem a következő elalvás valószínűségét', 'Nem jelent 50% esélyt', 'Stabilabb minta', 'minta'],
        en: ['Middle 50% of past wake windows', 'does not show the probability', 'does not mean a 50% chance', 'Stronger pattern', 'samples'],
        de: ['Mittlere 50% früherer Wachzeiten', 'nicht die Wahrscheinlichkeit', 'keine 50%ige Wahrscheinlichkeit', 'Stabileres Muster', 'Werte'],
      }[locale]
      const checkEvidence = async count => {
        assert.equal(await card.locator('.insights-card-head b').innerText(), `${count} ${rangeLabels[4]}`)
        assert.ok((await card.locator('.wake-window-hero small').innerText()).includes(rangeLabels[0]))
        assert.ok((await card.locator('.wake-range-explanation').innerText()).includes(rangeLabels[1]))
        assert.ok(!(await card.innerText()).includes(rangeLabels[3]))
      }
      const checkLayout = async target => {
        await target.evaluate(node => node.scrollIntoView({ block: 'center' }))
        assert.deepEqual(await target.evaluate(card => {
          const box = card.getBoundingClientRect()
          // Highlight decoration may extend into the card padding.
          return [...card.querySelectorAll('*')].filter(node => {
            const rect = node.getBoundingClientRect()
            return rect.right > box.right + 1 || rect.left < box.left - 1 ||
              (!node.classList.contains('wake-breakdown') && node.scrollWidth > node.clientWidth + 1)
          }).map(node => ({ tag: node.tagName, text: node.textContent }))
        }), [], 'Evidence text must fit a narrow phone')
      }
      const apply = async tuples => {
        const before = await page.evaluate(tuples => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          data.sessions = tuples.map(([day, hour, endHour], i) => {
            const startTime = new Date(2026, 8, day, 0, Math.round(hour * 60)).toISOString()
            const endTime = endHour === null ? null : new Date(2026, 8, day, 0, Math.round(endHour * 60)).toISOString()
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
        assert.equal(await card.locator('.wake-range-explanation').count(), 0)
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
          await checkEvidence(3)
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
      await checkEvidence(3)
      const prediction = page.locator('.prediction-card')
      assert.equal(await prediction.locator('.insights-card-head b').innerText(), labels[locale][4])
      assert.ok((await prediction.locator('.prediction-range-explanation').innerText()).includes(rangeLabels[2]))
      await checkLayout(card)
      await card.screenshot({ path: `.private-backups/s04-${locale}-${width}-subgroup.png` })

      await apply(pairs([20, 25, 26]))
      assert.equal(await card.locator('.wake-window-hero').count(), 1)
      await card.locator('.insights-range button').first().click()
      await collecting(2)
      await card.locator('.insights-range button').last().click()
      await card.locator('.wake-window-hero').waitFor()
      assert.match(await card.locator('.wake-window-hero small').innerText(), /3 /)

      // Seven gaps from a single day are observations, not stronger confidence.
      await apply([...Array.from({ length: 8 }, (_, i) => [29, 6 + i, 6.25 + i]), [30, 13, null]])
      await checkEvidence(7)
      assert.equal(await prediction.locator('.insights-card-head b').count(), 0)
      assert.equal(await prediction.locator('.prediction-range-explanation').count(), 0)

      // The badge stays factual for both identical and widely spread samples.
      for (const [name, gaps, window] of [
        ['identical', [2, 2, 2, 2, 2, 2, 2], '11:00–11:00'],
        ['spread', [1, 2, 3, 4, 5, 6, 7], '11:30–14:30'],
      ]) {
        const tuples = gaps.flatMap((gap, i) => [[20 + i, 8, 9], [20 + i, 9 + gap, 10 + gap]])
        await apply([...tuples, [30, 8, 9]])
        await checkEvidence(7)
        assert.equal(await prediction.locator('.insights-card-head b').innerText(), `7 ${rangeLabels[4]}`)
        assert.equal(await prediction.locator('.prediction-window').innerText(), window)
        assert.ok((await prediction.locator('.prediction-range-explanation').innerText()).includes(rangeLabels[2]))
        assert.ok(!(await prediction.innerText()).includes(rangeLabels[3]))
        await checkLayout(card)
        await card.screenshot({ path: `.private-backups/s05-${locale}-${width}-${name}-wake.png` })
        await checkLayout(prediction)
        await prediction.screenshot({ path: `.private-backups/s05-${locale}-${width}-${name}-prediction.png` })
      }
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: wake minimum ${locale}/${width}, 0/1/2/3, active sleep, removal, subgroup count, range change, layout`)
      console.log(`PASS: factual evidence ${locale}/${width}, 9 total/3 selected, 7 same-day, identical/spread quartiles, prediction explanation, layout`)
    } finally { await context.close() }
  }
}
