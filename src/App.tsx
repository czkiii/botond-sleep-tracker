import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AppData, Page, SleepSession } from './types'
import { createSession, defaultData, exportData, importData, loadData, saveData } from './storage'
import { awakeSince, durationOf, formatDateHeader, formatDuration, formatTime, formatTimer, splitDayNight, todaySessions, totalToday } from './utils'

const pad = (value: number) => String(value).padStart(2, '0')

function toLocalParts(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date()
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hour: date.getHours(),
    minute: date.getMinutes()
  }
}

function partsToIso(dateValue: string, hour: number, minute: number) {
  const [year, month, day] = dateValue.split('-').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function shortDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(year, month - 1, day))
}

function dateOptions() {
  const result: Array<{ value: string; label: string }> = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let index = 14; index >= 0; index -= 1) {
    const date = new Date(now)
    date.setDate(date.getDate() - index)
    const value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    result.push({ value, label: shortDateLabel(value) })
  }
  return result
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [page, setPage] = useState<Page>('today')
  const [now, setNow] = useState(Date.now())
  const [editor, setEditor] = useState<SleepSession | 'new' | null>(null)

  useEffect(() => saveData(data), [data])
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const current = useMemo(() => data.sessions.find((session) => !session.endTime) ?? null, [data.sessions])
  const updateSessions = (sessions: SleepSession[]) => setData((previous) => ({ ...previous, sessions }))

  const startNow = () => {
    if (!current) updateSessions([createSession(new Date().toISOString()), ...data.sessions])
  }

  const endNow = () => {
    if (!current) return
    const endTime = new Date().toISOString()
    updateSessions(data.sessions.map((session) => session.id === current.id ? { ...session, endTime, updatedAt: endTime } : session))
  }

  const saveEditor = (session: SleepSession) => {
    if (editor === 'new') updateSessions([session, ...data.sessions])
    else updateSessions(data.sessions.map((item) => item.id === session.id ? session : item))
    setEditor(null)
  }

  const deleteSession = (id: string) => {
    if (!window.confirm('Biztosan törlöd ezt az alvást?')) return
    updateSessions(data.sessions.filter((session) => session.id !== id))
    setEditor(null)
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {page === 'today' && <TodayPage data={data} now={now} current={current} onStart={startNow} onEnd={endNow} onOpenEditor={setEditor} onSettings={() => setPage('settings')} />}
        {page === 'history' && <HistoryPage sessions={data.sessions} onEdit={setEditor} onNew={() => setEditor('new')} />}
        {page === 'stats' && <StatsPage sessions={data.sessions} now={now} />}
        {page === 'settings' && <SettingsPage data={data} setData={setData} onBack={() => setPage('today')} />}
      </main>
      {page !== 'settings' && <BottomNav page={page} onChange={setPage} />}
      {editor && <SleepEditor session={editor === 'new' ? null : editor} currentExists={Boolean(current)} onClose={() => setEditor(null)} onSave={saveEditor} onDelete={deleteSession} />}
    </div>
  )
}

function TodayPage({ data, now, current, onStart, onEnd, onOpenEditor, onSettings }: {
  data: AppData
  now: number
  current: SleepSession | null
  onStart: () => void
  onEnd: () => void
  onOpenEditor: (value: SleepSession | 'new') => void
  onSettings: () => void
}) {
  const todays = todaySessions(data.sessions).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  const total = totalToday(data.sessions, new Date(now))
  const elapsed = current ? durationOf(current, now) : awakeSince(data.sessions, now)

  return (
    <section className="screen today-screen">
      <header className="compact-header">
        <div>
          <div className="date-label">{formatDateHeader(new Date(now))}</div>
          <div className="daily-summary">Ma eddig <strong>{formatDuration(total)}</strong> alvás</div>
        </div>
        <button className="icon-button" aria-label="Beállítások" onClick={onSettings}>⚙︎</button>
      </header>

      <div className={`status-orb ${current ? 'sleeping' : ''}`}>
        <div className="orb-progress" />
        <div className="orb-content">
          <div className="orb-icon">{current ? '☾' : '☾✦'}</div>
          <div className="orb-status">{current ? 'ALSZIK' : 'ÉBREN'}</div>
          <div className="orb-time">{current ? formatTimer(elapsed) : formatDuration(elapsed)}</div>
          {current && <div className="orb-sub">Elaludt {formatTime(current.startTime)}</div>}
        </div>
      </div>

      <button className="primary-action" onClick={current ? onEnd : onStart}>{current ? '☀︎  Felébredt' : '☾  Elaludt'}</button>
      <button className="text-action" onClick={() => onOpenEditor(current ?? 'new')}>Részletek</button>

      <div className="today-card">
        <div className="section-head"><h2>Mai alvások</h2><span>•••</span></div>
        <div className="sleep-list scroll-list">
          {todays.length === 0 && <div className="empty">Még nincs mai alvás.</div>}
          {todays.map((session) => <SleepRow key={session.id} session={session} now={now} onClick={() => onOpenEditor(session)} />)}
        </div>
      </div>
    </section>
  )
}

function SleepRow({ session, now, onClick }: { session: SleepSession; now: number; onClick?: () => void }) {
  return (
    <button className="sleep-row" onClick={onClick}>
      <span className="sleep-row-icon">☾</span>
      <span className="sleep-row-time">{formatTime(session.startTime)} – {session.endTime ? formatTime(session.endTime) : 'most'}</span>
      <span className="sleep-row-duration">{formatDuration(durationOf(session, now))}</span>
      <span className="sleep-row-edit">✎</span>
    </button>
  )
}

function HistoryPage({ sessions, onEdit, onNew }: { sessions: SleepSession[]; onEdit: (session: SleepSession) => void; onNew: () => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, SleepSession[]>()
    sessions.slice().sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).forEach((session) => {
      const key = new Intl.DateTimeFormat('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(session.startTime))
      map.set(key, (map.get(key) ?? []).concat(session))
    })
    return Array.from(map.entries())
  }, [sessions])

  return (
    <section className="screen history-screen">
      <header className="page-header centered-header"><h1>Előzmények</h1><button className="add-button" onClick={onNew}>＋</button></header>
      <div className="history-wrap">
        {grouped.length === 0 && <div className="empty-card">Még nincs rögzített alvás.</div>}
        {grouped.map(([date, items], index) => (
          <div className="history-group" key={date}>
            <h3>{index === 0 ? `Ma – ${date}` : index === 1 ? `Tegnap – ${date}` : date}</h3>
            <div className="sleep-list history-list">
              {items.map((session) => <SleepRow key={session.id} session={session} now={Date.now()} onClick={() => onEdit(session)} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StatsPage({ sessions, now }: { sessions: SleepSession[]; now: number }) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  const days = range === 'day' ? 1 : range === 'week' ? 7 : 30
  const chart = useMemo(() => Array.from({ length: days }, (_, index) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (days - 1 - index))
    return { label: new Intl.DateTimeFormat('hu-HU', { day: 'numeric' }).format(date), hours: +(totalToday(sessions, date) / 3600000).toFixed(2) }
  }), [sessions, now, days])

  const recent = sessions.filter((session) => new Date(session.startTime).getTime() >= now - days * 86400000)
  const sums = recent.reduce((acc, session) => {
    const parts = splitDayNight(session, now)
    acc.total += durationOf(session, now)
    acc.day += parts.day
    acc.night += parts.night
    return acc
  }, { total: 0, day: 0, night: 0 })
  const divisor = Math.max(1, days)

  return (
    <section className="screen stats-screen">
      <header className="page-header centered-header"><h1>Statisztika</h1></header>
      <div className="segmented">
        <button className={range === 'day' ? 'active' : ''} onClick={() => setRange('day')}>Nap</button>
        <button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>Hét</button>
        <button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Hónap</button>
      </div>

      <div className="chart-card compact-chart-card">
        <h2>Alvás időtartama</h2>
        <div className="bar-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 2, bottom: 0, left: -24 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis domain={[0, 14]} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0d1a2b', border: '1px solid #1c3352', borderRadius: 12 }} formatter={(value) => [`${value} ó`, 'Alvás']} />
              <Bar dataKey="hours" fill="#579dff" radius={[5, 5, 2, 2]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <h2 className="overview-title">24 órás áttekintés</h2>
      <div className="overview-grid">
        <div className="radial compact-radial"><div className="radial-inner"><span>0</span><strong>☾</strong><span className="sun-mark">☀︎</span></div></div>
        <div className="stats-stack">
          <StatCard label="Átlag" value={formatDuration(sums.total / divisor)} suffix="/ nap" />
          <StatCard label="Nappali" value={formatDuration(sums.day / divisor)} icon="☀︎" />
          <StatCard label="Éjszakai" value={formatDuration(sums.night / divisor)} icon="☾" />
        </div>
      </div>
    </section>
  )
}

function StatCard({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon?: string }) {
  return <div className="stat-card"><div><span>{label}</span><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>{icon && <b>{icon}</b>}</div>
}

function SettingsPage({ data, setData, onBack }: { data: AppData; setData: (data: AppData) => void; onBack: () => void }) {
  const changeName = (event: ChangeEvent<HTMLInputElement>) => setData({ ...data, settings: { ...data.settings, childName: event.target.value } })
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const next = await importData(file)
      if (!window.confirm(`${next.sessions.length} alvásbejegyzést találtam. Felülírjam a jelenlegi adatokat?`)) return
      exportData(data)
      setData(next)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Importálási hiba.')
    }
    event.target.value = ''
  }
  const clear = () => {
    if (!window.confirm('Biztosan törlöd az összes alvásadatot? Ez nem vonható vissza.')) return
    setData({ ...defaultData, settings: { ...defaultData.settings, childName: data.settings.childName || 'Botond' } })
  }

  return (
    <section className="screen settings-screen">
      <header className="page-header"><button className="back-button" onClick={onBack}>‹</button><h1>Beállítások</h1></header>
      <div className="settings-card"><label>Baba neve<input value={data.settings.childName} onChange={changeName} placeholder="Botond" /></label></div>
      <div className="settings-card action-stack">
        <button onClick={() => exportData(data)}>Adatok exportálása</button>
        <label className="file-button">Adatok importálása<input type="file" accept="application/json" onChange={handleImport} /></label>
        <button className="danger" onClick={clear}>Összes adat törlése</button>
      </div>
      <p className="muted">Az adatok kizárólag ezen az eszközön, a böngésző localStorage tárhelyén maradnak.</p>
    </section>
  )
}

function DateTimeWheel({ label, icon, value, disabled, onChange }: { label: string; icon: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const parts = toLocalParts(value)
  const dates = dateOptions()
  const update = (dateValue = parts.date, hour = parts.hour, minute = parts.minute) => onChange(partsToIso(dateValue, hour, minute))

  return (
    <div className={`wheel-block ${disabled ? 'disabled' : ''}`}>
      <div className="wheel-label">{icon} {label}</div>
      <div className="wheel-columns">
        <select size={5} value={parts.date} disabled={disabled} onChange={(event) => update(event.target.value)}>
          {dates.map((date) => <option key={date.value} value={date.value}>{date.label}</option>)}
        </select>
        <select size={5} value={parts.hour} disabled={disabled} onChange={(event) => update(parts.date, Number(event.target.value), parts.minute)}>
          {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{pad(hour)}</option>)}
        </select>
        <select size={5} value={parts.minute} disabled={disabled} onChange={(event) => update(parts.date, parts.hour, Number(event.target.value))}>
          {Array.from({ length: 60 }, (_, minute) => <option key={minute} value={minute}>{pad(minute)}</option>)}
        </select>
        <div className="wheel-focus" />
      </div>
    </div>
  )
}

function SleepEditor({ session, currentExists, onClose, onSave, onDelete }: {
  session: SleepSession | null
  currentExists: boolean
  onClose: () => void
  onSave: (session: SleepSession) => void
  onDelete: (id: string) => void
}) {
  const [start, setStart] = useState(session?.startTime ?? new Date().toISOString())
  const [end, setEnd] = useState(session?.endTime ?? new Date().toISOString())
  const [stillSleeping, setStillSleeping] = useState(session ? !session.endTime : false)
  const [note, setNote] = useState(session?.note ?? '')

  const submit = () => {
    const endIso = stillSleeping ? null : end
    if (new Date(start).getTime() > Date.now() + 60000 || (endIso && new Date(endIso).getTime() > Date.now() + 60000)) return window.alert('Jövőbeli időpont nem menthető.')
    if (endIso && new Date(endIso) <= new Date(start)) return window.alert('A felébredésnek később kell lennie, mint az elalvásnak.')
    if (stillSleeping && currentExists && !session) return window.alert('Már van egy futó alvás.')
    const nowIso = new Date().toISOString()
    onSave(session ? { ...session, startTime: start, endTime: endIso, note, updatedAt: nowIso } : { ...createSession(start, endIso), note })
  }

  return (
    <div className="editor-overlay">
      <div className="editor-screen">
        <header className="editor-header"><button onClick={onClose}>✕</button><h1>{session ? 'Részletek' : 'Alvás rögzítése'}</h1><span /></header>
        <div className="editor-body">
          <DateTimeWheel label="Elaludt" icon="☾" value={start} onChange={setStart} />
          <DateTimeWheel label="Felébredt" icon="☀︎" value={end} disabled={stillSleeping} onChange={setEnd} />
          <label className="toggle-row"><span>▥  Még alszik</span><input type="checkbox" checked={stillSleeping} onChange={(event) => setStillSleeping(event.target.checked)} /></label>
          {session && <label className="note-field">Megjegyzés<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcionális megjegyzés" /></label>}
        </div>
        <div className="editor-actions">
          {session && <button className="delete-button" onClick={() => onDelete(session.id)}>Törlés</button>}
          <button className="save-button" onClick={submit}>Mentés</button>
        </div>
      </div>
    </div>
  )
}

function BottomNav({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  const items: Array<[Page, string, string]> = [['today', '⌂', 'Ma'], ['history', '▱', 'Előzmények'], ['stats', '▥', 'Statisztika']]
  return <nav className="bottom-nav">{items.map(([key, icon, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => onChange(key)}><span>{icon}</span><small>{label}</small></button>)}</nav>
}
