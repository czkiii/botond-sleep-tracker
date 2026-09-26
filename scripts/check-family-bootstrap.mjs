// Isolated UI regression: real React app + local fake API. Never uses user profiles or remote data.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')) }
catch { throw new Error('Provide Playwright via SOLEMI_PLAYWRIGHT_MODULE, or install it in the test environment.') }

const server = await createServer({
  base: '/', server: { host: '127.0.0.1', port: 0 },
  define: {
    'import.meta.env.VITE_INTERNAL_PREVIEW': JSON.stringify('true'),
    'import.meta.env.VITE_ACCOUNT_AUTH': JSON.stringify('false'),
    'import.meta.env.VITE_SYNC_API_BASE': JSON.stringify('/api')
  }
})
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true,
    ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'hu-HU', serviceWorkers: 'block' })
  const at = '2026-08-26T10:00:00.000Z'
  const child = id => ({ id, name: 'Boti', birthDate: '2025-08-23', photoRef: null, createdAt: at, updatedAt: at })
  const sleep = (id, childId) => ({ id, childId, startTime: at, endTime: null, note: id, dayNightOverride: null, createdAt: at, updatedAt: at })
  const local = { version: 4, settings: { locale: 'hu', activeChildId: 'local-child', longSleepReminderEnabled: false },
    children: [child('local-child')], sessions: [sleep('local-active', 'local-child')] }
  await context.addInitScript(data => {
    if (!localStorage.getItem('solemiSleep:v4')) localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
  }, local)
  let joins = 0
  let failDownload = false
  const unexpected = []
  const snapshot = { revision: 3, familyName: 'Helyi böngészőpróba',
    children: [{ ...child('family-child'), revision: 1, deletedAt: null }],
    sessions: [{ ...sleep('family-active', 'family-child'), revision: 3, deletedAt: null }] }
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) { unexpected.push(url.origin); await route.abort(); return }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
    let data
    if (url.pathname === '/api/v1/join') {
      joins++
      data = { familyId: 'family', familyName: snapshot.familyName, device: { id: 'device' }, deviceToken: 'local-test-token', revision: 3 }
    } else if (url.pathname === '/api/v1/sync') {
      if (failDownload) { await route.abort(); return }
      data = snapshot
    } else {
      unexpected.push(`${route.request().method()} ${url.pathname}`)
      await route.abort(); return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  const settings = () => page.getByRole('button', { name: 'Beállítások', exact: true }).click()
  const panel = () => page.locator('.family-sync-settings-button').click()
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')))
  await settings(); await panel()
  await page.getByRole('button', { name: 'Csatlakozás kóddal', exact: true }).click()
  await page.getByPlaceholder('Meghívókód').fill('LOCAL123')
  await page.getByRole('button', { name: 'Csatlakozás', exact: true }).click()
  await page.getByRole('button', { name: 'A családi naplót használom', exact: true }).waitFor()
  assert.deepEqual((await stored()).sessions, local.sessions)
  await page.getByRole('button', { name: 'Egyelőre maradjon a helyi napló', exact: true }).click()
  await page.reload()
  await settings(); await panel()
  assert.deepEqual((await stored()).sessions, local.sessions)
  failDownload = true
  await page.getByRole('button', { name: 'Családi napló áttekintése', exact: true }).click()
  await page.locator('.family-sync-error').waitFor()
  assert.deepEqual((await stored()).sessions, local.sessions)
  failDownload = false
  await page.getByRole('button', { name: 'Családi napló áttekintése', exact: true }).click()
  await page.getByRole('button', { name: 'A családi naplót használom', exact: true }).waitFor()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Helyi napló letöltése', exact: true }).click()
  const backup = await download
  assert.ok(backup.suggestedFilename().endsWith('.json'))
  const beforeUrl = page.url()
  await page.getByRole('button', { name: 'A családi naplót használom', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions[0]?.id === 'family-active')
  assert.equal(page.url(), beforeUrl)
  const result = await stored()
  assert.equal(result.children.length, 1)
  assert.equal(result.children[0].id, 'family-child')
  assert.deepEqual(result.__solemiLocal.safetyBackupV1.data.sessions, local.sessions)
  assert.equal(result.__solemiLocal.familySyncV1.connection.revision, 3)
  assert.deepEqual(result.__solemiLocal.familySyncV1.pending, [])
  assert.equal(joins, 1)
  assert.deepEqual(unexpected, [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', browser: browser.version(), viewport: '393x852',
    cases: ['same-name different profiles', 'postpone + reload', 'failed download + retry', 'local export', 'confirmed family choice + local backup'] }))
} finally {
  await browser?.close()
  await server.close()
}
