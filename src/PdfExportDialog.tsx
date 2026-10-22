import { useEffect, useRef, useState } from 'react'
import type { AppData } from './types'
import { Modal } from './Modal'
import { pdfCopy } from './pdfCopy'
import { localDateKey } from './pdfReport'
import { preparePdfExport } from './pdfExport'

export function PdfExportDialog({ data, available, onClose }: { data: AppData; available: boolean; onClose: () => void }) {
  const text = pdfCopy[data.settings.locale]
  const today = localDateKey(new Date())
  const [childId, setChildId] = useState(data.settings.activeChildId)
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return localDateKey(d) })
  const [to, setTo] = useState(today)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const generate = async () => {
    if (!available || running.current) return
    running.current = true; setBusy(true); setError(''); setDone(false)
    try {
      const { bytes, filename } = await preparePdfExport({ childId, from, to, includeNotes })
      if (!alive.current) return
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const link = document.createElement('a'); link.href = url; link.download = filename
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setDone(true)
    } catch (failure) {
      if (!alive.current) return
      const code = failure instanceof Error ? failure.message : ''
      setError(code === 'PDF_RANGE' ? text.invalid : code === 'PDF_LARGE' ? text.large : code === 'PDF_CHANGED' || code === 'ACCOUNT_CONTEXT_CHANGED' ? text.changed
        : code === 'PDF_DENIED' || code.startsWith('ACCOUNT_') || code.startsWith('SESSION_') ? text.denied : text.failed)
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  return <Modal className="development-picker-overlay" label={text.title} busy={busy} onClose={onClose}>
    <form className="development-picker-sheet pdf-export-sheet" onSubmit={event => { event.preventDefault(); void generate() }}>
      <header><h2>{text.title}</h2><button type="button" aria-label={text.cancel} disabled={busy} onClick={onClose}>×</button></header>
      <p>{text.intro}</p>
      {!available ? <p role="status">{text.locked}</p> : <>
        <label>{text.child}<select value={childId} onChange={event => setChildId(event.target.value)} disabled={busy}>
          {data.children.map(child => <option key={child.id} value={child.id}>{child.name || text.unnamed}</option>)}
        </select></label>
        <div className="pdf-date-fields"><label>{text.from}<input type="date" value={from} max={to || today} required disabled={busy} onChange={event => setFrom(event.target.value)} /></label>
          <label>{text.to}<input type="date" value={to} min={from} max={today} required disabled={busy} onChange={event => setTo(event.target.value)} /></label></div>
        <label className="pdf-notes-option"><input type="checkbox" checked={includeNotes} disabled={busy} onChange={event => setIncludeNotes(event.target.checked)} />{text.notes}</label>
        <p>{text.privacy}</p>
        <button type="submit" className="pdf-download" disabled={busy}>{busy ? text.busy : text.create}</button>
      </>}
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{text.done}</p>}
    </form>
  </Modal>
}
