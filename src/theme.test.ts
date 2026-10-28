import { afterEach, expect, it, vi } from 'vitest'
import { followSystemTheme } from './theme'

// jsdom has no matchMedia; this fake lets the test flip the OS setting.
function fakeDarkModeQuery(initiallyDark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: initiallyDark,
    addEventListener: (_: 'change', fn: () => void) => listeners.add(fn),
    removeEventListener: (_: 'change', fn: () => void) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', (q: string) => {
    expect(q).toBe('(prefers-color-scheme: dark)')
    return query
  })
  const setDark = (dark: boolean) => {
    query.matches = dark
    listeners.forEach((fn) => fn())
  }
  return { setDark, listeners }
}

afterEach(() => vi.unstubAllGlobals())

it('adds .dark when the system is dark and follows later changes', () => {
  const { setDark } = fakeDarkModeQuery(true)
  const root = document.createElement('html')
  followSystemTheme(root)
  expect(root.classList.contains('dark')).toBe(true)
  expect(root.style.colorScheme).toBe('dark')

  setDark(false)
  expect(root.classList.contains('dark')).toBe(false)
  expect(root.style.colorScheme).toBe('light')

  setDark(true)
  expect(root.classList.contains('dark')).toBe(true)
})

it('starts light on a light system and stops following when cleaned up', () => {
  const { setDark, listeners } = fakeDarkModeQuery(false)
  const root = document.createElement('html')
  const stop = followSystemTheme(root)
  expect(root.classList.contains('dark')).toBe(false)

  stop()
  expect(listeners.size).toBe(0)
  setDark(true)
  expect(root.classList.contains('dark')).toBe(false)
})
