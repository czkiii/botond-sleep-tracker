import { buildSleepDaySummaries } from './sleepDevelopment'
import type { SleepDaySummary } from './sleepDevelopment'
import type { SleepSession } from './types'

const HOUR_MS = 60 * 60 * 1000

export type SleepChangeMetric = 'total' | 'day' | 'night' | 'longest' | 'episodes'

export type SleepChangeSignal = {
  metric: SleepChangeMetric
  direction: 'higher' | 'lower'
  severity: 'notice' | 'strong'
  baselineValue: number
  recentValue: number
  delta: number
  matchingRecentDays: number
  threshold: number
}

export type SleepChangeInsight = {
  status: 'collecting' | 'stable' | 'changed'
  recentWindowDays: 5
  baselineWindowDays: 28
  recentSampleCount: number
  baselineSampleCount: number
  signals: SleepChangeSignal[]
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function dayTime(day: SleepDaySummary) {
  return new Date(day.year, day.month, day.day).getTime()
}

function metricValue(day: SleepDaySummary, metric: SleepChangeMetric) {
  if (metric === 'total') return day.totalMs
  if (metric === 'day') return day.dayMs
  if (metric === 'night') return day.nightMs
  if (metric === 'longest') return day.longestBlockMs
  return day.episodeCount
}

function thresholdFor(metric: SleepChangeMetric, baseline: number) {
  if (metric === 'episodes') return Math.max(1, baseline * 0.25)
  if (metric === 'total' || metric === 'longest') return Math.max(HOUR_MS, baseline * (metric === 'total' ? 0.12 : 0.18))
  return Math.max(45 * 60 * 1000, baseline * 0.15)
}

export function buildSleepChangeInsight(sessions: SleepSession[], now = Date.now()): SleepChangeInsight {
  const today = new Date(now)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const recentStartDate = new Date(todayStart); recentStartDate.setDate(recentStartDate.getDate() - 5)
  const baselineStartDate = new Date(recentStartDate); baselineStartDate.setDate(baselineStartDate.getDate() - 28)
  const recentStart = recentStartDate.getTime()
  const baselineStart = baselineStartDate.getTime()
  const days = buildSleepDaySummaries(sessions, now)
  const recentDays = days.filter((day) => dayTime(day) >= recentStart && dayTime(day) < todayStart)
  const baselineDays = days.filter((day) => dayTime(day) >= baselineStart && dayTime(day) < recentStart)

  if (recentDays.length < 4 || baselineDays.length < 14) {
    return { status: 'collecting', recentWindowDays: 5, baselineWindowDays: 28, recentSampleCount: recentDays.length, baselineSampleCount: baselineDays.length, signals: [] }
  }

  const metrics: SleepChangeMetric[] = ['total', 'night', 'day', 'longest', 'episodes']
  const rawSignals = metrics.flatMap((metric): SleepChangeSignal[] => {
    const baselineValue = median(baselineDays.map((day) => metricValue(day, metric)))
    const recentValue = median(recentDays.map((day) => metricValue(day, metric)))
    const delta = recentValue - baselineValue
    const threshold = thresholdFor(metric, baselineValue)
    if (Math.abs(delta) < threshold) return []
    const direction = delta > 0 ? 'higher' : 'lower'
    const persistenceThreshold = threshold * 0.6
    const matchingRecentDays = recentDays.filter((day) => {
      const deviation = metricValue(day, metric) - baselineValue
      return direction === 'higher' ? deviation >= persistenceThreshold : deviation <= -persistenceThreshold
    }).length
    if (matchingRecentDays < 3) return []
    return [{
      metric,
      direction,
      severity: Math.abs(delta) >= threshold * 1.5 && matchingRecentDays >= 4 ? 'strong' : 'notice',
      baselineValue,
      recentValue,
      delta,
      matchingRecentDays,
      threshold
    }]
  }).sort((left, right) => Math.abs(right.delta) / right.threshold - Math.abs(left.delta) / left.threshold)

  const signals = rawSignals.filter((signal) => {
    if (signal.metric === 'total') {
      const explainingComponent = rawSignals.find((candidate) => (candidate.metric === 'day' || candidate.metric === 'night') && candidate.direction === signal.direction && Math.abs(candidate.delta) >= Math.abs(signal.delta) * 0.65)
      if (explainingComponent) return false
    }
    if (signal.metric === 'longest') {
      const night = rawSignals.find((candidate) => candidate.metric === 'night' && candidate.direction === signal.direction)
      if (night && Math.abs(Math.abs(night.delta) - Math.abs(signal.delta)) < 30 * 60 * 1000) return false
    }
    return true
  })

  return {
    status: signals.length ? 'changed' : 'stable',
    recentWindowDays: 5,
    baselineWindowDays: 28,
    recentSampleCount: recentDays.length,
    baselineSampleCount: baselineDays.length,
    signals
  }
}
