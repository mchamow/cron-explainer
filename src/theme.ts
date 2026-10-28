/**
 * shadcn's dark theme hangs off a `.dark` class on <html>; keep it in step with the OS setting.
 * Returns a function that stops following it.
 */
export function followSystemTheme(root: HTMLElement = document.documentElement): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    root.classList.toggle('dark', query.matches)
    // Native bits (number spinners, scrollbars) follow color-scheme, not the class.
    root.style.colorScheme = query.matches ? 'dark' : 'light'
  }
  apply()
  query.addEventListener('change', apply)
  return () => query.removeEventListener('change', apply)
}
