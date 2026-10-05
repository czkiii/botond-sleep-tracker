// Isolated fixture diaries and fake API only; no real accounts or family data.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'vite'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const server = await createServer({ base: '/', server: { host: '127.0.0.1', port: 0 }, define: {
  'import.meta.env.VITE_INTERNAL_PREVIEW': JSON.stringify('true'),
  'import.meta.env.VITE_ACCOUNT_AUTH': JSON.stringify('false'),
  'import.meta.env.VITE_SYNC_API_BASE': JSON.stringify('/api')
} })
const labels = {
  hu: { settings: 'Beállítások', next: 'Következő konfliktus', family: 'A családi változat maradjon', local: 'Ezen a telefonon lévő maradjon', clear: 'Helyi alvásnapló törlése' },
  en: { settings: 'Settings', next: 'Next conflict', family: 'Keep the family version', local: 'Keep this phone’s version', clear: 'Delete the local sleep diary' },
  de: { settings: 'Einstellungen', next: 'Nächster Konflikt', family: 'Familienversion behalten', local: 'Version dieses Telefons behalten', clear: 'Lokales Schlaftagebuch löschen' }
}
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  await mkdir('.private-backups', { recursive: true })
  const results = []
  for (const locale of ['hu', 'en', 'de']) for (const width of [320, 520]) {
    const context = await browser.newContext({ viewport: { width, height: 852 }, timezoneId: 'Europe/Budapest', serviceWorkers: 'block' })
    const at = '2026-10-01T21:30:00.000Z'
    const child = { id: 'child', name: 'Próba', birthDate: null, photoRef: null, createdAt: at, updatedAt: at }
    const longNote = 'Local <script>literal</script>\n' + 'Long note with every word preserved. '.repeat(12)
    const sessions = ['one', 'two'].map(id => ({ id, childId: child.id, startTime: at,
      endTime: id === 'one' ? null : '2026-10-02T05:00:00.000Z', note: id === 'one' ? longNote : 'Second local', dayNightOverride: 'day', createdAt: at, updatedAt: at }))
    const pending = sessions.map(s => ({ id: `op-${s.id}`, method: 'PATCH', path: `/v1/sessions/${s.id}`, sessionId: s.id, body: { operationId: `mut-${s.id}`, baseRevision: 1, patch: { note: s.note, dayNightOverride: 'day' } } }))
    const conflicts = sessions.map(s => ({ operationId: `op-${s.id}`, entityType: 'SESSION', entityId: s.id, baseRevision: 1, serverRevision: 2,
      serverValue: { ...s, note: `Family ${s.id}`, dayNightOverride: 'night', revision: 2, deletedAt: null } }))
    const data = { version: 4, settings: { locale, activeChildId: child.id, longSleepReminderEnabled: false }, children: [child], sessions,
      __solemiLocal: { familySyncV1: { connection: { familyId: 'family', familyName: 'Conflict fixture', deviceId: 'device', deviceToken: 'fixture-only', revision: 1 }, pending, conflicts, missingSessions: [] } } }
    await context.addInitScript(data => { if (!localStorage.getItem('solemiSleep:v4')) localStorage.setItem('solemiSleep:v4', JSON.stringify(data)) }, data)
    const unexpected = [], mutations = [], errors = []
    let releaseMutation
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) { unexpected.push(url.origin); await route.abort(); return }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      if (route.request().method() === 'PATCH' && url.pathname === '/api/v1/sessions/one') {
        mutations.push(JSON.parse(route.request().postData()))
        await new Promise(resolve => { releaseMutation = resolve })
        await route.fulfill({ json: { ok: true, data: { revision: 3 } } }); return
      }
      if (url.pathname === '/api/v1/sync') { await route.fulfill({ json: { ok: true, data: { revision: 3, children: [], sessions: [] } } }); return }
      unexpected.push(`${route.request().method()} ${url.pathname}`); await route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin)
    await page.getByRole('button', { name: labels[locale].settings, exact: true }).click()
    const opener = page.locator('.family-sync-settings-button')
    await opener.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    assert.equal(await dialog.locator('.conflict-version').count(), 2)
    assert.equal(await dialog.locator('.conflict-version').first().locator('dd').last().textContent(), longNote)
    assert.equal(await dialog.locator('.conflict-version script').count(), 0)
    assert.equal(await dialog.locator('.conflict-field.changed').count(), 4)
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('solemiSleep:v4'))
      saved.__solemiLocal.familySyncV1.conflicts[0].serverValue.note = 'Family one updated'
      localStorage.setItem('solemiSleep:v4', JSON.stringify(saved))
      window.dispatchEvent(new Event('solemi-sync-state'))
    })
    await dialog.getByText('Family one updated', { exact: true }).waitFor()
    await page.locator('.language-select').evaluate(el => el.focus())
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab')
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)
    }
    await context.setOffline(true)
    await page.waitForFunction(() => document.querySelector('.family-sync-sheet .family-sync-primary').disabled)
    await context.setOffline(false)
    await page.waitForFunction(() => !document.querySelector('.family-sync-sheet .family-sync-primary').disabled)
    // A narrow screen stacks full versions; a wider screen compares columns.
    const layout = await dialog.locator('.conflict-version').evaluateAll(els => els.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })))
    assert.equal(layout[0].y === layout[1].y, width > 420)
    await page.screenshot({ path: `.private-backups/conflict-${locale}-${width}.png` })
    if (width === 320) {
      // Deterministic 200% text-resize stress, not an OS accessibility claim.
      await dialog.evaluate(el => {
        const nodes = Array.from(el.querySelectorAll('*')).filter(node => !node.classList.contains('sr-only'))
        const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize))
        nodes.forEach((node, index) => { node.style.fontSize = `${sizes[index] * 2}px` })
      })
      await page.screenshot({ path: `.private-backups/conflict-${locale}-200percent.png` })
      assert.equal(await dialog.locator('.family-sync-sheet').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `${locale} 200% text overflow`)
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
      assert.equal(await opener.evaluate(el => el === document.activeElement), true)
      await opener.click()
    }
    // Choosing the SECOND conflict must leave the first one and its queue intact.
    await dialog.getByRole('button', { name: labels[locale].next, exact: true }).click()
    assert.match(await dialog.locator('.conflict-version').last().innerText(), /Family two/)
    await dialog.getByRole('button', { name: labels[locale].family, exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).__solemiLocal.familySyncV1.conflicts.length === 1)
    const afterSecond = await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')))
    assert.equal(afterSecond.sessions.find(s => s.id === 'two').note, 'Family two')
    assert.equal(afterSecond.sessions.find(s => s.id === 'one').note, longNote)
    assert.equal(afterSecond.__solemiLocal.familySyncV1.pending[0].id, 'op-one')
    assert.equal(mutations.length, 0)
    // Pending network action contains focus and cannot be cancelled midway.
    await dialog.getByRole('button', { name: labels[locale].local, exact: true }).click()
    await page.waitForFunction(() => document.querySelector('dialog').getAttribute('aria-busy') === 'true')
    await page.keyboard.press('Escape')
    assert.equal(await dialog.isVisible(), true)
    await new Promise((resolve, reject) => { const started = Date.now(); const poll = () => releaseMutation ? resolve() : Date.now() - started > 3000 ? reject(Error('Mutation did not start')) : setTimeout(poll, 20); poll() })
    releaseMutation()
    await page.waitForFunction(() => document.querySelector('dialog')?.getAttribute('aria-busy') !== 'true')
    assert.equal(mutations.length, 1)
    assert.equal(mutations[0].baseRevision, 2)
    assert.equal(mutations[0].patch.note, longNote)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    assert.equal(await opener.evaluate(el => el === document.activeElement), true)
    // Cancel a destructive preview using Escape: diary must be unchanged.
    const beforeClear = await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions)
    const clear = page.locator('.action-stack button').filter({ hasText: labels[locale].clear })
    await clear.click(); await dialog.waitFor()
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    assert.equal(await clear.evaluate(el => el === document.activeElement), true)
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions), beforeClear)
    // Open existing sleep, use the three listboxes instead of hundreds of tabs.
    await page.locator('.settings-screen .back-button').click()
    await page.locator('.bottom-nav button').nth(1).click()
    await page.locator('.sleep-row').last().click()
    await dialog.waitFor()
    const wheel = dialog.getByRole('listbox').nth(1)
    const selected = () => wheel.locator('[aria-selected="true"]').textContent()
    await wheel.focus(); await page.keyboard.press('Home')
    await page.waitForFunction(() => document.querySelectorAll('[role="listbox"]')[1].querySelector('[aria-selected="true"]').textContent === '00')
    await page.keyboard.press('ArrowDown')
    assert.equal(await selected(), '01')
    await page.keyboard.press('End')
    assert.equal(await selected(), '23')
    assert.equal(await dialog.locator('.wheel-column button:not([tabindex="-1"])').count(), 0)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.locator('.bottom-nav button').nth(2).click()
    const range = page.locator('.development-card .insights-range button').last()
    await range.click(); await dialog.waitFor()
    await page.locator('.bottom-nav button').first().evaluate(el => el.focus())
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    assert.equal(await range.evaluate(el => el === document.activeElement), true)
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, [])
    results.push({ locale, width, comparison: 'PASS', selectedConflict: 'PASS', keyboard: 'PASS', textResize: width === 320 ? 'PASS' : 'n/a' })
    await context.close()
  }
  console.log(JSON.stringify({ cases: results, result: 'PASS' }, null, 2))
} finally { await browser?.close(); await server.close() }
