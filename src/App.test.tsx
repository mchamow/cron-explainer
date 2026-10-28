import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './store'

const NOW = new Date('2026-10-28T10:07:30Z')

const input = () => screen.getByLabelText('Cron expression') as HTMLInputElement
const type = (value: string) => fireEvent.change(input(), { target: { value } })
const explanation = () => screen.getByTestId('explanation').textContent
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const toggle = (name: string) => screen.getByRole('button', { name })
const on = (name: string) => toggle(name).getAttribute('aria-pressed') === 'true'
const runs = () => within(screen.getByRole('list', { name: 'Next runs' })).getAllByRole('listitem').map((li) => li.textContent)
const fieldRows = () => within(screen.getByRole('table', { name: 'Field by field' })).getAllByRole('row').slice(1)
const press = (key: string) => fireEvent.keyDown(window, { key })
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
const status = () => screen.getByRole('status').textContent

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Starts in UTC so run times don't depend on the machine's time zone. */
const renderUtc = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ utc: true }))
  return render(<App />)
}

describe('explaining', () => {
  it('starts on weekdays at 9:30 with its fields, notes-free', () => {
    renderUtc()
    expect(input().value).toBe('30 9 * * 1-5')
    expect(explanation()).toBe('“At 09:30, Monday through Friday”')
    const chips = within(screen.getByRole('list', { name: 'Fields' })).getAllByRole('listitem')
    expect(chips.map((c) => c.textContent)).toEqual(['30min', '9hour', '*day', '*month', '1-5weekday'])
    expect(screen.queryByRole('list', { name: 'Notes' })).toBeNull()
  })

  it('explains whatever you type, field by field', () => {
    renderUtc()
    type('*/15 9-17 * JAN,JUL MON-FRI')
    expect(explanation()).toBe('“Every 15 minutes, between 09:00 and 17:59, Monday through Friday, in January and July”')
    expect(fieldRows().map((r) => r.lastElementChild?.textContent)).toEqual([
      '0, 15, 30, 45',
      '9, 10, 11, 12, 13, 14, 15, 16, 17',
      'any day of month',
      'January, July',
      'Monday, Tuesday, Wednesday, Thursday, Friday',
    ])
  })

  it('expands macros', () => {
    renderUtc()
    type('@monthly')
    expect(explanation()).toBe('“At 00:00, on day 1 of the month”')
    expect(screen.getByRole('list', { name: 'Fields' }).textContent).toMatch(/^@monthly =0min0hour1day/)
  })

  it('points at the broken field', () => {
    renderUtc()
    type('0 25 * * *')
    expect(explanation()).toBe('Hour: 25 is outside 0–23')
    expect(input().getAttribute('aria-invalid')).toBe('true')
    const rows = fieldRows()
    expect(rows[1].getAttribute('data-invalid')).toBe('true')
    expect(rows[1].textContent).toContain('25 is outside 0–23')
    expect(rows[0].getAttribute('data-invalid')).toBeNull()
    expect(screen.getByText('Fix the expression to see when it runs.')).toBeTruthy()
    type('0 0 * *')
    expect(explanation()).toMatch(/Expected 5 fields/)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows notes for surprising schedules', () => {
    renderUtc()
    type('*/7 * 1 * MON')
    const notes = within(screen.getByRole('list', { name: 'Notes' })).getAllByRole('listitem')
    expect(notes.map((n) => n.textContent)).toEqual([
      'Day of month and day of week are both set, so it runs when either one matches, not only when both do.',
      '*/7 starts over every hour, so after minute 56 the next run is 4 minutes later at minute 0, not 7.',
    ])
  })
})

describe('next runs', () => {
  it('lists the next ten runs with how far away they are', () => {
    renderUtc()
    expect(screen.getByTestId('zone').textContent).toBe('UTC')
    const r = runs()
    expect(r).toHaveLength(10)
    expect(r[0]).toBe('1Thu, Oct 29, 202609:30in 23 hours')
    expect(r[2]).toBe('3Mon, Nov 2, 202609:30in 5 days')
  })

  it('switches between local time and UTC', () => {
    render(<App />)
    expect(on('Local')).toBe(true)
    fireEvent.click(toggle('UTC'))
    expect(runs()[0]).toContain('Thu, Oct 29, 202609:30')
    press('u')
    expect(on('Local')).toBe(true)
  })

  it('says when a schedule never runs', () => {
    renderUtc()
    type('0 0 30 2 *')
    expect(screen.getByText(/Never runs/)).toBeTruthy()
  })

  it('keeps relative times fresh', () => {
    renderUtc()
    type('30 10 * * *')
    expect(runs()[0]).toContain('in 23 minutes')
    act(() => vi.advanceTimersByTime(60_000))
    expect(runs()[0]).toContain('in 22 minutes')
  })
})

describe('display', () => {
  it('toggles a 12-hour clock with a click or T', () => {
    renderUtc()
    fireEvent.click(toggle('12-hour'))
    expect(explanation()).toBe('“At 9:30 AM, Monday through Friday”')
    expect(runs()[0]).toContain('9:30 AM')
    press('t')
    expect(explanation()).toBe('“At 09:30, Monday through Friday”')
  })

  it('loads examples and marks the one showing', () => {
    renderUtc()
    expect(button('Weekdays at 9:30').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button('Quarterly'))
    expect(input().value).toBe('0 0 1 */3 *')
    expect(explanation()).toBe('“At 00:00, on day 1 of the month, every 3 months”')
    expect(button('Quarterly').getAttribute('aria-pressed')).toBe('true')
    expect(button('Weekdays at 9:30').getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(input())
    fireEvent.click(button('Try @weekly'))
    expect(explanation()).toBe('“At 00:00, on Sunday”')
  })
})

describe('keyboard', () => {
  it('focuses the field with / and leaves it with Escape', () => {
    renderUtc()
    press('/')
    expect(document.activeElement).toBe(input())
    fireEvent.keyDown(input(), { key: 'c' })
    expect(writeText).not.toHaveBeenCalled()
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(document.activeElement).not.toBe(input())
  })
})

describe('copying and sharing', () => {
  it('copies the expression and a link, by button or key', async () => {
    renderUtc()
    await act(async () => fireEvent.click(button('Copy expression')))
    expect(writeText).toHaveBeenLastCalledWith('30 9 * * 1-5')
    expect(status()).toBe('Copied expression')
    await act(async () => press('l'))
    expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/#30_9_*_*_1-5`)
    expect(status()).toBe('Copied link')
    await act(async () => press('c'))
    expect(writeText).toHaveBeenCalledTimes(3)
    act(() => vi.advanceTimersByTime(2000))
    expect(status()).toBe('')
  })

  it('says so when copying fails', async () => {
    writeText.mockImplementation(() => Promise.reject(new Error('denied')))
    renderUtc()
    await act(async () => fireEvent.click(button('Copy link')))
    expect(status()).toMatch(/Copy failed/)
  })

  it('keeps the expression in the URL and reads it back', () => {
    history.replaceState(null, '', '/#0_12_*_*_SAT,SUN')
    renderUtc()
    expect(input().value).toBe('0 12 * * SAT,SUN')
    expect(explanation()).toBe('“At 12:00, on Saturday and Sunday”')
    type('*/5 * * * *')
    expect(location.hash).toBe('#*/5_*_*_*_*')
    act(() => {
      history.replaceState(null, '', '/#@hourly')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(input().value).toBe('@hourly')
  })
})

describe('saving', () => {
  it('remembers the expression and display choices', () => {
    render(<App />)
    type('0 6 * * *')
    fireEvent.click(toggle('12-hour'))
    fireEvent.click(toggle('UTC'))
    expect(stored()).toMatchObject({ expr: '0 6 * * *', hour12: true, utc: true })
    cleanup()
    history.replaceState(null, '', '/')
    render(<App />)
    expect(input().value).toBe('0 6 * * *')
    expect(explanation()).toBe('“At 6:00 AM”')
    expect(on('UTC')).toBe(true)
  })

  it('starts fresh on corrupt saved data', () => {
    localStorage.setItem(STORAGE_KEY, '{oops')
    render(<App />)
    expect(input().value).toBe('30 9 * * 1-5')
  })

  it('collects valid expressions you pause on, and lets you reopen or remove them', () => {
    renderUtc()
    expect(screen.getByText('Expressions you look at show up here.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1000))
    type('0 0 1 * *')
    act(() => vi.advanceTimersByTime(500))
    type('0 0 1 * *  ')
    act(() => vi.advanceTimersByTime(1000))
    type('99 * * * *')
    act(() => vi.advanceTimersByTime(1000))
    const list = () => screen.getByRole('list', { name: 'Recent' })
    expect(within(list()).getAllByRole('listitem').map((li) => li.querySelector('.font-mono')?.textContent)).toEqual([
      '0 0 1 * *',
      '30 9 * * 1-5',
    ])
    expect(stored().recent).toEqual(['0 0 1 * *', '30 9 * * 1-5'])
    fireEvent.click(within(list()).getByRole('button', { name: /^30 9 \* \* 1-5/ }))
    expect(input().value).toBe('30 9 * * 1-5')
    fireEvent.click(button('Remove 0 0 1 * *'))
    expect(stored().recent).toEqual(['30 9 * * 1-5'])
    fireEvent.click(button('Clear'))
    expect(screen.queryByRole('list', { name: 'Recent' })).toBeNull()
  })
})
