import assert from 'node:assert/strict'

// Fake time tests freshness independently of the real-time performance samples.
export async function checkStatisticsFreshness(browser, origin) {
  const context = await browser.newContext({ timezoneId: 'Europe/Budapest', serviceWorkers: 'block' })
  const at = Date.parse('2026-09-30T10:00:10Z')
  const iso = time => new Date(time).toISOString()
  const data = { version: 4, settings: { locale: 'en', activeChildId: 'a', longSleepReminderEnabled: false },
    children: ['a', 'b'].map(id => ({ id, name: id, birthDate: null, photoRef: null, createdAt: iso(at), updatedAt: iso(at) })),
    sessions: [{ id: 'active', childId: 'a', startTime: iso(at - 3600000), endTime: null, note: 'Keep running', dayNightOverride: null, createdAt: iso(at), updatedAt: iso(at) }] }
  await context.addInitScript(data => {
    localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
    localStorage.setItem('solemi-internal-plan-preview', 'familyPlus')
  }, data)
  const errors = [], unexpected = []
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || url.pathname.startsWith('/api/')) { unexpected.push(url.href); return route.abort() }
    return route.continue()
  })
  try {
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date(at) })
    await page.goto(origin)
    await page.locator('.orb-time').waitFor()
    await page.clock.pauseAt(new Date(at + 60000))
    const timerBefore = await page.locator('.orb-time').innerText()
    await page.clock.runFor(1000)
    assert.notEqual(await page.locator('.orb-time').innerText(), timerBefore, 'Stopwatch must still tick every second')
    const statistics = page.getByRole('button', { name: 'Statistics', exact: true })
    await statistics.click()
    const calls = () => page.evaluate(() => structuredClone(window.__statisticsMeasure.calls))
    const sourceCalls = async () => (await calls()).buildSleepDaySource
    let before = await calls()
    await page.clock.runFor(10000)
    assert.deepEqual(await calls(), before, 'No second-driven recomputation')
    await page.clock.runFor(39000)
    assert.ok(await sourceCalls() > before.buildSleepDaySource, 'Minute boundary refresh')
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions[0].endTime), null, 'Statistics must not end a running sleep')
    before = await calls()
    await page.locator('.wake-card .insights-range button').first().click()
    assert.ok((await calls()).buildInsightsFoundation > before.buildInsightsFoundation, 'Range selection refreshes its analysis')
    assert.equal(await sourceCalls(), before.buildSleepDaySource, 'Range selection reuses daily preparation')

    // A sync/import replacement uses the same event as a real remote update.
    const apply = async operation => {
      await page.evaluate(operation => {
        const data = JSON.parse(localStorage.getItem('solemiSleep:v4'))
        if (operation === 'finish') data.sessions[0].endTime = new Date(Date.now()).toISOString()
        if (operation === 'switch') data.settings.activeChildId = 'b'
        if (operation === 'switch-back') data.settings.activeChildId = 'a'
        if (operation === 'remove') data.sessions = []
        localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
        window.dispatchEvent(new Event('solemi-remote-data-applied'))
      }, operation)
    }
    const overview = page.locator('.stats-row')
    const emptyOverview = await overview.innerText()
    before = await calls()
    await apply('finish')
    assert.ok(await sourceCalls() > before.buildSleepDaySource, 'Ending a sleep refreshes immediately')
    assert.notEqual(await overview.innerText(), emptyOverview, 'Newly ended sleep is included without waiting a minute')
    before = await calls()
    await apply('switch')
    assert.ok(await sourceCalls() > before.buildSleepDaySource, 'Child change refreshes immediately')
    assert.equal(await overview.innerText(), emptyOverview, 'Child statistics stay isolated')
    await apply('switch-back')
    assert.notEqual(await overview.innerText(), emptyOverview)
    before = await calls()
    await apply('remove')
    assert.ok(await sourceCalls() > before.buildSleepDaySource, 'Deletion refreshes immediately')
    assert.equal(await overview.innerText(), emptyOverview)

    // Hidden tabs do no analytics work; returning catches up immediately.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    before = await calls()
    await page.clock.runFor(120000)
    assert.deepEqual(await calls(), before)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    assert.ok(await sourceCalls() > before.buildSleepDaySource)

    // Focus after a clock jump also re-arms the next minute (including midnight).
    await page.clock.setSystemTime(new Date('2026-09-30T21:59:59Z'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.locator('.segmented.four-options button').nth(3).click()
    assert.equal(await page.locator('.custom-range-picker input').first().getAttribute('max'), '2026-09-30')
    await page.clock.runFor(1000)
    assert.equal(await page.locator('.custom-range-picker input').last().getAttribute('max'), '2026-10-01')

    // Locking an already-open premium view must stop its builders too.
    await page.locator('.internal-plan-options').getByRole('button', { name: 'Free', exact: true }).click()
    before = await calls()
    await page.clock.runFor(60000)
    const locked = await calls()
    assert.ok(locked.buildSleepDaySource > before.buildSleepDaySource)
    for (const name of Object.keys(before).filter(name => name !== 'buildSleepDaySource')) assert.equal(locked[name], before[name], name)
    await page.locator('.internal-plan-options').getByRole('button', { name: 'Family+', exact: true }).click()
    assert.ok((await calls()).buildInsightsFoundation > locked.buildInsightsFoundation, 'Unlock builds fresh insights')

    // Unmounting removes the analysis timer and listeners.
    await page.locator('.bottom-nav button').first().click()
    before = await calls()
    await page.clock.runFor(61000)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    assert.deepEqual(await calls(), before, 'Unmount cleanup')
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    console.log('PASS: stopwatch, stable seconds, minute boundary, range selection, immediate data/deletion/child refresh, hidden/resume, focus/midnight, entitlement switch, unmount cleanup')
    return 'PASS'
  } finally { await context.close() }
}
