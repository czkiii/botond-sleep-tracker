// Local UI acceptance: layout, persisted preferences, keyboard and native dialog.
// Uses a fresh browser context per case; no account, network API or user diary.
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
  await mkdir('.private-backups', { recursive: true })
  const cases = []
  for (const locale of ['hu', 'en', 'de']) {
    for (const width of [320, 393]) {
      const context = await browser.newContext({ viewport: { width, height: 852 }, serviceWorkers: 'block' })
      const at = '2026-08-26T10:00:00.000Z'
      const data = { version: 4, settings: { locale: 'hu', activeChildId: 'a', longSleepReminderEnabled: false },
        children: ['a', 'b'].map(id => ({ id, name: `Próba ${id}`, birthDate: null, photoRef: null, createdAt: at, updatedAt: at })),
        sessions: [{ id: 'sleep-a', childId: 'a', startTime: at, endTime: null, note: 'Keep this', dayNightOverride: 'day', createdAt: at, updatedAt: at }] }
      await context.addInitScript(data => {
        if (!localStorage.getItem('solemiSleep:v4')) localStorage.setItem('solemiSleep:v4', JSON.stringify(data))
      }, data)
      const unexpected = []
      await context.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== origin || url.pathname.startsWith('/api/')) {
          unexpected.push(url.href); await route.abort(); return
        }
        await route.continue()
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin)
      await page.getByRole('button', { name: 'Beállítások', exact: true }).click()
      await page.locator('.language-select').selectOption(locale)
      await page.waitForFunction(locale => document.documentElement.lang === locale, locale)
      const reminder = page.locator('.settings-toggle-row input')
      await reminder.check()
      const rowB = page.locator('.child-list-row').filter({ hasText: 'Próba b' })
      await rowB.locator('.child-select-button').focus()
      await page.keyboard.press('Space')
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('solemiSleep:v4')).settings.activeChildId === 'b')
      const layout = await page.evaluate(() => {
        const screen = document.querySelector('.settings-screen')
        const slot = screen.querySelector('[data-family-sync-slot]')
        const copy = slot.querySelector('.family-sync-settings-copy').getBoundingClientRect()
        const state = slot.querySelector('.family-sync-settings-state').getBoundingClientRect()
        return {
          belowChildren: slot.previousElementSibling.classList.contains('child-list'),
          aboveActions: slot.nextElementSibling.classList.contains('action-stack'),
          languageLast: screen.lastElementChild.classList.contains('settings-language-card'),
          syncEntries: slot.querySelectorAll('.family-sync-settings-button').length,
          nestedButtons: screen.querySelectorAll('button button, button [role="button"]').length,
          syncTextOverlaps: copy.left < state.right && copy.right > state.left && copy.top < state.bottom && copy.bottom > state.top,
          overflow: document.documentElement.scrollWidth > window.innerWidth
        }
      })
      assert.deepEqual(layout, { belowChildren: true, aboveActions: true, languageLast: true, syncEntries: 1, nestedButtons: 0, syncTextOverlaps: false, overflow: false })
      await page.screenshot({ path: `.private-backups/settings-${locale}-${width}.png`, fullPage: true })
      const edit = rowB.locator('.child-edit-button')
      await edit.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true)
      if (locale === 'hu' && width === 320) {
        await dialog.locator('input[type="file"]').setInputFiles({ name: 'fixture.svg', mimeType: 'image/svg+xml',
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>') })
        await page.locator('.photo-crop-screen').waitFor()
        assert.equal(await page.evaluate(() => document.querySelector('.photo-crop-screen').contains(document.activeElement)), true)
        const zoom = page.locator('.photo-zoom input')
        await zoom.focus()
        await page.keyboard.press('End')
        assert.equal(await zoom.inputValue(), '3')
        const crop = page.locator('.photo-crop-stage')
        await crop.focus()
        await page.keyboard.press('ArrowRight')
        assert.match(await crop.locator('img').getAttribute('style'), /10px/)
        await page.keyboard.press('Escape')
        await page.locator('.photo-crop-screen').waitFor({ state: 'detached' })
        assert.equal(await dialog.isVisible(), true)
      }
      if (locale === 'hu' && width === 393) await page.screenshot({ path: '.private-backups/settings-child-editor.png' })
      // Even an explicit focus request cannot reach the inert background.
      await page.locator('.language-select').evaluate(element => element.focus())
      assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true)
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await edit.evaluate(element => element === document.activeElement), true)
      await page.keyboard.press('Space')
      await dialog.waitFor()
      const name = dialog.locator('input[maxlength="60"]')
      await name.fill(`Changed ${locale}`)
      await name.press('Enter')
      await dialog.waitFor({ state: 'detached' })
      await page.waitForFunction(locale => JSON.parse(localStorage.getItem('solemiSleep:v4')).children[1].name === `Changed ${locale}`, locale)
      await page.reload()
      const labels = { hu: 'Beállítások', en: 'Settings', de: 'Einstellungen' }
      await page.getByRole('button', { name: labels[locale], exact: true }).click()
      await page.locator('.family-sync-settings-button').waitFor()
      assert.equal(await page.locator('[data-family-sync-slot] .family-sync-settings-button').count(), 1)
      assert.equal(await page.locator('.language-select').inputValue(), locale)
      assert.equal(await reminder.isChecked(), true)
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solemiSleep:v4')))
      assert.deepEqual(saved.sessions, data.sessions)
      assert.equal(saved.settings.activeChildId, 'b')
      assert.equal(saved.children[1].name, `Changed ${locale}`)
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
      cases.push(`${locale} ${width}px: order, preferences, keyboard, modal, save/reload`)
      await context.close()
    }
  }
  console.log(JSON.stringify({ result: 'PASS', browser: browser.version(), cases }))
} finally {
  await browser?.close()
  await server.close()
}
