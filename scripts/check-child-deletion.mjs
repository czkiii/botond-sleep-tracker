// Isolated real-UI regression with a local fake API; never opens user profiles.
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
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true,
    ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'hu-HU', serviceWorkers: 'block' })
  const at = '2026-08-26T10:00:00.000Z'
  const child = (id, name) => ({ id, name, birthDate: '2025-08-23', photoRef: null, createdAt: at, updatedAt: at })
  const children = [child('child-a', 'Megmaradó baba'), child('child-b', 'Másik baba')]
  const sleep = { id: 'old-sleep', childId: 'child-a', startTime: at, endTime: null,
    note: 'Megőrzendő alvás', dayNightOverride: 'day', createdAt: at, updatedAt: at }
  const data = { version: 4, settings: { locale: 'hu', activeChildId: 'child-a', longSleepReminderEnabled: false },
    children, sessions: [sleep], __solemiLocal: { familySyncV1: {
      connection: { familyId: 'family', familyName: 'Helyi törlési próba', deviceId: 'device', deviceToken: 'test-only', revision: 3 },
      pending: [], conflicts: [], missingSessions: []
    } } }
  await context.addInitScript(data => {
    if (!localStorage.getItem('solemiSleep:v4')) localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
  }, data)
  let rejected = false
  let deletes = 0
  const unexpected = []
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) { unexpected.push(url.origin); await route.abort(); return }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
    if (url.pathname === '/api/v1/children/child-a' && route.request().method() === 'DELETE') {
      deletes++
      rejected = true // The other device has deleted child-b first.
      await route.fulfill({ status: 409, contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'LAST_CHILD', message: 'Last child protected' } }) })
      return
    }
    if (url.pathname === '/api/v1/sync') {
      const full = url.searchParams.get('after') === '0'
      const snapshot = { revision: rejected ? 4 : 3,
        children: rejected ? children.map(c => ({ ...c, deletedAt: c.id === 'child-b' ? at : null, revision: 4 })) : [],
        sessions: full ? [{ ...sleep, deletedAt: null, revision: 2 }] : [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: snapshot }) })
      return
    }
    unexpected.push(`${route.request().method()} ${url.pathname}`)
    await route.abort()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.goto(origin)
  const settings = () => page.getByRole('button', { name: 'Beállítások', exact: true }).click()
  await settings()
  await page.locator('.child-list-row').filter({ hasText: 'Megmaradó baba' }).locator('.child-edit-button').click()
  await page.locator('.child-editor-screen .delete-button').click()
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('solemiSleep:v4'))
    return saved.__solemiLocal.familySyncV1.childDeletionRejected && saved.children.length === 1 && saved.sessions.length === 1
  })
  await page.locator('.family-sync-settings-button').click()
  await page.getByText('A gyermektörlést nem hajtottuk végre.', { exact: true }).last().waitFor()
  await mkdir('.private-backups', { recursive: true })
  await page.screenshot({ path: '.private-backups/a14-child-deletion.png', fullPage: true })
  await page.reload()
  await settings()
  await page.locator('.family-sync-settings-button').click()
  await page.getByRole('button', { name: 'Értem', exact: true }).click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')))
  assert.equal(saved.__solemiLocal.familySyncV1.childDeletionRejected, false)
  assert.deepEqual(saved.__solemiLocal.familySyncV1.pending, [])
  assert.deepEqual(saved.sessions, [sleep])
  assert.deepEqual(saved.children, [children[0]])
  assert.equal(deletes, 1)
  assert.deepEqual(unexpected, [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', browser: browser.version(), viewport: '393x852',
    cases: ['UI deletion rejected', 'profile and old active sleep restored', 'notice survives reload', 'notice dismissed', 'no repeated DELETE'] }))
} finally {
  await browser?.close()
  await server.close()
}
