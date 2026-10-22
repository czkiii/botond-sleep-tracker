import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ access: vi.fn(), workspace: vi.fn(), load: vi.fn(), render: vi.fn() }))
vi.mock('./accountAuth', () => ({ getAccountAccess: mocks.access }))
vi.mock('./accountWorkspace', () => ({ getActiveAccountWorkspaceId: mocks.workspace }))
vi.mock('./storage', () => ({ loadData: mocks.load }))
vi.mock('./pdfRenderer', () => ({ renderSleepPdf: mocks.render }))
import { authorizePdfExport, preparePdfExport } from './pdfExport'

let values: Map<string, string>
beforeEach(() => {
  vi.resetAllMocks(); values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null })
  vi.stubEnv('VITE_ACCOUNT_AUTH', 'true'); vi.stubEnv('VITE_INTERNAL_PREVIEW', 'false')
  mocks.workspace.mockReturnValue('account-a')
  mocks.access.mockResolvedValue({ features: ['PDF_EXPORT'], accountFeatures: [], familyFeatures: ['PDF_EXPORT'] })
  mocks.load.mockReturnValue({ version: 4, settings: { locale: 'en' }, children: [{ id: 'a', name: 'Test' }], sessions: [] })
  mocks.render.mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1]))))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const options = { childId: 'a', from: '2026-01-01', to: '2026-01-02', includeNotes: false }

describe('PDF export access and race protection', () => {
  it('accepts effective family-inherited PDF access even without a personal paid feature', async () => {
    await expect(preparePdfExport(options)).resolves.toMatchObject({ filename: 'solemi-sleep-2026-01-01-2026-01-02.pdf' })
    expect(mocks.access).toHaveBeenCalledTimes(2)
    expect(mocks.render).toHaveBeenCalledOnce()
  })
  it.each([{ features: [] }, { features: ['FAMILY_SYNC'] }, { features: ['FAMILY_PLUS_INSIGHTS'] }])('rejects access without the PDF_EXPORT capability: %j', async ({ features }) => {
    mocks.access.mockResolvedValue({ features })
    await expect(preparePdfExport(options)).rejects.toThrow('PDF_DENIED')
    expect(mocks.render).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it('accepts only an unexpired verified offline capability from the existing access layer', async () => {
    mocks.access.mockResolvedValue({ features: ['PDF_EXPORT'], offlineUntil: Date.now() + 60000 })
    await expect(authorizePdfExport()).resolves.toBeTypeOf('string')
    mocks.access.mockResolvedValue({ features: ['PDF_EXPORT'], offlineUntil: Date.now() })
    await expect(authorizePdfExport()).rejects.toThrow('PDF_DENIED')
  })
  it('blocks expiry/revocation during generation before handing out the bytes', async () => {
    mocks.access.mockResolvedValueOnce({ features: ['PDF_EXPORT'] }).mockResolvedValueOnce({ features: [] })
    await expect(preparePdfExport(options)).rejects.toThrow('PDF_DENIED')
  })
  it.each(['workspace', 'epoch', 'diary'])('blocks %s changes during generation', async kind => {
    mocks.render.mockImplementation(async () => {
      if (kind === 'workspace') mocks.workspace.mockReturnValue('account-b')
      if (kind === 'epoch') values.set('solemiSleep:authEpoch:v1', 'new-session')
      if (kind === 'diary') mocks.load.mockReturnValue({ replaced: true })
      return new Uint8Array([37])
    })
    await expect(preparePdfExport(options)).rejects.toThrow('PDF_CHANGED')
  })
  it('does not use the internal selector to unlock an authenticated Free account', async () => {
    vi.stubEnv('VITE_INTERNAL_PREVIEW', 'true'); values.set('solemi-internal-plan-preview', 'familyPlus')
    mocks.access.mockResolvedValue({ features: [] })
    await expect(authorizePdfExport()).rejects.toThrow('PDF_DENIED')
  })
  it('allows the plan selector only in an auth-disabled internal build', async () => {
    vi.stubEnv('VITE_ACCOUNT_AUTH', 'false')
    await expect(authorizePdfExport()).rejects.toThrow('PDF_DENIED')
    vi.stubEnv('VITE_INTERNAL_PREVIEW', 'true')
    for (const plan of ['family', 'familyPlus']) { values.set('solemi-internal-plan-preview', plan); await expect(authorizePdfExport()).resolves.toBeTypeOf('string') }
    values.set('solemi-internal-plan-preview', 'free')
    await expect(authorizePdfExport()).rejects.toThrow('PDF_DENIED')
  })
  it('does not export when the font asset fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    await expect(preparePdfExport(options)).rejects.toThrow('PDF_FONT')
    expect(mocks.render).not.toHaveBeenCalled()
  })
})
