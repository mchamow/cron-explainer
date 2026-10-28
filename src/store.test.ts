import { describe, expect, it } from 'vitest'
import { addRecent, DEFAULT_EXPR, defaults, fromHash, load, RECENT_MAX, save, STORAGE_KEY, toHash } from './store'

const storageWith = (value: string | null): Storage => {
  const s = new Map<string, string>()
  if (value !== null) s.set(STORAGE_KEY, value)
  return {
    getItem: (k) => s.get(k) ?? null,
    setItem: (k, v) => void s.set(k, v),
    removeItem: (k) => void s.delete(k),
    clear: () => s.clear(),
    key: () => null,
    get length() {
      return s.size
    },
  }
}

describe('load and save', () => {
  it('round-trips', () => {
    const storage = storageWith(null)
    const s = { expr: '0 0 * * *', hour12: true, utc: true, recent: ['0 0 * * *', '@hourly'] }
    save(s, storage)
    expect(load(storage)).toEqual(s)
  })

  it('falls back to defaults on missing or corrupt data', () => {
    expect(load(storageWith(null))).toEqual(defaults())
    expect(load(storageWith('{nope'))).toEqual(defaults())
    expect(load(storageWith('42'))).toEqual(defaults())
    expect(defaults().expr).toBe(DEFAULT_EXPR)
  })

  it('keeps the good fields of partly bad data', () => {
    const s = load(storageWith(JSON.stringify({ expr: 5, hour12: 'yes', utc: true, recent: ['a  b', 3, '', 'a b', '@daily'] })))
    expect(s).toEqual({ expr: DEFAULT_EXPR, hour12: false, utc: true, recent: ['a b', '@daily'] })
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(() => save(defaults(), broken)).not.toThrow()
    expect(load(broken)).toEqual(defaults())
  })
})

describe('recent', () => {
  it('puts the newest first, tidied, without duplicates, capped', () => {
    let list: string[] = []
    for (let i = 0; i < RECENT_MAX + 2; i++) list = addRecent(list, `${i} * * * *`)
    expect(list).toHaveLength(RECENT_MAX)
    expect(list[0]).toBe(`${RECENT_MAX + 1} * * * *`)
    list = addRecent(list, `  5   * * * * `)
    expect(list[0]).toBe('5 * * * *')
    expect(list.filter((x) => x === '5 * * * *')).toHaveLength(1)
  })
})

describe('hash', () => {
  it('round-trips expressions through a readable fragment', () => {
    expect(toHash(' 30  9 * * 1-5 ')).toBe('#30_9_*_*_1-5')
    expect(toHash('*/15 9,17 * JAN-MAR ?')).toBe('#*/15_9,17_*_JAN-MAR_%3F')
    expect(toHash('@daily')).toBe('#@daily')
    expect(toHash('  ')).toBe('')
    for (const e of ['30 9 * * 1-5', '*/15 9,17 * JAN-MAR ?', '@daily', '0 0 * * 5#3']) expect(fromHash(toHash(e))).toBe(e)
  })

  it('ignores empty or broken fragments', () => {
    expect(fromHash('')).toBeNull()
    expect(fromHash('#')).toBeNull()
    expect(fromHash('#%E0%A4%A')).toBeNull()
  })
})
