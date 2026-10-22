import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

export async function checkNightResettling(browser, origin) {
  await mkdir('.private-backups', { recursive: true })
  const copy = {
    hu: ['Statisztika', '7 ó 0 p', '15 p', 'Az éjszaka első elalvása előtt', 'Éjszakai visszaalvás előtt'],
    en: ['Statistics', '7 hr 0 min', '15 min', 'Before the first sleep of the night', 'Before settling back to sleep at night'],
    de: ['Statistik', '7 Std. 0 Min.', '15 Min.', 'Vor dem ersten Schlaf der Nacht', 'Vor dem nächtlichen Wiedereinschlafen'],
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
        const stamp = '2026-09-30T17:00:00Z'
        localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
        localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
          settings: { locale, activeChildId: 'a', longSleepReminderEnabled: false },
          children: [{ id: 'a', name: 'Night samples fixture', birthDate: null, photoRef: null, createdAt: stamp, updatedAt: stamp }], sessions: [],
        }))
      }, locale)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-30T17:00:00Z') })
      await page.goto(origin)
      await page.getByRole('button', { name: copy[locale][0], exact: true }).click()
      const wake = page.locator('.wake-card'), prediction = page.locator('.prediction-card')
      const apply = async mode => {
        const late = ['resettling', 'sparse-back', 'active'].includes(mode)
        await page.clock.setSystemTime(new Date(late ? '2026-09-30T22:05:00Z' : '2026-09-30T17:00:00Z'))
        const before = await page.evaluate(({ mode, late }) => {
          const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
          const time = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString()
          const session = (id, startTime, endTime) => ({ id, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime ?? startTime })
          data.sessions = (mode === 'sparse-bed' ? [27, 28] : [26, 27, 28]).flatMap(day => [
            session(`${day}-nap`, time(day, 12), time(day, 13)),
            session(`${day}-bed`, time(day, 20), time(day + 1, 0)),
            ...(mode === 'sparse-back' ? [] : [session(`${day}-back1`, time(day + 1, 0, 15), time(day + 1, 3)), session(`${day}-back2`, time(day + 1, 3, 15), time(day + 1, 6))]),
          ])
          data.sessions.push(session('today', time(30, 12), time(30, 13)))
          if (late) data.sessions.push(session('current-night', time(30, 20), mode === 'active' ? null : time(31, 0)))
          localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
          const calls = window.__statisticsMeasure.calls.buildPredictionLite
          window.dispatchEvent(new Event('solemi-remote-data-applied'))
          return calls
        }, { mode, late })
        await page.waitForFunction(before => window.__statisticsMeasure.calls.buildPredictionLite > before, before)
      }
      const capture = async name => {
        for (const [label, card] of [['wake', wake], ['prediction', prediction]]) {
          assert.doesNotMatch(await card.innerText(), /\{\w+\}/)
          assert.deepEqual(await card.evaluate(node => [...node.querySelectorAll('*')].filter(child => child.scrollWidth > child.clientWidth + 1).map(child => child.textContent)), [])
          await card.screenshot({ path: `.private-backups/s15-${locale}-${width}-${name}-${label}.png`, style: '.internal-preview-banner, .bottom-nav { visibility: hidden !important; }' })
        }
      }
      await apply('evening')
      assert.equal(await wake.locator('.wake-window-hero strong').innerText(), copy[locale][1])
      assert.equal(await wake.locator('.wake-window-hero > span').innerText(), copy[locale][3])
      assert.match(await wake.locator('.wake-breakdown .relevant small').innerText(), /3/)
      assert.equal(await prediction.locator('.prediction-window').innerText(), '20:00–20:00')
      assert.ok((await wake.locator('.wake-breakdown').innerText()).includes(copy[locale][4]))
      await capture('bedtime')
      await apply('resettling')
      assert.equal(await wake.locator('.wake-window-hero strong').innerText(), copy[locale][2])
      assert.equal(await wake.locator('.wake-window-hero > span').innerText(), copy[locale][4])
      assert.match(await wake.locator('.wake-breakdown .relevant small').innerText(), /6/)
      assert.equal(await prediction.locator('.prediction-window').innerText(), '00:15–00:15')
      await capture('resettling')
      for (const mode of ['sparse-bed', 'sparse-back']) {
        await apply(mode)
        assert.equal(await wake.locator('.wake-window-hero').count(), 0, 'Other sleep groups must not replace missing night evidence')
        assert.equal(await prediction.locator('.prediction-window').count(), 0)
        await capture(mode)
      }
      await apply('active')
      assert.equal(await prediction.locator('.prediction-window').count(), 0)
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions.at(-1).endTime), null)
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS: night samples ${locale}/${width}, 7-hour bedtime vs 15-minute resettling, matching 3/6 samples, sparse groups, active sleep, layout`)
    } finally { await context.close() }
  }
}
