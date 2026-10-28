import { describe as group, expect, it } from 'vitest'
import { type Cron, describe, describeField, formatTime, joinAnd, nextRuns, notes, ordinal, parse } from './cron'

const cron = (expr: string): Cron => {
  const r = parse(expr)
  if (!r.ok) throw new Error(r.message)
  return r.cron
}
const say = (expr: string, hour12 = false) => describe(cron(expr), { hour12 })
const error = (expr: string) => {
  const r = parse(expr)
  if (r.ok) throw new Error(`${expr} parsed`)
  return r.message
}
const iso = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 16))

group('parse', () => {
  it('reads values, lists, ranges and steps', () => {
    const c = cron('*/15 9-17 1,15 * 1-5')
    expect(c.minute.values).toEqual([0, 15, 30, 45])
    expect(c.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(c.dom.values).toEqual([1, 15])
    expect(c.month.values).toHaveLength(12)
    expect(c.dow.values).toEqual([1, 2, 3, 4, 5])
    expect(c.normalized).toBe('*/15 9-17 1,15 * 1-5')
  })

  it('reads stepped ranges and a start with a step', () => {
    expect(cron('10-50/20 * * * *').minute.values).toEqual([10, 30, 50])
    expect(cron('5/20 * * * *').minute.values).toEqual([5, 25, 45])
  })

  it('reads month and weekday names in any case, and 7 as Sunday', () => {
    const c = cron('0 0 * jan-MAR sun,Wed,7')
    expect(c.month.values).toEqual([1, 2, 3])
    expect(c.dow.values).toEqual([0, 3])
    expect(cron('0 0 * * 5-7').dow.values).toEqual([0, 5, 6])
  })

  it('tracks whether the day fields were written with a star', () => {
    expect(cron('0 0 */2 * ?').dom.star).toBe(true)
    expect(cron('0 0 */2 * ?').dow.star).toBe(true)
    expect(cron('0 0 1-31 * 1').dom.star).toBe(false)
  })

  it('expands macros', () => {
    const c = cron(' @Daily ')
    expect(c.normalized).toBe('0 0 * * *')
    expect(c.macro).toBe('@daily')
    expect(cron('@weekly').normalized).toBe('0 0 * * 0')
  })

  it('explains what is wrong, naming the field', () => {
    expect(error('')).toMatch(/Type a cron expression/)
    expect(error('* * * *')).toBe('Expected 5 fields (minute hour day-of-month month day-of-week), got 4.')
    expect(error('0 * * * * *')).toMatch(/got 6\. A seconds or year field is a Quartz/)
    expect(error('60 * * * *')).toBe('Minute: 60 is outside 0–59')
    expect(error('0 24 * * *')).toBe('Hour: 24 is outside 0–23')
    expect(error('0 0 0 * *')).toBe('Day of month: 0 is outside 1–31')
    expect(error('0 0 * FOO *')).toBe('Month: “FOO” isn\'t a number or a name like JAN')
    expect(error('0 0 * * MON-FUNDAY')).toMatch(/^Day of week: “FUNDAY”/)
    expect(error('0 0 * * 5-1')).toBe("Day of week: the range 5-1 runs backwards (cron ranges can't wrap around)")
    expect(error('*/0 * * * *')).toBe('Minute: a step of 0 never moves')
    expect(error('*/90 * * * *')).toBe('Minute: a step of 90 is larger than the range 0–59, so it would only ever match 0')
    expect(error('1,,2 * * * *')).toBe('Minute: empty item in the list')
    expect(error('0 0 L * *')).toMatch(/Quartz syntax/)
    expect(error('0 0 * * 5#3')).toMatch(/Quartz syntax/)
    expect(error('0 ? * * *')).toBe('Hour: ? is only allowed in the day fields')
    expect(error('@reboot')).toMatch(/no schedule/)
    expect(error('@often')).toMatch(/Unknown macro @often/)
  })

  it('reports every field, good and bad', () => {
    const r = parse('99 9 * * NOPE')
    expect(r.ok).toBe(false)
    expect(r.parts.map((p) => p.error === null)).toEqual([false, true, true, true, false])
    expect(r.parts[1].field?.values).toEqual([9])
  })
})

group('describe', () => {
  it.each([
    ['* * * * *', 'Every minute'],
    ['*/5 * * * *', 'Every 5 minutes'],
    ['5/15 * * * *', 'Every 15 minutes starting at minute 5'],
    ['0 * * * *', 'Every hour, on the hour'],
    ['15 * * * *', 'Every hour at minute 15'],
    ['0 */2 * * *', 'Every 2 hours, on the hour'],
    ['30 9 * * *', 'At 09:30'],
    ['0 9,17 * * *', 'At 09:00 and 17:00'],
    ['0 9-17 * * *', 'Every hour from 09:00 through 17:00'],
    ['30 8-18/2 * * *', 'Every 2 hours from 08:30 through 18:30'],
    ['0 12,8-10 * * *', 'At 12:00 and every hour from 08:00 through 10:00'],
    ['*/15 9-17 * * 1-5', 'Every 15 minutes, between 09:00 and 17:59, Monday through Friday'],
    ['* 9,17 * * *', 'Every minute, during 09:00–09:59 and 17:00–17:59'],
    ['0,30 */3 * * *', 'At minutes 0 and 30, during every 3rd hour'],
    ['0-29 * * * *', 'Every minute from minute 0 through 29'],
    ['30 9 * * 1-5', 'At 09:30, Monday through Friday'],
    ['0 8 * * MON,FRI', 'At 08:00, on Monday and Friday'],
    ['0 0 1 * *', 'At 00:00, on day 1 of the month'],
    ['0 0 1,15 * *', 'At 00:00, on days 1 and 15 of the month'],
    ['0 0 */2 * *', 'At 00:00, on every 2nd day of the month'],
    ['0 0 1-7 * 1', 'At 00:00, on days 1–7 of the month or on Monday'],
    ['0 0 */2 * 1', 'At 00:00, on every 2nd day of the month and on Monday'],
    ['0 0 1-31 * 1', 'At 00:00'],
    ['0 0 1 */3 *', 'At 00:00, on day 1 of the month, every 3 months'],
    ['0 12 1 1 *', 'At 12:00, on day 1 of the month, in January'],
    ['0 0 * 3-6 *', 'At 00:00, from March through June'],
    ['@yearly', 'At 00:00, on day 1 of the month, in January'],
    ['@weekly', 'At 00:00, on Sunday'],
  ])('%s → %s', (expr, text) => {
    expect(say(expr)).toBe(text)
  })

  it('writes 12-hour times when asked', () => {
    expect(say('30 9 * * *', true)).toBe('At 9:30 AM')
    expect(say('0 0,12 * * *', true)).toBe('At 12:00 AM and 12:00 PM')
    expect(say('*/10 13 * * *', true)).toBe('Every 10 minutes, between 1:00 PM and 1:59 PM')
  })

  it('sums up each field', () => {
    const c = cron('*/15 0-23 * JAN,JUL 1-5')
    expect(describeField(c.minute)).toBe('0, 15, 30, 45')
    expect(describeField(c.hour)).toBe('every hour (written out)')
    expect(describeField(c.dom)).toBe('any day of month')
    expect(describeField(c.month)).toBe('January, July')
    expect(describeField(c.dow)).toBe('Monday, Tuesday, Wednesday, Thursday, Friday')
    expect(describeField(cron('*/2 * * * *').minute)).toBe('0, 2, 4, 6, 8, 10, 12, 14, 16, 18, … (30 in all)')
  })
})

group('notes', () => {
  it('warns that two day fields mean either', () => {
    expect(notes(cron('0 0 1 * 1'))[0]).toMatch(/either one matches/)
    expect(notes(cron('0 0 1 * *'))).toEqual([])
  })

  it('points out uneven steps', () => {
    expect(notes(cron('*/7 * * * *'))).toEqual([
      '*/7 starts over every hour, so after minute 56 the next run is 4 minutes later at minute 0, not 7.',
    ])
    expect(notes(cron('0 */5 * * *'))[0]).toMatch(/after hour 20 the next run is 4 hours later at hour 0/)
    expect(notes(cron('*/15 */6 * * *'))).toEqual([])
  })

  it('warns about days not every month has', () => {
    expect(notes(cron('0 0 31 * *'))).toEqual(['Not every month has day 31; months without it are skipped.'])
  })
})

group('nextRuns', () => {
  const from = new Date('2026-10-28T10:07:30Z')

  it('finds the next minutes, strictly after now', () => {
    expect(iso(nextRuns(cron('*/15 * * * *'), from, 3, true))).toEqual(['2026-10-28T10:15', '2026-10-28T10:30', '2026-10-28T10:45'])
    expect(iso(nextRuns(cron('7 * * * *'), new Date('2026-10-28T10:07:00Z'), 1, true))).toEqual(['2026-10-28T11:07'])
  })

  it('skips to matching days, weekdays and months', () => {
    expect(iso(nextRuns(cron('30 9 * * 1-5'), from, 4, true))).toEqual([
      '2026-10-29T09:30',
      '2026-10-30T09:30',
      '2026-11-02T09:30',
      '2026-11-03T09:30',
    ])
    expect(iso(nextRuns(cron('0 0 1 */3 *'), from, 3, true))).toEqual(['2027-01-01T00:00', '2027-04-01T00:00', '2027-07-01T00:00'])
  })

  it('matches either day field when both are set', () => {
    // 1 Nov 2026 is a Sunday; Fridays are 30 Oct and 6 Nov.
    expect(iso(nextRuns(cron('0 12 1 * FRI'), from, 3, true))).toEqual(['2026-10-30T12:00', '2026-11-01T12:00', '2026-11-06T12:00'])
  })

  it('finds leap days and skips short months', () => {
    expect(iso(nextRuns(cron('0 0 29 2 *'), from, 2, true))).toEqual(['2028-02-29T00:00', '2032-02-29T00:00'])
    expect(iso(nextRuns(cron('0 0 31 * *'), from, 3, true))).toEqual(['2026-10-31T00:00', '2026-12-31T00:00', '2027-01-31T00:00'])
  })

  it('returns nothing for a date that never exists', () => {
    expect(nextRuns(cron('0 0 30 2 *'), from, 5, true)).toEqual([])
  })

  it('works in local time', () => {
    const local = new Date(2026, 9, 28, 10, 7)
    const runs = nextRuns(cron('30 9 * * *'), local, 2)
    expect(runs.map((d) => [d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [29, 9, 30],
      [30, 9, 30],
    ])
  })
})

group('helpers', () => {
  it('joins, counts and formats', () => {
    expect(joinAnd(['a'])).toBe('a')
    expect(joinAnd(['a', 'b', 'c'])).toBe('a, b and c')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal).join(' ')).toBe('1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 101st')
    expect(formatTime(7, 5)).toBe('07:05')
    expect(formatTime(0, 0, true)).toBe('12:00 AM')
    expect(formatTime(23, 59, true)).toBe('11:59 PM')
  })
})
