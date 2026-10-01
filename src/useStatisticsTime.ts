import { useEffect, useMemo, useState } from 'react'

// Statistics show minutes. The stopwatch keeps its independent second clock.
// Read the real time on data changes too: rounding down could exclude a sleep
// which has just ended. Sleeping/hidden tabs refresh on return, not in a loop.
export function useStatisticsTime(data: unknown) {
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      timer = setTimeout(refresh, 60000 - now % 60000)
    }
    const refresh = () => {
      if (document.visibilityState !== 'hidden') setClock(Date.now())
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
  return useMemo(() => Date.now(), [clock, data])
}
