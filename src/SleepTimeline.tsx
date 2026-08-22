import { useEffect, useMemo, useState } from 'react'
import type { SleepSession } from './types'
import { durationOf, formatDuration, formatTime } from './utils'

type Segment = {
  id: string
  session: SleepSession
  startMinute: number
  durationMinutes: number
  clippedStart: number
  clippedEnd: number
}

export default function SleepTimeline({ sessions, now, day }: { sessions: SleepSession[]; now: number; day?: string | null }) {
  const segments = useMemo<Segment[]>(() => {
    const dayStart = day
      ? (() => {
          const [year, month, date] = day.split('-').map(Number)
          return new Date(year, month - 1, date, 0, 0, 0, 0)
        })()
      : new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const dayStartMs = dayStart.getTime()
    const dayEndMs = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1, 0, 0, 0, 0).getTime()

    return sessions
      .map((session) => {
        const originalStart = new Date(session.startTime).getTime()
        const originalEnd = session.endTime ? new Date(session.endTime).getTime() : now
        const clippedStart = Math.max(originalStart, dayStartMs)
        const clippedEnd = Math.min(originalEnd, dayEndMs)
        if (clippedEnd <= clippedStart) return null

        return {
          id: session.id,
          session,
          startMinute: (clippedStart - dayStartMs) / 60000,
          durationMinutes: (clippedEnd - clippedStart) / 60000,
          clippedStart,
          clippedEnd
        }
      })
      .filter((segment): segment is Segment => Boolean(segment))
  }, [sessions, now, day])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => setSelectedId(null), [day])
  const selected = segments.find((segment) => segment.id === selectedId) ?? null

  return (
    <div className="sleep-timeline-block">
      <div className="sleep-timeline-wrap">
        <svg className="sleep-timeline" viewBox="0 0 120 120" aria-label="24 órás alvási idővonal">
          <circle className="timeline-track" cx="60" cy="60" r="48" pathLength="1440" />
          {segments.map((segment, index) => (
            <g key={`${segment.id}-${index}`}>
              <circle
                className={`timeline-segment ${selectedId === segment.id ? 'selected' : ''}`}
                cx="60"
                cy="60"
                r="48"
                pathLength="1440"
                strokeDasharray={`${Math.max(segment.durationMinutes, 2)} ${1440 - Math.max(segment.durationMinutes, 2)}`}
                strokeDashoffset={-segment.startMinute}
                transform="rotate(-90 60 60)"
              />
              <circle
                className="timeline-hit"
                cx="60"
                cy="60"
                r="48"
                pathLength="1440"
                strokeDasharray={`${Math.max(segment.durationMinutes, 6)} ${1440 - Math.max(segment.durationMinutes, 6)}`}
                strokeDashoffset={-segment.startMinute}
                transform="rotate(-90 60 60)"
                onClick={() => setSelectedId(segment.id)}
              />
            </g>
          ))}
        </svg>
        <span className="timeline-mark mark-0">0</span>
        <span className="timeline-mark mark-6">6</span>
        <span className="timeline-mark mark-12">12</span>
        <span className="timeline-mark mark-18">18</span>
        <div className="timeline-center"><span>☾</span><strong>24h</strong><span>☀︎</span></div>
      </div>

      <div className={`timeline-info ${selected ? 'visible' : ''}`}>
        {selected ? (
          <>
            <span className="timeline-info-icon">☾</span>
            <strong>{formatTime(new Date(selected.clippedStart).toISOString())}–{formatTime(new Date(selected.clippedEnd).toISOString())}</strong>
            <span>{formatDuration(selected.clippedEnd - selected.clippedStart)}</span>
          </>
        ) : (
          <span>Érints meg egy alvási szakaszt a részletekhez</span>
        )}
      </div>
    </div>
  )
}
