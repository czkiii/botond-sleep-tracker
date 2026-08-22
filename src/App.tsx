import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AppData, Page, SleepSession } from './types'
import { createSession, defaultData, exportData, importData, loadData, saveData } from './storage'
import { awakeSince, durationOf, formatDateHeader, formatDuration, formatTime, formatTimer, splitDayNight, todaySessions, totalToday } from './utils'

const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const fromLocalInput = (value: string) => new Date(value).toISOString()

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

  const current = useMemo(() => data.sessions.find(s => !s.endTime) ?? null, [data.sessions])

  const updateSessions = (sessions: SleepSession[]) => setData(prev => ({ ...prev, sessions }))

  const startNow = () => {
    if (current) return
    updateSessions([createSession(new Date().toISOString()), ...data.sessions])
  }

  const endNow = () => {
    if (!current) return
    const endTime = new Date().toISOString()
    updateSessions(data.sessions.map(s => s.id === current.id ? { ...s, endTime, updatedAt: endTime } : s))
  }

  const saveEditor = (session: SleepSession) => {
    if (editor === 'new') updateSessions([session, ...data.sessions])
    else updateSessions(data.sessions.map(s => s.id === session.id ? session : s))
    setEditor(null)
  }

  const deleteSession = (id: string) => {
    if (!window.confirm('Biztosan törlöd ezt az alvást?')) return
    updateSessions(data.sessions.filter(s => s.id !== id))
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
  data: AppData; now: number; current: SleepSession | null; onStart: () => void; onEnd: () => void; onOpenEditor: (value: SleepSession | 'new') => void; onSettings: () => void
}) {
  const todays = todaySessions(data.sessions).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  const total = totalToday(data.sessions, new Date(now))
  const elapsed = current ? durationOf(current, now) : awakeSince(data.sessions, now)

  return <section className="screen today-screen">
    <header className="compact-header">
      <div>
        <div className="date-label">{formatDateHeader(new Date(now))}</div>
        <div className="daily-summary">Ma eddig <strong>{formatDuration(total)}</strong> alvás</div>
      </div>
      <button className="icon-button" aria-label="Beállítások" onClick={onSettings}>⚙︎</button>
    </header>

    <div className={`status-orb ${current ? 'sleeping' : ''}`}>
      <div className="orb-icon">{current ? '☾' : '✦'}</div>
      <div className="orb-status">{current ? 'ALSZIK' : 'ÉBREN'}</div>
      <div className="orb-time">{current ? formatTimer(elapsed) : formatDuration(elapsed)}</div>
      {current && <div className="orb-sub">Elaludt {formatTime(current.startTime)}</div>}
    </div>

    <button className="primary-action" onClick={current ? onEnd : onStart}>{current ? '☀  Felébredt' : '☾  Elaludt'}</button>
    <button className="text-action" onClick={() => onOpenEditor(current ?? 'new')}>Részletek</button>

    <div className="section-head"><h2>Mai alvások</h2><span>{todays.length} alkalom</span></div>
    <div className="sleep-list scroll-list">
      {todays.length === 0 && <div className="empty">Még nincs mai alvás.</div>}
      {todays.map(s => <SleepRow key={s.id} session={s} now={now} onClick={() => onOpenEditor(s)} />)}
    </div>
  </section>
}

function SleepRow({ session, now, onClick }: { session: SleepSession; now: number; onClick?: () => void }) {
  return <button className="sleep-row" onClick={onClick}>
    <span className="sleep-row-icon">☾</span>
    <span className="sleep-row-time">{formatTime(session.startTime)} – {session.endTime ? formatTime(session.endTime) : 'most'}</span>
    <span className="sleep-row-duration">{formatDuration(durationOf(session, now))}</span>
  </button>
}

function HistoryPage({ sessions, onEdit, onNew }: { sessions: SleepSession[]; onEdit: (s: SleepSession) => void; onNew: () => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, SleepSession[]>()
    [...sessions].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).forEach(s => {
      const key = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(s.startTime))
      map.set(key, [...(map.get(key) ?? []), s])
    })
    return [...map.entries()]
  }, [sessions])

  return <section className="screen">
    <header className="page-header"><h1>Előzmények</h1><button className="add-button" onClick={onNew}>＋</button></header>
    <div className="history-wrap">
      {grouped.length === 0 && <div className="empty-card">Még nincs rögzített alvás.</div>}
      {grouped.map(([date, items]) => <div className="history-group" key={date}>
        <h3>{date}</h3>
        <div className="sleep-list">{items.map(s => <SleepRow key={s.id} session={s} now={Date.now()} onClick={() => onEdit(s)} />)}</div>
      </div>)}
    </div>
  </section>
}

function StatsPage({ sessions, now }: { sessions: SleepSession[]; now: number }) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  const days = range === 'day' ? 1 : range === 'week' ? 7 : 30
  const chart = useMemo(() => Array.from({ length: days }, (_, i) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (days - 1 - i))
    const total = totalToday(sessions, d)
    return { label: new Intl.DateTimeFormat('hu-HU', { day: 'numeric' }).format(d), hours: +(total / 3600000).toFixed(2) }
  }), [sessions, now, days])

  const recent = sessions.filter(s => new Date(s.startTime).getTime() >= now - days * 86400000)
  const sums = recent.reduce((acc, s) => {
    const parts = splitDayNight(s, now)
    acc.total += durationOf(s, now); acc.day += parts.day; acc.night += parts.night
    return acc
  }, { total: 0, day: 0, night: 0 })
  const divisor = Math.max(1, days)

  return <section className="screen">
    <header className="page-header"><h1>Statisztika</h1></header>
    <div className="segmented">
      <button className={range === 'day' ? 'active' : ''} onClick={() => setRange('day')}>Nap</button>
      <button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>Hét</button>
      <button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Hónap</button>
    </div>
    <div className="chart-card">
      <h2>Alvás időtartama</h2>
      <div className="bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis hide domain={[0, 14]} /><Tooltip contentStyle={{ background: '#0d1a2b', border: '1px solid #1c3352', borderRadius: 12 }} formatter={(value) => [`${value} ó`, 'Alvás']} /><Bar dataKey="hours" fill="#55a7ff" radius={[8, 8, 4, 4]} /></BarChart></ResponsiveContainer></div>
    </div>
    <div className="stats-grid">
      <StatCard label="Átlag" value={formatDuration(sums.total / divisor)} />
      <StatCard label="Nappali" value={formatDuration(sums.day / divisor)} />
      <StatCard label="Éjszakai" value={formatDuration(sums.night / divisor)} />
    </div>
    <div className="chart-card radial-card">
      <h2>24 órás áttekintés</h2>
      <div className="radial"><div className="radial-inner"><span>☾</span><strong>24h</strong><span>☀</span></div></div>
      <p className="muted center">A részletes időszakok a rögzített sessionökből számolódnak.</p>
    </div>
  </section>
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>
}

function SettingsPage({ data, setData, onBack }: { data: AppData; setData: (data: AppData) => void; onBack: () => void }) {
  const changeName = (e: ChangeEvent<HTMLInputElement>) => setData({ ...data, settings: { ...data.settings, childName: e.target.value } })
  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const next = await importData(file)
      if (!window.confirm(`${next.sessions.length} alvásbejegyzést találtam. Felülírjam a jelenlegi adatokat?`)) return
      exportData(data)
      setData(next)
    } catch (err) { window.alert(err instanceof Error ? err.message : 'Importálási hiba.') }
    e.target.value = ''
  }
  const clear = () => {
    if (!window.confirm('Biztosan törlöd az összes alvásadatot? Ez nem vonható vissza.')) return
    setData({ ...defaultData, settings: { ...defaultData.settings, childName: data.settings.childName || 'Botond' } })
  }
  return <section className="screen settings-screen">
    <header className="page-header"><button className="back-button" onClick={onBack}>‹</button><h1>Beállítások</h1></header>
    <div className="settings-card"><label>Baba neve<input value={data.settings.childName} onChange={changeName} placeholder="Botond" /></label></div>
    <div className="settings-card action-stack">
      <button onClick={() => exportData(data)}>Adatok exportálása</button>
      <label className="file-button">Adatok importálása<input type="file" accept="application/json" onChange={handleImport} /></label>
      <button className="danger" onClick={clear}>Összes adat törlése</button>
    </div>
    <p className="muted">Az adatok kizárólag ezen az eszközön, a böngésző localStorage tárhelyén maradnak.</p>
  </section>
}

function SleepEditor({ session, currentExists, onClose, onSave, onDelete }: { session: SleepSession | null; currentExists: boolean; onClose: () => void; onSave: (s: SleepSession) => void; onDelete: (id: string) => void }) {
  const [start, setStart] = useState(toLocalInput(session?.startTime))
  const [end, setEnd] = useState(session?.endTime ? toLocalInput(session.endTime) : toLocalInput())
  const [stillSleeping, setStillSleeping] = useState(session ? !session.endTime : false)
  const [note, setNote] = useState(session?.note ?? '')

  const submit = () => {
    const startIso = fromLocalInput(start)
    const endIso = stillSleeping ? null : fromLocalInput(end)
    if (new Date(startIso).getTime() > Date.now() + 60000 || (endIso && new Date(endIso).getTime() > Date.now() + 60000)) return window.alert('Jövőbeli időpont nem menthető.')
    if (endIso && new Date(endIso) <= new Date(startIso)) return window.alert('A felébredésnek később kell lennie, mint az elalvásnak.')
    if (stillSleeping && currentExists && !session) return window.alert('Már van egy futó alvás.')
    const now = new Date().toISOString()
    onSave(session ? { ...session, startTime: startIso, endTime: endIso, note, updatedAt: now } : { ...createSession(startIso, endIso), note })
  }

  return <div className="editor-overlay">
    <div className="editor-screen">
      <header className="editor-header"><button onClick={onClose}>✕</button><h1>{session ? 'Részletek' : 'Alvás rögzítése'}</h1><span /></header>
      <div className="editor-body">
        <div className="picker-block"><label>☾ Elaludt</label><input className="datetime-picker" type="datetime-local" value={start} max={toLocalInput()} onChange={e => setStart(e.target.value)} /></div>
        <div className={`picker-block ${stillSleeping ? 'disabled' : ''}`}><label>☀ Felébredt</label><input className="datetime-picker" type="datetime-local" value={end} max={toLocalInput()} disabled={stillSleeping} onChange={e => setEnd(e.target.value)} /></div>
        <label className="toggle-row"><span>🛏 Még alszik</span><input type="checkbox" checked={stillSleeping} onChange={e => setStillSleeping(e.target.checked)} /></label>
        {session && <label className="note-field">Megjegyzés<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Opcionális megjegyzés" /></label>}
      </div>
      <div className="editor-actions">
        {session && <button className="delete-button" onClick={() => onDelete(session.id)}>Törlés</button>}
        <button className="save-button" onClick={submit}>Mentés</button>
      </div>
    </div>
  </div>
}

function BottomNav({ page, onChange }: { page: Page; onChange: (p: Page) => void }) {
  const items: Array<[Page, string, string]> = [['today', '⌂', 'Ma'], ['history', '◷', 'Előzmények'], ['stats', '▥', 'Statisztika']]
  return <nav className="bottom-nav">{items.map(([key, icon, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => onChange(key)}><span>{icon}</span>{label}</button>)}</nav>
}
