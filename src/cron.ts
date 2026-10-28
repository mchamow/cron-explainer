/**
 * Standard 5-field cron (minute hour day-of-month month day-of-week), as Vixie cron reads it:
 * `*`, lists, ranges, steps, JAN–DEC / SUN–SAT names, 7 as Sunday and the @daily-style macros.
 */

export type FieldName = 'minute' | 'hour' | 'dom' | 'month' | 'dow'

export interface FieldSpec {
  name: FieldName
  label: string
  min: number
  max: number
  /** Three-letter names, indexed by value. */
  names?: readonly string[]
}

const MONTH_NAMES = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export const FIELDS: readonly FieldSpec[] = [
  { name: 'minute', label: 'Minute', min: 0, max: 59 },
  { name: 'hour', label: 'Hour', min: 0, max: 23 },
  { name: 'dom', label: 'Day of month', min: 1, max: 31 },
  { name: 'month', label: 'Month', min: 1, max: 12, names: MONTH_NAMES },
  { name: 'dow', label: 'Day of week', min: 0, max: 7, names: DAY_NAMES },
]

export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

/** One comma-separated piece of a field: `5`, `1-5`, `*`, `*\/15`, `10-50/10` or `5/15`. */
export interface Segment {
  start: number
  end: number
  step: number
  kind: 'single' | 'range' | 'step'
}

export interface Field {
  spec: FieldSpec
  text: string
  segments: Segment[]
  /** Every value the field matches, sorted, with day-of-week 7 folded into 0. */
  values: number[]
  /** Written as `*` or `?` (with or without a step). Decides how the two day fields combine. */
  star: boolean
}

export interface Cron {
  minute: Field
  hour: Field
  dom: Field
  month: Field
  dow: Field
  /** The five fields, macros expanded, single-spaced. */
  normalized: string
  macro: string | null
}

export interface PartResult {
  spec: FieldSpec
  text: string
  field: Field | null
  error: string | null
}

export type ParseResult =
  | { ok: true; cron: Cron; parts: PartResult[] }
  /** `parts` is empty when the expression doesn't even have five fields. */
  | { ok: false; message: string; parts: PartResult[] }

const fieldEnd = (spec: FieldSpec) => (spec.name === 'dow' ? 6 : spec.max)

function parseValue(token: string, spec: FieldSpec): number | string {
  if (/^\d+$/.test(token)) {
    const n = Number(token)
    return n < spec.min || n > spec.max ? `${n} is outside ${spec.min}–${spec.max}` : n
  }
  if (spec.names) {
    const i = spec.names.indexOf(token.toUpperCase())
    if (i > 0 || (i === 0 && spec.name === 'dow')) return i
    return `“${token}” isn't a number or a name like ${spec.name === 'dow' ? 'MON' : 'JAN'}`
  }
  return `“${token}” isn't a number`
}

const QUARTZ = /^(L|LW|\d+W|\d+L|[A-Z\d]+#\d+)$/i

function parseSegment(part: string, spec: FieldSpec): Segment | string {
  if (part === '') return 'empty item in the list'
  if (QUARTZ.test(part)) return `“${part}” is Quartz syntax (L, W, #), which standard cron doesn't support`
  const pieces = part.split('/')
  if (pieces.length > 2) return `“${part}” has more than one /`
  const [base, stepText] = pieces
  let step = 1
  if (stepText !== undefined) {
    if (!/^\d+$/.test(stepText)) return `step “${stepText}” isn't a whole number`
    step = Number(stepText)
    if (step === 0) return 'a step of 0 never moves'
    if (step > fieldEnd(spec) - spec.min) {
      return `a step of ${step} is larger than the range ${spec.min}–${fieldEnd(spec)}, so it would only ever match ${base === '*' ? spec.min : base.split('-')[0]}`
    }
  }
  if (base === '*' || base === '?') {
    if (base === '?' && spec.name !== 'dom' && spec.name !== 'dow') return '? is only allowed in the day fields'
    return { start: spec.min, end: fieldEnd(spec), step, kind: step === 1 ? 'range' : 'step' }
  }
  const ends = base.split('-')
  if (ends.length > 2) return `“${base}” isn't a range like 1-5`
  const start = parseValue(ends[0], spec)
  if (typeof start === 'string') return start
  if (ends.length === 1) {
    if (stepText === undefined) return { start, end: start, step: 1, kind: 'single' }
    return { start, end: fieldEnd(spec), step, kind: 'step' }
  }
  const end = parseValue(ends[1], spec)
  if (typeof end === 'string') return end
  if (start > end) return `the range ${base} runs backwards (cron ranges can't wrap around)`
  return { start, end, step, kind: step === 1 ? 'range' : 'step' }
}

export function parseField(text: string, spec: FieldSpec): Field | string {
  const segments: Segment[] = []
  for (const part of text.split(',')) {
    const seg = parseSegment(part, spec)
    if (typeof seg === 'string') return seg
    segments.push(seg)
  }
  const values = new Set<number>()
  for (const s of segments) {
    for (let v = s.start; v <= s.end; v += s.step) values.add(spec.name === 'dow' ? v % 7 : v)
  }
  return {
    spec,
    text,
    segments,
    values: [...values].sort((a, b) => a - b),
    star: text.startsWith('*') || text.startsWith('?'),
  }
}

export function parse(expression: string): ParseResult {
  const trimmed = expression.trim()
  if (trimmed === '') return { ok: false, message: 'Type a cron expression, like 30 9 * * 1-5', parts: [] }
  let macro: string | null = null
  let body = trimmed
  if (trimmed.startsWith('@')) {
    const key = trimmed.toLowerCase()
    if (key === '@reboot') return { ok: false, message: '@reboot runs once when cron starts, so it has no schedule to explain', parts: [] }
    if (!(key in MACROS)) {
      return { ok: false, message: `Unknown macro ${trimmed}. Try @yearly, @monthly, @weekly, @daily or @hourly`, parts: [] }
    }
    macro = key
    body = MACROS[key]
  }
  const texts = body.split(/\s+/)
  if (texts.length !== 5) {
    const extra =
      texts.length === 6 || texts.length === 7
        ? ' A seconds or year field is a Quartz/Spring extension, not standard cron.'
        : ''
    return {
      ok: false,
      message: `Expected 5 fields (minute hour day-of-month month day-of-week), got ${texts.length}.${extra}`,
      parts: [],
    }
  }
  const parts: PartResult[] = FIELDS.map((spec, i) => {
    const r = parseField(texts[i], spec)
    return typeof r === 'string'
      ? { spec, text: texts[i], field: null, error: r }
      : { spec, text: texts[i], field: r, error: null }
  })
  const bad = parts.find((p) => p.error)
  if (bad) return { ok: false, message: `${bad.spec.label}: ${bad.error}`, parts }
  const [minute, hour, dom, month, dow] = parts.map((p) => p.field!)
  return { ok: true, cron: { minute, hour, dom, month, dow, normalized: texts.join(' '), macro }, parts }
}

// ——— Plain English ———

export const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function joinAnd(items: string[], word = 'and'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`
}

export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export function formatTime(h: number, m: number, hour12 = false): string {
  const mm = String(m).padStart(2, '0')
  if (!hour12) return `${String(h).padStart(2, '0')}:${mm}`
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

const fullCount = (spec: FieldSpec) => fieldEnd(spec) - spec.min + 1
const isEvery = (f: Field) => f.values.length === fullCount(f.spec)
const isSingles = (f: Field) => f.segments.every((s) => s.kind === 'single')
/** The last value a segment actually reaches: `0-20/7` stops at 14. */
const lastOf = (s: Segment) => s.end - ((s.end - s.start) % s.step)
const spansAll = (s: Segment, spec: FieldSpec) => s.start === spec.min && s.end === fieldEnd(spec)
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`)

function timePhrase(minute: Field, hour: Field, hour12: boolean): string {
  const t = (h: number, m: number) => formatTime(h, m, hour12)
  if (isSingles(minute) && isSingles(hour) && minute.values.length * hour.values.length <= 6) {
    return `at ${joinAnd(hour.values.flatMap((h) => minute.values.map((m) => t(h, m))))}`
  }
  if (minute.values.length === 1) {
    const m = minute.values[0]
    const at = m === 0 ? ', on the hour' : ` at minute ${m}`
    if (isEvery(hour)) return `every hour${at}`
    const singles = hour.segments.filter((s) => s.kind === 'single').map((s) => t(s.start, m))
    const pieces = singles.length ? [`at ${joinAnd(singles)}`] : []
    for (const s of hour.segments) {
      if (s.kind === 'single') continue
      const every = s.step === 1 ? 'every hour' : `every ${s.step} hours`
      pieces.push(spansAll(s, hour.spec) ? `${every}${at}` : `${every} from ${t(s.start, m)} through ${t(lastOf(s), m)}`)
    }
    return joinAnd(pieces)
  }
  const minutes = minutePhrase(minute)
  if (isEvery(hour)) return minutes
  const windows = hour.segments.map((s) => {
    if (s.kind === 'step') {
      const range = spansAll(s, hour.spec) ? '' : ` from ${t(s.start, 0)} through ${t(lastOf(s), 59)}`
      return `during every ${ordinal(s.step)} hour${range}`
    }
    return hour.segments.length === 1 ? `between ${t(s.start, 0)} and ${t(s.end, 59)}` : `${t(s.start, 0)}–${t(s.end, 59)}`
  })
  const plain = hour.segments.length > 1 && hour.segments.every((s) => s.kind !== 'step')
  return `${minutes}, ${plain ? 'during ' : ''}${joinAnd(windows)}`
}

function minutePhrase(minute: Field): string {
  if (isEvery(minute)) return 'every minute'
  const singles = minute.segments.filter((s) => s.kind === 'single').map((s) => String(s.start))
  const pieces = singles.length ? [`at ${plural(singles.length, 'minute')} ${joinAnd(singles)}`] : []
  for (const s of minute.segments) {
    if (s.kind === 'range') pieces.push(`every minute from minute ${s.start} through ${s.end}`)
    if (s.kind !== 'step') continue
    if (spansAll(s, minute.spec)) pieces.push(`every ${s.step} minutes`)
    else if (s.end === minute.spec.max) pieces.push(`every ${s.step} minutes starting at minute ${s.start}`)
    else pieces.push(`every ${s.step} minutes from minute ${s.start} through ${lastOf(s)}`)
  }
  return joinAnd(pieces)
}

function domPhrase(dom: Field): string {
  const items = dom.segments.filter((s) => s.kind !== 'step').map((s) => (s.kind === 'single' ? `${s.start}` : `${s.start}–${s.end}`))
  const pieces = items.length ? [`${dom.values.length === 1 ? 'day' : 'days'} ${joinAnd(items)}`] : []
  for (const s of dom.segments) {
    if (s.kind !== 'step') continue
    pieces.push(`every ${ordinal(s.step)} day${spansAll(s, dom.spec) ? '' : ` from day ${s.start} through ${lastOf(s)}`}`)
  }
  return `on ${joinAnd(pieces)} of the month`
}

function namedPhrase(f: Field, names: string[], unit: string): string[] {
  return f.segments.map((s) => {
    if (s.kind === 'single') return names[s.start]
    if (s.kind === 'range') return `${names[s.start]} through ${names[s.end]}`
    if (spansAll(s, f.spec)) return `every ${s.step} ${unit}`
    return `every ${s.step} ${unit} from ${names[s.start]} through ${names[lastOf(s)]}`
  })
}

function dowPhrase(dow: Field): string {
  const items = namedPhrase(dow, WEEKDAYS, 'days')
  if (dow.segments.length === 1 && dow.segments[0].kind === 'range') return items[0]
  return `on ${joinAnd(items)}`
}

function monthPhrase(month: Field): string {
  const items = namedPhrase(month, MONTHS, 'months')
  if (month.segments.length === 1 && month.segments[0].kind === 'step') return items[0]
  if (month.segments.length === 1 && month.segments[0].kind === 'range') return `from ${items[0]}`
  return `in ${joinAnd(items)}`
}

export function describe(cron: Cron, { hour12 = false } = {}): string {
  const parts = [timePhrase(cron.minute, cron.hour, hour12)]
  const dom = isEvery(cron.dom) ? null : domPhrase(cron.dom)
  const dow = isEvery(cron.dow) ? null : dowPhrase(cron.dow)
  // Both day fields written without * means either may match, so one that matches every day wins.
  const either = !cron.dom.star && !cron.dow.star
  if (dom && dow) parts.push(`${dom} ${either ? 'or' : 'and'} ${dow}`)
  else if ((dom || dow) && !either) parts.push((dom ?? dow)!)
  if (!isEvery(cron.month)) parts.push(monthPhrase(cron.month))
  const text = parts.join(', ')
  return text[0].toUpperCase() + text.slice(1)
}

/** What the field matches, in a few words, for the field-by-field table. */
export function describeField(f: Field): string {
  const v = f.values
  const name = (n: number) => (f.spec.name === 'month' ? MONTHS[n] : f.spec.name === 'dow' ? WEEKDAYS[n] : String(n))
  if (f.star && isEvery(f)) return `any ${f.spec.label.toLowerCase()}`
  if (isEvery(f)) return `every ${f.spec.label.toLowerCase()} (written out)`
  return list(v.map(name))
}

function list(items: string[]): string {
  return items.length > 12 ? `${items.slice(0, 10).join(', ')}, … (${items.length} in all)` : items.join(', ')
}

/** Things about the schedule that commonly surprise people. */
export function notes(cron: Cron): string[] {
  const out: string[] = []
  if (!cron.dom.star && !cron.dow.star) {
    out.push('Day of month and day of week are both set, so it runs when either one matches, not only when both do.')
  }
  for (const [f, unit, parent] of [
    [cron.minute, 'minute', 'hour'],
    [cron.hour, 'hour', 'day'],
  ] as const) {
    const s = f.segments[0]
    if (f.segments.length !== 1 || s.kind !== 'step' || !spansAll(s, f.spec)) continue
    const size = fullCount(f.spec)
    if (size % s.step === 0) continue
    const last = lastOf(s)
    const gap = size - last + s.start
    out.push(
      `${f.text} starts over every ${parent}, so after ${unit} ${last} the next run is ${gap} ${plural(gap, unit)} later at ${unit} ${s.start}, not ${s.step}.`,
    )
  }
  if (!cron.dom.star && cron.dom.values[0] > 28) {
    out.push(`Not every month has day ${cron.dom.values[0]}; months without it are skipped.`)
  }
  return out
}

// ——— Next runs ———

interface Calendar {
  /** [year, month 1–12, day, hour, minute, weekday 0–6] */
  parts(d: Date): [number, number, number, number, number, number]
  make(y: number, mo: number, d: number, h: number, mi: number): Date
}

const LOCAL: Calendar = {
  parts: (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getDay()],
  make: (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi),
}
const UTC: Calendar = {
  parts: (d) => [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCDay()],
  make: (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h, mi)),
}

/** How far ahead to look before deciding a schedule never runs (covers leap days). */
const HORIZON_YEARS = 30

/** The next `count` times the schedule fires strictly after `from`, in local time or UTC. */
export function nextRuns(cron: Cron, from: Date, count: number, utc = false): Date[] {
  const cal = utc ? UTC : LOCAL
  const minutes = new Set(cron.minute.values)
  const hours = new Set(cron.hour.values)
  const doms = new Set(cron.dom.values)
  const months = new Set(cron.month.values)
  const dows = new Set(cron.dow.values)
  const dayMatches = (d: number, wd: number) => {
    if (cron.dom.star && cron.dow.star) return true
    if (cron.dom.star) return dows.has(wd)
    if (cron.dow.star) return doms.has(d)
    return doms.has(d) || dows.has(wd)
  }
  const out: Date[] = []
  let t = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000)
  const lastYear = cal.parts(t)[0] + HORIZON_YEARS
  // Around a daylight-saving change a local "next hour" can land at or before t; never go backwards.
  const advance = (next: Date) => {
    t = next.getTime() > t.getTime() ? next : new Date(t.getTime() + 60_000)
  }
  while (out.length < count) {
    const [y, mo, d, h, mi, wd] = cal.parts(t)
    if (y > lastYear) break
    if (!months.has(mo)) advance(cal.make(y, mo + 1, 1, 0, 0))
    else if (!dayMatches(d, wd)) advance(cal.make(y, mo, d + 1, 0, 0))
    else if (!hours.has(h)) advance(cal.make(y, mo, d, h + 1, 0))
    else if (!minutes.has(mi)) advance(cal.make(y, mo, d, h, mi + 1))
    else {
      out.push(t)
      advance(cal.make(y, mo, d, h, mi + 1))
    }
  }
  return out
}
