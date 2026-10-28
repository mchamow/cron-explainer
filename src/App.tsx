import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClockIcon, CheckIcon, CircleAlertIcon, CopyIcon, HistoryIcon, InfoIcon, LinkIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { describe, describeField, type FieldName, FIELDS, nextRuns, notes, parse } from './cron'
import { formatClock, formatDay, localZone, relative } from './format'
import { addRecent, fromHash, load, save, toHash } from './store'

const RUNS = 10

const FIELD_STYLE: Record<FieldName, { chip: string; dot: string }> = {
  minute: { chip: 'bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300', dot: 'bg-sky-500' },
  hour: { chip: 'bg-violet-500/10 text-violet-700 ring-violet-500/30 dark:text-violet-300', dot: 'bg-violet-500' },
  dom: { chip: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300', dot: 'bg-emerald-500' },
  month: { chip: 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300', dot: 'bg-amber-500' },
  dow: { chip: 'bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300', dot: 'bg-rose-500' },
}
const ALLOWED: Record<FieldName, string> = {
  minute: '0–59',
  hour: '0–23',
  dom: '1–31',
  month: '1–12 or JAN–DEC',
  dow: '0–7 or SUN–SAT',
}
/** A pressed toggle should read as "on" at a glance, more than the default muted fill. */
const ON =
  'aria-pressed:bg-indigo-600 aria-pressed:text-white aria-pressed:hover:bg-indigo-600/90 dark:aria-pressed:bg-indigo-500 dark:aria-pressed:text-white dark:aria-pressed:hover:bg-indigo-500/90'
const SHORT: Record<FieldName, string> = { minute: 'min', hour: 'hour', dom: 'day', month: 'month', dow: 'weekday' }

const PRESETS = [
  { label: 'Every minute', expr: '* * * * *' },
  { label: 'Every 5 minutes', expr: '*/5 * * * *' },
  { label: 'Hourly', expr: '0 * * * *' },
  { label: 'Daily at midnight', expr: '0 0 * * *' },
  { label: 'Weekdays at 9:30', expr: '30 9 * * 1-5' },
  { label: 'Mondays at 8:00', expr: '0 8 * * MON' },
  { label: 'Office hours', expr: '*/15 9-17 * * 1-5' },
  { label: 'First of the month', expr: '0 0 1 * *' },
  { label: 'Quarterly', expr: '0 0 1 */3 *' },
  { label: 'Leap day', expr: '0 12 29 2 *' },
]

const SYNTAX = [
  { token: '*', means: 'any value', example: '* * * * *' },
  { token: ',', means: 'a list', example: '0 9,17 * * *' },
  { token: '-', means: 'a range', example: '0 9 * * 1-5' },
  { token: '/', means: 'a step', example: '*/15 * * * *' },
  { token: 'JAN', means: 'month and weekday names', example: '0 8 * JAN,JUL MON' },
  { token: '@', means: 'macros: @hourly, @daily, @weekly, @monthly, @yearly', example: '@weekly' },
]

/** Single-key shortcuts fire everywhere except while typing in a text field. */
const isTyping = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]') != null

function initial() {
  const saved = load()
  return { ...saved, expr: fromHash(location.hash) ?? saved.expr }
}

export default function App() {
  const [start] = useState(initial)
  const [expr, setExpr] = useState(start.expr)
  const [hour12, setHour12] = useState(start.hour12)
  const [utc, setUtc] = useState(start.utc)
  const [recent, setRecent] = useState(start.recent)
  const [now, setNow] = useState(() => new Date())
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const result = useMemo(() => parse(expr), [expr])
  const runs = useMemo(() => (result.ok ? nextRuns(result.cron, now, RUNS, utc) : []), [result, now, utc])

  useEffect(() => save({ expr, hour12, utc, recent }), [expr, hour12, utc, recent])
  useEffect(() => history.replaceState(null, '', toHash(expr) || location.pathname + location.search), [expr])
  useEffect(() => {
    const onHash = () => {
      const e = fromHash(location.hash)
      if (e !== null) setExpr(e)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  // An expression you've stopped typing and that parses goes into the history.
  useEffect(() => {
    if (!result.ok) return
    const id = setTimeout(() => setRecent((r) => addRecent(r, expr)), 1000)
    return () => clearTimeout(id)
  }, [expr, result.ok])
  useEffect(() => {
    if (!status) return
    const id = setTimeout(() => setStatus(null), 1800)
    return () => clearTimeout(id)
  }, [status])

  const copy = useCallback(async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ ok: true, text: `Copied ${what}` })
    } catch {
      setStatus({ ok: false, text: 'Copy failed: select the text and copy it yourself' })
    }
  }, [])
  const link = () => `${location.origin}${location.pathname}${toHash(expr)}`

  const choose = (e: string) => {
    setExpr(e)
    inputRef.current?.focus()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (key === 'c') void copy(expr.trim(), 'expression')
      else if (key === 'l') void copy(link(), 'link')
      else if (key === 't') setHour12((h) => !h)
      else if (key === 'u') setUtc((u) => !u)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tokens = result.ok ? result.cron.normalized.split(' ') : result.parts.map((p) => p.text)
  const macro = result.ok ? result.cron.macro : null
  const zone = utc ? 'UTC' : localZone()

  return (
    <TooltipProvider>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:py-10">
        <header className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm dark:bg-indigo-400 dark:text-indigo-950">
            <AlarmClockIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cron Explainer</h1>
            <p className="text-sm text-muted-foreground">Paste a cron expression to read it in plain English and see when it runs next.</p>
          </div>
        </header>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="expr" className="text-sm font-medium">
                Cron expression
              </label>
              <div className="flex gap-2">
                <Input
                  id="expr"
                  ref={inputRef}
                  value={expr}
                  onChange={(e) => setExpr(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  aria-invalid={!result.ok}
                  aria-describedby="explanation"
                  placeholder="30 9 * * 1-5"
                  className="h-10 min-w-0 flex-1 font-mono text-base sm:h-12 sm:text-lg sm:tracking-wide md:text-xl"
                />
                <Tooltip>
                  <TooltipTrigger
                    render={<Button variant="outline" size="icon-lg" className="size-10 sm:size-12" aria-label="Copy expression" onClick={() => void copy(expr.trim(), 'expression')} />}
                  >
                    {status?.ok && status.text.endsWith('expression') ? <CheckIcon /> : <CopyIcon />}
                  </TooltipTrigger>
                  <TooltipContent>
                    Copy expression <Kbd>C</Kbd>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={<Button variant="outline" size="icon-lg" className="size-10 sm:size-12" aria-label="Copy link" onClick={() => void copy(link(), 'link')} />}>
                    {status?.ok && status.text.endsWith('link') ? <CheckIcon /> : <LinkIcon />}
                  </TooltipTrigger>
                  <TooltipContent>
                    Copy a link to this schedule <Kbd>L</Kbd>
                  </TooltipContent>
                </Tooltip>
              </div>
              {tokens.length === 5 && (
                <ol aria-label="Fields" className="flex flex-wrap items-start gap-1.5">
                  {macro && <li className="self-center pe-1 font-mono text-sm text-muted-foreground">{macro} =</li>}
                  {tokens.map((t, i) => {
                    const f = FIELDS[i]
                    const bad = !result.ok && result.parts[i].error !== null
                    return (
                      <li key={f.name} className="flex flex-col items-center gap-0.5" data-invalid={bad || undefined}>
                        <span
                          className={cn(
                            'max-w-40 truncate rounded-md px-2 py-0.5 font-mono text-sm ring-1',
                            bad ? 'bg-destructive/10 text-destructive ring-destructive/50' : FIELD_STYLE[f.name].chip,
                          )}
                        >
                          {t}
                        </span>
                        <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">{SHORT[f.name]}</span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            <div className="rounded-xl bg-muted/60 p-4 ring-1 ring-border">
              <p
                id="explanation"
                aria-live="polite"
                data-testid="explanation"
                className={cn(
                  'flex items-start gap-2 text-lg leading-snug font-semibold text-balance sm:text-xl',
                  !result.ok && 'text-base font-medium text-destructive sm:text-base',
                )}
              >
                {!result.ok && <CircleAlertIcon className="mt-0.5 size-5 shrink-0" />}
                {result.ok ? `“${describe(result.cron, { hour12 })}”` : result.message}
              </p>
              {result.ok && notes(result.cron).length > 0 && (
                <ul aria-label="Notes" className="mt-3 flex flex-col gap-1.5">
                  {notes(result.cron).map((n) => (
                    <li key={n} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <InfoIcon className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ToggleGroup
                aria-label="Clock"
                variant="outline"
                size="sm"
                spacing={0}
                value={[hour12 ? '12h' : '24h']}
                onValueChange={(v) => v[0] && setHour12(v[0] === '12h')}
              >
                <ToggleGroupItem value="24h" className={cn('px-3', ON)}>
                  24-hour
                </ToggleGroupItem>
                <ToggleGroupItem value="12h" className={cn('px-3', ON)}>
                  12-hour
                </ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup
                aria-label="Time zone"
                variant="outline"
                size="sm"
                spacing={0}
                value={[utc ? 'utc' : 'local']}
                onValueChange={(v) => v[0] && setUtc(v[0] === 'utc')}
              >
                <ToggleGroupItem value="local" className={cn('px-3', ON)}>
                  Local
                </ToggleGroupItem>
                <ToggleGroupItem value="utc" className={cn('px-3', ON)}>
                  UTC
                </ToggleGroupItem>
              </ToggleGroup>
              <p
                role="status"
                className={cn('ms-auto text-xs', status?.ok === false ? 'text-destructive' : 'text-indigo-700 dark:text-indigo-300')}
              >
                {status?.text}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase" id="presets-label">
                Examples
              </span>
              <ul aria-labelledby="presets-label" className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <li key={p.expr}>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-pressed={result.ok && result.cron.normalized === p.expr && !result.cron.macro}
                      className={ON}
                      onClick={() => choose(p.expr)}
                    >
                      {p.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Next {RUNS} runs</CardTitle>
              <CardDescription>
                In{' '}
                <span className="font-medium text-foreground" data-testid="zone">
                  {zone}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!result.ok ? (
                <p className="text-sm text-muted-foreground">Fix the expression to see when it runs.</p>
              ) : runs.length === 0 ? (
                <p className="flex items-start gap-2 text-sm font-medium text-destructive">
                  <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  Never runs: no date in the next 30 years matches.
                </p>
              ) : (
                <ol aria-label="Next runs" className="flex flex-col divide-y divide-border">
                  {runs.map((d, i) => (
                    <li key={d.getTime()} className="flex items-baseline gap-3 py-1.5 text-sm">
                      <span className="w-5 text-end text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="flex-1">{formatDay(d, { hour12, utc })}</span>
                      <span className="font-mono font-medium tabular-nums">{formatClock(d, { hour12, utc })}</span>
                      <span className="w-24 text-end text-xs text-muted-foreground max-[400px]:hidden">{relative(d, now)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Field by field</CardTitle>
              <CardDescription>minute · hour · day of month · month · day of week</CardDescription>
            </CardHeader>
            <CardContent>
              {result.parts.length === 0 ? (
                <p className="text-sm text-muted-foreground">A cron expression has five fields separated by spaces.</p>
              ) : (
                <Table aria-label="Field by field">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Matches</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.parts.map((p) => (
                      <TableRow key={p.spec.name} data-invalid={p.error ? true : undefined}>
                        <TableCell className="align-top">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className={cn('size-2 shrink-0 rounded-full', FIELD_STYLE[p.spec.name].dot)} />
                            {p.spec.label}
                          </span>
                          <span className="ps-3.5 text-xs text-muted-foreground">{ALLOWED[p.spec.name]}</span>
                        </TableCell>
                        <TableCell className="max-w-24 truncate align-top font-mono">{p.text}</TableCell>
                        <TableCell className={cn('align-top whitespace-normal', p.error && 'text-destructive')}>
                          {p.error ?? describeField(p.field!)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HistoryIcon className="size-4 text-muted-foreground" />
                Recent
              </CardTitle>
              <CardDescription>Saved in this browser.</CardDescription>
              {recent.length > 0 && (
                <CardAction>
                  <Button variant="ghost" size="sm" onClick={() => setRecent([])}>
                    <Trash2Icon />
                    Clear
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Expressions you look at show up here.</p>
              ) : (
                <ul aria-label="Recent" className="flex flex-col gap-1">
                  {recent.map((r) => {
                    const parsed = parse(r)
                    return (
                      <li key={r} className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => choose(r)}
                          className="flex min-w-0 flex-1 flex-col rounded-md px-2 py-1 text-start outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="truncate font-mono text-sm">{r}</span>
                          {parsed.ok && <span className="truncate text-xs text-muted-foreground">{describe(parsed.cron, { hour12 })}</span>}
                        </button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r}`} onClick={() => setRecent((l) => l.filter((x) => x !== r))}>
                          <XIcon />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Syntax</CardTitle>
              <CardDescription>Click an example to try it.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2 text-sm">
                {SYNTAX.map((s) => (
                  <div key={s.token} className="contents">
                    <dt className="font-mono font-semibold text-indigo-700 dark:text-indigo-300">{s.token}</dt>
                    <dd className="flex flex-wrap items-baseline gap-x-2">
                      <span>{s.means}</span>
                      <button
                        type="button"
                        aria-label={`Try ${s.example}`}
                        onClick={() => choose(s.example)}
                        className="rounded font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {s.example}
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>
            <Kbd>/</Kbd> edit
          </span>
          <span>
            <Kbd>C</Kbd> copy
          </span>
          <span>
            <Kbd>L</Kbd> link
          </span>
          <span>
            <Kbd>T</Kbd> 12/24h
          </span>
          <span>
            <Kbd>U</Kbd> UTC
          </span>
          <span className="ms-auto">
            Day 34 of{' '}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/mchamow?tab=repositories">
              100 Days of React
            </a>
          </span>
        </footer>
      </main>
    </TooltipProvider>
  )
}
