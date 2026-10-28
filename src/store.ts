/** What the app remembers between visits, and the expression's place in the URL. */
export interface Saved {
  expr: string
  hour12: boolean
  utc: boolean
  /** Valid expressions you've looked at, newest first. */
  recent: string[]
}

export const DEFAULT_EXPR = '30 9 * * 1-5'
export const RECENT_MAX = 8
export const STORAGE_KEY = 'cron-explainer'

export const defaults = (): Saved => ({ expr: DEFAULT_EXPR, hour12: false, utc: false, recent: [] })

export const tidy = (expr: string) => expr.trim().replace(/\s+/g, ' ')

export function addRecent(list: string[], expr: string): string[] {
  const e = tidy(expr)
  return [e, ...list.filter((x) => x !== e)].slice(0, RECENT_MAX)
}

export function save(s: Saved, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Storage blocked or full: nothing is remembered, everything still works.
  }
}

/** The saved state, field by field: anything missing or malformed takes its default. */
export function load(storage: Storage = localStorage): Saved {
  const d = defaults()
  let raw: unknown
  try {
    raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    raw = null
  }
  if (typeof raw !== 'object' || raw === null) return d
  const r = raw as Record<string, unknown>
  const recent = Array.isArray(r.recent) ? r.recent.filter((x): x is string => typeof x === 'string' && tidy(x) !== '') : []
  return {
    expr: typeof r.expr === 'string' && r.expr.length <= 200 ? r.expr : d.expr,
    hour12: typeof r.hour12 === 'boolean' ? r.hour12 : d.hour12,
    utc: typeof r.utc === 'boolean' ? r.utc : d.utc,
    recent: [...new Set(recent.map(tidy))].slice(0, RECENT_MAX),
  }
}

/** `30 9 * * 1-5` ⇄ `#30_9_*_*_1-5`: underscores read better in a link than %20. */
export function toHash(expr: string): string {
  const body = tidy(expr).replace(/ /g, '_')
  return body ? `#${encodeURIComponent(body).replace(/%2F/g, '/').replace(/%2C/g, ',').replace(/%40/g, '@')}` : ''
}

export function fromHash(hash: string): string | null {
  if (hash.length <= 1) return null
  try {
    return decodeURIComponent(hash.slice(1)).replace(/_/g, ' ')
  } catch {
    return null
  }
}
