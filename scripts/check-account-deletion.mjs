// Isolated React UI with synthetic API responses; no real profile or remote requests.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'vite'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.SOLEMI_PLAYWRIGHT_MODULE || 'playwright')
const server = await createServer({ base: '/', server: { host: '127.0.0.1', port: 0 }, define: {
  'import.meta.env.VITE_ACCOUNT_API_BASE': JSON.stringify('/api')
  , 'import.meta.env.VITE_ACCOUNT_AUTH': JSON.stringify('true'),
  'import.meta.env.VITE_ACCOUNT_DELETION': JSON.stringify('true'),
  'import.meta.env.VITE_INTERNAL_PREVIEW': JSON.stringify('true')
}, plugins: [{ name: 'deletion-fixture', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/deletion-test')) return next()
    res.setHeader('Content-Type', 'text/html')
    res.end(await vite.transformIndexHtml('/deletion-test', `<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div>
      <script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import Controls, { AccountRecovery } from '/src/AccountDataControls.tsx';
      import { accountDeletionCopy } from '/src/accountDeletionCopy.ts';
      import { activateRestoredAccountWorkspace } from '/src/accountWorkspace.ts';
      import { saveChildPhoto, loadChildPhoto } from '/src/photoStore.ts';
      import { loadData, saveData } from '/src/storage.ts';
      import '/src/styles.css';
      const locale=new URL(location.href).searchParams.get('locale'); window.copy=accountDeletionCopy(locale);
      activateRestoredAccountWorkspace('test-account');
      window.photoRef=await saveChildPhoto('fixture',new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'],{type:'image/svg+xml'}));
      const data=loadData(); data.children[0].photoRef=window.photoRef; saveData(data); window.readPhoto=()=>loadChildPhoto(window.photoRef);
      sessionStorage.setItem('solemiSleep:accountAccess',JSON.stringify({account:{id:'test-account'},deviceId:'d',accessToken:'access',accessExpiresAt:Date.now()+300000}));
      const root=createRoot(document.getElementById('root'));
      window.recovery=()=>root.render(React.createElement(AccountRecovery,{locale,recovery:{accountId:'test-account',recoveryToken:'recovery-proof',recoverUntil:Date.now()+100000},onDone:()=>window.done=true}));
      root.render(React.createElement(Controls,{locale,accountId:'test-account',onDeleted:()=>window.done=true}));
      </script>`))
  })
} }] })
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, channel: process.env.SOLEMI_BROWSER_CHANNEL || 'msedge' })
  await mkdir('.private-backups', { recursive: true })
  let cases=0
  for (const locale of ['hu','en','de']) for (const mode of ['IMMEDIATE','RECOVERY']) {
    const context=await browser.newContext({viewport:{width:320,height:852},serviceWorkers:'block'})
    context.setDefaultTimeout(15000)
    const requests=[], errors=[]
    let rejectDelete=true
    await context.route('**/*', async route=>{
      const url=new URL(route.request().url())
      if(url.origin!==origin) { errors.push('external-request'); return route.abort() }
      if(!url.pathname.startsWith('/api/')) return route.continue()
      requests.push({path:url.pathname,headers:route.request().headers(),body:route.request().postDataJSON()})
      let data={}
      if(url.pathname.endsWith('/deletion-preview')) data={accountId:'test-account',family:{id:'f',name:'Test family',revision:3,members:1}}
      if(url.pathname.endsWith('/export')) data={format:'solemi-account-export',account:{id:'test-account'}}
      if(url.pathname.endsWith('/delete') && rejectDelete) return route.fulfill({status:409,json:{ok:false,error:{code:'DELETION_PREVIEW_CHANGED'}}})
      return route.fulfill({status:200,json:{ok:true,data}})
    })
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message))
    await page.goto(`${origin}/deletion-test?locale=${locale}`)
    await page.waitForFunction(()=>window.copy)
    const c=await page.evaluate(()=>window.copy)
    await page.getByRole('button',{name:c.title,exact:true}).click()
    const dl=page.waitForEvent('download')
    await page.getByRole('button',{name:c.export,exact:true}).click()
    const file=await dl
    const exported=JSON.parse(await readFile(await file.path(),'utf8'))
    assert.equal(exported.format,'solemi-personal-export')
    assert.equal(exported.localDiary.version,4)
    assert.match(exported.photos[0].dataUrl,/^data:image\/svg\+xml;base64,/)
    await page.getByRole('button',{name:c.continue,exact:true}).click()
    const erase=page.getByRole('button',{name:mode==='IMMEDIATE'?c.immediate:c.recovery,exact:true})
    assert.equal(await erase.isDisabled(),true)
    await page.getByRole('checkbox').check()
    assert.equal(await erase.isDisabled(),true)
    await page.getByRole('textbox').fill('Test family')
    await erase.click(); await page.getByRole('alert').waitFor()
    assert.equal(await page.evaluate(()=>Boolean(window.done)),false)
    await page.getByRole('button',{name:c.retry,exact:true}).click()
    await page.waitForFunction(()=>!document.querySelector('input[type=checkbox]').checked)
    await page.getByRole('checkbox').check(); await page.getByRole('textbox').fill('Test family')
    await page.screenshot({path:`.private-backups/account-deletion-${locale}-${mode}.png`,fullPage:true})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    rejectDelete=false
    await erase.click(); await page.waitForFunction(()=>window.done===true)
    const calls=requests.filter(r=>r.path.endsWith('/delete'))
    assert.equal(calls.length,2); assert.equal(calls[1].body.mode,mode)
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('solemiSleep:accountAccess')),null)
    const saved=await page.evaluate(()=>localStorage.getItem('solemiSleep:workspaceData:v1:account:test-account'))
    assert.equal(Boolean(saved),mode==='RECOVERY')
    assert.equal(await page.evaluate(async()=>Boolean(await window.readPhoto())),mode==='RECOVERY')
    if(mode==='RECOVERY') {
      await page.evaluate(()=>{window.done=false;window.recovery()})
      await page.getByRole('button',{name:c.restore,exact:true}).click()
      await page.waitForFunction(()=>window.done===true)
      assert.equal(requests.at(-1).headers.authorization,'Bearer recovery-proof')
      assert.match(requests.at(-1).path,/\/restore$/)
    }
    assert.deepEqual(errors,[])
    await context.close(); cases++
  }
  const web = await browser.newContext({ viewport: { width:393,height:852 }, serviceWorkers:'block' })
  web.setDefaultTimeout(15000)
  await web.addInitScript(()=>{
    sessionStorage.setItem('solemiSleep:accountAccess',JSON.stringify({account:{id:'web-account',email:'fixture@example.test'},deviceId:'d',accessToken:'web-access',accessExpiresAt:Date.now()+300000}))
  })
  await web.route('**/*', async route=>{
    const url=new URL(route.request().url())
    if(url.origin!==origin) return route.abort()
    if(url.pathname==='/api/v1/auth/me') return route.fulfill({status:200,json:{ok:true,data:{account:{id:'web-account',email:'fixture@example.test'}}}})
    return route.continue()
  })
  const page=await web.newPage()
  await page.goto(`${origin}/delete-account`)
  await page.getByRole('heading',{name:/Solemi Sleep/}).waitFor()
  await page.locator('.account-card .account-signout').last().click()
  await page.locator('section.account-data-controls').waitFor()
  await web.close()
  console.log(`PASS: ${cases} account deletion UI cases (HU/EN/DE, both modes, stale snapshot, export, confirmation, local cleanup and recovery proof), plus the direct /delete-account web entry.`)
} finally { await browser?.close(); await server.close() }
