import { it, expect } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Miniflare } from 'miniflare'
import { appleSigningFixture } from './storeProviderFixture'

it('verifies a signed certificate chain inside the actual Cloudflare runtime and rejects tampering', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const output = resolve(root, '.wrangler/store-runtime-test')
  mkdirSync(output, { recursive: true })
  const config = resolve(output, 'wrangler.json')
  writeFileSync(config, JSON.stringify({ name: 'solemi-local-store-test', main: resolve(root, 'tests/fixtures/storeVerifier.worker.ts'),
    compatibility_date: '2026-08-22', compatibility_flags: ['nodejs_compat'] }))
  execFileSync(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--config', config, '--outdir', output],
    { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(output, 'wrangler.log') }, stdio: 'pipe', timeout: 30000 })
  const runtime = new Miniflare({ workers: [{ config: { name: 'store-probe',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: readFileSync(resolve(output, 'storeVerifier.worker.js'), 'utf8') } } },
    compatibilityDate: '2026-08-22', compatibilityFlags: ['nodejs_compat'] } }] })
  try {
    const signing = appleSigningFixture('app.solemi.test', 123)
    const jws = signing.sign({ bundleId: 'app.solemi.test', environment: 'Sandbox', transactionId: '10002', signedDate: Date.now() })
    const send = (signed: string) => runtime.dispatchFetch('http://local.test', { method: 'POST', body: JSON.stringify({ root: signing.rootBase64, jws: signed }) })
    const valid = await send(jws)
    expect(valid.status).toBe(200)
    expect(await valid.json()).toEqual({ verified: true, transactionId: '10002' })
    expect((await send(signing.changePayload(jws))).status).toBe(422)
  } finally { await runtime.dispose() }
}, 60000)
