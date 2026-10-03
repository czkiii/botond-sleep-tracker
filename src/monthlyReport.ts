import { buildSleepDaySummaries, summarizeSleepMonths } from './sleepDevelopment'
import type { SleepDaySummary, SleepDevelopmentMonth } from './sleepDevelopment'
import type { SleepSession } from './types'

const MIN_RECORDED_DAYS = 14

export type MonthlyReportMetric = 'total' | 'day' | 'night' | 'longest' | 'episodes'

export type MonthlyReportMonth = SleepDevelopmentMonth

export type MonthlyReportTrend = {
  metric: MonthlyReportMetric
  direction: 'higher' | 'lower'
  currentValue: number
  baselineValue: number
  delta: number
}

export type MonthlyReportMilestone = {
  kind: 'night-high' | 'longest-high' | 'episodes-low'
  value: number
  previousBest: number
}

export type MonthlyFamilyReport = {
  status: 'collecting' | 'ready'
  month: MonthlyReportMonth | null
  baselineMonthCount: number
  trends: MonthlyReportTrend[]
  milestones: MonthlyReportMilestone[]
}

const trendThresholds: Record<MonthlyReportMetric, number> = {
  total: 45 * 60 * 1000,
  day: 30 * 60 * 1000,
  night: 30 * 60 * 1000,
  longest: 45 * 60 * 1000,
  episodes: 0.5
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function metricValue(month: MonthlyReportMonth, metric: MonthlyReportMetric) {
  if (metric === 'total') return month.averageTotalMs
  if (metric === 'day') return month.averageDayMs
  if (metric === 'night') return month.averageNightMs
  if (metric === 'longest') return month.averageLongestBlockMs
  return month.averageEpisodeCount
}

export function buildMonthlyFamilyReport(sessions: SleepSession[], now = Date.now(), days = buildSleepDaySummaries(sessions, now)): MonthlyFamilyReport {
  const current = new Date(now)
  const currentMonthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
  const eligible = summarizeSleepMonths(days)
    .filter((month) => month.key < currentMonthKey && month.recordedDays >= MIN_RECORDED_DAYS)
  const month = eligible[eligible.length - 1] ?? null
  const earlier = month ? eligible.filter((candidate) => candidate.key < month.key) : []
  const baseline = earlier.slice(-3)
  if (!month || baseline.length === 0) return { status: 'collecting', month, baselineMonthCount: baseline.length, trends: [], milestones: [] }

  const metrics: MonthlyReportMetric[] = ['total', 'night', 'day', 'longest', 'episodes']
  const trends = metrics.flatMap((metric): MonthlyReportTrend[] => {
    const currentValue = metricValue(month, metric)
    const baselineValues = baseline.map((item) => metricValue(item, metric))
    if (currentValue === null || baselineValues.some(value => value === null)) return []
    const baselineValue = median(baselineValues as number[])
    const delta = currentValue - baselineValue
    return Math.abs(delta) >= trendThresholds[metric]
      ? [{ metric, direction: delta > 0 ? 'higher' : 'lower', currentValue, baselineValue, delta }]
      : []
  })

  const milestones: MonthlyReportMilestone[] = []
  if (earlier.length >= 2) {
    const previousNightHigh = Math.max(...earlier.map((item) => item.averageNightMs))
    const earlierLongest = earlier.map(item => item.averageLongestBlockMs).filter((value): value is number => value !== null)
    const previousLongestHigh = Math.max(...earlierLongest)
    const previousEpisodesLow = Math.min(...earlier.map((item) => item.averageEpisodeCount))
    if (month.averageNightMs >= previousNightHigh + 30 * 60 * 1000) milestones.push({ kind: 'night-high', value: month.averageNightMs, previousBest: previousNightHigh })
    if (earlierLongest.length >= 2 && month.averageLongestBlockMs !== null && month.averageLongestBlockMs >= previousLongestHigh + 30 * 60 * 1000) milestones.push({ kind: 'longest-high', value: month.averageLongestBlockMs, previousBest: previousLongestHigh })
    if (month.averageEpisodeCount <= previousEpisodesLow - 0.5) milestones.push({ kind: 'episodes-low', value: month.averageEpisodeCount, previousBest: previousEpisodesLow })
  }

  return { status: 'ready', month, baselineMonthCount: baseline.length, trends, milestones }
}

export const MONTHLY_REPORT_MIN_RECORDED_DAYS = MIN_RECORDED_DAYS
