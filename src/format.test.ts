import { describe, expect, it } from 'vitest'
import { formatClock, formatDay, relative } from './format'

const at = (iso: string) => new Date(iso)

describe('format', () => {
  it('formats run times in UTC, 24- or 12-hour', () => {
    const d = at('2026-10-29T21:05:00Z')
    expect(formatDay(d, { hour12: false, utc: true })).toBe('Thu, Oct 29, 2026')
    expect(formatClock(d, { hour12: false, utc: true })).toBe('21:05')
    expect(formatClock(d, { hour12: true, utc: true })).toBe('9:05 PM')
    expect(formatClock(at('2026-10-29T00:00:00Z'), { hour12: false, utc: true })).toBe('00:00')
  })

  it('says how far away a run is', () => {
    const now = at('2026-10-28T10:00:20Z')
    expect(relative(at('2026-10-28T10:00:30Z'), now)).toBe('in under a minute')
    expect(relative(at('2026-10-28T10:01:00Z'), now)).toBe('in 1 minute')
    expect(relative(at('2026-10-28T10:45:00Z'), now)).toBe('in 45 minutes')
    expect(relative(at('2026-10-28T15:00:00Z'), now)).toBe('in 5 hours')
    expect(relative(at('2026-10-30T10:00:00Z'), now)).toBe('in 2 days')
    expect(relative(at('2027-01-28T10:00:00Z'), now)).toBe('in 3 months')
    expect(relative(at('2028-02-29T00:00:00Z'), now)).toBe('in 1 year')
  })
})
