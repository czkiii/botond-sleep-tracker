// Local-only browser rehearsal. Requires Playwright (or SOLEMI_PLAYWRIGHT_MODULE)
// and its Chromium, or an installed SOLEMI_BROWSER_CHANNEL such as msedge.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')) }
catch { throw new Error('Provide Playwright via SOLEMI_PLAYWRIGHT_MODULE (absolute package directory), or install it in the test environment.') }
const base = process.env.SOLEMI_PWA_TEST_BASE || '/'
assert.ok(base === '/' || base === '/botond-sleep-tracker/', 'Use a supported test base path')
await mkdir(join(root, '.wrangler'), { recursive: true })
const output = await mkdtemp(join(root, '.wrangler', 'pwa-check-'))
let servedBuild = join(output, 'a')
let failPrecache = false
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  res.setHeader('Cache-Control', 'no-store')
  if (path.startsWith('/api')) { res.writeHead(503).end('Local test: API disabled'); return }
  if (!path.startsWith(base)) { res.writeHead(404).end(); return }
  const relative = path.slice(base.length) || 'index.html'
  if (failPrecache && relative === 'index.html') { res.writeHead(503).end('Simulated failed update'); return }
  const file = resolve(servedBuild, relative)
  if (!file.startsWith(servedBuild + sep)) { res.writeHead(403).end(); return }
  try {
    const body = await readFile(file)
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    res.end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
let browser

async function until(check, label) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(100)
  }
  throw new Error(`Timed out: ${label}`)
}

try {
  // Separate test builds: only their HTML marker differs. This tests a rollback
  // within the current V4 diary/outbox contract, never a downgrade to V3.
  Object.assign(process.env, { VITE_INTERNAL_PREVIEW: 'false', VITE_ACCOUNT_AUTH: 'true',
    VITE_BASE_PATH: base, VITE_RELEASE_CHANNEL: '', VITE_SYNC_API_BASE: `${origin}/api-disabled`,
    VITE_ACCOUNT_API_BASE: '/api-disabled' })
  for (const version of ['a', 'b']) {
    await build({ root, mode: 'pwa-audit', logLevel: 'warn',
      build: { outDir: join(output, version) },
      plugins: [{ name: 'local-pwa-test-marker', transformIndexHtml: (html) =>
        html.replace('<head>', `<head><meta name="pwa-test-build" content="${version}">`) }]
    })
  }
  browser = await chromium.launch({ headless: true,
    ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort())
  // Keep app uploads offline while the browser downloads the SW update locally.
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }))
  const initial = await context.newPage()
  await initial.goto(`${origin}${base}`)
  await initial.evaluate(() => navigator.serviceWorker.ready)
  await initial.reload()
  await initial.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  const at = new Date(Date.now() - 10 * 60_000).toISOString()
  const child = { id: 'pwa-child', name: 'PWA audit', birthDate: null, photoRef: null, createdAt: at, updatedAt: at }
  const active = { id: 'pwa-active', childId: child.id, startTime: at, endTime: null,
    note: 'Saved before update', dayNightOverride: 'night', createdAt: at, updatedAt: at }
  const connection = { familyId: 'pwa-family', familyName: 'Local fixture', deviceId: 'pwa-device', deviceToken: 'fixture-only', revision: 10 }
  const pending = [
    { id: 'op-create', method: 'POST', path: '/v1/sessions/start', sessionId: active.id,
      body: { operationId: 'mut-create', baseRevision: 10, sessionId: active.id, childId: child.id, startTime: at, note: active.note, dayNightOverride: active.dayNightOverride } },
    { id: 'op-edit', method: 'PATCH', path: '/v1/sessions/other', sessionId: 'other',
      body: { operationId: 'mut-edit', baseRevision: 9, patch: { note: 'Offline edit' } } },
    { id: 'op-delete', method: 'DELETE', path: '/v1/sessions/deleted', sessionId: 'deleted',
      body: { operationId: 'mut-delete', baseRevision: 8 } }
  ]
  const diary = { version: 4, settings: { locale: 'hu', activeChildId: child.id, longSleepReminderEnabled: false },
    children: [child], sessions: [active], __solemiLocal: {
      familySyncV1: { connection, pending, conflicts: [], missingSessions: [], sessionRevisions: { other: 9 } }
    } }
  const parkedKey = 'solemiSleep:workspaceData:v1:account:parked-account'
  const parkedSnapshot = JSON.stringify({ diary: JSON.stringify(diary), legacyDiary: null, legacySync: null,
    detachedFamily: null, lastSyncAt: null })
  await initial.evaluate(({ diary, parkedKey, parkedSnapshot }) => {
    localStorage.setItem('solemiSleep:v4', JSON.stringify(diary))
    localStorage.setItem('solemiSleep:activeWorkspace:v1', JSON.stringify({ kind: 'account', accountId: 'pwa-owner' }))
    localStorage.setItem(parkedKey, parkedSnapshot)
  }, { diary, parkedKey, parkedSnapshot })
  await initial.reload()
  await initial.locator('.custom-correction').click()
  await initial.locator('textarea').fill('Unsaved draft must survive update discovery')
  const draftDocument = await initial.evaluate(() => {
    window.__pwaDocument = crypto.randomUUID()
    return window.__pwaDocument
  })
  const second = await context.newPage()
  await second.goto(`${origin}${base}`)
  await second.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  // Failure while downloading B must leave A active and its open editor intact.
  servedBuild = join(output, 'b')
  failPrecache = true
  await initial.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration.update()
    const installing = registration.installing
    if (installing && installing.state !== 'redundant') await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Failed update did not become redundant')), 20_000)
      installing.addEventListener('statechange', () => {
        if (installing.state === 'redundant') { clearTimeout(timeout); resolve() }
      })
    })
  })
  assert.equal(await initial.evaluate(() => window.__pwaDocument), draftDocument)
  assert.equal(await initial.locator('textarea').inputValue(), 'Unsaved draft must survive update discovery')
  assert.equal(await initial.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)), false)
  console.log('PASS: failed update keeps the active version and unsaved draft')

  failPrecache = false
  const nextWorkerEvent = context.waitForEvent('serviceworker')
  await initial.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
  const nextWorker = await nextWorkerEvent
  await initial.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))
  assert.equal(await initial.evaluate(() => window.__pwaDocument), draftDocument)
  assert.equal(await initial.locator('textarea').inputValue(), 'Unsaved draft must survive update discovery')
  assert.equal(await initial.locator('meta[name=pwa-test-build]').getAttribute('content'), 'a')
  await initial.locator('.save-button').click()
  await initial.waitForFunction(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).sessions[0].note === 'Unsaved draft must survive update discovery')
  const saved = await initial.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')))
  assert.deepEqual(saved.__solemiLocal.familySyncV1.pending.slice(0, 3), pending)
  assert.equal(saved.__solemiLocal.familySyncV1.pending.length, 4)
  await initial.close()
  assert.equal(await second.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)), true)
  assert.equal(await second.locator('meta[name=pwa-test-build]').getAttribute('content'), 'a')
  await second.close()
  await until(() => nextWorker.evaluate(() => self.registration.active?.state === 'activated' && !self.registration.waiting), 'B activation after both tabs close')
  console.log('PASS: update waits for both tabs; saving the draft keeps all queued operations')

  async function verifySaved(page, version) {
    await page.goto(`${origin}${base}`)
    await page.locator('.custom-correction').waitFor()
    assert.equal(await page.locator('meta[name=pwa-test-build]').getAttribute('content'), version)
    const state = await page.evaluate((parkedKey) => ({
      diary: JSON.parse(localStorage.getItem('solemiSleep:v4')),
      parked: localStorage.getItem(parkedKey), workspace: JSON.parse(localStorage.getItem('solemiSleep:activeWorkspace:v1'))
    }), parkedKey)
    assert.deepEqual(state.diary.sessions, saved.sessions)
    assert.deepEqual(state.diary.__solemiLocal.familySyncV1.pending, saved.__solemiLocal.familySyncV1.pending)
    assert.equal(state.parked, parkedSnapshot)
    assert.deepEqual(state.workspace, { kind: 'account', accountId: 'pwa-owner' })
    assert.equal(state.diary.sessions[0].endTime, null)
  }
  const upgraded = await context.newPage()
  await verifySaved(upgraded, 'b')
  await context.setOffline(true)
  await verifySaved(upgraded, 'b')
  await context.setOffline(false)
  console.log('PASS: upgraded app starts offline with active sleep, outbox and parked account preserved')

  servedBuild = join(output, 'a')
  const rollbackEvent = context.waitForEvent('serviceworker')
  await upgraded.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
  const rollbackWorker = await rollbackEvent
  await upgraded.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))
  await upgraded.close()
  await until(() => rollbackWorker.evaluate(() => self.registration.active?.state === 'activated' && !self.registration.waiting), 'A rollback activation')
  const rolledBack = await context.newPage()
  await verifySaved(rolledBack, 'a')
  const cacheUrls = await rolledBack.evaluate(async () => {
    const urls = []
    for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) urls.push(request.url)
    return urls
  })
  assert.ok(cacheUrls.length > 0)
  assert.ok(cacheUrls.every((url) => new URL(url).origin === origin && !new URL(url).pathname.startsWith('/api')))
  const apiPage = await context.newPage()
  assert.equal((await apiPage.goto(`${origin}/api/health`)).status(), 503)
  assert.match(await apiPage.locator('body').innerText(), /API disabled/)
  console.log('PASS: compatible rollback preserves data; cache contains app files, not API responses')
  console.log(`PASS: PWA lifecycle at ${base}; browser ${browser.version()}; fixtures: ${output}`)
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
