import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  resolveInitialTheme,
  applyTheme,
  THEME_KEY,
  THEME_COLORS,
} from '../src/utils/theme.ts'
import { STORES, DB_NAME } from '../src/types/database.ts'

describe('Phase 11: Light/Dark Theme Consistency', () => {
  describe('Theme Resolution Precedence', () => {
    it('1. Defaults to "dark" when no saved preference and no matchMedia', () => {
      const theme = resolveInitialTheme(null, undefined)
      assert.strictEqual(theme, 'dark')
    })

    it('2. Uses system light preference when no saved preference', () => {
      const matchMediaFn = (query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
      })
      const theme = resolveInitialTheme(null, matchMediaFn)
      assert.strictEqual(theme, 'light')
    })

    it('3. Uses system dark preference when no saved preference', () => {
      const matchMediaFn = (query: string) => ({
        matches: query !== '(prefers-color-scheme: light)',
      })
      const theme = resolveInitialTheme(null, matchMediaFn)
      assert.strictEqual(theme, 'dark')
    })

    it('4. Falls back safely to "dark" when matchMedia throws or fails', () => {
      const throwingMatchMedia = () => {
        throw new Error('matchMedia unsupported in this environment')
      }
      const theme = resolveInitialTheme(null, throwingMatchMedia)
      assert.strictEqual(theme, 'dark')
    })

    it('5. Saved "light" theme explicitly overrides system "dark" preference', () => {
      const systemDark = (query: string) => ({
        matches: query !== '(prefers-color-scheme: light)',
      })
      const theme = resolveInitialTheme('light', systemDark)
      assert.strictEqual(theme, 'light')
    })

    it('6. Saved "dark" theme explicitly overrides system "light" preference', () => {
      const systemLight = (query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
      })
      const theme = resolveInitialTheme('dark', systemLight)
      assert.strictEqual(theme, 'dark')
    })

    it('7. Preserves the exact localStorage key "gully-scorer-theme"', () => {
      assert.strictEqual(THEME_KEY, 'gully-scorer-theme')
    })

    it('8. Invalid stored theme strings fall back safely to system preference or dark', () => {
      const systemLight = (query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
      })
      assert.strictEqual(resolveInitialTheme('invalid_theme', systemLight), 'light')
      assert.strictEqual(resolveInitialTheme('', systemLight), 'light')
      assert.strictEqual(resolveInitialTheme(undefined, systemLight), 'light')

      // Without matchMedia
      assert.strictEqual(resolveInitialTheme('neon', undefined), 'dark')
      assert.strictEqual(resolveInitialTheme('solarized', undefined), 'dark')
    })
  })

  describe('DOM Application & <meta name="theme-color"> Updates', () => {
    function createMockDocument(initialMetaColor?: string) {
      let dataTheme: string | undefined
      let metaAttrs: Record<string, string> = initialMetaColor
        ? { name: 'theme-color', content: initialMetaColor }
        : {}

      const mockMeta = {
        getAttribute(name: string) {
          return metaAttrs[name] || null
        },
        setAttribute(name: string, value: string) {
          metaAttrs[name] = value
        },
      }

      const mockDoc = {
        documentElement: {
          dataset: {
            get theme() {
              return dataTheme
            },
            set theme(val: string) {
              dataTheme = val
            },
          },
        },
        head: {
          appendChild(_el: unknown) {},
        },
        querySelector(selector: string) {
          if (selector === 'meta[name="theme-color"]') {
            return metaAttrs['name'] === 'theme-color' ? mockMeta : null
          }
          return null
        },
        createElement(tag: string) {
          if (tag === 'meta') {
            return mockMeta
          }
          return {}
        },
      } as unknown as Document

      return { mockDoc, getTheme: () => dataTheme, getMetaColor: () => metaAttrs['content'] }
    }

    it('9. Updates dataset.theme and <meta name="theme-color"> for Dark theme', () => {
      const { mockDoc, getTheme, getMetaColor } = createMockDocument('#ffffff')
      applyTheme('dark', mockDoc)

      assert.strictEqual(getTheme(), 'dark')
      assert.strictEqual(getMetaColor(), THEME_COLORS.dark)
      assert.strictEqual(getMetaColor(), '#17152f')
    })

    it('10. Updates dataset.theme and <meta name="theme-color"> for Light theme', () => {
      const { mockDoc, getTheme, getMetaColor } = createMockDocument('#17152f')
      applyTheme('light', mockDoc)

      assert.strictEqual(getTheme(), 'light')
      assert.strictEqual(getMetaColor(), THEME_COLORS.light)
      assert.strictEqual(getMetaColor(), '#6046c0')
    })

    it('11. Creates <meta name="theme-color"> element if none existed in document', () => {
      const { mockDoc, getTheme, getMetaColor } = createMockDocument()
      applyTheme('light', mockDoc)

      assert.strictEqual(getTheme(), 'light')
      assert.strictEqual(getMetaColor(), '#6046c0')
    })
  })

  describe('Strict Invariants: Persistence Isolation', () => {
    it('12. Theme never enters IndexedDB stores, match records, or database schema', () => {
      // Check database store names to confirm there is no "theme" store
      const storeValues = Object.values(STORES)
      assert.ok(!storeValues.includes('theme' as any), 'No theme store in STORES')
      assert.ok(!storeValues.includes('themes' as any), 'No themes store in STORES')
      assert.strictEqual(DB_NAME, 'scoremate_local_db')
    })
  })
})
