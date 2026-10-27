// Isolated browser proof: no real diary, family API or login is accessed.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname, resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const base = '/botond-sleep-tracker/'
const destination = 'https://solemi-sleep-internal.pages.dev/'
let legacy = false
const oldSW = `self.addEventListener('install',e=>e.waitUntil(caches.open('old-diary').then(c=>c.put('${base}',new Response('<h1>Old diary</h1>',{headers:{'Content-Type':'text/html'}})))));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.match('${base}'))})`
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (!pathname.startsWith(base)) return res.writeHead(404).end()
  const file = pathname.slice(base.length) || 'index.html'
  if (legacy && file === 'sw.js') return res.setHeader('Content-Type','text/javascript'), res.end(oldSW)
  if (legacy && file === 'index.html') return res.setHeader('Content-Type','text/html'), res.end('<h1>Old diary</h1>')
  if (!['index.html', 'entry.js', 'entry.css', 'sw.js'].includes(file)) return res.writeHead(404).end()
  res.setHeader('Content-Type', { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }[extname(file)])
  res.end(await readFile(resolve('legacy-entry', file)))
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: process.env.SOLEMI_BROWSER_CHANNEL || 'msedge', headless: true })
const errors = []
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  await ctx.route('**/*', route => route.request().url().startsWith(origin)
    ? route.continue() : route.request().url() === destination
      ? route.fulfill({ contentType: 'text/html', body: '<h1>New app (test stub)</h1>' }) : route.abort())
  ctx.on('page', p => p.on('pageerror', e => errors.push(String(e))))
  return ctx
}
const diary = { version:3, settings:{childName:'Synthetic child',locale:'hu'},sessions:[
  {id:'test-done',start:'2026-10-26T19:00:00.000Z',end:'2026-10-27T05:00:00.000Z',note:'Keep exactly',createdAt:'2026-10-26T19:00:00.000Z',updatedAt:'2026-10-27T05:00:00.000Z'},
  {id:'test-active',start:'2026-10-27T18:20:00.000Z',end:null,note:'',createdAt:'2026-10-27T18:20:00.000Z',updatedAt:'2026-10-27T18:20:00.000Z'}
] }
try {
  const ctx = await context(); let page = await ctx.newPage()
  await page.goto(origin+base+'?backup=1')
  await page.evaluate(data => { localStorage.setItem('solemiSleep:v3',JSON.stringify(data)); localStorage.setItem('solemiSleep:sync:v1','private-token-must-not-export') }, diary)
  await page.goto(origin+base)
  await page.getByRole('button', {name:'Régi napló letöltése (V3)',exact:true}).waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'Régi napló letöltése (V3)',exact:true}).click()])
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  assert.equal(exported.format, 'solemi-sleep-backup');assert.deepEqual(exported.data,diary)
  assert.equal(JSON.stringify(exported).includes('private-token'),false)
  assert.equal(await page.evaluate(()=>localStorage.getItem('solemiSleep:v3')),JSON.stringify(diary))
  await mkdir('worker/.private-backups/pages-transition-2026-10-27',{recursive:true})
  await page.screenshot({path:'worker/.private-backups/pages-transition-2026-10-27/entry-mobile.png',fullPage:true})
  await page.getByRole('link',{name:'Az új app megnyitása',exact:true}).click();await page.waitForURL(destination)
  await page.goto(origin+base);await page.waitForURL(destination)
  await page.goto(origin+base+'?backup=1');await page.getByRole('button',{name:'Régi napló letöltése (V3)',exact:true}).waitFor()
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('solemiSleep:v3'));d.sessions[1].note='Changed old diary';localStorage.setItem('solemiSleep:v3',JSON.stringify(d))})
  await page.goto(origin+base);await page.getByRole('button',{name:'Régi napló letöltése (V3)',exact:true}).waitFor()
  await page.evaluate(()=>localStorage.setItem('solemiSleep:v3','{broken'))
  await page.reload();const recovery=page.getByRole('button',{name:'Sérült napló mentése helyreállításhoz (V3)',exact:true})
  const [raw]=await Promise.all([page.waitForEvent('download'),recovery.click()]);assert.equal(await readFile(await raw.path(),'utf8'),'{broken')
  await ctx.close()

  const empty=await context();page=await empty.newPage();await page.goto(origin+base);await page.waitForURL(destination);await empty.close()
  const blocked=await context();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('Unavailable')}}))
  page=await blocked.newPage();await page.goto(origin+base);await page.getByText('A böngésző helyi tárhelyét most nem lehet elolvasni.',{exact:false}).waitFor();assert.ok(page.url().startsWith(origin));await blocked.close()

  // An old installed worker stays in control until old windows close.
  legacy=true;const swctx=await context();page=await swctx.newPage();await page.goto(origin+base)
  await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready})
  await page.reload();await page.evaluate(data=>localStorage.setItem('solemiSleep:v3',JSON.stringify(data)),diary)
  legacy=false
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();await new Promise((resolve,reject)=>{const end=Date.now()+15000;const t=setInterval(()=>{if(r.waiting){clearInterval(t);resolve()}else if(Date.now()>end){clearInterval(t);reject(Error('No waiting worker'))}},100)})})
  assert.equal(await page.locator('h1').textContent(),'Old diary')
  await page.close();page=await swctx.newPage();await page.goto(origin+base+'?backup=1')
  await page.getByRole('button',{name:'Régi napló letöltése (V3)',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>localStorage.getItem('solemiSleep:v3')),JSON.stringify(diary))
  assert.ok(await page.evaluate(async()=> (await caches.keys()).includes('old-diary')))
  await swctx.setOffline(true);await page.reload();await page.getByRole('button',{name:'Régi napló letöltése (V3)',exact:true}).waitFor()
  await swctx.close()
  assert.deepEqual(errors,[])
  console.log('PASS: V3 export incl. active sleep; no credentials; explicit transition; acknowledged redirect; backup return; changed/corrupt/blocked storage; empty redirect; waiting SW; storage/cache preservation; offline backup.')
} finally { await browser.close();await new Promise(done=>server.close(done)) }
