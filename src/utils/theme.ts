import { THEME_KEY } from '../services/storageService.ts'

export type Theme = 'dark' | 'light'

export const THEME_COLORS = {
  dark: '#17152f',
  light: '#6046c0',
} as const

/**
 * Resolves initial theme with strict precedence:
 * 1. Saved localStorage theme ('light' or 'dark')
 * 2. System preference via window.matchMedia('(prefers-color-scheme: light)')
 * 3. Default to 'dark'
 */
export function resolveInitialTheme(
  stored: string | null | undefined,
  matchMediaFn?: (query: string) => { matches: boolean }
): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  const mm = matchMediaFn ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined)

  if (typeof mm === 'function') {
    try {
      if (mm('(prefers-color-scheme: light)').matches) {
        return 'light'
      }
    } catch {
      // matchMedia failure fallback
    }
  }

  return 'dark'
}

/**
 * Applies the theme to the DOM:
 * 1. document.documentElement.dataset.theme = theme
 * 2. Updates <meta name="theme-color"> to match active theme
 */
export function applyTheme(theme: Theme, doc?: Document): void {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : undefined)
  if (!targetDoc) return

  targetDoc.documentElement.dataset.theme = theme

  let meta = targetDoc.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = targetDoc.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    targetDoc.head?.appendChild(meta)
  }
  meta.setAttribute('content', THEME_COLORS[theme])
}

export { THEME_KEY }
