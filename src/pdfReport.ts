import type { AppData, SleepSession } from './types'
import type { Locale } from './i18n'

export type PdfOptions = { childId: string; from: string; to: string; includeNotes: boolean }
export type PdfReport = { locale: Locale; childName: string; from: string; to: string; generatedAt: number; timeZone: string;
  rows: Array<{ startTime: string; endTime: string | null; duration: number; type: SleepSession['dayNightOverride']; note?: string }>;
  total: number; omitted: number }
export const MAX_PDF_ROWS = 5000
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('PDF_RANGE')
  const date = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(date.getTime()) || localDateKey(date) !== value) throw new Error('PDF_RANGE')
  return date
}
export function buildPdfReport(data: AppData, options: PdfOptions, now = Date.now()): PdfReport {
  const from = parseDay(options.from), to = parseDay(options.to)
  const days = (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000 + 1
  if (!Number.isFinite(now) || days < 1 || days > 366 || options.to > localDateKey(new Date(now))) throw new Error('PDF_RANGE')
  // Calendar arithmetic preserves 23/25-hour days at DST transitions.
  const after = new Date(to); after.setDate(after.getDate() + 1)
  const lower = from.getTime(), upper = Math.min(after.getTime(), now)
  const child = data.children.find(item => item.id === options.childId)
  if (!child) throw new Error('PDF_CHANGED')
  const rows: PdfReport['rows'] = [], intervals: Array<[number, number]> = []
  let omitted = 0, noteCharacters = 0
  for (const session of data.sessions) {
    if (session.childId !== child.id) continue
    const start = Date.parse(session.startTime), end = session.endTime === null ? now : Date.parse(session.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start > now || end > now) { omitted++; continue }
    const a = Math.max(lower, start), b = Math.min(upper, end)
    if (b <= a) continue
    if (rows.length >= MAX_PDF_ROWS) throw new Error('PDF_LARGE')
    const note = options.includeNotes ? session.note : undefined
    noteCharacters += note?.length ?? 0
    if (noteCharacters > 500000) throw new Error('PDF_LARGE')
    rows.push({ startTime: session.startTime, endTime: session.endTime, duration: b - a, type: session.dayNightOverride, ...(note !== undefined ? { note } : {}) })
    intervals.push([a, b])
  }
  rows.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  intervals.sort((a, b) => a[0] - b[0])
  let total = 0, end = -Infinity
  for (const [a, b] of intervals) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b) }
  return { locale: data.settings.locale, childName: child.name, from: options.from, to: options.to, generatedAt: now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, rows, total, omitted }
}
