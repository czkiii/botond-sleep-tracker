// Isolated browser proof: real Web Locks, HttpOnly cookie rotation and WebCrypto.
// No user profile, real account, signing key or remote API is used.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const publicJwk = keys.publicKey.export({ format: 'jwk' })
const now = Math.floor(Date.now() / 1000)
const content = [ { alg: 'ES256', typ: 'JWT' }, { version: 1, iss: 'solemi-offline', aud: 'solemi-local-features',
  sub: 'browser-account', deviceId: 'browser-device', features: ['FAMILY_PLUS_INSIGHTS'], iat: now, exp: now + 120 } ]
  .map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.')
const offlineGrant = `${content}.${sign('sha256', Buffer.from(content), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
let cookie = 0, active = 0, peak = 0, refreshes = 0, rejected = 0
const server = await createServer({ base: '/', server: { host: '127.0.0.1', port: 0 },
  define: { 'import.meta.env.VITE_ACCOUNT_API_BASE': JSON.stringify('/api'),
    'import.meta.env.VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK': JSON.stringify(JSON.stringify(publicJwk)) },
  plugins: [{ name: 'isolated-account-fixture', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (req.url === '/account-test') {
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><script type="module">window.auth = await import("/src/accountAuth.ts"); window.ready = true</script>')
        return
      }
      if (!req.url?.startsWith('/api/')) return next()
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      const reply = data => res.end(JSON.stringify({ ok: true, data }))
      if (req.url === '/api/v1/auth/refresh') {
        refreshes++; peak = Math.max(peak, ++active)
        const sent = Number(/solemi_refresh=(\d+)/.exec(req.headers.cookie || '')?.[1])
        await new Promise(resolve => setTimeout(resolve, 50))
        active--
        if (sent !== cookie) {
          rejected++; res.statusCode = 401
          res.end(JSON.stringify({ ok: false, error: { code: 'REFRESH_REUSED' } })); return
        }
        cookie++
        res.setHeader('Set-Cookie', `solemi_refresh=${cookie}; HttpOnly; SameSite=Lax; Path=/api/v1/auth`)
        reply({ account: { id: 'browser-account', email: 'fixture@example.test', name: 'Fixture' }, deviceId: 'browser-device',
          accessToken: 'fixture-access', accessExpiresAt: Date.now() + 300000, expiresAt: Date.now() + 86400000 })
      } else if (req.url === '/api/v1/auth/access') {
        reply({ features: ['FAMILY_PLUS_INSIGHTS'], accountFeatures: ['FAMILY_PLUS_INSIGHTS'], familyFeatures: [],
          membership: null, familySync: { status: 'NO_ACTIVE_MEMBERSHIP', canSync: false }, offlineGrant })
      } else { res.statusCode = 404; res.end('{}') }
    })
  } }]
})
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true,
    ...(process.env.SOLEMI_BROWSER_CHANNEL ? { channel: process.env.SOLEMI_BROWSER_CHANNEL } : {}) })
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await context.addCookies([{ name: 'solemi_refresh', value: '0', url: `${origin}/api/v1/auth`, httpOnly: true, sameSite: 'Lax' }])
  await context.addInitScript(() => localStorage.setItem('solemiSleep:activeWorkspace:v1', JSON.stringify({ kind: 'account', accountId: 'browser-account' })))
  const pages = await Promise.all([context.newPage(), context.newPage()])
  for (const page of pages) { await page.goto(`${origin}/account-test`); await page.waitForFunction(() => window.ready) }
  await Promise.all(pages.map(page => page.evaluate(() => window.auth.restoreAccount())))
  assert.equal(refreshes, 2); assert.equal(peak, 1); assert.equal(rejected, 0)
  console.log('PASS: two real browser tabs rotate one shared HttpOnly cookie without replay')
  await pages[0].evaluate(() => window.auth.getAccountAccess())
  await pages[0].close(); await pages[1].close()
  const cold = await context.newPage()
  await cold.goto(`${origin}/account-test`); await cold.waitForFunction(() => window.ready)
  await context.setOffline(true)
  const offline = await cold.evaluate(async () => {
    const account = await window.auth.restoreAccount()
    const access = await window.auth.getAccountAccess()
    return { account, access, token: sessionStorage.getItem('solemiSleep:accountAccess') }
  })
  assert.equal(offline.account, null); assert.equal(offline.token, null)
  assert.deepEqual(offline.access.features, ['FAMILY_PLUS_INSIGHTS']); assert.equal(offline.access.familySync.canSync, false)
  assert.equal(refreshes, 2)
  console.log('PASS: fresh page state recovers signed local rights offline without account authentication or cloud access')
  const expired = await cold.evaluate(async () => {
    const oldNow = Date.now
    Date.now = () => oldNow() + 180000
    try { await window.auth.getAccountAccess(); return false } catch { return true }
  })
  assert.equal(expired, true)
  console.log('PASS: signed offline rights stop at expiry')
} finally { await browser?.close(); await server.close() }
