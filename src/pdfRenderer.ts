import { PDFDocument, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { pdfCopy } from './pdfCopy'
import { localeTag } from './i18n'
import type { PdfReport } from './pdfReport'

const ink = rgb(.07, .15, .23), muted = rgb(.28, .36, .44), blue = rgb(.12, .35, .55)
export function wrapPdfText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/(\s+)/u)) {
      if (font.widthOfTextAtSize(line + word, size) <= width) { line += word; continue }
      if (line.trim()) { lines.push(line.trimEnd()); line = '' }
      // Long unbroken notes must wrap rather than clip or disappear.
      for (const character of word.trimStart()) {
        if (font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = '' }
        line += character
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}
export async function renderSleepPdf(report: PdfReport, fontBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(fontBytes, { subset: true })
  const supported = new Set(font.getCharacterSet())
  let substituted = false
  const clean = (text: string) => Array.from(text.normalize('NFC').replace(/\r\n?/g, '\n')).map(c => {
    const n = c.codePointAt(0)!
    if (c === '\n') return c
    if (c === '\t') return '    '
    if (supported.has(n) && n >= 32 && !/[\u202a-\u202e\u2066-\u2069]/u.test(c)) return c
    substituted = true; return `[U+${n.toString(16).toUpperCase()}]`
  }).join('')
  const text = pdfCopy[report.locale], width = 499, margin = 48
  pdf.setTitle(`Solemi Sleep - ${text.title}`); pdf.setAuthor('Solemi Sleep')
  pdf.setCreationDate(new Date(report.generatedAt)); pdf.setModificationDate(new Date(report.generatedAt))
  pdf.setLanguage(localeTag(report.locale))
  let page: PDFPage, y = 0
  const newPage = () => {
    if (pdf.getPageCount() >= 250) throw new Error('PDF_LARGE')
    page = pdf.addPage([595.28, 841.89]); y = 763
    page.drawText('SOLEMI SLEEP', { x: margin, y: 801, size: 10, font, color: blue })
    page.drawLine({ start: { x: margin, y: 787 }, end: { x: 547, y: 787 }, thickness: 1, color: rgb(.78, .84, .88) })
  }
  newPage()
  const paragraph = (value: string, size = 10, color = ink, continuation?: string) => {
    const lines = wrapPdfText(clean(value), font, size, width)
    for (const line of lines) {
      if (y < 65) {
        newPage()
        if (continuation) { page.drawText(continuation, { x: margin, y, size: 9, font, color: muted }); y -= 20 }
      }
      page.drawText(line, { x: margin, y, size, font, color }); y -= size * 1.5
    }
    y -= 5
  }
  const date = (value: string | number) => new Intl.DateTimeFormat(localeTag(report.locale), {
    timeZone: report.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'shortOffset'
  }).format(new Date(value))
  const duration = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 3600)} ${text.hour} ${Math.floor(s % 3600 / 60)} ${text.minute} ${s % 60} ${text.second}`
  }
  paragraph(text.title, 22, blue)
  paragraph(`${text.child}: ${report.childName || text.unnamed}`, 15)
  paragraph(`${text.range}: ${report.from} - ${report.to}`)
  paragraph(`${text.generated}: ${date(report.generatedAt)}`)
  paragraph(`${text.zone}: ${report.timeZone}`, 9, muted)
  paragraph(`${text.entries}: ${report.rows.length}   |   ${text.total}: ${duration(report.total)}`, 12, blue)
  paragraph(text.explanation, 9, muted)
  paragraph(text.disclaimer, 9, muted)
  if (report.omitted) paragraph(`${text.omitted}: ${report.omitted}`, 10)
  if (!report.rows.length) paragraph(text.empty, 12)
  for (const [index, row] of report.rows.entries()) {
    if (y < 185) newPage()
    paragraph(`${index + 1}.   ${text.start}: ${date(row.startTime)}`, 12, blue)
    paragraph(`${text.end}: ${row.endTime ? date(row.endTime) : text.active}`)
    paragraph(`${text.duration}: ${duration(row.duration)}   |   ${text.type}: ${row.type === 'day' ? text.day : row.type === 'night' ? text.night : text.automatic}`, 9)
    if (row.note) paragraph(`${text.note}: ${row.note}`, 10, ink, `${index + 1}. ${text.note} (${text.continued})`)
    y -= 7
    if (index % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0))
  }
  if (substituted) paragraph(text.symbols, 9, muted)
  const pages = pdf.getPages()
  pages.forEach((p, index) => {
    p.drawLine({ start: { x: margin, y: 45 }, end: { x: 547, y: 45 }, thickness: .5, color: rgb(.78, .84, .88) })
    p.drawText(`Solemi Sleep   |   ${index + 1} / ${pages.length}`, { x: margin, y: 28, font, size: 9, color: muted })
  })
  return pdf.save()
}
