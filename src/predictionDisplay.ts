import { localeTag, t, type Locale } from './i18n'
import type { PredictionLite } from './prediction'

export function predictionUnavailableText(prediction: PredictionLite, locale: Locale) {
  if (prediction.unavailableReason === 'stale-wake' && prediction.lastWakeTime !== null) {
    const time = new Intl.DateTimeFormat(localeTag(locale), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(prediction.lastWakeTime)
    return t(locale, 'predictionStaleWake', { time })
  }
  return t(locale, prediction.unavailableReason === 'sleeping' ? 'predictionSleeping' :
    prediction.unavailableReason === 'missing-wake' ? 'predictionMissingWake' : 'predictionInvalidData')
}

export function formatPredictionWindow(start: number, end: number, now: number, locale: Locale) {
  const dateKey = (value: number) => new Date(value).toDateString()
  const dated = dateKey(start) !== dateKey(now) || dateKey(end) !== dateKey(now)
  const dateOptions: Intl.DateTimeFormatOptions = dated ? {
    month: 'short', day: 'numeric',
    year: [start, end].some(value => new Date(value).getFullYear() !== new Date(now).getFullYear()) ? 'numeric' : undefined,
  } : {}
  const formatter = new Intl.DateTimeFormat(localeTag(locale), {
    ...dateOptions,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  return `${formatter.format(start)}–${formatter.format(end)}`
}
