import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AppData, Page, SleepSession } from './types'
import { createSession, defaultData, exportData, importData, loadData, saveData } from './storage'
import { awakeSince, durationOf, formatDateHeader, formatDuration, formatTime, formatTimer, splitDayNight, todaySessions, totalToday } from './utils'

const pad = (value: number) => String(value).padStart(2, '0')

function Icon({ name, size = 18 }: { name: 'moon' | 'sun' | 'settings' | 'home' | 'history' | 'stats' | 'edit' | 'plus' | 'close'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'moon') return <svg {...common}><path d="M20.2 15.2A8.6 8.6 0 0 1 8.8 3.8 8.7 8.7 0 1 0 20.2 15.2Z" /></svg>
  if (name === 'sun') return <svg {...common}><circle cx="12" cy="12" r="3.6" /><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" /></svg>
  if (name === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05-2.76 2.76-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.64V21h-3.8v-.07A1.8 1.8 0 0 0 9 19.3a1.8 1.8 0 0 0-2 .36l-.05.05-2.76-2.76.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.96 13H3v-3.8h-.04A1.8 1.8 0 0 0 4.6 8.1a1.8 1.8 0 0 0-.36-2l-.05-.05 2.76-2.76.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10.1 2.06V2h3.8v.06A1.8 1.8 0 0 0 15 3.7a1.8 1.8 0 0 0 2-.36l.05-.05 2.76 2.76-.05.05a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21.04 9.2H21V13h.04A1.8 1.8 0 0 0 19.4 15Z" /></svg>
  if (name === 'home') return <svg {...common}><path d="M4 10.5 12 4l8 6.5V20h-6v-5h-4v5H4Z" /></svg>
  if (name === 'history') return <svg {...common}><path d="M4 5v5h5" /><path d="M5.2 16.5A8 8 0 1 0 4 10" /><path d="M12 8v4l2.6 1.5" /></svg>
  if (name === 'stats') return <svg {...common}><path d="M5 20V11M10 20V5M15 20v-8M20 20V8" /></svg>
  if (name === 'edit') return <svg {...common}><path d="m4 20 4.3-1 9.8-9.8-3.3-3.3L5 15.7 4 20Z" /><path d="m13.8 6.9 3.3 3.3" /></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>
}

function toLocalParts(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date()
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, hour: date.getHours(), minute: date.getMinutes() }
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
  const now = new Date(); now.setHours(0, 0, 0, 0)
  for (let index = 10; index >= 0; index -= 1) {
    const date = new Date(now); date.setDate(date.getDate() - index)
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
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])

  const current = useMemo(() => data.sessions.find((session) => !session.endTime) ?? null, [data.sessions])
  const updateSessions = (sessions: SleepSession[]) => setData((previous) => ({ ...previous, sessions }))
  const startNow = () => { if (!current) updateSessions([createSession(new Date().toISOString()), ...data.sessions]) }
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
    updateSessions(data.sessions.filter((session) => session.id !== id)); setEditor(null)
  }

  return <div className="app-shell">
    <main className="app-main">
      {page === 'today' && <TodayPage data={data} now={now} current={current} onStart={startNow} onEnd={endNow} onOpenEditor={setEditor} onSettings={() => setPage('settings')} />}
      {page === 'history' && <HistoryPage sessions={data.sessions} onEdit={setEditor} onNew={() => setEditor('new')} />}
      {page === 'stats' && <StatsPage sessions={data.sessions} now={now} />}
      {page === 'settings' && <SettingsPage data={data} setData={setData} onBack={() => setPage('today')} />}
    </main>
    {page !== 'settings' && <BottomNav page={page} onChange={setPage} />}
    {editor && <SleepEditor session={editor === 'new' ? null : editor} currentExists={Boolean(current)} onClose={() => setEditor(null)} onSave={saveEditor} onDelete={deleteSession} />}
  </div>
}

function TodayPage({ data, now, current, onStart, onEnd, onOpenEditor, onSettings }: { data: AppData; now: number; current: SleepSession | null; onStart: () => void; onEnd: () => void; onOpenEditor: (value: SleepSession | 'new') => void; onSettings: () => void }) {
  const todays = todaySessions(data.sessions).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  const yesterdayStart = new Date(now); yesterdayStart.setHours(0, 0, 0, 0); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const yesterdayEnd = new Date(yesterdayStart); yesterdayEnd.setDate(yesterdayEnd.getDate() + 1)
  const yesterdays = data.sessions
    .filter((session) => { const start = new Date(session.startTime).getTime(); return start >= yesterdayStart.getTime() && start < yesterdayEnd.getTime() })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  const total = totalToday(data.sessions, new Date(now))
  const elapsed = current ? durationOf(current, now) : awakeSince(data.sessions, now)
  return <section className="screen today-screen">
    <header className="compact-header"><div className="header-copy"><div className="date-label">{formatDateHeader(new Date(now))}</div><div className="daily-summary">Ma eddig <strong>{formatDuration(total)}</strong> alvás</div></div><button className="icon-button" aria-label="Beállítások" onClick={onSettings}><Icon name="settings" size={18} /></button></header>
    <div className={`status-orb ${current ? 'sleeping' : 'awake'}`}><div className="orb-content"><div className="orb-icon"><Icon name="moon" size={19} /></div><div className="orb-status">{current ? 'ALSZIK' : 'ÉBREN'}</div><div className="orb-time">{current ? formatTimer(elapsed) : formatDuration(elapsed)}</div>{current && <div className="orb-sub">Elaludt {formatTime(current.startTime)}</div>}</div></div>
    <button className="primary-action" onClick={current ? onEnd : onStart}><Icon name={current ? 'sun' : 'moon'} size={20} /><span>{current ? 'Felébredt' : 'Elaludt'}</span></button>
    <button className="text-action" onClick={() => onOpenEditor(current ?? 'new')}>Részletek</button>
    <div className="sleep-cards-stack">
      <div className="today-card"><div className="section-head"><h2>Mai alvások</h2><span>•••</span></div><div className="sleep-list scroll-list">{todays.length === 0 && <div className="empty">Még nincs mai alvás.</div>}{todays.map((session) => <SleepRow key={session.id} session={session} now={now} onClick={() => onOpenEditor(session)} compact />)}</div></div>
      <div className="today-card yesterday-card"><div className="section-head"><h2>Tegnapi alvások</h2><span>•••</span></div><div className="sleep-list scroll-list">{yesterdays.length === 0 && <div className="empty">Nem volt tegnap rögzített alvás.</div>}{yesterdays.map((session) => <SleepRow key={session.id} session={session} now={now} onClick={() => onOpenEditor(session)} compact />)}</div></div>
    </div>
  </section>
}

function SleepRow({ session, now, onClick, compact = false }: { session: SleepSession; now: number; onClick?: () => void; compact?: boolean }) {
  return <button className={`sleep-row ${compact ? 'compact' : ''}`} onClick={onClick}><span className="sleep-row-icon"><Icon name="moon" size={13} /></span><span className="sleep-row-time">{formatTime(session.startTime)} – {session.endTime ? formatTime(session.endTime) : 'most'}</span><span className="sleep-row-duration">{formatDuration(durationOf(session, now))}</span>{!compact && <span className="sleep-row-edit"><Icon name="edit" size={12} /></span>}</button>
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
  return <section className="screen history-screen"><header className="page-header centered-header"><h1>Előzmények</h1><button className="add-button" onClick={onNew}><Icon name="plus" size={19} /></button></header><div className="history-wrap">{grouped.length === 0 && <div className="empty-card">Még nincs rögzített alvás.</div>}{grouped.map(([date, items], index) => <div className="history-group" key={date}><h3>{index === 0 ? `Ma – ${date}` : index === 1 ? `Tegnap – ${date}` : date}</h3><div className="sleep-list history-list">{items.map((session) => <SleepRow key={session.id} session={session} now={Date.now()} onClick={() => onEdit(session)} />)}</div></div>)}</div></section>
}

function StatsPage({ sessions, now }: { sessions: SleepSession[]; now: number }) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  const days = range === 'day' ? 1 : range === 'week' ? 7 : 30
  const chart = useMemo(() => Array.from({ length: days }, (_, index) => {
    const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (days - 1 - index))
    return { label: new Intl.DateTimeFormat('hu-HU', { day: 'numeric' }).format(date), hours: +(totalToday(sessions, date) / 3600000).toFixed(2) }
  }), [sessions, now, days])
  const recent = sessions.filter((session) => new Date(session.startTime).getTime() >= now - days * 86400000)
  const sums = recent.reduce((acc, session) => { const parts = splitDayNight(session, now); acc.total += durationOf(session, now); acc.day += parts.day; acc.night += parts.night; return acc }, { total: 0, day: 0, night: 0 })
  const divisor = Math.max(1, days)
  return <section className="screen stats-screen"><header className="page-header centered-header"><h1>Statisztika</h1></header>
    <div className="segmented"><button className={range === 'day' ? 'active' : ''} onClick={() => setRange('day')}>Nap</button><button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>Hét</button><button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Hónap</button></div>
    <div className="chart-card compact-chart-card"><h2>Alvás időtartama</h2><div className="bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 8, right: 2, bottom: 0, left: -26 }}><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis domain={[0, 14]} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: '#0d1a2b', border: '1px solid #1c3352', borderRadius: 10 }} formatter={(value) => [`${value} ó`, 'Alvás']} /><Bar dataKey="hours" fill="#579dff" radius={[4, 4, 1, 1]} maxBarSize={17} /></BarChart></ResponsiveContainer></div></div>
    <h2 className="overview-title">24 órás áttekintés</h2>
    <div className="overview-compact"><div className="radial compact-radial"><div className="clock-mark mark-0">0</div><div className="clock-mark mark-6">6</div><div className="clock-mark mark-12">12</div><div className="clock-mark mark-18">18</div><div className="radial-inner"><Icon name="moon" size={16} /><Icon name="sun" size={16} /></div></div><div className="stats-row"><StatCard label="Átlag" value={formatDuration(sums.total / divisor)} suffix="/ nap" /><StatCard label="Nappali" value={formatDuration(sums.day / divisor)} icon="sun" /><StatCard label="Éjszakai" value={formatDuration(sums.night / divisor)} icon="moon" /></div></div>
  </section>
}

function StatCard({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon?: 'moon' | 'sun' }) {
  return <div className="stat-card"><div><span>{label}</span><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>{icon && <b><Icon name={icon} size={15} /></b>}</div>
}

function SettingsPage({ data, setData, onBack }: { data: AppData; setData: (data: AppData) => void; onBack: () => void }) {
  const changeName = (event: ChangeEvent<HTMLInputElement>) => setData({ ...data, settings: { ...data.settings, childName: event.target.value } })
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; try { const next = await importData(file); if (!window.confirm(`${next.sessions.length} alvásbejegyzést találtam. Felülírjam a jelenlegi adatokat?`)) return; exportData(data); setData(next) } catch (error) { window.alert(error instanceof Error ? error.message : 'Importálási hiba.') } event.target.value = '' }
  const clear = () => { if (!window.confirm('Biztosan törlöd az összes alvásadatot? Ez nem vonható vissza.')) return; setData({ ...defaultData, settings: { ...defaultData.settings, childName: data.settings.childName || 'Botond' } }) }
  return <section className="screen settings-screen"><header className="page-header"><button className="back-button" onClick={onBack}>‹</button><h1>Beállítások</h1><span className="header-spacer" /></header><div className="settings-card"><label>Baba neve<input value={data.settings.childName} onChange={changeName} placeholder="Botond" /></label></div><div className="settings-card action-stack"><button onClick={() => exportData(data)}>Adatok exportálása</button><label className="file-button">Adatok importálása<input type="file" accept="application/json" onChange={handleImport} /></label><button className="danger" onClick={clear}>Összes adat törlése</button></div><p className="muted">Az adatok kizárólag ezen az eszközön, a böngésző localStorage tárhelyén maradnak.</p></section>
}

type WheelItem = { value: string; label: string }
function WheelColumn({ items, value, disabled, onChange }: { items: WheelItem[]; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const row = 46
  useEffect(() => {
    const index = Math.max(0, items.findIndex((item) => item.value === value))
    requestAnimationFrame(() => ref.current?.scrollTo({ top: index * row, behavior: 'auto' }))
  }, [items, value])
  const handleScroll = () => {
    if (!ref.current || disabled) return
    const index = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / row)))
    if (items[index] && items[index].value !== value) onChange(items[index].value)
  }
  return <div ref={ref} className={`wheel-column ${disabled ? 'disabled' : ''}`} onScroll={handleScroll}>{items.map((item) => <button type="button" key={item.value} className={item.value === value ? 'selected' : ''} disabled={disabled} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>
}

function DateTimeWheel({ label, icon, value, disabled, onChange }: { label: string; icon: 'moon' | 'sun'; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const parts = toLocalParts(value)
  const dates = dateOptions()
  const update = (dateValue = parts.date, hour = parts.hour, minute = parts.minute) => onChange(partsToIso(dateValue, hour, minute))
  const hours = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: pad(hour) }))
  const minutes = Array.from({ length: 60 }, (_, minute) => ({ value: String(minute), label: pad(minute) }))
  return <div className={`wheel-block ${disabled ? 'disabled' : ''}`}><div className="wheel-label"><Icon name={icon} size={16} /><span>{label}</span></div><div className="wheel-columns custom-wheel"><WheelColumn items={dates} value={parts.date} disabled={disabled} onChange={(next) => update(next)} /><WheelColumn items={hours} value={String(parts.hour)} disabled={disabled} onChange={(next) => update(parts.date, Number(next), parts.minute)} /><WheelColumn items={minutes} value={String(parts.minute)} disabled={disabled} onChange={(next) => update(parts.date, parts.hour, Number(next))} /><div className="wheel-focus" /></div></div>
}

function SleepEditor({ session, currentExists, onClose, onSave, onDelete }: { session: SleepSession | null; currentExists: boolean; onClose: () => void; onSave: (session: SleepSession) => void; onDelete: (id: string) => void }) {
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
  return <div className="editor-overlay"><div className="editor-screen"><header className="editor-header"><button onClick={onClose}><Icon name="close" size={18} /></button><h1>{session ? 'Részletek' : 'Alvás rögzítése'}</h1><span /></header><div className="editor-body"><DateTimeWheel label="Elaludt" icon="moon" value={start} onChange={setStart} /><DateTimeWheel label="Felébredt" icon="sun" value={end} disabled={stillSleeping} onChange={setEnd} /><label className="toggle-row"><span className="toggle-label"><Icon name="moon" size={16} /> Még alszik</span><input type="checkbox" checked={stillSleeping} onChange={(event) => setStillSleeping(event.target.checked)} /></label>{session && <label className="note-field">Megjegyzés<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcionális megjegyzés" /></label>}</div><div className="editor-actions centered-actions">{session && <button className="delete-button" onClick={() => onDelete(session.id)}>Törlés</button>}<button className="save-button" onClick={submit}>Mentés</button></div></div></div>
}

function BottomNav({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  const items: Array<[Page, 'home' | 'history' | 'stats', string]> = [['today', 'home', 'Ma'], ['history', 'history', 'Előzmények'], ['stats', 'stats', 'Statisztika']]
  return <nav className="bottom-nav">{items.map(([key, icon, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => onChange(key)}><span><Icon name={icon} size={18} /></span><small>{label}</small></button>)}</nav>
}
