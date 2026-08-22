import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import type { Locale } from './i18n'
import { t } from './i18n'
import type { SleepSession } from './types'
import { durationOf, formatDuration, formatTime } from './utils'

const ACTION_WIDTH = 152
const FULL_DELETE_THRESHOLD = 210
const MAX_SWIPE = 240

function EditIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 20 4.3-1 9.8-9.8-3.3-3.3L5 15.7 4 20Z" /><path d="m13.8 6.9 3.3 3.3" /></svg>
}

function TrashIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m7 7 1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></svg>
}

function MoonIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.2 15.2A8.6 8.6 0 0 1 8.8 3.8 8.7 8.7 0 1 0 20.2 15.2Z" /></svg>
}

export default function SwipeHistoryRow({ session, now, locale, onEdit, onDelete }: { session: SleepSession; now: number; locale: Locale; onEdit: () => void; onDelete: () => void }) {
  const [offset, setOffset] = useState(0)
  const startX = useRef<number | null>(null)
  const startOffset = useRef(0)
  const suppressClick = useRef(false)

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    startX.current = event.touches[0]?.clientX ?? null
    startOffset.current = offset
    suppressClick.current = false
  }

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (startX.current === null) return
    const x = event.touches[0]?.clientX ?? startX.current
    const delta = x - startX.current
    if (Math.abs(delta) > 7) suppressClick.current = true
    const next = Math.max(-MAX_SWIPE, Math.min(0, startOffset.current + delta))
    setOffset(next)
  }

  const handleTouchEnd = () => {
    startX.current = null
    if (offset <= -FULL_DELETE_THRESHOLD) {
      setOffset(0)
      onDelete()
      return
    }
    setOffset(offset < -48 ? -ACTION_WIDTH : 0)
  }

  const handleRowClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (offset !== 0) {
      setOffset(0)
      return
    }
    onEdit()
  }

  return <div className="swipe-history-row" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
    <div className="swipe-history-actions">
      <button className="swipe-edit" type="button" onClick={() => { setOffset(0); onEdit() }}><EditIcon /><span>{t(locale, 'edit')}</span></button>
      <button className="swipe-delete" type="button" onClick={() => { setOffset(0); onDelete() }}><TrashIcon /><span>{t(locale, 'delete')}</span></button>
    </div>
    <button className="sleep-row swipe-history-content" type="button" style={{ transform: `translate3d(${offset}px, 0, 0)` }} onClick={handleRowClick}>
      <span className="sleep-row-icon"><MoonIcon /></span>
      <span className="sleep-row-time">{formatTime(session.startTime, locale)} – {session.endTime ? formatTime(session.endTime, locale) : t(locale, 'now')}</span>
      <span className="sleep-row-duration">{formatDuration(durationOf(session, now), locale)}</span>
      <span className="sleep-row-edit"><EditIcon /></span>
    </button>
  </div>
}
