// V1 statistics use the viewing device's calendar, not an account/family zone.
export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// A rolling elapsed-time window is deliberately not N local calendar dates.
export function statisticsLookbackStart(now: number, days: number) {
  return now - days * 24 * 60 * 60 * 1000
}

// Count date labels, not elapsed 24-hour blocks (DST and date-line travel).
export function localCalendarDayDistance(start: number, end: number) {
  const ordinal = (time: number) => {
    const date = new Date(time)
    const utc = new Date(0)
    utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate())
    return utc.getTime() / 86400000
  }
  return ordinal(end) - ordinal(start)
}
