import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')

describe('Mobile Viewport & Android WebView Configuration Audit', () => {
  it('1. index.html contains exact mobile Capacitor viewport meta tag with viewport-fit=cover', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8')
    const viewportMatch = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"\s*\/?>/)
    assert.ok(viewportMatch, 'index.html must contain a viewport meta tag')

    const content = viewportMatch[1]
    assert.ok(content.includes('width=device-width'), 'viewport must include width=device-width')
    assert.ok(content.includes('initial-scale=1.0'), 'viewport must include initial-scale=1.0')
    assert.ok(content.includes('viewport-fit=cover'), 'viewport must include viewport-fit=cover for edge-to-edge native safe areas')
    assert.doesNotMatch(content, /width=\d{3,}/, 'viewport must not set fixed pixel width')
  })

  it('2. capacitor.config.ts preserves app identity and does not configure desktop user agent', () => {
    const configPath = path.join(ROOT_DIR, 'capacitor.config.ts')
    const content = fs.readFileSync(configPath, 'utf8')
    assert.match(content, /appId:\s*'com\.gullyscorer\.app'/)
    assert.match(content, /appName:\s*'ScoreMate'/)
    assert.doesNotMatch(content, /overrideUserAgent/i, 'Capacitor must not override user agent to desktop')
    assert.doesNotMatch(content, /appendUserAgent.*desktop/i, 'Capacitor must not append desktop user agent')
  })

  it('3. AndroidManifest.xml and MainActivity configure standard Capacitor mobile WebView in portrait', () => {
    const manifestPath = path.join(ROOT_DIR, 'android/app/src/main/AndroidManifest.xml')
    const manifest = fs.readFileSync(manifestPath, 'utf8')
    assert.match(manifest, /package_name">com\.gullyscorer\.app<\/string>|<manifest[^>]*package="com\.gullyscorer\.app"|<activity[^>]*android:name="\.MainActivity"/)
    assert.match(manifest, /android:screenOrientation="portrait"/, 'MainActivity must enforce portrait orientation for mobile container')
    assert.doesNotMatch(manifest, /android:configChanges="[^"]*"\s+android:screenOrientation="desktop"/i)

    const mainActivityPath = path.join(ROOT_DIR, 'android/app/src/main/java/com/gullyscorer/app/MainActivity.java')
    const mainActivity = fs.readFileSync(mainActivityPath, 'utf8')
    assert.match(mainActivity, /public class MainActivity extends BridgeActivity/)
    assert.doesNotMatch(mainActivity, /setUseWideViewPort\(true\)/, 'MainActivity must not enable wide viewport desktop emulation')
  })

  it('4. src/main.tsx marks root with capacitor-native when running on native Capacitor platform', () => {
    const mainPath = path.join(ROOT_DIR, 'src/main.tsx')
    const mainContent = fs.readFileSync(mainPath, 'utf8')
    assert.match(mainContent, /Capacitor\.isNativePlatform\(\)/, 'main.tsx must check Capacitor.isNativePlatform()')
    assert.match(mainContent, /classList\.add\(['"]capacitor-native['"]\)/, 'main.tsx must mark root with capacitor-native class')
  })

  it('5. src/index.css root containers are 100% width/height and mobile-first', () => {
    const cssPath = path.join(ROOT_DIR, 'src/index.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    // Root elements width: 100%
    assert.match(css, /html,\s*body,\s*#root\s*\{[^}]*width:\s*100%/, 'html, body, #root must be width: 100%')
    assert.match(css, /html,\s*body,\s*#root\s*\{[^}]*height:\s*100%/, 'html, body, #root must be height: 100%')

    // Base app-shell must be full-width mobile-first (not restricted to 480px default)
    assert.match(css, /\.app-shell[^{]*\{[^}]*width:\s*100%/, '.app-shell must have width: 100%')
    assert.match(css, /\.app-shell[^{]*\{[^}]*max-width:\s*100%/, '.app-shell must have max-width: 100%')

    // Native Capacitor rule enforces full-screen invariants
    assert.match(css, /:root\.capacitor-native[^{]*\.app-shell[^{]*\{[^}]*width:\s*100%\s*!important/)
    assert.match(css, /:root\.capacitor-native[^{]*\.app-shell[^{]*\{[^}]*max-width:\s*100%\s*!important/)
  })

  it('6. src/index.css does NOT contain arbitrary 520px or 581px desktop-mockup breakpoints', () => {
    const cssPath = path.join(ROOT_DIR, 'src/index.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    // No min-width: 581px rule imposing margin-top: 24px and border-radius on app-shell
    assert.doesNotMatch(css, /@media\s*\(\s*min-width\s*:\s*581px\s*\)\s*\{\s*\.app-shell/, 'No 581px breakpoint imposing desktop frame on mobile emulators')

    // No max-width: 520px rule restricting mobile-first styling
    assert.doesNotMatch(css, /@media\s*\(\s*max-width\s*:\s*520px\s*\)\s*\{\s*body/, 'No 520px breakpoint restricting mobile layout')
  })

  it('7. Safe area insets are properly integrated on topbar, bottom-nav, and app-shell', () => {
    const cssPath = path.join(ROOT_DIR, 'src/index.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    assert.match(css, /env\(\s*safe-area-inset-top[^)]*\)/, 'Must handle safe-area-inset-top')
    assert.match(css, /env\(\s*safe-area-inset-bottom[^)]*\)/, 'Must handle safe-area-inset-bottom')
  })
})
