// Production-build, local-only PDF acceptance. No real accounts or diary data.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const base = '/botond-sleep-tracker/'
await mkdir(join(root, '.wrangler'), { recursive: true })
const output = await mkdtemp(join(root, '.wrangler', 'pdf-check-'))
const artifacts = join(root, '.private-backups', 'pdf-export')
await mkdir(artifacts, { recursive: true })
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  if (!path.startsWith(base)) { res.writeHead(404).end(); return }
  const file = resolve(output, path.slice(base.length) || 'index.html')
  if (!file.startsWith(output + sep)) { res.writeHead(403).end(); return }
  try { res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)) }
  catch { res.writeHead(404).end() }
})
let browser
try {
  Object.assign(process.env, { VITE_INTERNAL_PREVIEW: 'true', VITE_ACCOUNT_AUTH: 'false', VITE_BASE_PATH: base, VITE_RELEASE_CHANNEL: '', VITE_SYNC_API_BASE: '/api-disabled' })
  await build({ root, mode: 'pdf-audit', logLevel: 'warn', build: { outDir: output } })
  const sw = await readFile(join(output, 'sw.js'), 'utf8')
  assert.match(sw, /fonts\/NotoSans-Regular.ttf/)
  assert.match(sw, /pdfRenderer-[^"']+\.js/)
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true, ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  const cases = []
  for (const [locale, plan, notes, offline] of [['hu', 'family', false, false], ['en', 'family', true, true], ['de', 'familyPlus', true, false], ['hu', 'free', false, false]]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 852 }, timezoneId: 'Europe/Budapest', serviceWorkers: 'allow' })
    const at = '2026-09-01T10:00:00Z'
    const note = 'NOTE-MARKER Árvíztűrő tükörfúrógép ÄÖÜß <script>literal</script> 😀\n' + 'A long note remains readable across pages. '.repeat(95) + 'END-NOTE'
    const data = { version: 4, settings: { locale: 'hu', activeChildId: 'a', longSleepReminderEnabled: false },
      children: ['a', 'b'].map(id => ({ id, name: id === 'a' ? 'Árvíztűrő tükörfúrógép – ÄÖÜß' : 'PRIVATE-OTHER-CHILD', birthDate: '2025-01-02', photoRef: null, createdAt: at, updatedAt: at })),
      sessions: [
        { id: 'a1', childId: 'a', startTime: '2026-08-31T21:00:00Z', endTime: '2026-09-01T06:00:00Z', note, dayNightOverride: 'night', createdAt: at, updatedAt: at },
        { id: 'a2', childId: 'a', startTime: '2026-09-01T05:00:00Z', endTime: '2026-09-01T07:00:00Z', note: 'SECOND-NOTE', dayNightOverride: 'day', createdAt: at, updatedAt: at },
        { id: 'a3', childId: 'a', startTime: '2026-10-07T08:00:00Z', endTime: null, note: 'ACTIVE-NOTE', dayNightOverride: null, createdAt: at, updatedAt: at },
        { id: 'b1', childId: 'b', startTime: '2026-09-01T05:00:00Z', endTime: '2026-09-01T07:00:00Z', note: 'PRIVATE-OTHER-NOTE', dayNightOverride: 'day', createdAt: at, updatedAt: at }
      ] }
    await context.addInitScript(({ data, plan }) => {
      if (!localStorage.getItem('solemiSleep:v4')) localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
      localStorage.setItem('solemi-internal-plan-preview', plan)
    }, { data, plan })
    const unexpected = [], errors = []
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.includes('/api')) { unexpected.push(url.href); return route.abort() }
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'))
    await page.goto(origin + base)
    // Preview deliberately skips registration; explicitly install the identical
    // generated worker to test precaching without live account credentials.
    await page.evaluate(async base => {
      await navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('SW installation timed out')), 20000))])
    }, base)
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await page.getByRole('button', { name: 'Beállítások', exact: true }).click({ timeout: 10000 }).catch(async error => {
      console.error('Startup diagnostic:', await page.locator('body').innerText(), errors)
      throw error
    })
    await page.locator('.language-select').selectOption(locale)
    if (offline) await context.setOffline(true)
    const before = await page.evaluate(() => localStorage.getItem('solemiSleep:v4'))
    const button = page.locator('.pdf-export-button')
    await button.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    if (plan === 'free') {
      assert.equal(await dialog.locator('input, select, button[type=submit]').count(), 0)
      assert.ok(await dialog.getByRole('status').textContent())
      await page.keyboard.press('Escape')
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Adatok exportálása', exact: true }).click()
      assert.match((await download).suggestedFilename(), /\.json$/)
    } else {
      assert.equal(await dialog.locator('input[type=checkbox]').isChecked(), false)
      await dialog.locator('input[type=date]').nth(0).fill('2026-09-01')
      await dialog.locator('input[type=date]').nth(1).fill('2026-10-07')
      if (notes) await dialog.locator('input[type=checkbox]').check()
      assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false)
      await page.screenshot({ path: join(artifacts, `${locale}-dialog.png`) })
      const downloaded = page.waitForEvent('download')
      await dialog.locator('button[type=submit]').click()
      const download = await downloaded
      assert.equal(download.suggestedFilename(), 'solemi-sleep-2026-09-01-2026-10-07.pdf')
      const file = join(artifacts, `${locale}.pdf`)
      await download.saveAs(file)
      assert.equal((await readFile(file)).subarray(0, 5).toString(), '%PDF-')
      assert.ok(await dialog.getByRole('status').textContent())
      await page.keyboard.press('Escape')
      assert.equal(await button.evaluate(el => el === document.activeElement), true)
      assert.equal(await page.evaluate(() => localStorage.getItem('solemiSleep:v4')), before)
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    cases.push({ locale, plan, notes, offline, passed: true })
    await context.close()
  }
  const result = { browser: browser.version(), base, cases, artifacts }
  await writeFile(join(artifacts, 'browser-result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally { await browser?.close(); if (server.listening) await new Promise(done => server.close(done)) }
