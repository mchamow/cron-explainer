export interface TimeOptions {
  hour12: boolean
  utc: boolean
}

const cache = new Map<string, Intl.DateTimeFormat>()
function formatter(kind: 'day' | 'clock', { hour12, utc }: TimeOptions) {
  const key = `${kind}${hour12}${utc}`
  let f = cache.get(key)
  if (!f) {
    const timeZone = utc ? 'UTC' : undefined
    f =
      kind === 'day'
        ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone })
        : new Intl.DateTimeFormat('en-US', { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23', timeZone })
    cache.set(key, f)
  }
  return f
}

/** "Thu, Oct 29, 2026" */
export const formatDay = (d: Date, o: TimeOptions) => formatter('day', o).format(d)
/** "09:30" or "9:30 AM" */
export const formatClock = (d: Date, o: TimeOptions) => formatter('clock', o).format(d)

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

/** "in 5 minutes", "in 3 hours", "in 2 days", "in 4 months", "in 2 years" */
export function relative(d: Date, now: Date): string {
  const minutes = Math.round((d.getTime() - now.getTime()) / 60_000)
  if (minutes < 1) return 'in under a minute'
  if (minutes < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return rtf.format(hours, 'hour')
  const days = Math.round(minutes / 1440)
  if (days < 31) return rtf.format(days, 'day')
  const months = Math.round(days / 30.44)
  if (months < 12) return rtf.format(months, 'month')
  return rtf.format(Math.round(days / 365.25), 'year')
}

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'your time zone'
