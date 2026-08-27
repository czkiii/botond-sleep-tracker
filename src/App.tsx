import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { languageOptions, localeTag, t } from './i18n'
import type { Locale } from './i18n'
import type { AppData, ChildProfile, DayNightOverride, Page, SleepSession } from './types'
import type { DataQualityIssueKind } from './utils'
import { createChild, createSession, exportData, importData, inspectBackup, loadData, saveData } from './storage'
import type { ImportDiagnostic, ImportInspection } from './storage'
import { deleteChildPhoto, loadChildPhoto, prepareChildPhoto, saveChildPhoto } from './photoStore'
import type { AvatarCrop } from './photoStore'
import { removeChildProfile } from './childProfiles'
import { buildInsightsFoundation } from './insights'
import { buildSimilarDaysInsight } from './similarDays'
import { buildPredictionLite } from './prediction'
import { buildSleepDevelopment } from './sleepDevelopment'
import type { SleepDevelopmentMilestone } from './sleepDevelopment'
import { buildSleepChangeInsight } from './sleepChange'
import type { SleepChangeMetric, SleepChangeSignal } from './sleepChange'
import { buildMonthlyFamilyReport } from './monthlyReport'
import type { MonthlyReportMetric, MonthlyReportMilestone, MonthlyReportTrend } from './monthlyReport'
import { DEFAULT_DAY_START_MINUTES, DEFAULT_NIGHT_START_MINUTES, LONG_SLEEP_GUARDRAIL_MS, awakeSince, durationOf, formatDateHeader, formatDuration, formatTime, formatTimer, getDataQualityWarnings, splitDayNight, todaySessions, totalToday } from './utils'
import SleepTimeline from './SleepTimeline'
import SwipeHistoryRow from './SwipeHistoryRow'

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

function shortDateLabel(value: string, locale: Locale) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(localeTag(locale), { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(year, month - 1, day))
}

function dateOptions(locale: Locale) {
  const result: Array<{ value: string; label: string }> = []
  const now = new Date(); now.setHours(0, 0, 0, 0)
  for (let index = 10; index >= 0; index -= 1) {
    const date = new Date(now); date.setDate(date.getDate() - index)
    const value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    result.push({ value, label: shortDateLabel(value, locale) })
  }
  return result
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [page, setPage] = useState<Page>('today')
  const [now, setNow] = useState(Date.now())
  const [editor, setEditor] = useState<SleepSession | 'new' | null>(null)
  const locale = data.settings.locale
  const activeChild = data.children.find((child) => child.id === data.settings.activeChildId) ?? data.children[0]
  const activeSessions = useMemo(() => data.sessions.filter((session) => session.childId === activeChild.id), [data.sessions, activeChild.id])

  useEffect(() => saveData(data), [data])
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])

  const current = useMemo(() => activeSessions.find((session) => !session.endTime) ?? null, [activeSessions])
  const updateSessions = (sessions: SleepSession[]) => setData((previous) => ({ ...previous, sessions }))
  const startNow = () => { if (!current) updateSessions([createSession(activeChild.id, new Date().toISOString()), ...data.sessions]) }
  const endNow = () => {
    if (!current) return
    const endTime = new Date().toISOString()
    updateSessions(data.sessions.map((session) => session.id === current.id ? { ...session, endTime, updatedAt: endTime } : session))
  }
  const adjustCurrentStart = (minutes: number) => {
    if (!current) return
    const updatedAt = new Date().toISOString()
    const startTime = new Date(Date.parse(current.startTime) + minutes * 60000).toISOString()
    updateSessions(data.sessions.map((session) => session.id === current.id ? { ...session, startTime, updatedAt } : session))
  }
  const saveEditor = (session: SleepSession) => {
    if (editor === 'new') updateSessions([session, ...data.sessions])
    else updateSessions(data.sessions.map((item) => item.id === session.id ? session : item))
    setEditor(null)
  }
  const deleteSession = (id: string) => {
    if (!window.confirm(t(locale, 'deleteConfirm'))) return
    updateSessions(data.sessions.filter((session) => session.id !== id)); setEditor(null)
  }

  return <div className="app-shell">
    <main className="app-main">
      {page === 'today' && <TodayPage data={data} child={activeChild} sessions={activeSessions} now={now} locale={locale} current={current} onSelectChild={(childId) => setData((previous) => ({ ...previous, settings: { ...previous.settings, activeChildId: childId } }))} onStart={startNow} onEnd={endNow} onAdjustStart={adjustCurrentStart} onOpenEditor={setEditor} onHistory={() => setPage('history')} onSettings={() => setPage('settings')} />}
      {page === 'history' && <HistoryPage sessions={activeSessions} locale={locale} onEdit={setEditor} onDelete={deleteSession} onNew={() => setEditor('new')} />}
      {page === 'stats' && <StatsPage sessions={activeSessions} now={now} locale={locale} childName={activeChild.name} />}
      {page === 'settings' && <SettingsPage data={data} setData={setData} onBack={() => setPage('today')} />}
    </main>
    {page !== 'settings' && <BottomNav page={page} locale={locale} onChange={setPage} />}
    {editor && <SleepEditor childId={activeChild.id} session={editor === 'new' ? null : editor} locale={locale} currentExists={Boolean(current)} onClose={() => setEditor(null)} onSave={saveEditor} onDelete={deleteSession} />}
  </div>
}

function TodayPage({ data, child, sessions, now, locale, current, onSelectChild, onStart, onEnd, onAdjustStart, onOpenEditor, onHistory, onSettings }: { data: AppData; child: ChildProfile; sessions: SleepSession[]; now: number; locale: Locale; current: SleepSession | null; onSelectChild: (childId: string) => void; onStart: () => void; onEnd: () => void; onAdjustStart: (minutes: number) => void; onOpenEditor: (value: SleepSession | 'new') => void; onHistory: () => void; onSettings: () => void }) {
  const todays = todaySessions(sessions).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  const yesterdayStart = new Date(now); yesterdayStart.setHours(0, 0, 0, 0); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const yesterdayEnd = new Date(yesterdayStart); yesterdayEnd.setDate(yesterdayEnd.getDate() + 1)
  const yesterdays = sessions
    .filter((session) => { const start = new Date(session.startTime).getTime(); return start >= yesterdayStart.getTime() && start < yesterdayEnd.getTime() })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  const total = totalToday(sessions, new Date(now))
  const lastCompleted = sessions.filter((session) => session.endTime).sort((a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime())[0] ?? null
  const elapsed = current ? durationOf(current, now) : awakeSince(sessions, now)
  const qualityWarnings = getDataQualityWarnings(sessions, now)
  const showLongSleepReminder = Boolean(current && data.settings.longSleepReminderEnabled && elapsed >= LONG_SLEEP_GUARDRAIL_MS)
  const visibleQualityWarning = qualityWarnings.find((issue) => issue.kind !== 'stale-active')

  return <section className="screen today-screen">
    <header className="compact-header"><div className="header-copy"><div className="child-header-line"><ChildAvatar child={child} className="child-avatar" />{data.children.length > 1 ? <select aria-label={t(locale, 'chooseChild')} className="child-switcher" value={child.id} onChange={(event) => onSelectChild(event.target.value)}>{data.children.map((item) => <option key={item.id} value={item.id}>{item.name || t(locale, 'unnamedChild')}</option>)}</select> : <strong className="single-child-name">{child.name || t(locale, 'unnamedChild')}</strong>}</div><div className="date-label">{formatDateHeader(new Date(now), locale)}</div><div className="daily-summary">{t(locale, 'todaySoFar')} <strong>{formatDuration(total, locale)}</strong> {t(locale, 'sleepNoun')}</div></div><button className="icon-button" aria-label={t(locale, 'settings')} onClick={onSettings}><Icon name="settings" size={18} /></button></header>
    <div className={`status-orb ${current ? 'sleeping' : 'awake'}`}><div className="orb-content"><div className="orb-status">{current ? t(locale, 'sleeping') : t(locale, 'awake')}</div><div className="orb-time">{formatTimer(elapsed)}</div><div className="orb-sub">{current ? `${t(locale, 'fellAsleep')} ${formatTime(current.startTime, locale)}` : lastCompleted ? `${t(locale, 'wokeUp')} ${formatTime(lastCompleted.endTime!, locale)}` : t(locale, 'noPreviousWake')}</div></div></div>
    <button className="primary-action" onClick={current ? onEnd : onStart}><Icon name={current ? 'sun' : 'moon'} size={20} /><span>{current ? t(locale, 'wokeUp') : t(locale, 'fellAsleep')}</span></button>
    {current && <div className="quick-correction"><span>{t(locale, 'startedEarlier')}</span>{[5, 10, 15].map((minutes) => <button key={minutes} onClick={() => onAdjustStart(-minutes)}>−{minutes}</button>)}<button className="custom-correction" onClick={() => onOpenEditor(current)}>{t(locale, 'customTime')}</button></div>}
    {showLongSleepReminder && <div className="sleep-warning-card"><strong>{t(locale, 'stillSleepingQuestion')}</strong><span>{t(locale, 'longSleepReminderText')}</span></div>}
    {visibleQualityWarning && <button className="quality-warning-card" onClick={() => onOpenEditor(sessions.find((session) => visibleQualityWarning.sessionIds.includes(session.id)) ?? 'new')}><span className="quality-warning-icon" aria-hidden="true">!</span><span className="quality-warning-copy"><strong>{t(locale, qualityIssueTranslationKey(visibleQualityWarning.kind))}</strong><small>{t(locale, 'tapToFix')}</small></span><span className="quality-warning-arrow" aria-hidden="true">›</span></button>}
    <button className="text-action" onClick={() => onOpenEditor(current ?? 'new')}>{t(locale, 'manualEntry')}</button>
    <div className="sleep-cards-stack">
      <div className="today-card"><div className="section-head"><h2>{t(locale, 'todaySleeps')}</h2><button className="section-more" type="button" aria-label={t(locale, 'history')} onClick={onHistory}>•••</button></div><div className="sleep-list scroll-list">{todays.length === 0 && <div className="empty">{t(locale, 'noSleepToday')}</div>}{todays.map((session) => <SleepRow key={session.id} session={session} now={now} locale={locale} onClick={() => onOpenEditor(session)} compact />)}</div></div>
      <div className="today-card yesterday-card"><div className="section-head"><h2>{t(locale, 'yesterdaySleeps')}</h2><button className="section-more" type="button" aria-label={t(locale, 'history')} onClick={onHistory}>•••</button></div><div className="sleep-list scroll-list">{yesterdays.length === 0 && <div className="empty">{t(locale, 'noSleepYesterday')}</div>}{yesterdays.map((session) => <SleepRow key={session.id} session={session} now={now} locale={locale} onClick={() => onOpenEditor(session)} compact />)}</div></div>
    </div>
  </section>
}

function qualityIssueTranslationKey(kind: DataQualityIssueKind) {
  const keys = {
    'invalid-time': 'invalidTimeWarning',
    'future-time': 'futureTimeWarning',
    'suspiciously-short': 'shortDurationWarning',
    'stale-active': 'staleActiveWarning',
    'extreme-duration': 'extremeDurationWarning',
    'possible-duplicate': 'duplicateWarning',
    overlap: 'overlapWarning'
  } as const
  return keys[kind]
}

function SleepRow({ session, now, locale, onClick, compact = false }: { session: SleepSession; now: number; locale: Locale; onClick?: () => void; compact?: boolean }) {
  return <button className={`sleep-row ${compact ? 'compact' : ''}`} onClick={onClick}><span className="sleep-row-icon"><Icon name="moon" size={13} /></span><span className="sleep-row-time">{formatTime(session.startTime, locale)} – {session.endTime ? formatTime(session.endTime, locale) : t(locale, 'now')}</span><span className="sleep-row-duration">{formatDuration(durationOf(session, now), locale)}</span>{!compact && <span className="sleep-row-edit"><Icon name="edit" size={12} /></span>}</button>
}

function HistoryPage({ sessions, locale, onEdit, onDelete, onNew }: { sessions: SleepSession[]; locale: Locale; onEdit: (session: SleepSession) => void; onDelete: (id: string) => void; onNew: () => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, SleepSession[]>()
    sessions.slice().sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).forEach((session) => {
      const key = new Intl.DateTimeFormat(localeTag(locale), { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(session.startTime))
      map.set(key, (map.get(key) ?? []).concat(session))
    })
    return Array.from(map.entries())
  }, [sessions, locale])
  return <section className="screen history-screen"><header className="page-header centered-header"><h1>{t(locale, 'history')}</h1><button className="add-button" onClick={onNew}><Icon name="plus" size={19} /></button></header><div className="history-wrap">{grouped.length === 0 && <div className="empty-card">{t(locale, 'noRecordedSleep')}</div>}{grouped.map(([date, items], index) => <div className="history-group" key={date}><h3>{index === 0 ? `${t(locale, 'today')} – ${date}` : index === 1 ? `${t(locale, 'yesterday')} – ${date}` : date}</h3><div className="sleep-list history-list">{items.map((session) => <SwipeHistoryRow key={session.id} session={session} now={Date.now()} locale={locale} onEdit={() => onEdit(session)} onDelete={() => onDelete(session.id)} />)}</div></div>)}</div></section>
}

function dateKeyAt(time: number) {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dateKeyTime(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
}

function statsForDate(sessions: SleepSession[], dateKey: string, now: number) {
  const startOfDay = dateKeyTime(dateKey)
  const date = new Date(startOfDay)
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  let total = 0, day = 0, night = 0
  sessions.forEach((session) => {
    const overlapStart = Math.max(new Date(session.startTime).getTime(), startOfDay)
    const overlapEnd = Math.min(session.endTime ? new Date(session.endTime).getTime() : now, endOfDay)
    if (overlapEnd <= overlapStart) return
    const clipped: SleepSession = { ...session, startTime: new Date(overlapStart).toISOString(), endTime: new Date(overlapEnd).toISOString() }
    const parts = splitDayNight(clipped, now)
    total += overlapEnd - overlapStart
    day += parts.day
    night += parts.night
  })
  return { total, day, night }
}

function StatsPage({ sessions, now, locale, childName }: { sessions: SleepSession[]; now: number; locale: Locale; childName: string }) {
  const availableStart = sessions.length > 0 ? dateKeyAt(Math.min(...sessions.map((session) => new Date(session.startTime).getTime()))) : dateKeyAt(now)
  const availableEnd = dateKeyAt(now)
  const [range, setRange] = useState<'day' | 'week' | 'month' | 'custom'>('week')
  const [insightsRange, setInsightsRange] = useState<7 | 14 | 30>(14)
  const [developmentRange, setDevelopmentRange] = useState<3 | 6 | 12 | 'custom'>(12)
  const [customStart, setCustomStart] = useState(availableStart)
  const [customEnd, setCustomEnd] = useState(availableEnd)
  const [developmentStart, setDevelopmentStart] = useState(availableStart.slice(0, 7))
  const [developmentEnd, setDevelopmentEnd] = useState(availableEnd.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const customStartTime = dateKeyTime(customStart)
  const customEndTime = dateKeyTime(customEnd)
  const customDays = Math.max(1, Math.round((customEndTime - customStartTime) / 86400000) + 1)
  const days = range === 'day' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : customDays
  const developmentMonthOptions = useMemo(() => {
    const [startYear, startMonth] = availableStart.slice(0, 7).split('-').map(Number)
    const [endYear, endMonth] = availableEnd.slice(0, 7).split('-').map(Number)
    const cursor = new Date(startYear, startMonth - 1, 1)
    const limit = new Date(endYear, endMonth - 1, 1)
    const result: Array<{ value: string; label: string }> = []
    while (cursor <= limit) {
      result.push({ value: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`, label: new Intl.DateTimeFormat(localeTag(locale), { year: 'numeric', month: 'long' }).format(cursor) })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return result
  }, [availableStart, availableEnd, locale])

  const chart = useMemo(() => Array.from({ length: days }, (_, index) => {
    const date = range === 'custom' ? new Date(customStartTime) : new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + (range === 'custom' ? index : -(days - 1 - index)))
    const dateKey = dateKeyAt(date.getTime())
    const stats = statsForDate(sessions, dateKey, now)
    return { dateKey, label: new Intl.DateTimeFormat(localeTag(locale), days > 31 ? { month: 'short', day: 'numeric' } : { day: 'numeric' }).format(date), hours: +(stats.total / 3600000).toFixed(2), ...stats }
  }), [sessions, now, days, range, customStartTime, locale])

  const sums = chart.reduce((acc, item) => ({ total: acc.total + item.total, day: acc.day + item.day, night: acc.night + item.night }), { total: 0, day: 0, night: 0 })
  const divisor = Math.max(1, chart.length)

  const selectedStats = useMemo(() => {
    if (!selectedDate) return null
    const [year, month, day] = selectedDate.split('-').map(Number)
    const values = statsForDate(sessions, selectedDate, now)
    const date = new Date(year, month - 1, day)
    return { ...values, label: new Intl.DateTimeFormat(localeTag(locale), { month: 'short', day: 'numeric' }).format(date) }
  }, [sessions, now, selectedDate, locale])

  const changeRange = (next: 'day' | 'week' | 'month' | 'custom') => { setRange(next); setSelectedDate(null) }
  const display = selectedStats ?? { total: sums.total / divisor, day: sums.day / divisor, night: sums.night / divisor, label: t(locale, 'average') }
  const timelineDate = selectedDate ?? (range === 'custom' ? customEnd : undefined)
  const chartUnit = locale === 'hu' ? 'ó' : locale === 'de' ? 'Std.' : 'hr'
  const insights = useMemo(() => buildInsightsFoundation(sessions, now, { lookbackDays: insightsRange }), [sessions, now, insightsRange])
  const similarDays = useMemo(() => buildSimilarDaysInsight(sessions, now, insightsRange), [sessions, now, insightsRange])
  const prediction = useMemo(() => buildPredictionLite(sessions, now, insightsRange), [sessions, now, insightsRange])
  const development = useMemo(() => buildSleepDevelopment(sessions, now, developmentRange === 'custom' ? 12 : developmentRange, developmentRange === 'custom' ? { startMonth: developmentStart, endMonth: developmentEnd } : undefined), [sessions, now, developmentRange, developmentStart, developmentEnd])
  const sleepChange = useMemo(() => buildSleepChangeInsight(sessions, now), [sessions, now])
  const monthlyReport = useMemo(() => buildMonthlyFamilyReport(sessions, now), [sessions, now])
  const developmentChart = useMemo(() => development.months.map((item) => ({
    key: item.key,
    label: new Intl.DateTimeFormat(localeTag(locale), { month: 'short' }).format(new Date(item.year, item.month, 1)),
    day: +(item.averageDayMs / 3600000).toFixed(2),
    night: +(item.averageNightMs / 3600000).toFixed(2)
  })), [development.months, locale])
  const wakeWindow = insights.wakeWindow
  const routine = insights.routine
  const relevantWakeWindow = prediction.bucket ? wakeWindow.breakdown.find((item) => item.key === prediction.bucket) ?? null : null
  const primaryWakeMs = relevantWakeWindow?.typicalMs ?? wakeWindow.typicalMs
  const primaryWakeRange = relevantWakeWindow ? { lowMs: relevantWakeWindow.lowMs, highMs: relevantWakeWindow.highMs } : wakeWindow.typicalRange
  const primaryWakeLabel = relevantWakeWindow ? wakeBucketLabel(locale, relevantWakeWindow.key) : t(locale, 'typicalWakeWindow')

  return <section className="screen stats-screen"><header className="page-header centered-header"><h1>{t(locale, 'statistics')}</h1></header>
    <div className="segmented four-options"><button className={range === 'day' ? 'active' : ''} onClick={() => changeRange('day')}>{t(locale, 'day')}</button><button className={range === 'week' ? 'active' : ''} onClick={() => changeRange('week')}>{t(locale, 'week')}</button><button className={range === 'month' ? 'active' : ''} onClick={() => changeRange('month')}>{t(locale, 'month')}</button><button className={range === 'custom' ? 'active' : ''} onClick={() => changeRange('custom')}>{t(locale, 'customRange')}</button></div>
    {range === 'custom' && <div className="custom-range-picker"><label>{t(locale, 'fromDate')}<input type="date" min={availableStart} max={customEnd} value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>{t(locale, 'toDate')}<input type="date" min={customStart} max={availableEnd} value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div>}
    <div className="chart-card compact-chart-card"><h2>{t(locale, 'sleepDuration')}</h2><div className="bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 8, right: 2, bottom: 0, left: -26 }}><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis domain={[0, 14]} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: '#0d1a2b', border: '1px solid #1c3352', borderRadius: 10 }} formatter={(value) => [`${value} ${chartUnit}`, t(locale, 'sleep')]} /><Bar dataKey="hours" fill="#579dff" radius={[4, 4, 1, 1]} maxBarSize={17} onClick={(entry: any) => setSelectedDate(entry?.payload?.dateKey ?? null)} /></BarChart></ResponsiveContainer></div></div>
    <h2 className="overview-title">{t(locale, 'overview24h')}</h2>
    <div className="overview-compact"><SleepTimeline sessions={sessions} now={now} day={timelineDate} locale={locale} /><div className="stats-row"><StatCard label={display.label} value={formatDuration(display.total, locale)} suffix={selectedStats ? undefined : t(locale, 'perDay')} /><StatCard label={t(locale, 'daytime')} value={formatDuration(display.day, locale)} icon="sun" /><StatCard label={t(locale, 'nighttime')} value={formatDuration(display.night, locale)} icon="moon" /></div></div>
    <div className="insights-card wake-card"><div className="insights-card-head"><div><span>{t(locale, 'insights')}</span><h2>{t(locale, 'wakeWindow')}</h2></div>{wakeWindow.confidence && <b>{t(locale, wakeWindow.confidence === 'medium' ? 'mediumConfidence' : 'lowConfidence')}</b>}</div>
      <div className="insights-range" aria-label={t(locale, 'insightsRange')}>{([7, 14, 30] as const).map((value) => <button key={value} className={insightsRange === value ? 'active' : ''} onClick={() => setInsightsRange(value)}>{value} {t(locale, 'daysShort')}</button>)}</div>
      {primaryWakeMs !== null ? <div className="wake-window-hero"><span>{primaryWakeLabel}</span><strong>{formatDuration(primaryWakeMs, locale)}</strong>{primaryWakeRange && <small>{t(locale, 'typicalRange')}: {formatDuration(primaryWakeRange.lowMs, locale)}–{formatDuration(primaryWakeRange.highMs, locale)} · {t(locale, 'sampleCountShort', { count: relevantWakeWindow?.sampleCount ?? wakeWindow.sampleCount })}</small>}</div> : <p>{t(locale, 'wakeWindowCollecting', { count: wakeWindow.sampleCount })}</p>}
      {wakeWindow.currentMs !== null ? <div className="current-awake-status"><span>{t(locale, 'awakeForNow')}</span><strong>{formatDuration(wakeWindow.currentMs, locale)}</strong></div> : <p>{t(locale, 'wakeWindowUnavailable')}</p>}
      {wakeWindow.breakdown.length > 0 && <div className="wake-breakdown"><strong>{t(locale, 'bySleepOrder')}</strong>{wakeWindow.breakdown.map((item) => <div key={item.key} className={item.key === relevantWakeWindow?.key ? 'relevant' : ''}><span>{wakeBucketLabel(locale, item.key)}</span><b>{formatDuration(item.typicalMs, locale)}</b><small>{t(locale, 'sampleCountShort', { count: item.sampleCount })}</small></div>)}</div>}
      <small>{wakeWindow.status === 'ready' ? t(locale, 'wakeWindowBasis', { count: wakeWindow.sampleCount }) : t(locale, 'wakeWindowCollecting', { count: wakeWindow.sampleCount })}</small>
      {insights.quality.excludedSessionCount > 0 && <small className="insights-quality-note">{t(locale, 'insightsExcluded', { count: insights.quality.excludedSessionCount })}</small>}
    </div>
    <div className="insights-card routine-card"><div className="insights-card-head"><div><span>{t(locale, 'insights')}</span><h2>{t(locale, 'routinePatterns')}</h2></div>{routine.status === 'ready' && <b>{t(locale, 'observedDays', { count: routine.observedDayCount })}</b>}</div>
      {routine.status === 'collecting' && <p className="routine-empty">{t(locale, 'routineCollecting')}</p>}
      {routine.bedtime && <RoutineRow label={t(locale, 'typicalBedtime')} value={formatClockMinutes(routine.bedtime.typicalMinutes, locale)} detail={t(locale, 'routineConsistency', { consistent: routine.bedtime.consistentCount, count: routine.bedtime.sampleCount })} />}
      {routine.wakeTime && <RoutineRow label={t(locale, 'typicalWakeTime')} value={formatClockMinutes(routine.wakeTime.typicalMinutes, locale)} detail={t(locale, 'routineConsistency', { consistent: routine.wakeTime.consistentCount, count: routine.wakeTime.sampleCount })} />}
      {routine.daytimeSleepCount && <RoutineRow label={t(locale, 'typicalNapCount')} value={formatCount(routine.daytimeSleepCount.typicalCount, locale)} detail={t(locale, 'napCountRange', { low: formatCount(routine.daytimeSleepCount.lowCount, locale), high: formatCount(routine.daytimeSleepCount.highCount, locale) })} />}
      {routine.status === 'ready' && <small>{t(locale, 'routineOwnData')}</small>}
    </div>
    <div className="insights-card development-card"><div className="insights-card-head"><div><span>{t(locale, 'insights')}</span><h2>{t(locale, 'sleepDevelopment')}</h2></div><b>{t(locale, 'familyPlus')}</b></div>
      <div className="insights-range four-options" aria-label={t(locale, 'developmentRange')}>{([3, 6, 12] as const).map((value) => <button key={value} className={developmentRange === value ? 'active' : ''} onClick={() => setDevelopmentRange(value)}>{value} {t(locale, 'monthsShort')}</button>)}<button className={developmentRange === 'custom' ? 'active' : ''} onClick={() => setDevelopmentRange('custom')}>{t(locale, 'customRange')}</button></div>
      {developmentRange === 'custom' && <div className="custom-range-picker compact development-range-picker"><label>{t(locale, 'fromDate')}<select value={developmentStart} onChange={(event) => setDevelopmentStart(event.target.value)}>{developmentMonthOptions.filter((month) => month.value <= developmentEnd).map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</select></label><label>{t(locale, 'toDate')}<select value={developmentEnd} onChange={(event) => setDevelopmentEnd(event.target.value)}>{developmentMonthOptions.filter((month) => month.value >= developmentStart).map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</select></label><small>{t(locale, 'selectedDevelopmentRange', { start: developmentMonthOptions.find((month) => month.value === developmentStart)?.label ?? developmentStart, end: developmentMonthOptions.find((month) => month.value === developmentEnd)?.label ?? developmentEnd })}</small></div>}
      {development.status === 'collecting' ? <p className="routine-empty">{t(locale, 'developmentCollecting')}</p> : <>
        <div className="development-chart" aria-label={t(locale, 'developmentChart')}><ResponsiveContainer width="100%" height="100%"><BarChart data={developmentChart} margin={{ top: 8, right: 0, bottom: 0, left: -30 }}><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: '#0d1a2b', border: '1px solid #1c3352', borderRadius: 10 }} formatter={(value, name) => [`${value} ${chartUnit}`, t(locale, name === 'day' ? 'daytime' : 'nighttime')]} /><Bar dataKey="night" stackId="sleep" fill="#3978bc" radius={[0, 0, 2, 2]} maxBarSize={24} /><Bar dataKey="day" stackId="sleep" fill="#73b9f6" radius={[4, 4, 0, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div>
        {development.first && development.latest && <div className="then-now"><strong>{t(locale, 'thenNow')}</strong><div className="then-now-grid"><DevelopmentPoint label={t(locale, 'then')} month={development.first} locale={locale} /><DevelopmentPoint label={t(locale, 'nowPeriod')} month={development.latest} locale={locale} /></div></div>}
        {development.milestones.length > 0 && <div className="development-milestones">{development.milestones.slice(0, 3).map((milestone) => <span key={milestone.kind}>{developmentMilestoneLabel(locale, milestone)}</span>)}</div>}
      </>}
      <small>{t(locale, 'developmentOwnData')}</small>
    </div>
    <div className="insights-card change-card"><div className="insights-card-head"><div><span>{t(locale, 'insights')}</span><h2>{t(locale, 'sleepChangePlain')}</h2></div><b>{t(locale, sleepChange.status === 'changed' ? 'changeDetectedPlain' : sleepChange.status === 'stable' ? 'stablePatternPlain' : 'familyPlus')}</b></div>
      {sleepChange.status === 'collecting' && <p className="routine-empty">{t(locale, 'changeCollectingPlain', { recent: sleepChange.recentSampleCount, baseline: sleepChange.baselineSampleCount })}</p>}
      {sleepChange.status === 'stable' && <div className="change-stable"><strong>{t(locale, 'stablePatternPlain')}</strong><span>{t(locale, 'changeStablePlain', { name: childName })}</span></div>}
      {sleepChange.status === 'changed' && <><p className="change-intro">{t(locale, 'changeIntro', { name: childName })}</p><div className="change-signals">{sleepChange.signals.slice(0, 3).map((signal) => <ChangeSignal key={signal.metric} signal={signal} locale={locale} />)}</div></>}
      <small>{t(locale, 'changeOwnDataPlain')}</small>
    </div>
    <div className="insights-card monthly-report-card"><div className="insights-card-head"><div><span>{t(locale, 'monthlyReportEyebrow')}</span><h2>{t(locale, 'monthlyReport')}</h2></div><b>{t(locale, 'familyPlus')}</b></div>
      {monthlyReport.status === 'collecting' || !monthlyReport.month ? <p className="routine-empty">{t(locale, 'monthlyReportCollecting')}</p> : <>
        <div className="monthly-report-hero"><span>{formatReportMonth(monthlyReport.month, locale)}</span><strong>{formatDuration(monthlyReport.month.averageTotalMs, locale)}</strong><small>{t(locale, 'monthlyDailyAverage')} · {t(locale, 'recordedDays', { count: monthlyReport.month.recordedDays })}</small></div>
        <div className="monthly-kpis"><div><span>{t(locale, 'daytime')}</span><strong>{formatDuration(monthlyReport.month.averageDayMs, locale)}</strong></div><div><span>{t(locale, 'nighttime')}</span><strong>{formatDuration(monthlyReport.month.averageNightMs, locale)}</strong></div><div><span>{t(locale, 'longestBlock')}</span><strong>{formatDuration(monthlyReport.month.averageLongestBlockMs, locale)}</strong></div></div>
        <small className="monthly-baseline">{t(locale, 'monthlyComparedTo', { count: monthlyReport.baselineMonthCount })}</small>
        {monthlyReport.trends.length === 0 ? <div className="monthly-stable"><strong>{t(locale, 'monthlyStableTitle')}</strong><span>{t(locale, 'monthlyStable')}</span></div> : <div className="monthly-trends"><strong>{t(locale, 'monthlyTrends')}</strong>{monthlyReport.trends.slice(0, 3).map((trend) => <MonthlyTrend key={trend.metric} trend={trend} locale={locale} />)}</div>}
        {monthlyReport.milestones.length > 0 && <div className="monthly-milestones"><strong>{t(locale, 'monthlyMilestones')}</strong>{monthlyReport.milestones.map((milestone) => <span key={milestone.kind}>{monthlyMilestoneLabel(locale, milestone)}</span>)}</div>}
      </>}
      <small>{t(locale, 'monthlyOwnData')}</small>
    </div>
    <div className="insights-card similar-days-card"><div className="insights-card-head"><div><span>{t(locale, 'insights')}</span><h2>{t(locale, 'similarDays')}</h2></div>{similarDays.status === 'ready' && <b>{t(locale, 'closestDays')}</b>}</div>
      {similarDays.status === 'unavailable' && <p className="routine-empty">{t(locale, 'similarDaysUnavailablePlain', { name: childName })}</p>}
      {similarDays.status === 'collecting' && <p className="routine-empty">{t(locale, 'similarDaysCollectingPlain', { count: similarDays.candidateCount })}</p>}
      {similarDays.matches.map((match) => <div className="similar-day-row" key={match.dateKey}><div><strong>{formatDateKey(match.dateKey, locale)}</strong><small>{t(locale, 'similarDayEvidence', { naps: match.snapshot.daytimeSleepCount, sleep: formatDuration(match.snapshot.totalSleepMs, locale), awake: formatDuration(match.snapshot.awakeMs ?? 0, locale) })}</small></div>{match.nextSleep ? <span>{t(locale, 'thenSleptAt')} <b>{formatTime(match.nextSleep.startTime, locale)}</b></span> : <span>{t(locale, 'noLaterSleep')}</span>}</div>)}
      {similarDays.status === 'ready' && <small>{t(locale, 'similarDaysExplanationPlain', { name: childName })}</small>}
    </div>
    <div className="insights-card prediction-card"><div className="insights-card-head"><div><span>{t(locale, 'insights')}</span><h2>{t(locale, 'nextSleepEstimate')}</h2></div>{prediction.confidence && <b>{t(locale, prediction.confidence === 'medium' ? 'mediumConfidence' : 'lowConfidence')}</b>}</div>
      {prediction.status === 'unavailable' && <p className="routine-empty">{t(locale, 'predictionUnavailable')}</p>}
      {prediction.status === 'collecting' && <p className="routine-empty">{t(locale, 'predictionCollecting', { count: prediction.sampleCount })}</p>}
      {prediction.status === 'ready' && prediction.windowStart !== null && prediction.windowEnd !== null && <><strong className="prediction-window">{formatTime(new Date(prediction.windowStart).toISOString(), locale)}–{formatTime(new Date(prediction.windowEnd).toISOString(), locale)}</strong><p className={`prediction-state ${prediction.windowState}`}>{t(locale, prediction.windowState === 'upcoming' ? 'predictionUpcoming' : prediction.windowState === 'likely-now' ? 'predictionLikelyNow' : 'predictionPassed')}</p><small>{t(locale, 'predictionBasis', { count: prediction.sampleCount, order: t(locale, prediction.bucket === 'day-1' ? 'firstNap' : prediction.bucket === 'day-2' ? 'secondNap' : prediction.bucket === 'day-3-plus' ? 'laterNap' : 'nightSleep') })}</small><small className="prediction-disclaimer">{t(locale, 'predictionDisclaimer')}</small></>}
    </div>
  </section>
}

function formatDateKey(value: string, locale: Locale) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(localeTag(locale), { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(year, month - 1, day))
}

function wakeBucketLabel(locale: Locale, key: 'day-1' | 'day-2' | 'day-3-plus' | 'night') {
  return t(locale, key === 'day-1' ? 'firstNapWindow' : key === 'day-2' ? 'secondNapWindow' : key === 'day-3-plus' ? 'laterNapWindow' : 'nightSleepWindow')
}

function RoutineRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="routine-row"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function DevelopmentPoint({ label, month, locale }: { label: string; month: import('./sleepDevelopment').SleepDevelopmentMonth; locale: Locale }) {
  const monthLabel = new Intl.DateTimeFormat(localeTag(locale), { year: 'numeric', month: 'short' }).format(new Date(month.year, month.month, 1))
  return <div><span>{label} · {monthLabel}</span><strong>{formatDuration(month.averageTotalMs, locale)}</strong><small>{t(locale, 'longestBlock')}: {formatDuration(month.averageLongestBlockMs, locale)} · {t(locale, 'recordedDays', { count: month.recordedDays })}</small></div>
}

function developmentMilestoneLabel(locale: Locale, milestone: SleepDevelopmentMilestone) {
  if (milestone.kind === 'episodes-fewer') return t(locale, 'milestoneEpisodesFewer', { count: formatCount(Math.abs(milestone.delta), locale) })
  const duration = formatDuration(Math.abs(milestone.delta), locale)
  return t(locale, milestone.kind === 'night-longer' ? 'milestoneNightLonger' : milestone.kind === 'longest-longer' ? 'milestoneLongestLonger' : 'milestoneDayShorter', { duration })
}

function ChangeSignal({ signal, locale }: { signal: SleepChangeSignal; locale: Locale }) {
  const value = signal.metric === 'episodes' ? formatCount(Math.abs(signal.delta), locale) : formatDuration(Math.abs(signal.delta), locale)
  const baseline = signal.metric === 'episodes' ? formatCount(signal.baselineValue, locale) : formatDuration(signal.baselineValue, locale)
  const recent = signal.metric === 'episodes' ? formatCount(signal.recentValue, locale) : formatDuration(signal.recentValue, locale)
  const title = signal.metric === 'episodes'
    ? t(locale, signal.direction === 'higher' ? 'changeEpisodesMore' : 'changeEpisodesLess')
    : t(locale, signal.direction === 'higher' ? 'changeMetricMorePlain' : 'changeMetricLessPlain', { metric: changeMetricLabel(locale, signal.metric).toLocaleLowerCase(localeTag(locale)) })
  const explanation = signal.metric === 'episodes'
    ? t(locale, 'changeEpisodesExplanation', { count: signal.matchingRecentDays, baseline, recent })
    : t(locale, 'changeDurationExplanation', { count: signal.matchingRecentDays, baseline, recent, difference: value })
  return <div className={`change-signal ${signal.severity}`}><div><span>{title}</span><b>{t(locale, 'changeDaysBadge', { count: signal.matchingRecentDays })}</b></div><p>{explanation}</p><small>{t(locale, 'changeNotWarning')}</small></div>
}

function changeMetricLabel(locale: Locale, metric: SleepChangeMetric) {
  return t(locale, metric === 'total' ? 'changeMetricTotal' : metric === 'day' ? 'changeMetricDay' : metric === 'night' ? 'changeMetricNight' : metric === 'longest' ? 'changeMetricLongest' : 'changeMetricEpisodes')
}

function formatReportMonth(month: import('./monthlyReport').MonthlyReportMonth, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), { year: 'numeric', month: 'long' }).format(new Date(month.year, month.month, 1))
}

function monthlyMetricLabel(locale: Locale, metric: MonthlyReportMetric) {
  return changeMetricLabel(locale, metric)
}

function MonthlyTrend({ trend, locale }: { trend: MonthlyReportTrend; locale: Locale }) {
  const delta = trend.metric === 'episodes' ? formatCount(Math.abs(trend.delta), locale) : formatDuration(Math.abs(trend.delta), locale)
  const current = trend.metric === 'episodes' ? formatCount(trend.currentValue, locale) : formatDuration(trend.currentValue, locale)
  return <div className="monthly-trend"><div><span>{monthlyMetricLabel(locale, trend.metric)}</span><strong>{trend.direction === 'higher' ? '↑' : '↓'} {delta}</strong></div><small>{t(locale, 'monthlyTrendCurrent', { value: current })}</small></div>
}

function monthlyMilestoneLabel(locale: Locale, milestone: MonthlyReportMilestone) {
  if (milestone.kind === 'episodes-low') return t(locale, 'monthlyMilestoneEpisodes', { value: formatCount(milestone.value, locale) })
  return t(locale, milestone.kind === 'night-high' ? 'monthlyMilestoneNight' : 'monthlyMilestoneLongest', { value: formatDuration(milestone.value, locale) })
}

function formatClockMinutes(minutes: number, locale: Locale) {
  const date = new Date(2020, 0, 1, Math.floor(minutes / 60), minutes % 60)
  return new Intl.DateTimeFormat(localeTag(locale), { hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(value)
}

function StatCard({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon?: 'moon' | 'sun' }) {
  return <div className="stat-card"><div><span>{label}</span><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>{icon && <b><Icon name={icon} size={15} /></b>}</div>
}

function SettingsPage({ data, setData, onBack }: { data: AppData; setData: (data: AppData) => void; onBack: () => void }) {
  const locale = data.settings.locale
  const [editingChild, setEditingChild] = useState<ChildProfile | 'new' | null>(null)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const changeLocale = (event: ChangeEvent<HTMLSelectElement>) => setData({ ...data, settings: { ...data.settings, locale: event.target.value as Locale } })
  const applyImport = (inspection: ImportInspection) => {
    const next = inspection.data
    const diagnosticText = inspection.diagnostics.map((diagnostic) => `• ${importDiagnosticText(locale, diagnostic)}`).join('\n')
    const summary = t(locale, 'importFound', { count: next.sessions.length, children: next.children.length })
    if (!window.confirm(diagnosticText ? `${summary}\n\n${diagnosticText}\n\n${t(locale, 'importReplaceQuestion')}` : `${summary}\n\n${t(locale, 'importReplaceQuestion')}`)) return
    exportData(data)
    setData({ ...next, settings: { ...next.settings, locale } })
  }
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      applyImport(await importData(file, locale))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t(locale, 'importError'))
    } finally {
      event.target.value = ''
    }
  }
  const loadDemoData = async () => {
    setLoadingDemo(true)
    try {
      const module = await import('../test-data/solemi-demo-v4-2026-08-26.json')
      applyImport(inspectBackup(module.default))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t(locale, 'importError'))
    } finally {
      setLoadingDemo(false)
    }
  }
  const clear = () => {
    if (!window.confirm(t(locale, 'clearConfirm'))) return
    setData({ ...data, sessions: [] })
  }
  return <><section className="screen settings-screen"><header className="page-header"><button className="back-button" onClick={onBack}>‹</button><h1>{t(locale, 'settings')}</h1><span className="header-spacer" /></header>
    <div className="settings-card settings-fields">
      <label>{t(locale, 'language')}<select className="language-select" value={locale} onChange={changeLocale}>{languageOptions.map((language) => <option key={language.value} value={language.value}>{language.flag} {language.label}</option>)}</select></label>
      <label className="settings-toggle-row"><span><strong>{t(locale, 'longSleepReminder')}</strong><small>{t(locale, 'longSleepReminderHint')}</small></span><input type="checkbox" checked={data.settings.longSleepReminderEnabled} onChange={(event) => setData({ ...data, settings: { ...data.settings, longSleepReminderEnabled: event.target.checked } })} /></label>
    </div>
    <div className="settings-section-head"><div><h2>{t(locale, 'children')}</h2><p>{t(locale, 'childrenHint')}</p></div><button className="mini-add-button" onClick={() => setEditingChild('new')}><Icon name="plus" size={17} />{t(locale, 'addChild')}</button></div>
    <div className="settings-card child-list">{data.children.map((child) => {
      const count = data.sessions.filter((session) => session.childId === child.id).length
      const active = child.id === data.settings.activeChildId
      return <button key={child.id} className={`child-list-row ${active ? 'active' : ''}`} onClick={() => setData({ ...data, settings: { ...data.settings, activeChildId: child.id } })}><ChildAvatar child={child} className="child-list-avatar" /><span><strong>{child.name || t(locale, 'unnamedChild')}</strong><small>{child.birthDate || t(locale, 'birthDateMissing')} · {t(locale, 'sleepEntries', { count })}</small></span>{active && <b>{t(locale, 'active')}</b>}<span className="child-edit-button" role="button" tabIndex={0} aria-label={t(locale, 'editChild')} onClick={(event) => { event.stopPropagation(); setEditingChild(child) }}><Icon name="edit" size={15} /></span></button>
    })}</div>
    <div className="settings-card action-stack"><button onClick={() => exportData(data)}>{t(locale, 'exportData')}</button><label className="file-button">{t(locale, 'importData')}<input type="file" accept="application/json" onChange={handleImport} /></label>{import.meta.env.VITE_INTERNAL_PREVIEW === 'true' && <button className="internal-demo-button" onClick={loadDemoData} disabled={loadingDemo}>{loadingDemo ? t(locale, 'loadingDemoData') : t(locale, 'loadDemoData')}</button>}<button className="danger" onClick={clear}>{t(locale, 'clearAll')}</button></div><p className="muted">{t(locale, 'localOnly')}</p></section>
    {editingChild && <ChildEditor child={editingChild === 'new' ? null : editingChild as ChildProfile} locale={locale} onClose={() => setEditingChild(null)} onSave={(next) => {
      if (editingChild === 'new') setData({ ...data, children: [...data.children, next], settings: { ...data.settings, activeChildId: next.id } })
      else setData({ ...data, children: data.children.map((child) => child.id === next.id ? next : child) })
      setEditingChild(null)
    }} onDelete={editingChild === 'new' ? undefined : () => {
      const child = editingChild as ChildProfile
      if (data.children.length <= 1) return window.alert(t(locale, 'deleteLastChild'))
      const count = data.sessions.filter((session) => session.childId === child.id).length
      if (!window.confirm(t(locale, 'deleteChildConfirm', { name: child.name || t(locale, 'unnamedChild'), count }))) return
      const next = removeChildProfile(data, child.id)
      if (!next) return
      if (child.photoRef) void deleteChildPhoto(child.photoRef).catch(() => {})
      setData(next)
      setEditingChild(null)
    }} />}</>
}

function importDiagnosticText(locale: Locale, diagnostic: ImportDiagnostic) {
  const keys = {
    'migrated-v3': 'importMigratedV3',
    'active-child-reset': 'importActiveChildReset',
    'identical-children-removed': 'importDuplicateChildrenRemoved',
    'identical-sessions-removed': 'importDuplicateSessionsRemoved',
    'local-photos-not-included': 'importPhotosLocal'
  } as const
  return t(locale, keys[diagnostic.kind], { count: diagnostic.count })
}

function ChildAvatar({ child, className, previewUrl }: { child: ChildProfile; className: string; previewUrl?: string | null }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(previewUrl ?? null)
  useEffect(() => {
    if (previewUrl !== undefined) { setPhotoUrl(previewUrl); return }
    let stopped = false
    let objectUrl: string | null = null
    if (!child.photoRef) { setPhotoUrl(null); return }
    void loadChildPhoto(child.photoRef).then((blob) => {
      if (!blob || stopped) return
      objectUrl = URL.createObjectURL(blob)
      setPhotoUrl(objectUrl)
    }).catch(() => setPhotoUrl(null))
    return () => { stopped = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [child.photoRef, previewUrl])
  return <span className={className}>{photoUrl ? <img src={photoUrl} alt="" /> : (child.name.trim()[0] || '•').toUpperCase()}</span>
}

type CropCandidate = {
  file: File
  url: string
  width: number
  height: number
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

function PhotoCropper({ candidate, locale, onCancel, onDone }: { candidate: CropCandidate; locale: Locale; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const viewportSize = Math.min(300, Math.max(240, window.innerWidth - 64))
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [processing, setProcessing] = useState(false)
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null)
  const baseScale = Math.max(viewportSize / candidate.width, viewportSize / candidate.height)
  const imageScale = baseScale * zoom
  const imageWidth = candidate.width * imageScale
  const imageHeight = candidate.height * imageScale
  const limitX = Math.max(0, (imageWidth - viewportSize) / 2)
  const limitY = Math.max(0, (imageHeight - viewportSize) / 2)
  const constrain = (x: number, y: number) => ({ x: clamp(x, -limitX, limitX), y: clamp(y, -limitY, limitY) })
  const changeZoom = (nextZoom: number) => {
    const nextScale = baseScale * nextZoom
    const nextLimitX = Math.max(0, (candidate.width * nextScale - viewportSize) / 2)
    const nextLimitY = Math.max(0, (candidate.height * nextScale - viewportSize) / 2)
    setZoom(nextZoom)
    setOffset((previous) => ({ x: clamp(previous.x, -nextLimitX, nextLimitX), y: clamp(previous.y, -nextLimitY, nextLimitY) }))
  }
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: offset.x, y: offset.y }
  }
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    setOffset(constrain(drag.current.x + event.clientX - drag.current.startX, drag.current.y + event.clientY - drag.current.startY))
  }
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }
  const confirm = async () => {
    setProcessing(true)
    try {
      const size = viewportSize / imageScale
      const crop: AvatarCrop = {
        x: (candidate.width - size) / 2 - offset.x / imageScale,
        y: (candidate.height - size) / 2 - offset.y / imageScale,
        size
      }
      onDone(await prepareChildPhoto(candidate.file, crop))
    } catch {
      setProcessing(false)
      window.alert(t(locale, 'photoSaveError'))
    }
  }

  return <div className="photo-crop-overlay"><div className="photo-crop-screen">
    <header className="photo-crop-header"><button type="button" onClick={onCancel} disabled={processing}><Icon name="close" size={20} /></button><h2>{t(locale, 'positionPhoto')}</h2><button type="button" className="crop-done" onClick={confirm} disabled={processing}>{processing ? t(locale, 'saving') : t(locale, 'done')}</button></header>
    <div className="photo-crop-body"><p>{t(locale, 'positionPhotoHint')}</p><div className="photo-crop-stage" style={{ width: viewportSize, height: viewportSize }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
      <img src={candidate.url} alt="" draggable={false} style={{ width: imageWidth, height: imageHeight, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }} />
      <span className="photo-crop-ring" />
    </div><label className="photo-zoom"><span>{t(locale, 'zoomPhoto')}</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} /></label></div>
  </div></div>
}

function ChildEditor({ child, locale, onClose, onSave, onDelete }: { child: ChildProfile | null; locale: Locale; onClose: () => void; onSave: (child: ChildProfile) => void; onDelete?: () => void }) {
  const draft = useRef(child ?? createChild()).current
  const [name, setName] = useState(child?.name ?? '')
  const [birthDate, setBirthDate] = useState(child?.birthDate ?? '')
  const [photoRef, setPhotoRef] = useState(child?.photoRef ?? null)
  const [photoFile, setPhotoFile] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null | undefined>(undefined)
  const [cropCandidate, setCropCandidate] = useState<CropCandidate | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) return window.alert(t(locale, 'photoInvalid'))
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => setCropCandidate({ file, url, width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => { URL.revokeObjectURL(url); window.alert(t(locale, 'photoInvalid')) }
    image.src = url
    event.target.value = ''
  }
  const submit = async () => {
    if (!name.trim()) return window.alert(t(locale, 'childNameRequired'))
    if (birthDate && new Date(`${birthDate}T00:00:00`).getTime() > Date.now()) return window.alert(t(locale, 'birthDateFuture'))
    setSaving(true)
    try {
      const storedPhotoRef = photoFile ? await saveChildPhoto(draft.id, photoFile) : photoRef
      onSave({ ...draft, name: name.trim(), birthDate: birthDate || null, photoRef: storedPhotoRef, updatedAt: new Date().toISOString() })
    } catch {
      setSaving(false)
      window.alert(t(locale, 'photoSaveError'))
    }
  }
  const previewChild = { ...draft, name, photoRef }
  return <div className="editor-overlay"><div className="editor-screen child-editor-screen"><header className="editor-header"><button onClick={onClose} disabled={saving}><Icon name="close" size={18} /></button><h1>{child ? t(locale, 'editChild') : t(locale, 'addChild')}</h1><span /></header><div className="editor-body child-editor-body"><div className="profile-preview"><ChildAvatar child={previewChild} className="profile-preview-avatar" previewUrl={previewUrl} /><strong>{name || t(locale, 'unnamedChild')}</strong><div className="photo-actions"><label className="photo-button">{photoRef || photoFile ? t(locale, 'changePhoto') : t(locale, 'addPhoto')}<input type="file" accept="image/*" onChange={choosePhoto} /></label>{(photoRef || photoFile) && <button type="button" onClick={() => { setPhotoFile(null); setPreviewUrl(null); setPhotoRef(null) }}>{t(locale, 'removePhoto')}</button>}</div><small>{t(locale, 'photoLocalHint')}</small></div><label>{t(locale, 'childName')}<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={t(locale, 'childNamePlaceholder')} /></label><label>{t(locale, 'birthDate')} <small>{t(locale, 'optional')}</small><input type="date" value={birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setBirthDate(event.target.value)} /></label>{birthDate && <p className="profile-info-note">{t(locale, 'birthDateAnalyticsHint')}</p>}</div><div className={`editor-actions centered-actions ${onDelete ? '' : 'single-action'}`}>{onDelete && <button className="delete-button" onClick={onDelete} disabled={saving}>{t(locale, 'deleteChild')}</button>}<button className="save-button" onClick={submit} disabled={saving}>{saving ? t(locale, 'saving') : t(locale, 'save')}</button></div></div>{cropCandidate && <PhotoCropper candidate={cropCandidate} locale={locale} onCancel={() => { URL.revokeObjectURL(cropCandidate.url); setCropCandidate(null) }} onDone={(blob) => { URL.revokeObjectURL(cropCandidate.url); setPhotoFile(blob); setPreviewUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob) }); setCropCandidate(null) }} />}</div>
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

function DateTimeWheel({ label, icon, value, locale, disabled, onChange }: { label: string; icon: 'moon' | 'sun'; value: string; locale: Locale; disabled?: boolean; onChange: (value: string) => void }) {
  const parts = toLocalParts(value)
  const dates = dateOptions(locale)
  const update = (dateValue = parts.date, hour = parts.hour, minute = parts.minute) => onChange(partsToIso(dateValue, hour, minute))
  const hours = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: pad(hour) }))
  const minutes = Array.from({ length: 60 }, (_, minute) => ({ value: String(minute), label: pad(minute) }))
  return <div className={`wheel-block ${disabled ? 'disabled' : ''}`}><div className="wheel-label"><Icon name={icon} size={16} /><span>{label}</span></div><div className="wheel-columns custom-wheel"><WheelColumn items={dates} value={parts.date} disabled={disabled} onChange={(next) => update(next)} /><WheelColumn items={hours} value={String(parts.hour)} disabled={disabled} onChange={(next) => update(parts.date, Number(next), parts.minute)} /><WheelColumn items={minutes} value={String(parts.minute)} disabled={disabled} onChange={(next) => update(parts.date, parts.hour, Number(next))} /><div className="wheel-focus" /></div></div>
}

function SleepEditor({ childId, session, locale, currentExists, onClose, onSave, onDelete }: { childId: string; session: SleepSession | null; locale: Locale; currentExists: boolean; onClose: () => void; onSave: (session: SleepSession) => void; onDelete: (id: string) => void }) {
  const [start, setStart] = useState(session?.startTime ?? new Date().toISOString())
  const [end, setEnd] = useState(session?.endTime ?? new Date().toISOString())
  const [stillSleeping, setStillSleeping] = useState(session ? !session.endTime : false)
  const [note, setNote] = useState(session?.note ?? '')
  const [dayNightOverride, setDayNightOverride] = useState<DayNightOverride>(session?.dayNightOverride ?? null)
  const submit = () => {
    const endIso = stillSleeping ? null : end
    if (new Date(start).getTime() > Date.now() + 60000 || (endIso && new Date(endIso).getTime() > Date.now() + 60000)) return window.alert(t(locale, 'futureNotAllowed'))
    if (endIso && new Date(endIso) <= new Date(start)) return window.alert(t(locale, 'wakeAfterSleep'))
    if (stillSleeping && currentExists && !session) return window.alert(t(locale, 'activeExists'))
    const nowIso = new Date().toISOString()
    onSave(session ? { ...session, startTime: start, endTime: endIso, note, dayNightOverride, updatedAt: nowIso } : { ...createSession(childId, start, endIso), note, dayNightOverride })
  }
  return <div className="editor-overlay"><div className="editor-screen"><header className="editor-header"><button onClick={onClose}><Icon name="close" size={18} /></button><h1>{session ? t(locale, 'details') : t(locale, 'recordSleep')}</h1><span /></header><div className="editor-body"><DateTimeWheel label={t(locale, 'fellAsleep')} icon="moon" value={start} locale={locale} onChange={setStart} /><label className={`toggle-row active-sleep-toggle ${stillSleeping ? 'active' : ''}`}><span className="toggle-label"><Icon name="moon" size={16} /> <span><strong>{t(locale, 'stillSleeping')}</strong><small>{t(locale, 'stillSleepingHint')}</small></span></span><input type="checkbox" checked={stillSleeping} onChange={(event) => setStillSleeping(event.target.checked)} /></label>{!stillSleeping && <DateTimeWheel label={t(locale, 'wokeUp')} icon="sun" value={end} locale={locale} onChange={setEnd} />}<div className="classification-block"><strong>{t(locale, 'sleepType')}</strong><div className="classification-options"><button className={dayNightOverride === null ? 'active' : ''} onClick={() => setDayNightOverride(null)}>{t(locale, 'automatic')}</button><button className={dayNightOverride === 'day' ? 'active' : ''} onClick={() => setDayNightOverride('day')}>{t(locale, 'daytime')}</button><button className={dayNightOverride === 'night' ? 'active' : ''} onClick={() => setDayNightOverride('night')}>{t(locale, 'nighttime')}</button></div><small>{t(locale, 'automaticRule', { dayStart: pad(DEFAULT_DAY_START_MINUTES / 60), nightStart: pad(DEFAULT_NIGHT_START_MINUTES / 60) })}</small></div><label className="note-field">{t(locale, 'note')}<textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder={t(locale, 'optionalNote')} /></label></div><div className="editor-actions centered-actions">{session && <button className="delete-button" onClick={() => onDelete(session.id)}>{t(locale, 'delete')}</button>}<button className="save-button" onClick={submit}>{t(locale, 'save')}</button></div></div></div>
}

function BottomNav({ page, locale, onChange }: { page: Page; locale: Locale; onChange: (page: Page) => void }) {
  const items: Array<[Page, 'home' | 'history' | 'stats', string]> = [['today', 'home', t(locale, 'sleeps')], ['history', 'history', t(locale, 'history')], ['stats', 'stats', t(locale, 'statistics')]]
  return <nav className="bottom-nav">{items.map(([key, icon, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => onChange(key)}><span><Icon name={icon} size={18} /></span><small>{label}</small></button>)}</nav>
}
