import { getAccountAccess } from './accountAuth'
import { getActiveAccountWorkspaceId } from './accountWorkspace'
import { canExportPdf, INTERNAL_PLAN_PREVIEW_KEY, parseProductPlan } from './entitlements'
import { publicAssetUrl } from './assetPaths'
import { loadData } from './storage'
import { buildPdfReport } from './pdfReport'
import type { PdfOptions } from './pdfReport'

export function pdfContext() {
  return JSON.stringify([getActiveAccountWorkspaceId(), localStorage.getItem('solemiSleep:authEpoch:v1')])
}
export async function authorizePdfExport(expectedContext = pdfContext()) {
  if (pdfContext() !== expectedContext) throw new Error('PDF_CHANGED')
  if (import.meta.env.VITE_ACCOUNT_AUTH === 'true') {
    if (!getActiveAccountWorkspaceId()) throw new Error('PDF_DENIED')
    const access = await getAccountAccess()
    if (!Array.isArray(access.features) || !access.features.includes('PDF_EXPORT')
      || (access.offlineUntil !== undefined && (!Number.isFinite(access.offlineUntil) || access.offlineUntil <= Date.now()))) throw new Error('PDF_DENIED')
  } else {
    const plan = parseProductPlan(localStorage.getItem(INTERNAL_PLAN_PREVIEW_KEY)) ?? 'familyPlus'
    if (import.meta.env.VITE_INTERNAL_PREVIEW !== 'true' || !canExportPdf(plan)) throw new Error('PDF_DENIED')
  }
  if (pdfContext() !== expectedContext) throw new Error('PDF_CHANGED')
  return expectedContext
}

export async function preparePdfExport(options: PdfOptions) {
  const context = await authorizePdfExport()
  const data = loadData(), snapshot = JSON.stringify(data)
  const report = buildPdfReport(data, options)
  const { renderSleepPdf } = await import('./pdfRenderer')
  const response = await fetch(publicAssetUrl(import.meta.env.BASE_URL, 'fonts/NotoSans-Regular.ttf'))
  if (!response.ok) throw new Error('PDF_FONT')
  const bytes = await renderSleepPdf(report, new Uint8Array(await response.arrayBuffer()))
  // Rendering may take time. A logout, account switch, expired grant or diary
  // replacement must not download a report from the earlier context.
  await authorizePdfExport(context)
  if (JSON.stringify(loadData()) !== snapshot) throw new Error('PDF_CHANGED')
  return { bytes, filename: `solemi-sleep-${options.from}-${options.to}.pdf` }
}
