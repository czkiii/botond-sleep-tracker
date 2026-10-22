import { useEffect, useMemo, useState } from 'react'
import { deviceTimeZone } from './statisticsCalendar'

// Statistics show minutes. The stopwatch keeps its independent second clock.
// Read the real time on data changes too: rounding down could exclude a sleep
// which has just ended. Sleeping/hidden tabs refresh on return, not in a loop.
export function useStatisticsTime(data: unknown) {
  const [clock, setClock] = useState(() => ({ now: Date.now(), timeZone: deviceTimeZone() }))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      timer = setTimeout(refresh, 60000 - now % 60000)
    }
    const refresh = () => {
      if (document.visibilityState !== 'hidden') {
        const next = { now: Date.now(), timeZone: deviceTimeZone() }
        setClock(previous => previous.now === next.now && previous.timeZone === next.timeZone ? previous : next)
      }
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return useMemo(() => ({ now: Date.now(), timeZone: deviceTimeZone() }), [clock, data])
}
